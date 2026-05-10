/**
 * One-time / bulk ingestion of Lovdata public archives into law_chunks.
 *
 * Usage:
 *   npx tsx scripts/ingestLovdata.ts        # priority laws only
 *   npx tsx scripts/ingestLovdata.ts --all  # full corpus
 */
import "dotenv/config";

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as cheerio from "cheerio";

import { createServerSupabase } from "../src/lib/supabase";
import { embedBatch } from "../src/services/embeddings";

const LOVER_ARCHIVE = "/tmp/lover.tar.bz2";
const FORSKRIFTER_ARCHIVE = "/tmp/forskrifter.tar.bz2";
const EXTRACT_LOVER = "/tmp/lovdata-lover";
const EXTRACT_FORSKRIFTER = "/tmp/lovdata-forskrifter";

const LOVER_URL =
  process.env.LOVDATA_LOVER_URL ??
  "https://api.lovdata.no/v1/publicData/get/gjeldende-lover.tar.bz2";
const FORSKRIFTER_URL =
  process.env.LOVDATA_FORSKRIFTER_URL ??
  "https://api.lovdata.no/v1/publicData/get/gjeldende-sentrale-forskrifter.tar.bz2";

/** Match by substring in file path (Lovdata nl-* stems). Processed in this order first. */
const PRIORITY_LAW_STEMS = [
  "nl-20050617-062",
  "nl-19970613-044",
  "nl-19940526-024",
  "nl-19930604-058",
  "nl-20010615-081",
  "nl-20001215-106",
  "nl-19780622-055",
  "nl-19880623-027",
] as const;

const SECTION_MIN_CHARS = 50;
const SECTION_ONE_CHUNK_MAX = 1200;
const CHUNK_TARGET_CHARS = 3200;
const CHUNK_OVERLAP_CHARS = 400;
const EMBED_BATCH = 20;
const BATCH_PAUSE_MS = 500;
const EMBED_RETRY_MS = 2000;

interface LawChunkRow {
  lovdata_url: string;
  law_name: string;
  section: string;
  section_title: string | null;
  content: string;
  content_hash: string;
  source_url: string;
  embedding: number[];
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function priorityIndex(filePath: string): number | null {
  const lower = filePath.toLowerCase();
  for (let i = 0; i < PRIORITY_LAW_STEMS.length; i++) {
    if (lower.includes(PRIORITY_LAW_STEMS[i]!)) return i;
  }
  return null;
}

function sortFiles(paths: string[], all: boolean): string[] {
  const sorted = [...paths].sort((a, b) => {
    const ia = priorityIndex(a);
    const ib = priorityIndex(b);
    if (ia !== null && ib !== null) return ia - ib;
    if (ia !== null) return -1;
    if (ib !== null) return 1;
    return a.localeCompare(b);
  });
  if (all) return sorted;
  return sorted.filter((p) => priorityIndex(p) !== null);
}

function walkLawFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (/\.(xml|html|htm)$/i.test(name.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

async function downloadWithProgress(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let lastLoggedPct = -1;

  const progressStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.length;
      if (total > 0) {
        const pct = Math.floor((100 * received) / total);
        if (pct >= lastLoggedPct + 5) {
          lastLoggedPct = pct;
          console.log(
            `  ${pct}% (${(received / 1_000_000).toFixed(1)} / ${(total / 1_000_000).toFixed(1)} MB)`,
          );
        }
      } else if (received % (25 * 1024 * 1024) < chunk.length) {
        console.log(`  ${(received / 1_000_000).toFixed(1)} MB downloaded...`);
      }
      controller.enqueue(chunk);
    },
  });

  const webBody = res.body.pipeThrough(progressStream);
  await pipeline(
    Readable.fromWeb(webBody as import("stream/web").ReadableStream),
    createWriteStream(dest),
  );
  console.log(`  Done: ${dest} (${(statSync(dest).size / 1_000_000).toFixed(1)} MB)`);
}

function extractArchive(archive: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xjf", archive, "-C", destDir], { stdio: "inherit" });
}

function parseLawName($: ReturnType<typeof cheerio.load>): string {
  let fromTitle = $("title").first().text().trim();
  fromTitle = fromTitle.replace(/\s*-\s*Lovdata\s*$/i, "").trim();
  if (fromTitle) return normalizeWs(fromTitle);
  const h =
    $("h1").first().text().trim() || $("h2").first().text().trim();
  return h ? normalizeWs(h) : "Ukjent";
}

