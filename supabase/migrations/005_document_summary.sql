-- Add summary storage for token-optimized document context injection.
alter table public.documents
  add column if not exists summary jsonb,
  add column if not exists summary_text text;

comment on column public.documents.summary is 'Haiku-generated structural summary. Cached in prompt for token efficiency.';
comment on column public.documents.summary_text is 'Short summary text injected as first document context block, always cached.';
