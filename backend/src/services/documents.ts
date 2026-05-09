import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Express } from "express";
import { PDFParse } from "pdf-parse";
import { v5 as uuidv5 } from "uuid";
import { createServerSupabase } from "../lib/supabase";
import { embedBatch, embedText, toVectorLiteral } from "./embeddings";

const execFileAsync = promisify(execFile);
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALLOWED_MIME_TYPES = new Set(["application/pdf", DOCX_MIME]);
const DOCUMENT_CHUNK_NAMESPACE = "09b7d859-3f69-5d5a-a4c1-765f4f1c8f30";

export class ValidationError extends Error {
  readonly statusCode = 422;
}

export class LibreOfficeError extends Error {
  readonly statusCode = 500;
}

export class EmbeddingError extends Error {
  readonly statusCode = 500;
}

export class StorageError extends Error {
  readonly statusCode = 500;
}

export interface ProcessDocumentInput {
  file: Express.Multer.File;
  userId: string;
  documentId: string;
}

export interface ProcessDocumentResult {
  r2Key: string;
  pageCount: number | null;
  extractedTextPreview: string;
  chunkCount: number;
}

export interface DocumentChunkSearchResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  similarity: number;
}

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function processDocument(
  input: ProcessDocumentInput,
): Promise<ProcessDocumentResult> {
  const { file, userId, documentId } = input;

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new ValidationError("Kun PDF- og Word-dokumenter støttes.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new ValidationError("Filen er for stor. Maksimal filstørrelse er 10 MB.");
  }

  const safeFilename = basename(file.originalname).replace(/\s+/g, "_");
  const r2Key = `${userId}/${documentId}/${safeFilename}`;

  try {
    // SECURITY: user document bytes go to the private backend R2 bucket only.
    await r2.send(
      new PutObjectCommand({
        Bucket: requireEnv("CLOUDFLARE_R2_BUCKET_NAME"),
        Key: r2Key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
  } catch (error) {
    throw new StorageError(
      `Kunne ikke lagre dokumentet: ${errorMessage(error)}`,
    );
  }

  const pdfBuffer =
    file.mimetype === DOCX_MIME
      ? await convertDocxToPdf(file.buffer, documentId)
      : file.buffer;

  const parser = new PDFParse({ data: pdfBuffer });
  const parsed = await parser.getText();
  await parser.destroy();
  const text = parsed.text.trim();
  const chunks = chunkText(text);

  let embeddings: number[][];
  try {
    embeddings = await embedChunks(chunks);
  } catch (error) {
    throw new EmbeddingError(
      `Kunne ikke lage dokumentindeks: ${errorMessage(error)}`,
    );
  }

  const supabase = createServerSupabase();
  // SECURITY: service role writes chunks for a document already created for this user.
  const { error } = await supabase.from("document_chunks").upsert(
    chunks.map((chunk, index) => ({
      id: generateDeterministicId(documentId, index),
      document_id: documentId,
      user_id: userId,
      chunk_index: index,
      content: chunk,
      embedding: embeddings[index],
      token_count: Math.ceil(chunk.length / 4),
    })),
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Kunne ikke lagre dokumentindeks: ${error.message}`);
  }

  return {
    r2Key,
    pageCount: typeof parsed.total === "number" ? parsed.total : null,
    extractedTextPreview: text.slice(0, 500),
    chunkCount: chunks.length,
  };
}

export async function searchDocumentChunks(
  query: string,
  documentId: string,
  userId: string,
): Promise<DocumentChunkSearchResult[]> {
  const embedding = await embedText(query);
  const supabase = createServerSupabase();

  // SECURITY: document vector search is explicitly scoped to authenticated user id.
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: toVectorLiteral(embedding),
    target_document_id: documentId,
    target_user_id: userId,
    match_threshold: 0.5,
    match_count: 5,
  });

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{
    id: string;
    document_id: string;
    chunk_index: number;
    content: string;
    similarity: number;
  }>)
    .map((row) => ({
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      text: row.content,
      similarity: Number(row.similarity),
    }))
    .sort((a, b) => a.chunkIndex - b.chunkIndex);
}

export async function deleteDocumentObject(r2Key: string): Promise<void> {
  // SECURITY: deletes only the private object key loaded from the user's document row.
  await r2.send(
    new DeleteObjectCommand({
      Bucket: requireEnv("CLOUDFLARE_R2_BUCKET_NAME"),
      Key: r2Key,
    }),
  );
}

export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const charsPerToken = 4;
  const targetChars = chunkSize * charsPerToken;
  const overlapChars = overlap * charsPerToken;
  const minChars = 50 * charsPerToken;

  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= targetChars) {
      current = candidate;
      continue;
    }

    if (current.length >= minChars) {
      chunks.push(current);
    }

    const overlapText = current.slice(Math.max(0, current.length - overlapChars));
    current = `${overlapText} ${word}`.trim();
  }

  if (current.length >= minChars) {
    chunks.push(current);
  }

  return chunks;
}

function generateDeterministicId(documentId: string, index: number): string {
  return uuidv5(`${documentId}:${index}`, DOCUMENT_CHUNK_NAMESPACE);
}

async function convertDocxToPdf(
  inputBuffer: Buffer,
  documentId: string,
): Promise<Buffer> {
  const inputPath = join("/tmp", `${documentId}-${randomUUID()}.docx`);
  const outputPath = inputPath.replace(/\.docx$/, ".pdf");

  try {
    await writeFile(inputPath, inputBuffer);
    await execFileAsync("libreoffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      "/tmp",
      inputPath,
    ]);
    return await readFile(outputPath);
  } catch (error) {
    const message =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "LibreOffice er ikke installert på serveren."
        : `DOCX-konvertering feilet: ${errorMessage(error)}`;
    throw new LibreOfficeError(message);
  } finally {
    await unlink(inputPath).catch(() => undefined);
    await unlink(outputPath).catch(() => undefined);
  }
}

async function embedChunks(chunks: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    results.push(...(await embedBatch(batch)));
    if (i + 20 < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return results;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
