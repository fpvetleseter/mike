import Anthropic from "@anthropic-ai/sdk";

const HAIKU_MODEL = "claude-haiku-4-5";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const DOCUMENT_SUMMARY_PROMPT_VERSION = "1.0.0";

export interface DocumentSummary {
  documentType: string;
  parties: string[];
  governingLaw: string | null;
  effectiveDate: string | null;
  terminationClauses: string[];
  keyObligations: string[];
  summaryText: string;
}

// SECURITY: use Batch API so this never blocks the upload response.
export async function submitSummaryBatchJob(
  documentId: string,
  extractedText: string,
): Promise<string> {
  const truncated = extractedText.slice(0, 32000);

  const batch = await client.messages.batches.create({
    requests: [
      {
        custom_id: `summary-${documentId}`,
        params: {
          model: HAIKU_MODEL,
          max_tokens: 500,
          system: [
            {
              type: "text",
              text: 'Du er et juridisk ekstraksjonssystem. Analyser dokumentet og returner et JSON-objekt. Kun gyldig JSON, ingen annen tekst, ingen markdown-blokker. JSON-struktur: {"documentType":"string","parties":["string"],"governingLaw":"string|null","effectiveDate":"string|null","terminationClauses":["string"],"keyObligations":["string"],"summaryText":"string -- 2-3 setninger"}',
            },
          ],
          messages: [{ role: "user", content: truncated }],
        },
      },
    ],
  });

  return batch.id;
}

export async function pollSummaryBatch(
  batchId: string,
  customId: string,
  maxAttempts = 20,
  intervalMs = 15000,
): Promise<DocumentSummary | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") continue;

    const results = await client.messages.batches.results(batchId);
    for await (const result of results) {
      if (result.custom_id !== customId) continue;
      if (result.result.type !== "succeeded") return null;

      const text = result.result.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      return parseDocumentSummary(text);
    }
  }

  return null;
}

function parseDocumentSummary(text: string): DocumentSummary | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isDocumentSummary(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isDocumentSummary(value: unknown): value is DocumentSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.documentType === "string" &&
    Array.isArray(value.parties) &&
    value.parties.every((party) => typeof party === "string") &&
    (typeof value.governingLaw === "string" || value.governingLaw === null) &&
    (typeof value.effectiveDate === "string" || value.effectiveDate === null) &&
    Array.isArray(value.terminationClauses) &&
    value.terminationClauses.every((clause) => typeof clause === "string") &&
    Array.isArray(value.keyObligations) &&
    value.keyObligations.every((obligation) => typeof obligation === "string") &&
    typeof value.summaryText === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
