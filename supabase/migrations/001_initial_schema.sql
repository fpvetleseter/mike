-- ============================================================
-- Juridisk Initial Schema
-- Migration: 001_initial_schema
-- Run this in Supabase SQL Editor before any other migration.
-- ============================================================

-- Enable pgvector (should already be enabled, this is idempotent)
create extension if not exists vector;

-- ── Profiles ─────────────────────────────────────────────────
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  stripe_customer_id text unique,
  queries_today integer not null default 0 check (queries_today >= 0),
  queries_reset_at timestamptz not null default now(),
  documents_this_month integer not null default 0 check (documents_this_month >= 0),
  documents_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Documents ─────────────────────────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  filename text not null,
  r2_key text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  file_size_bytes integer not null check (file_size_bytes > 0),
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  page_count integer,
  extracted_text_preview text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

-- ── Document Chunks (pgvector RAG) ────────────────────────────
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  token_count integer,
  created_at timestamptz not null default now()
);

alter table public.document_chunks enable row level security;

create policy "Users can view own document chunks"
  on public.document_chunks for select
  using (auth.uid() = user_id);

create policy "Service role can manage chunks"
  on public.document_chunks for all
  using (auth.role() = 'service_role');

-- HNSW index for fast similarity search
create index on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

-- ── Conversations ─────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  document_id uuid references public.documents(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Users can manage own conversations"
  on public.conversations for all
  using (auth.uid() = user_id);

-- ── Messages ─────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb default '[]'::jsonb,
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Users can manage own messages"
  on public.messages for all
  using (auth.uid() = user_id);

-- ── Updated_at triggers ───────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_documents_updated_at
  before update on public.documents
  for each row execute procedure public.update_updated_at();

create trigger update_conversations_updated_at
  before update on public.conversations
  for each row execute procedure public.update_updated_at();
