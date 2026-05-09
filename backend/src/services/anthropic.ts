import Anthropic from "@anthropic-ai/sdk";

export interface StreamLegalResponseOptions {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  maxTokens?: number;
  conversationId?: string;
}

export interface StreamLegalResponseResult {
  stream: AsyncIterable<string>;
  getUsage: () => Promise<{ inputTokens: number; outputTokens: number }>;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function streamLegalResponse(
  options: StreamLegalResponseOptions,
): Promise<StreamLegalResponseResult> {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
  const maxTokens = options.maxTokens ?? 2048;

  console.info("Starting legal response stream", {
    model,
    estimatedInputTokens: estimateInputTokens(options),
    conversationId: options.conversationId,
  });

  if (process.env.NODE_ENV !== "production") {
    console.info("Legal response stream payload metadata", {
      messageCount: options.messages.length,
      systemPromptChars: options.systemPrompt.length,
    });
  }

  const sdkStream = anthropic.messages.stream({
    model,
    system: options.systemPrompt,
    messages: options.messages,
    max_tokens: maxTokens,
  });

  const deltas: string[] = [];
  let notify: (() => void) | null = null;
  let ended = false;
  let failure: unknown = null;

  sdkStream.on("text", (text) => {
    deltas.push(text);
    notify?.();
    notify = null;
  });

  sdkStream.on("error", (error) => {
    failure = error;
    ended = true;
    notify?.();
    notify = null;
  });

  const finalMessagePromise = sdkStream.finalMessage().finally(() => {
    ended = true;
    notify?.();
    notify = null;
  });

  async function* textStream(): AsyncIterable<string> {
    while (!ended || deltas.length > 0) {
      if (deltas.length > 0) {
        const next = deltas.shift();
        if (next !== undefined) {
          yield next;
        }
        continue;
      }
      if (failure) {
        throw failure;
      }
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
    }
    if (failure) {
      throw failure;
    }
  }

  return {
    stream: textStream(),
    getUsage: async () => {
      const finalMessage = await finalMessagePromise;
      return {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      };
    },
  };
}

function estimateInputTokens(options: StreamLegalResponseOptions): number {
  const messageChars = options.messages.reduce(
    (sum, message) => sum + message.content.length,
    0,
  );
  return Math.ceil((options.systemPrompt.length + messageChars) / 4);
}
