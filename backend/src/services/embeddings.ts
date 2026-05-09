import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_INPUT_CHARS = 8000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedBatch([text]);
  return embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((text) => text.slice(0, MAX_INPUT_CHARS)),
  });

  return response.data.map((item) => item.embedding);
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
