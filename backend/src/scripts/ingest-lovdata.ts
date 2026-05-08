/**
 * Lovdata bulk ingestion script.
 *
 * Downloads the public Lovdata datasets (gjeldende lover and sentrale
 * forskrifter), parses each HTML file with cheerio, computes a SHA-256
 * hash per legalArticle, and upserts changed/new sections into the
 * pgvector-backed law_chunks table.
 *
 * Idempotent: hash comparison means unchanged sections are skipped.
 * Memory-conscious: files are processed one at a time.
 *
 * Usage: npm run ingest:lovdata
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, createWriteStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { createServerSupabase } from "../lib/supabase";

const SOURCES = [
  {
    name: "gjeldende-lover",
    url: "https://api.lovdata.no/v1/publicData/get/gjeldende-lover.tar.bz2",
  },
  {
    name: "gjeldende-sentrale-forskrifter",
    url: "https://api.lovdata.no/v1/publicData/get/gjeldende-sentrale-forskrifter.tar.bz2",
  },
];

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_BATCH_SIZE = 100;
// $0.02 per 1M tokens for text-embedding-3-small
const PRICE_PER_TOKEN = 0.00002 / 1000;

interface ParsedSection {
  lovdata_url: string;
  law_name: string;
  section: string;
  section_title: string | null;
  content: string;
  content_hash: string;
  source_url: string;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await pipeline(
    Readable.fromWeb(response.body as unknown as import("stream/web").ReadableStream),
    createWriteStream(dest),
  );
}

function extractTarBz2(archive: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("tar", ["-xjf", archive, "-C", destDir], {
      stdio: "inherit",
    });
    proc.on("error", reject);
    proc.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`tar exited with code ${code}`)),
    );
  });
}

async function* walkHtmlFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkHtmlFiles(full);
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      yield full;
    }
  }
}

function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseHtml(html: string): ParsedSection[] {
  const $ = cheerio.load(html);
  const lawName = normaliseWhitespace($("title").first().text()) || "Ukjent";

  const out: ParsedSection[] = [];
  $("[class*='legalArticle']").each((_, el) => {
    const $el = $(el);
    const lovdataUrl =
      $el.attr("data-lovdata-URL") ?? $el.attr("data-lovdata-url");
    const section = $el.attr("data-name");
    if (!lovdataUrl || !section) return;

    const sectionTitle =
      normaliseWhitespace($el.find(".legalArticleTitle").first().text()) ||
      null;

    const paragraphs: string[] = [];
    $el.find(".legalP, .numberedLegalP").each((__, p) => {
      const text = normaliseWhitespace($(p).text());
      if (text) paragraphs.push(text);
    });
    const content = paragraphs.join("\n");
    if (!content) return;

    const hash = createHash("sha256").update(content).digest("hex");
    const sourceUrl = `https://lovdata.no/${lovdataUrl.replace(/^\/+/, "")}`;

    out.push({
      lovdata_url: lovdataUrl,
      law_name: lawName,
      section,
      section_title: sectionTitle,
      content,
      content_hash: hash,
      source_url: sourceUrl,
    });
  });
  return out;
}

async function loadExistingHashes(
  db: ReturnType<typeof createServerSupabase>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from("law_chunks")
      .select("lovdata_url, content_hash")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) {
      map.set(row.lovdata_url, row.content_hash);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function embedBatch(
  openai: OpenAI,
  inputs: string[],
): Promise<{ vectors: number[][]; tokens: number }> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: inputs,
  });
  return {
    vectors: res.data.map((d) => d.embedding),
    tokens: res.usage?.prompt_tokens ?? 0,
  };
}

async function upsertBatch(
  db: ReturnType<typeof createServerSupabase>,
  rows: Array<ParsedSection & { embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("law_chunks").upsert(
    rows.map((r) => ({
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
  if (error) throw error;
}

async function main() {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY must be set");
  }
  const openai = new OpenAI({ apiKey: openaiKey });
  const db = createServerSupabase();

  const workDir = mkdtempSync(join(tmpdir(), "lovdata-"));
  console.log(`Working directory: ${workDir}`);

  let totalFound = 0;
  let totalSkipped = 0;
  let totalEmbedded = 0;
  let totalTokens = 0;

  try {
    console.log("Loading existing hashes from law_chunks...");
    const existing = await loadExistingHashes(db);
    console.log(`  ${existing.size} sections already in database`);

    for (const source of SOURCES) {
      console.log(`\n=== ${source.name} ===`);
      const archivePath = join(workDir, `${source.name}.tar.bz2`);
      const extractDir = join(workDir, source.name);

      console.log(`Downloading ${source.url}`);
      await downloadToFile(source.url, archivePath);
      const size = (await stat(archivePath)).size;
      console.log(`  ${(size / 1_000_000).toFixed(1)} MB downloaded`);

      console.log("Extracting...");
      await import("node:fs/promises").then((m) =>
        m.mkdir(extractDir, { recursive: true }),
      );
      await extractTarBz2(archivePath, extractDir);

      let pendingSections: ParsedSection[] = [];

      const flush = async () => {
        if (pendingSections.length === 0) return;
        const inputs = pendingSections.map((s) => s.content);
        try {
          const { vectors, tokens } = await embedBatch(openai, inputs);
          totalTokens += tokens;
          const rows = pendingSections.map((s, i) => ({
            ...s,
            embedding: vectors[i],
          }));
          await upsertBatch(db, rows);
          totalEmbedded += pendingSections.length;
        } catch (err) {
          console.error(
            `  Batch error (${pendingSections.length} sections):`,
            err instanceof Error ? err.message : err,
          );
        }
        pendingSections = [];
      };

      for await (const file of walkHtmlFiles(extractDir)) {
        try {
          const html = await readFile(file, "utf8");
          const sections = parseHtml(html);
          totalFound += sections.length;

          for (const s of sections) {
            if (existing.get(s.lovdata_url) === s.content_hash) {
              totalSkipped++;
              continue;
            }
            pendingSections.push(s);
            if (pendingSections.length >= EMBED_BATCH_SIZE) {
              await flush();
            }
          }
        } catch (err) {
          console.error(
            `  Error in ${file}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      await flush();
    }

    const cost = totalTokens * PRICE_PER_TOKEN;
    console.log("\n=== Summary ===");
    console.log(`Found:    ${totalFound}`);
    console.log(`Skipped:  ${totalSkipped} (unchanged)`);
    console.log(`Embedded: ${totalEmbedded}`);
    console.log(`Tokens:   ${totalTokens}`);
    console.log(`Cost:     $${cost.toFixed(4)}`);
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
