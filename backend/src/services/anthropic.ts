import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  MessageStreamEvent,
  TextBlockParam,
  Usage,
} from "@anthropic-ai/sdk/resources/messages";
import {
  LEGAL_ASSISTANT_PROMPT,
} from "../proprietary/prompts/legal-assistant";
import {
  TOKEN_BUDGET,
  chunkCountForQuery,
  classifyQuery,
  estimateTokens,
  trimHistory,
} from "../lib/tokenBudget";
import { extractRelevantSentences } from "./compression";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const EXTENDED_CACHE_TTL_BETA = "extended-cache-ttl-2025-04-11";

export interface StreamLegalResponseParams {
  userMessage: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  documentSummaryText?: string;
  documentChunks?: Array<{ content: string; chunk_index: number }>;
  lovdataResults?: Array<{
    lawName: string;
    section: string;
    sectionTitle: string;
    text: string;
    url: string;
  }>;
  userId: string;
}

export interface StreamLegalResponseResult {
  stream: AsyncIterable<MessageStreamEvent>;
  inputTokens: number;
  model: string;
  getUsage: () => Promise<{ inputTokens: number; outputTokens: number }>;
}

export async function streamLegalResponse(
  params: StreamLegalResponseParams,
): Promise<StreamLegalResponseResult> {
  const {
    userMessage,
    conversationHistory,
    documentSummaryText,
    documentChunks = [],
    lovdataResults = [],
  } = params;

  const queryType = classifyQuery(userMessage);
  const maxOutputTokens = {
    clause: TOKEN_BUDGET.OUTPUT_CLAUSE_QUESTION,
    general: TOKEN_BUDGET.OUTPUT_GENERAL_QUESTION,
    risk: TOKEN_BUDGET.OUTPUT_RISK_ANALYSIS,
  }[queryType];

  const selectedDocumentChunks = documentChunks
    .slice(0, chunkCountForQuery(queryType))
    .sort((a, b) => a.chunk_index - b.chunk_index);
  const compressedChunks = await Promise.all(
    selectedDocumentChunks.map((chunk) =>
      extractRelevantSentences(chunk.content, userMessage),
    ),
  );

  const lovdataContext = formatLovdataContext(lovdataResults);
  const documentContext =
    compressedChunks.length > 0
      ? `### Dokumentinnhold (utdrag)\n${compressedChunks
          .map((chunk) => chunk.compressedText)
          .join("\n---\n")}`
      : "Ingen dokumentkontekst. Brukeren stiller et generelt spørsmål.";

  const trimmedHistory = trimHistory(
    conversationHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    TOKEN_BUDGET.MAX_CONVERSATION_HISTORY_TOKENS,
  );

  const systemBlocks: TextBlockParam[] = [
    {
      type: "text",
      text: buildCacheableLegalPrompt(),
      cache_control: { type: "ephemeral" },
    },
  ];

  if (documentSummaryText) {
    systemBlocks.push({
      type: "text",
      text: `## Dokumentsammendrag\n${documentSummaryText}`,
      cache_control: { type: "ephemeral" },
    });
  }

  const contextualUserMessage = [
    lovdataContext ? `## Rettskilder\n${lovdataContext}` : "",
    documentContext !== "Ingen dokumentkontekst. Brukeren stiller et generelt spørsmål."
      ? `## Dokumentkontekst\n${documentContext}`
      : "",
    `## Spørsmål\n${userMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: MessageParam[] = [
    ...trimmedHistory
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })),
    { role: "user", content: contextualUserMessage },
  ];

  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
  const inputTokens = estimateInputTokens(systemBlocks, messages);

  console.info("Starting legal response stream", {
    model,
    estimatedInputTokens: inputTokens,
    queryType,
    hasDocumentContext: documentChunks.length > 0,
  });

  const sdkStream = client.messages.stream(
    {
      model,
      max_tokens: maxOutputTokens,
      system: systemBlocks,
      messages,
    },
    {
      headers: { "anthropic-beta": EXTENDED_CACHE_TTL_BETA },
    },
  );

  const finalMessagePromise = sdkStream.finalMessage();

  async function* streamWithCostLogging(): AsyncIterable<MessageStreamEvent> {
    try {
      for await (const event of sdkStream) {
        yield event;
      }
      const finalMessage = await finalMessagePromise;
      logCompletedCall({
        model,
        usage: finalMessage.usage,
        queryType,
        hasDocumentContext: documentChunks.length > 0,
        compressionSavingsTokens: compressedChunks.reduce(
          (sum, chunk) => sum + (chunk.originalTokens - chunk.compressedTokens),
          0,
        ),
      });
    } catch (error) {
      throw error;
    }
  }

  return {
    stream: streamWithCostLogging(),
    inputTokens,
    model,
    getUsage: async () => {
      const finalMessage = await finalMessagePromise;
      return {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      };
    },
  };
}

function buildCacheableLegalPrompt(): string {
  return LEGAL_ASSISTANT_PROMPT.replace(
    "{{LOVDATA_CONTEXT}}",
    "Rettskilder gis dynamisk i brukerens melding under ## Rettskilder.",
  )
    .replace(
      "{{DOCUMENT_CONTEXT}}",
      "Dokumentkontekst gis dynamisk i brukerens melding under ## Dokumentkontekst.",
    )
    .replace(
      "{{CONVERSATION_HISTORY}}",
      "Samtalehistorikk gis som tidligere meldinger i meldingslisten.",
    );
}

function formatLovdataContext(
  results: StreamLegalResponseParams["lovdataResults"],
): string {
  if (!results || results.length === 0) {
    return "Ingen Lovdata-resultater tilgjengelig for dette spørsmålet.";
  }

  const included: NonNullable<StreamLegalResponseParams["lovdataResults"]> = [];
  for (const result of results) {
    const isDuplicate = included.some(
      (existing) => textOverlapRatio(existing.text, result.text) > 0.6,
    );
    if (!isDuplicate) included.push(result);
  }

  return included
    .map(
      (result) =>
        `### ${result.lawName} ${result.section} — ${result.sectionTitle}\n${result.text}\nKilde: ${result.url}`,
    )
    .join("\n\n");
}

