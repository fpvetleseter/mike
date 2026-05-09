import Anthropic from "@anthropic-ai/sdk";
import { estimateTokens } from "../lib/tokenBudget";

const HAIKU_MODEL = "claude-haiku-4-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CompressionResult {
  compressedText: string;
  originalTokens: number;
  compressedTokens: number;
}

// SECURITY: never log chunk text in production.
export async function extractRelevantSentences(
  chunkText: string,
  userQuery: string,
): Promise<CompressionResult> {
  const originalTokens = estimateTokens(chunkText);

  if (originalTokens < 150) {
    return {
      compressedText: chunkText,
      originalTokens,
      compressedTokens: originalTokens,
    };
  }

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: "Du er et juridisk ekstraksjonssystem. Din eneste oppgave er å trekke ut de setningene fra en lovtekst som er direkte relevante for brukerens spørsmål. Returner kun de relevante setningene, ordrett, uten forklaring, uten JSON, uten markdown. Hvis ingen setninger er relevante, returner ingenting.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Spørsmål: ${userQuery}\n\nLovtekst:\n${chunkText}`,
      },
    ],
  });

  const compressedText = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!compressedText || compressedText.length < 50) {
    return {
      compressedText: chunkText,
      originalTokens,
      compressedTokens: originalTokens,
    };
  }

  return {
    compressedText,
    originalTokens,
    compressedTokens: estimateTokens(compressedText),
  };
}
