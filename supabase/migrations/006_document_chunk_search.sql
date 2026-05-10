drop function if exists public.match_document_chunks;

-- Token-optimized document chunk search for Day 5.
-- SECURITY: result rows are always scoped by document_id and user_id.

create unique index if not exists document_chunks_document_id_chunk_index_idx
  on public.document_chunks (document_id, chunk_index);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_document_id uuid,
  match_user_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  chunk_index int,
  similarity float
)
language sql
stable
as $$
  select
    dc.id,
    dc.content,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.document_id = match_document_id
    and dc.user_id = match_user_id
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