function textOverlapRatio(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const denominator = Math.min(wordsA.size, wordsB.size);
  if (denominator === 0) return 0;
  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection += 1;
  }
  return intersection / denominator;
}

function estimateInputTokens(
  systemBlocks: TextBlockParam[],
  messages: MessageParam[],
): number {
  const systemText = systemBlocks.map((block) => block.text).join("\n");
  const messageText = messages
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((block) => ("text" in block ? block.text : ""))
            .join("\n"),
    )
    .join("\n");
  return estimateTokens(`${systemText}\n${messageText}`);
}

function logCompletedCall(input: {
  model: string;
  usage: Usage;
  queryType: "clause" | "general" | "risk";
  hasDocumentContext: boolean;
  compressionSavingsTokens: number;
}): void {
  const { model, usage, queryType, hasDocumentContext, compressionSavingsTokens } =
    input;

  // SECURITY: log metadata only, never content.
  console.log(
    JSON.stringify({
      event: "ai_call_complete",
      model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      query_type: queryType,
      has_document_context: hasDocumentContext,
      compression_savings_tokens: compressionSavingsTokens,
      estimated_cost_usd: estimateCost(model, usage),
    }),
  );
}

function estimateCost(
  _model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  },
): number {
  const INPUT_PER_TOKEN = 3 / 1_000_000;
  const OUTPUT_PER_TOKEN = 15 / 1_000_000;
  const CACHE_WRITE_PER_TOKEN = INPUT_PER_TOKEN * 1.25;
  const CACHE_READ_PER_TOKEN = INPUT_PER_TOKEN * 0.1;

  return (
    usage.input_tokens * INPUT_PER_TOKEN +
    usage.output_tokens * OUTPUT_PER_TOKEN +
    (usage.cache_creation_input_tokens ?? 0) * CACHE_WRITE_PER_TOKEN +
    (usage.cache_read_input_tokens ?? 0) * CACHE_READ_PER_TOKEN
  );
}
