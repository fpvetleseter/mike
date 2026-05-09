export const TOKEN_BUDGET = {
  // Context injection limits
  MAX_DOCUMENT_CHUNKS: 3,
  MIN_CHUNK_RELEVANCE_SCORE: 0.72,
  MAX_LOVDATA_RESULTS: 3,
  MIN_LOVDATA_RELEVANCE_SCORE: 0.7,
  MAX_CONVERSATION_HISTORY_TOKENS: 3000,

  // Haiku structural summary stored per document
  SUMMARY_MAX_TOKENS: 300,

  // Output token budgets by query type
  OUTPUT_CLAUSE_QUESTION: 200,
  OUTPUT_GENERAL_QUESTION: 350,
  OUTPUT_RISK_ANALYSIS: 600,

  // Cache TTL
  CACHE_TTL: "1h" as const,

  // Chunk token estimate (used for history budget calculation)
  CHARS_PER_TOKEN: 4,
} as const;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_BUDGET.CHARS_PER_TOKEN);
}

export function trimHistory(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Array<{ role: string; content: string }> {
  const result: typeof messages = [];
  let tokenCount = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const tokens = estimateTokens(messages[i].content);
    if (tokenCount + tokens > maxTokens) break;
    result.unshift(messages[i]);
    tokenCount += tokens;
  }

  return result;
}

export function classifyQuery(message: string): "clause" | "general" | "risk" {
  const lower = message.toLowerCase();
  const clausePatterns = [
    "hva er",
    "hva sier",
    "hvilken paragraf",
    "hvilken bestemmelse",
    "oppsigelsestid",
    "ferie",
    "lønn",
    "overtid",
    "prøvetid",
  ];
  const riskPatterns = [
    "risiko",
    "risikoanalyse",
    "gjennomgå",
    "analysere",
    "vurdere",
    "hva bør jeg passe på",
    "røde flagg",
    "problemer med",
  ];

  if (riskPatterns.some((pattern) => lower.includes(pattern))) return "risk";
  if (clausePatterns.some((pattern) => lower.includes(pattern))) return "clause";
  return "general";
}

export function chunkCountForQuery(
  queryType: "clause" | "general" | "risk",
): number {
  return {
    clause: 1,
    general: 2,
    risk: TOKEN_BUDGET.MAX_DOCUMENT_CHUNKS,
  }[queryType];
}
