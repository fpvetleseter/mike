import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "../lib/supabase";
import { LEGAL_ASSISTANT_PROMPT } from "../proprietary/prompts/legal-assistant";
import { pollSummaryBatch } from "../services/documentSummary";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PendingSummaryMeta {
  batchId: string;
  customId: string;
  status: string;
}

interface PendingDocumentRow {
  id: string;
  summary: unknown;
}

export function startSummaryPoller(intervalMs = 30000): void {
  console.log("[poller] summary poller started");
  setInterval(() => {
    void pollPendingSummaries();
  }, intervalMs);
}

let isPollerRunning = false;

async function pollPendingSummaries(): Promise<void> {
  if (isPollerRunning) return;
  isPollerRunning = true;
  try {
    await doPollPendingSummaries();
  } finally {
    isPollerRunning = false;
  }
}

async function doPollPendingSummaries(): Promise<void> {
  const supabase = createServiceClient();

  // SECURITY: service role reads only summary metadata, never document content.
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, summary")
    .eq("status", "ready")
    .not("summary", "is", null);

  if (error) {
    console.error("[poller] summary lookup failed", { error: error.message });
    return;
  }

  for (const doc of (docs ?? []) as PendingDocumentRow[]) {
    const meta = parsePendingSummaryMeta(doc.summary);
    if (!meta || meta.status !== "pending") continue;

    try {
      const batch = await client.messages.batches.retrieve(meta.batchId);
      if (batch.processing_status !== "ended") continue;

      const result = await pollSummaryBatch(meta.batchId, meta.customId, 1, 0);
      if (!result) {
        await supabase
          .from("documents")
          .update({ summary: { ...meta, status: "failed" } })
          .eq("id", doc.id);
        continue;
      }

      await supabase
        .from("documents")
        .update({
          summary: { ...meta, status: "complete", data: result },
          summary_text: result.summaryText,
        })
        .eq("id", doc.id);

      // SECURITY: cache warmup sends static prompt and summary only; no user query content.
      await client.messages.create(
        {
          model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
          max_tokens: 0,
          system: [
            {
              type: "text",
              text: LEGAL_ASSISTANT_PROMPT,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `## Dokumentsammendrag\n${result.summaryText}`,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: "warmup" }],
        },
        {
          headers: { "anthropic-beta": "extended-cache-ttl-2025-04-11" },
        },
      );

      console.log(`[poller] summary complete and cache warmed document_id=${doc.id}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "UNKNOWN";
      console.error(`[poller] error document_id=${doc.id} error=${msg}`);
    }
  }
}

function parsePendingSummaryMeta(value: unknown): PendingSummaryMeta | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.batchId !== "string" ||
    typeof value.customId !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  return {
    batchId: value.batchId,
    customId: value.customId,
    status: value.status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
