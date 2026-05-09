-- Vector search helpers for Juridisk Day 3 RAG.
-- SECURITY: functions are read-only and return only rows scoped by explicit filters.

create or replace function public.match_law_chunks(
  query_embedding vector(1536),
  match_threshold double precision default 0.5,
  match_count integer default 5,
  law_filter text[] default null
)
returns table (
  id uuid,
  law_name text,
  section text,
  section_title text,
  content text,
  source_url text,
  similarity double precision
)
language sql
stable
as $$
  select
    lc.id,
    lc.law_name,
    lc.section,
    lc.section_title,
    lc.content,
    lc.source_url,
    1 - (lc.embedding <=> query_embedding) as similarity
  from public.law_chunks lc
  where lc.embedding is not null
    and 1 - (lc.embedding <=> query_embedding) > match_threshold
    and (
      law_filter is null
      or lower(lc.law_name) = any(law_filter)
      or lower(regexp_replace(lc.law_name, '\s+', '', 'g')) = any(law_filter)
    )
  order by lc.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  target_document_id uuid,
  target_user_id uuid,
  match_threshold double precision default 0.5,
  match_count integer default 5
)
returns table (
  id uuid,
  document_id uuid,
  user_id uuid,
  chunk_index integer,
  content text,
  similarity double precision
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.user_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and dc.document_id = target_document_id
    and dc.user_id = target_user_id
    and 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
