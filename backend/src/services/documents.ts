import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Express } from "express";
import { PDFParse } from "pdf-parse";
import { createServiceClient } from "../lib/supabase";
import { embedBatch, embedText, toVectorLiteral } from "./embeddings";
import { submitSummaryBatchJob } from "./documentSummary";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALLOWED_MIME_TYPES = new Set(["application/pdf", DOCX_MIME]);
const MAX_EMBED_BATCH_SIZE = 10;

export class ValidationError extends Error {
  readonly statusCode = 422;
}

export interface DocumentChunkSearchResult {
  id: string;
  chunkIndex: number;
  content: string;
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
  file: Express.Multer.File,
  userId: string,
  documentId: string,
): Promise<void> {
  const supabase = createServiceClient();

  try {
    // SECURITY: check MIME type from multer, not extension or user input.
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new Error("INVALID_MIME_TYPE");
    }

    const safeFilename = basename(file.originalname).replace(/\s+/g, "_");
    const r2Key = `${userId}/${documentId}/${safeFilename}`;
    await uploadToR2(r2Key, file.buffer, file.mimetype);

    const pdfBuffer =
      file.mimetype === DOCX_MIME
        ? await convertDocxToPdf(file.buffer, documentId)
        : file.buffer;

    const { text, pageCount } = await extractTextFromPdf(pdfBuffer);
    const chunks = chunkText(text, 800, 100);
    await upsertDocumentChunks(documentId, userId, chunks);

    const batchId = await submitSummaryBatchJob(documentId, text);

    // SECURITY: update only metadata and a short preview; full text stays out of document rows.
    await supabase
      .from("documents")
      .update({
        status: "ready",
        page_count: pageCount,
        extracted_text_preview: text.slice(0, 500),
        r2_key: r2Key,
      })
      .eq("id", documentId)
      .eq("user_id", userId);

    await supabase
      .from("documents")
      .update({
        summary: {
          batchId,
          customId: `summary-${documentId}`,
          status: "pending",
        },
      })
      .eq("id", documentId)
      .eq("user_id", userId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "UNKNOWN";
    console.error(
      `[documents] processing failed document_id=${documentId} error=${errorMessage}`,
    );

    await supabase
      .from("documents")
      .update({ status: "error", error_message: userFacingDocumentError(errorMessage) })
      .eq("id", documentId)
      .eq("user_id", userId);
  }
}

export async function convertDocxToPdf(
  buffer: Buffer,
  documentId: string = randomUUID(),
): Promise<Buffer> {
  const inputPath = join("/tmp", `${documentId}.docx`);
  const outputPath = join("/tmp", `${documentId}.pdf`);

  try {
    await writeFile(inputPath, buffer);
    execSync(
      `libreoffice --headless --convert-to pdf --outdir /tmp ${inputPath}`,
      { stdio: "pipe" },
    );
    return await readFile(outputPath);
  } catch {
    throw new Error("LIBREOFFICE_FAILED");
  } finally {
    await unlink(inputPath).catch(() => undefined);
    await unlink(outputPath).catch(() => undefined);
  }
}

export async function extractTextFromPdf(
  buffer: Buffer,
): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return { text: data.text.trim(), pageCount: data.total };
  } finally {
    await parser.destroy();
  }
}

export function chunkText(
  text: string,
  chunkTokens: number,
  overlapTokens: number,
): string[] {
  const chunkChars = chunkTokens * 4;
  const overlapChars = overlapTokens * 4;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(text.length, start + chunkChars);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(0, end - overlapChars);
  }

  return chunks;
}

export async function upsertDocumentChunks(
  documentId: string,
  userId: string,
  chunks: string[],
): Promise<void> {
  const supabase = createServiceClient();

  for (let offset = 0; offset < chunks.length; offset += MAX_EMBED_BATCH_SIZE) {
    const batch = chunks.slice(offset, offset + MAX_EMBED_BATCH_SIZE);
    const embeddings = await embedBatch(batch);

    // SECURITY: chunks are written with authenticated user's id for RLS scoping.
    const { error } = await supabase.from("document_chunks").upsert(
      batch.map((chunk, index) => ({
        document_id: documentId,
        user_id: userId,
        chunk_index: offset + index,
        content: chunk,
        embedding: embeddings[index],
        token_count: Math.ceil(chunk.length / 4),
      })),
      { onConflict: "document_id,chunk_index" },
    );

    if (error) {
      throw new Error(`DOCUMENT_CHUNK_UPSERT_FAILED: ${error.message}`);
    }

    if (offset + MAX_EMBED_BATCH_SIZE < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

export async function uploadToR2(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  // SECURITY: bucket credentials are backend-only and never exposed to clients.
  await r2.send(
    new PutObjectCommand({
      Bucket: requireEnv("CLOUDFLARE_R2_BUCKET_NAME"),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

export async function searchDocumentChunks(
  query: string,
  documentId: string,
  userId: string,
  options?: { matchThreshold?: number; matchCount?: number },
): Promise<DocumentChunkSearchResult[]> {
  const embedding = await embedText(query);
  const supabase = createServiceClient();

  // SECURITY: vector search is explicitly scoped to authenticated user and document.
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: toVectorLiteral(embedding),
    match_document_id: documentId,
    match_user_id: userId,
    match_threshold: options?.matchThreshold ?? 0.72,
    match_count: options?.matchCount ?? 3,
  });

  if (error) throw error;

  return ((data ?? []) as Array<{
    id: string;
    content: string;
    chunk_index: number;
    similarity: number;
  }>)
    .map((row) => ({
      id: row.id,
      chunkIndex: row.chunk_index,
      content: row.content,
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function userFacingDocumentError(errorMessage: string): string {
  if (errorMessage === "INVALID_MIME_TYPE") {
    return "Kun PDF- og Word-dokumenter støttes.";
  }
  if (errorMessage === "LIBREOFFICE_FAILED") {
    return "Word-dokumentet kunne ikke konverteres til PDF.";
  }
  return "Dokumentet kunne ikke behandles. Sjekk at filen er et gyldig PDF- eller Word-dokument.";
}
