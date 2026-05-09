import { createServerSupabase } from "../lib/supabase";
import { embedText, toVectorLiteral } from "./embeddings";

export interface LovdataChunk {
  id: string;
  lawName: string;
  shortName: string;
  year: number;
  section: string;
  sectionTitle: string;
  text: string;
  url: string;
  similarity: number;
}

interface LawChunkRow {
  id: string;
  law_name: string;
  section: string;
  section_title: string | null;
  content: string;
  source_url: string;
  similarity: number;
}

export async function searchLovdata(
  query: string,
  options?: {
    maxResults?: number;
    threshold?: number;
    lawFilter?: string[];
  },
): Promise<{ results: LovdataChunk[]; available: boolean }> {
  try {
    const maxResults = options?.maxResults ?? 5;
    const threshold = Math.max(options?.threshold ?? 0.5, 0);
    const lawFilter =
      options?.lawFilter?.map((law) => law.toLowerCase().trim()).filter(Boolean) ??
      null;

    const embedding = await embedText(query);
    const supabase = createServerSupabase();

    // SECURITY: service role client is backend-only and reads the legal corpus.
    // TODO(ferdinand): Add Redis caching for repeated Lovdata searches in Phase 2.
    const { data, error } = await supabase.rpc("match_law_chunks", {
      query_embedding: toVectorLiteral(embedding),
      match_threshold: threshold,
      match_count: maxResults,
      law_filter: lawFilter && lawFilter.length > 0 ? lawFilter : null,
    });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as LawChunkRow[];
    return {
      available: true,
      results: rows.map(mapLawChunkRow),
    };
  } catch (error) {
    console.error("Lovdata retrieval failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { results: [], available: false };
  }
}

function mapLawChunkRow(row: LawChunkRow): LovdataChunk {
  return {
    id: row.id,
    lawName: row.law_name,
    shortName: deriveShortName(row.law_name),
    year: deriveYear(row.source_url),
    section: row.section,
    sectionTitle: row.section_title ?? "",
    text: row.content,
    url: row.source_url,
    similarity: Number(row.similarity),
  };
}

function deriveShortName(lawName: string): string {
  return lawName
    .toLowerCase()
    .replace(/loven\b/, "l")
    .replace(/[^a-zæøå0-9]/gi, "")
    .slice(0, 24);
}

function deriveYear(url: string): number {
  const match = url.match(/\/(?:lov|forskrift)\/(\d{4})-/);
  return match ? Number(match[1]) : 0;
}