function toSourceUrl(lovdataPath: string): string {
  const trimmed = lovdataPath.replace(/^\/+/, "");
  if (trimmed.startsWith("NL/")) {
    return `https://lovdata.no/${trimmed.slice(3)}`;
  }
  return `https://lovdata.no/${trimmed}`;
}

function chunkSectionText(text: string): string[] {
  if (text.length <= SECTION_ONE_CHUNK_MAX) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_TARGET_CHARS, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    const next = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
    if (next <= start) break;
    start = next;
  }
  return chunks;
}

function parseFile(html: string, lawNameFallback: string): Omit<LawChunkRow, "embedding">[] {
  const $ = cheerio.load(html);
  const lawName = parseLawName($) || lawNameFallback;
  const rows: Omit<LawChunkRow, "embedding">[] = [];

  $("article.legalArticle").each((_, el) => {
    const $el = $(el);
    const dataName = ($el.attr("data-name") ?? "").trim();
    if (!dataName || dataName.toUpperCase().includes("KAPITTEL")) return;

    const lovdataRaw =
      $el.attr("data-lovdata-URL") ?? $el.attr("data-lovdata-url");
    if (!lovdataRaw?.trim()) return;

    const baseLov = lovdataRaw.trim().replace(/^\/+/, "");
    const sectionNum = normalizeWs(
      $el.find("span.legalArticleValue").first().text(),
    );
    if (!sectionNum) return;

    const sectionTitleRaw = $el.find("span.legalArticleTitle").first().text();
    const sectionTitle = sectionTitleRaw.trim()
      ? normalizeWs(sectionTitleRaw)
      : null;

    const paragraphs: string[] = [];
    $el.find("article.legalP, article.numberedLegalP").each((__, p) => {
      const t = normalizeWs($(p).text());
      if (t) paragraphs.push(t);
    });
    const fullText = paragraphs.join("\n");
    if (fullText.length < SECTION_MIN_CHARS) return;

    const sourceUrl = toSourceUrl(baseLov);
    const textChunks = chunkSectionText(fullText);

    textChunks.forEach((content, idx) => {
      const lovdata_url =
        idx === 0 ? baseLov : `${baseLov}#chunk-${idx}`;
      const content_hash = createHash("sha256").update(content).digest("hex");
      rows.push({
        lovdata_url,
        law_name: lawName,
        section: sectionNum,
        section_title: sectionTitle,
        content,
        content_hash,
        source_url: sourceUrl,
      });
    });
  });

  return rows;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatchWithRetry(texts: string[]): Promise<number[][] | null> {
  try {
    return await embedBatch(texts);
  } catch (first) {
    console.error(
      "Embedding batch failed, retrying once:",
      first instanceof Error ? first.message : first,
    );
    await sleep(EMBED_RETRY_MS);
    try {
      return await embedBatch(texts);
    } catch (second) {
      console.error(
        "Embedding batch failed after retry; falling back to per-chunk embed:",
        second instanceof Error ? second.message : second,
      );
      return null;
    }
  }
}

async function embedOneWithRetry(text: string): Promise<number[] | null> {
  try {
    const [v] = await embedBatch([text]);
    return v ?? null;
  } catch (first) {
    await sleep(EMBED_RETRY_MS);
    try {
      const [v] = await embedBatch([text]);
      return v ?? null;
    } catch (second) {
      console.error(
        "Skipped chunk after embed retry:",
        second instanceof Error ? second.message : second,
      );
      return null;
    }
  }
}

async function main(): Promise<void> {
  const runAll = process.argv.includes("--all");
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY must be set");
  }

  const db = createServerSupabase();
  const started = Date.now();

  let filesProcessed = 0;
  let chunksUpserted = 0;
  let chunksSkippedEmbed = 0;
  let filesParseFailed = 0;

  mkdirSync(EXTRACT_LOVER, { recursive: true });
  mkdirSync(EXTRACT_FORSKRIFTER, { recursive: true });

  try {
    console.log("Downloading lover archive...");
    await downloadWithProgress(LOVER_URL, LOVER_ARCHIVE);
    console.log("Downloading forskrifter archive...");
    await downloadWithProgress(FORSKRIFTER_URL, FORSKRIFTER_ARCHIVE);

    console.log("Extracting lover...");
    extractArchive(LOVER_ARCHIVE, EXTRACT_LOVER);
    console.log("Extracting forskrifter...");
    extractArchive(FORSKRIFTER_ARCHIVE, EXTRACT_FORSKRIFTER);

    const allPaths = [
      ...walkLawFiles(EXTRACT_LOVER),
      ...walkLawFiles(EXTRACT_FORSKRIFTER),
    ];
    const files = sortFiles(allPaths, runAll);
    const totalFiles = files.length;

    if (totalFiles === 0) {
      console.warn(
        runAll
          ? "No law files found in extracted archives."
          : "No priority law files matched. Use --all to ingest the full corpus.",
      );
    }

    for (let fi = 0; fi < files.length; fi++) {
      const filePath = files[fi]!;
      let rows: Omit<LawChunkRow, "embedding">[] = [];
      try {
        const html = await readFile(filePath, "utf8");
        const baseName = filePath.split(/[/\\]/).pop() ?? filePath;
        rows = parseFile(html, baseName);
      } catch (err) {
        filesParseFailed++;
        console.error(
          `Parse failed (${filePath}):`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      filesProcessed++;
      const previewName = rows[0]?.law_name ?? filePath;

      for (let i = 0; i < rows.length; i += EMBED_BATCH) {
        const batch = rows.slice(i, i + EMBED_BATCH);
        const texts = batch.map((r) => r.content);
        let vectors = await embedBatchWithRetry(texts);
        if (!vectors) {
          const recovered: LawChunkRow[] = [];
          for (const r of batch) {
            const v = await embedOneWithRetry(r.content);
            if (v) recovered.push({ ...r, embedding: v });
            else chunksSkippedEmbed++;
            await sleep(50);
          }
          if (recovered.length === 0) continue;
          const withEmbeddings = recovered;
          const { error } = await db.from("law_chunks").upsert(
            withEmbeddings.map((r) => ({
              lovdata_url: r.lovdata_url,
              law_name: r.law_name,
              section: r.section,
              section_title: r.section_title,
              content: r.content,
              content_hash: r.content_hash,
              source_url: r.source_url,
              jurisdiction: "NO",
              embedding: r.embedding,
              last_updated: new Date().toISOString(),
            })),
            { onConflict: "lovdata_url" },
          );
          if (error) {
            console.error(
              `Supabase upsert error (batch starting ${withEmbeddings[0]?.source_url}):`,
              error.message,
            );
            continue;
          }
          chunksUpserted += withEmbeddings.length;
          await sleep(BATCH_PAUSE_MS);
          continue;
        }

        const withEmbeddings: LawChunkRow[] = batch.map((r, j) => ({
          ...r,
          embedding: vectors[j]!,
        }));

        const { error } = await db.from("law_chunks").upsert(
          withEmbeddings.map((r) => ({
            lovdata_url: r.lovdata_url,
            law_name: r.law_name,
            section: r.section,
            section_title: r.section_title,
            content: r.content,
            content_hash: r.content_hash,
            source_url: r.source_url,
            jurisdiction: "NO",
            embedding: r.embedding,
            last_updated: new Date().toISOString(),
          })),
          { onConflict: "lovdata_url" },
        );

        if (error) {
          console.error(
            `Supabase upsert error (batch starting ${withEmbeddings[0]?.source_url}):`,
            error.message,
          );
          continue;
        }

        chunksUpserted += withEmbeddings.length;
        await sleep(BATCH_PAUSE_MS);
      }

      console.log(
        `Processed file ${fi + 1} of ${totalFiles}: ${previewName} (${rows.length} chunks)`,
      );
    }
  } finally {
    for (const p of [EXTRACT_LOVER, EXTRACT_FORSKRIFTER]) {
      try {
        rmSync(p, { recursive: true, force: true });
        console.log(`Removed ${p}`);
      } catch {
        // best effort
      }
    }
  }

  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\n=== Summary ===");
  console.log(`Mode:              ${runAll ? "all laws" : "priority laws only"}`);
  console.log(`Files processed:   ${filesProcessed}`);
  console.log(`Files parse-fail:  ${filesParseFailed}`);
  console.log(`Chunks upserted:   ${chunksUpserted}`);
  console.log(`Chunks skip embed: ${chunksSkippedEmbed}`);
  console.log(`Total time:        ${sec}s`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
