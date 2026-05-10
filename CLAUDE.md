# CLAUDE.md — Juridisk Codebase Guide

> This file is the single source of truth for any AI assistant (or human contributor) working on
> this codebase. Read it entirely before writing any code. It is authoritative over any general
> conventions you may have been trained on.

---

## 1. Project Overview

**Juridisk** is a Norwegian AI-powered legal assistant for founders, startups, and SMEs operating
under Norwegian and EEA law. Users upload legal documents (PDF, DOCX) or ask free-form legal
questions. The system retrieves relevant Norwegian law via the Lovdata Pro API, reasons over the
document and legal context, and returns a grounded, cited, Norwegian-language answer.

**This is not a generic chatbot.** Every architectural decision is calibrated to Norwegian law,
bootstrap economics, GDPR compliance, and solo-founder build velocity.

**One-line product description (Norwegian):**
> AI-drevet juridisk rådgiver for norske gründere og bedrifter.

---

## 2. Repository Origin and AGPL Compliance

This project is forked from [willchen96/mike](https://github.com/willchen96/mike), which is
licensed under **AGPL-3.0**.

### What this means in practice

| File origin | License | Rule |
|---|---|---|
| Files inherited or modified from `willchen96/mike` | AGPL-3.0 | Must remain AGPL-3.0. All modifications must be published. |
| New files written for Juridisk | Proprietary (default) | May be kept closed-source. |
| Files in `/src/core/` | AGPL-3.0 | Always treat as AGPL. Never mix proprietary logic here. |
| Files in `/src/proprietary/` | Proprietary | Never import AGPL code here. This is the moat. |

### Never do the following
- Do not move business logic, prompt architecture, billing, or onboarding code into `/src/core/`.
- Do not import `/src/proprietary/` modules from `/src/core/` files.
- Do not strip AGPL license headers from inherited files.
- If unsure whether a file is Mike-derived, check `git log --follow <file>`.

### Where the competitive moat lives
The AGPL applies to code structure, not knowledge. The moat is:
1. The Norwegian legal prompt architecture (in `/src/proprietary/prompts/`)
2. The Lovdata retrieval pipeline (in `/src/proprietary/retrieval/`)
3. The product design and UX
4. The brand and distribution

---

## 3. Tech Stack

### Frontend
- **Framework:** Next.js 16 with App Router
- **Language:** TypeScript (strict mode, no `any`)
- **Runtime UI:** React 19
- **Styling:** Tailwind CSS 4 + shadcn/ui components
- **AI streaming:** Vercel AI SDK (`useChat`, `useCompletion`)
- **Auth client:** `@supabase/auth-helpers-nextjs`

### Backend
- **Runtime:** Node.js 20+ on Railway (persistent process, no serverless timeouts)
- **Framework:** Express.js with TypeScript
- **AI calls:** Anthropic TypeScript SDK (`@anthropic-ai/sdk`) -- server only, never client.
  Primary model is `claude-opus-4-7` via `ANTHROPIC_MODEL`.
- **Document processing:** LibreOffice headless (DOCX to PDF), `pdf-parse` (text extraction)
- **Embeddings:** Supabase `pgvector` extension with OpenAI `text-embedding-3-small`.
  The shared backend embedding helper is implemented in `backend/src/services/embeddings.ts`.

### Database and Auth
- **Provider:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (magic link + Google OAuth)
- **RLS:** Enabled on every table, no exceptions
- **Realtime:** Used for document processing status updates

### Storage
- **User documents:** Cloudflare R2 (S3-compatible, zero egress fees)
- **Max file size:** 10MB per upload, enforced at middleware level

### Legal Data
- **Source:** Lovdata public data ingestion into `law_chunks` for Phase 1 retrieval
- **Caching:** Not implemented in Day 3. Redis caching is deferred to Phase 2.
- **Stored legal corpus:** Ingested Lovdata law chunks are stored in `law_chunks` with embeddings.
  User-facing message storage only stores citation metadata in `messages.citations`.

### Payments
- **Provider:** Stripe
- **Currency:** NOK
- **Webhook:** Stripe webhook to Railway backend drives all entitlement changes
- **No client-side payment logic** -- all Stripe calls go through the backend

### Deployment
- **Frontend:** Vercel (hobby tier, App Router, edge config for feature flags)
- **Backend:** Railway (persistent Node.js, 512MB RAM sufficient for Phase 1)
- **Domain:** `.no` domain via Domeneshop.no

---

## 4. File and Directory Structure

```
juridisk/
├── src/
│   ├── app/                         # Next.js App Router (frontend)
│   │   ├── (auth)/                  # Auth pages: login, register, callback
│   │   ├── (dashboard)/             # Protected app pages
│   │   │   ├── chat/                # Main chat interface
│   │   │   ├── documents/           # Document library
│   │   │   └── settings/            # User settings, billing
│   │   ├── api/                     # Next.js API routes (non-AI, lightweight only)
│   │   │   └── webhooks/stripe/     # Stripe webhook handler
│   │   ├── layout.tsx
│   │   └── page.tsx                 # Landing page
│   │
│   ├── core/                        # AGPL-3.0 — Mike-derived code
│   │   ├── chat/                    # Base chat primitives from Mike
│   │   ├── document/                # Base document handling from Mike
│   │   └── README.md                # States AGPL-3.0, links to Mike repo
│   │
│   ├── proprietary/                 # Proprietary — Juridisk-specific
│   │   ├── agents/                  # Agent orchestration logic
│   │   ├── prompts/                 # All system prompts (versioned)
│   │   ├── retrieval/               # Lovdata Pro API client and RAG pipeline
│   │   ├── billing/                 # Stripe integration, entitlement checks
│   │   ├── ratelimit/               # Per-user rate limiting middleware
│   │   └── i18n/                    # Norwegian UI strings
│   │
│   ├── components/                  # React components
│   │   ├── ui/                      # shadcn/ui base components (do not modify)
│   │   ├── chat/                    # Chat UI components
│   │   ├── documents/               # Document upload, list, viewer
│   │   └── layout/                  # Shell, nav, sidebar
│   │
│   ├── lib/                         # Shared utilities
│   │   ├── supabase/                # Supabase client (server and browser variants)
│   │   ├── r2/                      # Cloudflare R2 client
│   │   └── utils.ts                 # Generic helpers
│   │
│   └── types/                       # Shared TypeScript types
│       ├── database.ts              # Generated from Supabase schema
│       └── api.ts                   # API request/response types
│
├── backend/                         # Express.js backend (deployed to Railway)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── ai.ts                # All AI endpoints
│   │   │   ├── documents.ts         # Document upload, processing
│   │   │   └── health.ts            # Health check
│   │   ├── middleware/
│   │   │   ├── auth.ts              # JWT validation via Supabase
│   │   │   ├── ratelimit.ts         # Per-user rate limiting
│   │   │   └── validate.ts          # Request validation (zod)
│   │   ├── services/
│   │   │   ├── anthropic.ts         # Claude API calls -- only file that touches Anthropic SDK
│   │   │   ├── lovdata.ts           # Lovdata Pro API client
│   │   │   ├── documents.ts         # LibreOffice + pdf-parse pipeline
│   │   │   └── embeddings.ts        # pgvector upsert/query
│   │   └── index.ts                 # Express app entry point
│   ├── package.json
│   └── tsconfig.json
│
├── supabase/
│   ├── migrations/                  # SQL migrations (versioned, never edited after apply)
│   └── seed.sql                     # Dev seed data only
│
├── docs/
│   ├── CLAUDE.md                    # This file
│   ├── AGENTS.md                    # Agent architecture
│   ├── PRD.md                       # Product requirements
│   └── ROADMAP.md                   # Build roadmap
│
├── .env.example                     # Template -- no real values, ever
├── CLAUDE.md                        # Symlink or copy of docs/CLAUDE.md at root
└── package.json                     # Root (frontend)
```

---

## 5. Environment Variables

### Frontend (Next.js on Vercel)

```bash
# Safe to expose to the browser -- Supabase anon key is designed to be public
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Backend URL -- no secret, just a URL
NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app
```

### Backend (Express on Railway)

```bash
# Secrets -- never in frontend, never NEXT_PUBLIC_ prefixed
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
LOVDATA_API_KEY=...
CLOUDFLARE_R2_ACCESS_KEY_ID=...
CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
CLOUDFLARE_R2_BUCKET_NAME=juridisk-documents
CLOUDFLARE_R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
SUPABASE_URL=https://your-project.supabase.co

# Config
NODE_ENV=production
PORT=3001
RATE_LIMIT_FREE_DAILY=10
RATE_LIMIT_FREE_MONTHLY_DOCS=3
```

**Axiom:** If a variable contains a secret and has `NEXT_PUBLIC_` prefix, it is a critical security
bug. Fix it before any other task.

---

## 6. Security Axioms

These are not preferences. They are constraints. Do not negotiate them, do not work around them,
do not mark them as TODO.

1. **All Anthropic API calls originate from the backend only.** The frontend calls
   `NEXT_PUBLIC_BACKEND_URL/api/ai/*`. It never calls `api.anthropic.com` directly.

2. **Every Supabase table has RLS enabled.** Every policy is scoped to `auth.uid()`. If you
   create a migration that adds a table without a RLS policy, it is a bug.

3. **User documents are scoped at the database level.** The `documents` table has a `user_id`
   column with a RLS policy `USING (auth.uid() = user_id)`. The application layer never manually
   filters by user -- the database enforces it.

4. **JWT validation is server-side on every protected route.** The backend middleware extracts
   the Bearer token, calls `supabase.auth.getUser(token)`, and rejects invalid tokens with 401.
   It never trusts a `user_id` passed in the request body.

5. **File uploads are validated before storage.** Allowed MIME types: `application/pdf`,
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Max size: 10MB.
   Validation happens in backend middleware, not in the frontend component.

6. **No user content is logged in plaintext in production.** Log request metadata (user_id hash,
   document_id, latency, token count). Never log the user's document text or query string.

7. **Rate limiting is enforced at the backend middleware layer.** The frontend may show usage
   counts for UX purposes, but the backend is the enforcement point. Never trust a frontend claim
   that a user has remaining quota.

8. **Stripe webhook signature is verified on every webhook call.** Use
   `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Reject any webhook that
   fails signature verification before touching the database.

---

## 7. Coding Standards

### TypeScript
- Strict mode is on. `"strict": true` in all `tsconfig.json` files.
- No `any`. Use `unknown` and narrow it. Use `z.infer<typeof schema>` for validated types.
- All API request and response bodies are validated with `zod` on the backend.
- Generate Supabase types with `supabase gen types typescript` and commit the output to
  `src/types/database.ts`. Never hand-write database types.

### React / Next.js
- Use Server Components by default. Add `"use client"` only when you need browser APIs,
  event handlers, or hooks.
- Never fetch data in a Client Component that could be fetched in a Server Component.
- Loading states: every async Server Component is wrapped in a `<Suspense>` with a skeleton.
- Error states: every route segment has an `error.tsx` boundary with a Norwegian error message
  and a retry button.
- No inline styles. Tailwind classes only. If you are writing a `style={}` prop, reconsider.

### API Design
- All backend routes return `{ data: T, error: null }` on success and `{ data: null, error: string }` on failure.
- HTTP status codes are used correctly: 200, 201, 400, 401, 403, 404, 422, 429, 500.
- 429 responses include a `Retry-After` header.
- All routes are prefixed `/api/v1/`.

### Naming Conventions
- Files: `kebab-case.ts` for utilities and services, `PascalCase.tsx` for React components.
- Variables and functions: `camelCase`.
- Types and interfaces: `PascalCase`. Prefix interfaces with `I` only for dependency injection contracts.
- Database columns: `snake_case` (Postgres convention).
- Environment variables: `SCREAMING_SNAKE_CASE`.

### Comments
- Write comments that explain *why*, not *what*.
- Use `// TODO(ferdinand):` for decisions deferred, with a one-line description of what needs deciding.
- Use `// SECURITY:` to flag any code path that touches auth, secrets, or user data.
- Use `// AGPL:` to flag any file that is Mike-derived and must remain open-source.

---

## 8. Language Requirements

**All user-facing text is in Norwegian Bokmål.** This is not optional.

- UI strings: Norwegian. Stored in `/src/proprietary/i18n/nb.ts`.
- Error messages shown to users: Norwegian.
- Legal disclaimers: Norwegian.
- Email content: Norwegian.
- Loading states, empty states, success messages: Norwegian.

**Code, comments, and documentation are in English.**

If you write a user-facing string in English, it is a bug. If you are unsure of the Norwegian
translation, write it in English with a `// i18n:` comment flagging it for review.

### Key Norwegian UI strings (reference)

```typescript
export const nb = {
  errors: {
    generic: "Noe gikk galt. Prøv igjen.",
    rateLimit: "Du har brukt opp dagens gratis spørsmål. Oppgrader til Pro for ubegrenset tilgang.",
    documentProcessing: "Dokumentet kunne ikke behandles. Sjekk at filen er et gyldig PDF- eller Word-dokument.",
    unauthorized: "Du må logge inn for å bruke denne funksjonen.",
    fileTooLarge: "Filen er for stor. Maksimal filstørrelse er 10 MB.",
    invalidFileType: "Kun PDF- og Word-dokumenter støttes.",
  },
  disclaimer: {
    short: "Dette er ikke juridisk rådgivning. Konsulter en advokat for bindende beslutninger.",
    full: "Juridisk AI gir generell informasjon basert på norsk lov og offentlig tilgjengelig rettskildemateriale. Svarene utgjør ikke juridisk rådgivning og etablerer ikke et klient-advokat-forhold. For beslutninger med rettslige konsekvenser anbefales det alltid å konsultere en kvalifisert advokat.",
  },
  loading: {
    analyzing: "Analyserer dokumentet...",
    thinking: "Tenker...",
    retrieving: "Henter rettskilder fra Lovdata...",
  },
}
```

---

## 9. Legal Content Handling

This product gives information about law. That creates obligations and risks.

### What the system must always do
- Append the short disclaimer (`nb.disclaimer.short`) to every AI response shown to the user.
- Never claim that an AI response constitutes legal advice.
- Never tell a user they do not need a lawyer.
- Always surface the Lovdata citation for any specific legal claim (statute, section, paragraph).
- If the AI is uncertain about a legal point, it must say so in Norwegian.

### What the system must never do
- Give tax advice (outside scope -- reject with a clear message).
- Give advice about criminal proceedings.
- Generate documents for use in active litigation.
- Claim that a generated document template is legally binding without lawyer review.

### Citation format
Norwegian legal citations follow this format in AI output:

```
[Lov name], § [section] ([year]) -- Lovdata: [URL]

Example:
Arbeidsmiljøloven § 15-3 (2005) -- Lovdata: https://lovdata.no/lov/2005-06-17-62/§15-3
```

The Lovdata retrieval service returns structured citation objects. The prompt architecture injects
them as grounded context. The AI is instructed to cite only from injected context, not from
training data alone.

---

## 10. Working with the Lovdata Pro API

The Lovdata Pro API is the source of truth for all Norwegian law content.

- The API client lives in `backend/src/services/lovdata.ts`.
- It is the only file that may call `api.lovdata.no`.
- Results are cached: 24-hour TTL for law text (stable), 1-hour TTL for search results.
- Full law text is never persisted to the Supabase database -- only citation metadata.
- If the Lovdata API is unavailable, the system falls back gracefully: the AI answers from
  training knowledge only and appends a notice: "Lovdata-tilkobling er midlertidig utilgjengelig.
  Svaret er basert på generell juridisk kunnskap og kan mangle aktuelle lovendringer."

---

## 11. AI Model Selection Policy

| Task | Model | Reason |
|---|---|---|
| Legal Q&A with document context | `claude-opus-4-7` | Primary model currently configured for Phase 1 quality |
| Document summarization (first pass) | `claude-haiku-4-5` | Cheap, fast, sufficient for summary |
| Document risk flagging | `claude-sonnet-4-5` | Requires nuanced legal reasoning |
| Draft generation | `claude-sonnet-4-5` | Quality over cost for user-facing output |
| Embedding generation | `text-embedding-3-small` (OpenAI) | Implemented via `backend/src/services/embeddings.ts` |

Never use a more expensive model where a cheaper one is sufficient. Always log model used,
input tokens, and output tokens per request to track cost against the $20/month hard cap.

---

## 12. Database Schema Overview

Full migrations live in `supabase/migrations/`. This is the canonical schema summary.

```sql
-- Users are managed by Supabase Auth (auth.users table)
-- We extend with a public profile:

create table public.profiles (
  id uuid references auth.users(id) primary key,
  email text not null,
  tier text not null default 'free', -- 'free' | 'pro'
  stripe_customer_id text,
  queries_today integer not null default 0,
  queries_reset_at timestamptz not null default now(),
  documents_this_month integer not null default 0,
  documents_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  filename text not null,
  r2_key text not null,        -- key in Cloudflare R2
  status text not null default 'processing', -- 'processing' | 'ready' | 'error'
  page_count integer,
  extracted_text_preview text, -- first 500 chars only, for display
  created_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  document_id uuid references public.documents(id), -- nullable for general Q&A
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) not null,
  role text not null, -- 'user' | 'assistant'
  content text not null,
  citations jsonb,    -- array of { law: string, section: string, url: string }
  model text,         -- which Claude model was used
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

-- RLS policies (abbreviated -- full policies in migrations)
alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Example policy pattern (replicated for all tables):
create policy "Users can only see their own data"
  on public.documents for all
  using (auth.uid() = user_id);
```

---

## 13. How to Start a New Session on This Codebase

If you are a Claude session that has just been given this file and nothing else, do the following
before writing any code:

1. Read `AGENTS.md` to understand the AI agent architecture.
2. Read the relevant section of `PRD.md` for the feature you are building.
3. Check `supabase/migrations/` to understand the current database schema.
4. Check the current file structure before creating new files -- the directory may already exist.
5. Ask Ferdinand to confirm the target phase (Phase 1, 2, or 3) before starting any task.
6. Never modify files in `src/core/` without confirming they are not Mike-derived.
7. Run `git log --oneline -10` to orient yourself in the commit history.

When in doubt, ask. Ferdinand is the sole decision-maker on product, legal, and architecture
questions. Do not make autonomous decisions on anything that touches billing, legal content policy,
or AGPL compliance.

---

## 14. Session Handoff Notes

This section is updated at the end of each build session. It is the first thing a new session
should read after the rest of CLAUDE.md.

### After Day 3

**Confirmed working locally:**
- TypeScript build: `npm run build` passes in `backend/`
- Auth middleware: Bearer token is validated with `supabase.auth.getUser()`, and new Day 3 routes can read `req.user`
- Rate limit middleware: chat route uses Day 2 `checkQueryLimit`; query count is incremented once after a successful assistant response
- Lovdata retrieval: semantic search service exists and calls `match_law_chunks` pgvector RPC
- Document upload service: R2 upload, PDF extraction, chunking, embeddings, and `document_chunks` upsert are implemented
- Chat route: SSE streaming route exists with disclaimer enforcement and citation extraction

**Not yet confirmed in this session:**
- Live Railway health check
- Valid Supabase JWT route checks
- Real Anthropic/OpenAI/R2 calls
- PDF upload status transition within 60 seconds
- Rate-limit exhaustion behavior with a real profile

**Known deviations from original spec:**
- Current migrations use `law_chunks.content/source_url` rather than `chunk_text/url`; Day 3 code maps those columns to the route/service interfaces.
- Current migrations use `document_chunks.content` rather than `chunk_text`; Day 3 document code writes to `content`.
- Vector search is implemented through Supabase RPC functions in `supabase/migrations/004_vector_search_functions.sql` because Supabase JS cannot express pgvector `<=>` ordering directly.
- LibreOffice availability on Railway is not verified in this session.
- `ANTHROPIC_MODEL` was added to the expected backend environment but may still need to be set in Railway.

**Route deviation resolved:**
- Mike-derived `documents.ts` moved to `backend/src/core/routes/documents.ts` (AGPL-preserved, inactive)
- Juridisk v1 document API is in `backend/src/routes/documents.ts`, mounted at `/api/v1/documents`
- No conflicting mounts remain

**SSE endpoint: not yet confirmed against live Railway.** Run the curl test in Task 5
before starting Day 4 frontend work.

**What the next session (Day 4) must do first:**
- Read this section before writing frontend code.
- Confirm backend SSE endpoint with a curl test before building the chat UI against it:
```bash
curl -N -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hva er oppsigelsestiden?","conversationId":"YOUR_UUID"}' \
  https://YOUR_RAILWAY_URL/api/v1/ai/chat
```
- Check Railway logs for any startup errors before assuming the backend is clean.

**Open decisions deferred:**
- Redis caching for Lovdata search results (currently no caching -- Phase 2)
- LibreOffice on Railway: confirm nixpacks config installs it or document the workaround
- Decide whether to migrate existing `content` columns to `chunk_text` later, or keep the deployed schema names and update docs/specs consistently

### After Day 4

- Chat page: `frontend/src/app/(dashboard)/chat/page.tsx` (Server Component, auth guard)
- Chat layout: `frontend/src/app/(dashboard)/chat/ChatLayout.tsx` (Client Component, all state)
- SSE stream parsing: handles `type=delta` and `type=done` events from the backend, including both `text` and `content` delta fields
- Supabase SSR clients: `frontend/src/lib/supabase/client.ts` (browser) and `frontend/src/lib/supabase/server.ts` (server)
- Norwegian strings: `frontend/src/lib/nb.ts` -- add all new strings here, never inline
- Document upload: `frontend/src/components/documents/DocumentUpload.tsx` -- MIME and size validation before fetch
- Route guard: `frontend/src/middleware.ts` protects `/chat` and redirects unauthenticated users to `/login`
- Live SSE endpoint: not yet confirmed against Railway with a real Supabase JWT in this local session
- Next task: Day 5 document processing backend integration and live E2E checks -- see `ROADMAP.md` Day 5 tasks

### After Day 5

- Token optimization: `backend/src/lib/tokenBudget.ts` -- all thresholds and budgets live here.
- Compression: `backend/src/services/compression.ts` -- Haiku sentence extraction pass for retrieved chunks.
- Document summary: `backend/src/services/documentSummary.ts` -- Batch API submission and polling helpers.
- Batch poller: `backend/src/jobs/summaryPoller.ts` -- runs inside the Express process every 30s.
- Cache warmup: fires from `summaryPoller` after Batch API completion and pre-warms the static prompt + document summary cache blocks.
- pgvector RPC: `match_document_chunks` in `supabase/migrations/006_document_chunk_search.sql` -- always scoped to `user_id` and `document_id`.
- Cost logger: every completed AI stream logs `estimated_cost_usd`, cache read/write token metadata, query type, document-context flag, and compression savings.
- LibreOffice: `backend/nixpacks.toml` and `backend/Dockerfile` both exist in `backend/`; Nixpacks should be tried first.
- Migration status: `supabase/migrations/005_document_summary.sql` and `006_document_chunk_search.sql` exist, but `supabase db push` was not applied locally because the checkout is not linked to a Supabase project ref.

### After Day 5 live verification

**Production URLs:**
- Frontend: `https://ai.fpvetleseter.com`
- Backend (Railway): `https://mike-production-bc69.up.railway.app`

**Confirmed in production:**
- Core chat path: sign-in, create/list conversations, stream assistant replies over SSE, persist messages (end-to-end verified).

**Profiles row requirement:**
- Backend features that read `public.profiles` (rate limits, tier, usage) assume a profile row exists for every `auth.users` id. The `on_auth_user_created` trigger creates profiles for new sign-ups, but it predates some test accounts. Backfill safely with:
  ```sql
  insert into public.profiles (id, email)
  select id, email from auth.users
  on conflict (id) do nothing;
  ```
  Adjust the column list if the migration adds non-default columns without defaults.

**Known issues — prioritize at start of Day 6:**
1. SSE stream cuts off mid-response
2. Lovdata retrieval not injecting into prompt
3. Disclaimer rendering twice in chat UI

**Still not production-verified:** document upload pipeline, PDF/DOCX processing on Railway, and document-grounded Q&A against live R2 and embeddings (code exists; live run pending).

### After Day 6

- Billing route: `backend/src/routes/billing.ts`
  - `POST /api/v1/billing/checkout` is authenticated, creates or reuses a Stripe customer, stores `profiles.stripe_customer_id`, and returns `{ data: { url }, error: null }`.
  - `POST /api/v1/billing/portal` is authenticated, requires an existing `profiles.stripe_customer_id`, and returns `{ data: { url }, error: null }`.
- Stripe webhook route: `backend/src/routes/webhooks.ts`
  - Mounted at `/api/v1/webhooks/stripe` before `express.json()` using `express.raw({ type: "application/json" })`.
  - Verifies `stripe-signature` with `stripe.webhooks.constructEvent()` before any database write.
  - Returns 200 after signature verification and processes entitlement updates asynchronously.
  - `checkout.session.completed` sets `profiles.tier = 'pro'`; `customer.subscription.deleted` sets `profiles.tier = 'free'`.
- Frontend settings page: `frontend/src/app/(dashboard)/settings/page.tsx`
  - Server Component with Supabase auth guard.
  - Shows `Gratis` / `Pro`, `Spørsmål brukt i dag:`, Checkout for free users, and Customer Portal for Pro users.
  - Uses server actions to forward the Supabase JWT to the backend; no Stripe secret is exposed to frontend code.
- Chat limit UI: `frontend/src/app/(dashboard)/chat/ChatLayout.tsx`
  - A 429 response from `/api/v1/ai/chat` now shows an inline Norwegian upgrade prompt with a button to `/settings`.
- Environment: `backend/.env.example` now includes `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRO_PRICE_ID`.
- Verification completed locally:
  - `npm run build` in `backend/` passes.
  - `npm run build` in `frontend/` passes.
- Live E2E still pending:
  - Stripe Checkout URL creation with live/test key.
  - Stripe Customer Portal URL creation.
  - Signed Stripe webhook delivery to Railway and observed `profiles.tier` updates.

### After Day 6 UI (Iteration 2)

**Components rebuilt:**
- `frontend/src/components/layout/Sidebar.tsx`: Rebuilt from scratch with five zones. Glass effect (`rgba(18, 14, 10, 0.68)`, `blur(16px)`, `saturate(1.5)`).
- `frontend/src/components/chat/EmptyState.tsx`: Tagline fixed with `var(--color-accent-gold)` and text-shadow.
- `frontend/src/app/(dashboard)/chat/ChatLayout.tsx`: Added `handleUpgrade` (wired to `/api/v1/billing/checkout`), passed new props to Sidebar, added mobile progress bar.
- `frontend/src/lib/nb.ts`: Added strings for usage, upgrade, and empty state.
- `frontend/src/app/globals.css`: Added `pulse-bar` animation.

**Architectural conventions established:**
- **Glass surfaces:** Use `backdrop-filter` with `isolation: isolate` for all glass components. Avoid solid backgrounds.
- **Usage tracking:** Frontend usage bars are driven by `queriesToday` passed from `ChatPage` server component.
- **Tailwind v4:** `tailwind.config.ts` is absent; all theme configuration and animations live in `globals.css`.

**Next dependencies:**
- The upgrade card and button call `POST /api/v1/billing/checkout`. This requires the backend to be deployed to Railway with valid Stripe environment variables (`STRIPE_SECRET_KEY`, etc.).
- Day 7 tasks (landing page, onboarding) are next.

### After Day 6 UI (Iteration 3)

**Glass fix — critical pattern:**
- `SidebarRoot` uses inline `style` (not Tailwind classes) for all glass properties:
  `background: "rgba(18, 14, 10, 0.68)"`, `backdropFilter: "blur(16px) saturate(1.5)"`,
  `WebkitBackdropFilter: "blur(16px) saturate(1.5)"`, `isolation: "isolate"`.
- Any future wrapper around `<Sidebar>` MUST NOT set a solid `background-color`.
  The painting is composited through the sidebar by the browser because the body's
  `background-image` sits behind the `<aside>` element in the same stacking context.
- Tailwind classes like `backdrop-blur-[16px]` and `saturate-[1.5]` (which targets `filter`,
  not `backdrop-filter`) were replaced with explicit inline styles to guarantee correctness.

**Progress bar (Zone 2):**
- 4px height, track `rgba(255,255,255,0.07)`, border-radius 999px.
- Fill color steps: 0–5 → `#4a9e6b`, 6–7 → `#c9922a`, 8–9 → `#c96a2a`, 10 → `#c93a2a`.
- `transition: width 600ms ease-out, background-color 400ms ease` for smooth color change.
- At 10/10: `pulse-bar` animation (700ms, forwards) is applied to the fill div.

**Upgrade card (Zone 2b) — conditional display pattern:**
- `queriesUsed < 6` (free tier): render ambient copy only, no CTA.
- `queriesUsed >= 6` (free tier): card renders; uses `useEffect` + local state `cardVisible`
  to trigger a CSS transition (opacity 0→1, translateY 4px→0, 300ms ease-out) on mount.
  This avoids needing a CSS keyframe for the slide-in.
- At 10/10: same `pulse-bar` animation on card opacity, plus "Du har brukt alle dagens spørsmål." text.
- Card background: `rgba(201,168,76,0.07)` — no solid fills, no opaque amber box.
- Upgrade button: transparent background, `1px solid rgba(201,168,76,0.5)` border, hover uses
  `onMouseEnter`/`onMouseLeave` to set inline styles (avoids Tailwind `hover:` conflict with inline base).

**New strings:** `frontend/src/lib/nb.ts` now has a `sidebar` section.
  Old `nb.chat.dagensBruk`, `nb.chat.usageToday` remain for ChatLayout backward compatibility.

**Remaining dependencies:**
- `POST /api/v1/billing/checkout` requires Railway deploy with Stripe env vars.
- Input disabled state at initial 10/10 load requires ChatLayout to also check `queriesToday >= 10`
  prop (currently only disabled on 429 response). Not yet implemented — tracked as known gap.
