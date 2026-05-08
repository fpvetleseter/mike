-- Law corpus chunks for RAG retrieval
-- No RLS: this is public law data, not user data
-- Updated nightly via ingestion script

create table if not exists public.law_chunks (
  id uuid primary key default gen_random_uuid(),
  lovdata_url text not null unique,
  law_name text not null,
  section text not null,
  section_title text,
  content text not null,
  content_hash text not null,
  embedding vector(1536),
  source_url text not null,
  jurisdiction text not null default 'NO',
  last_updated timestamptz not null default now()
);

create index if not exists law_chunks_embedding_idx
  on public.law_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists law_chunks_lovdata_url_idx
  on public.law_chunks (lovdata_url);
