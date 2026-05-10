# ROADMAP.md — Juridisk Build Roadmap

## Current Build State

**Last updated:** 2026-05-10
**Phase:** 1 -- MVP
**Day completed:** 6 production bugfix shipped for core chat; billing UI and Stripe routes build-verified locally (live Stripe E2E still pending)

### What is live
- **Production app:** Core chat works end-to-end at `https://ai.fpvetleseter.com` (auth, conversations, SSE streaming, rate limits).
- **Production backend:** Railway at `https://mike-production-bc69.up.railway.app`.
- Supabase: eu-west-1, pgvector enabled, Phase 1 tables migrated with RLS per Day 1/2 notes
- Cloudflare R2: bucket `juridisk-documents` configured in env template with endpoint `https://79a4bc1dce5114ee00a16a215e658a91.r2.cloudflarestorage.com`
- Lovdata ingestion: script exists and writes Norwegian law embeddings to `law_chunks`

### Day 6 production bugfix status
- [DONE] SSE route hardened with `X-Accel-Buffering: no`, early `flushHeaders()`, and 15-second heartbeat comments.
- [DONE] Lovdata chat path instrumented with search-result count and prompt-context length logging.
- [DONE] Duplicate assistant-message disclaimer removed from chat renderers; persistent footer disclaimer remains.
- [PENDING] Live authenticated chat retest with Railway logs and screenshot after redeploy.

### What the backend can now do (after Day 3 local build)
- `POST /api/v1/ai/chat` -- authenticated, rate-limited, RAG pipeline, SSE streaming, citations, disclaimer
- `POST /api/v1/conversations` and GET variants -- conversation management
- `POST /api/v1/documents/upload` -- R2 storage, PDF extraction, chunking, embeddings, async processing
- `GET/DELETE /api/v1/documents` -- document library management
- `POST /api/v1/billing/checkout` and `/portal` -- authenticated Stripe Checkout and Customer Portal session creation
- `POST /api/v1/webhooks/stripe` -- raw-body Stripe webhook with signature verification before entitlement writes

### What is not yet built
- Landing page and onboarding (Day 7)
- Document risk analysis -- two-pass pipeline (Phase 2)
- Drafting agent (Phase 2)
- Live document upload and document-grounded Q&A verification (implemented locally; not yet proven against production)
- Live Day 6 Stripe Checkout, Portal, and webhook verification with real Stripe dashboard credentials

### Current Build State (after Day 6 UI Iteration 4)
Sidebar rebuilt as a pure list-based layout — no card components, no borders on individual elements, no backdrop-filter inside the sidebar shell. Only `SidebarRoot` carries the glass treatment.

Five zones: (1) wordmark only, (2) "Ny samtale" icon+text row, (3) 3px progress bar + counter + optional plain-text upgrade link at 6/10+ (free only), (4) conversation list with "Samtaler" section label and simple text rows, (5) footer with avatar, email prefix, optional "· Pro" suffix, logout icon.

Upgrade CTA is a plain `<button>` with `background: none; border: none` — no card, no fill, no border.
Progress bar: 3px height, same green→amber→red color steps, `pulse-bar` at 10/10.
Conversation items: `py-[6px] px-5`, `opacity-75` default, `opacity-90` hover, `opacity-100` + `bg-white/[0.08]` active.
Footer rule: `rgba(255,255,255,0.06)` — not gold.

All Norwegian strings routed through `nb.sidebar.*` in `frontend/src/lib/nb.ts`.
Frontend `npm run build` passes locally.

> Note: Core chat is verified live against production. `supabase db push` may still be unavailable in
> unlinked local checkouts. Live Stripe verification remains pending until Railway has
> `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, and the deployed webhook endpoint configured.

**Format:** Phases, not time-boxes. Each phase has a definition of done. Phase 1 is broken into
day-level tasks. Phases 2 and 3 are task-level but not day-level (scope will be clearer after
Phase 1 ships and real user feedback arrives).

**Principle:** Ship the smallest thing that proves the core value. Do not build Phase 2 features
to unblock a Phase 1 launch. Cut ruthlessly within a phase before cutting across phases.

---

## Critical Decisions (Read Before Building)

These three decisions have the largest downstream consequences if made wrong. Make them
consciously before writing Phase 1 code.

### Decision 1: Lovdata API Terms of Service

**What hangs on it:** Whether you can show Lovdata retrieved text directly to users in the UI,
or must only use it as grounding context for the AI (which paraphrases it).

**Stakes:** If Lovdata's ToS prohibits displaying retrieved law text to end users, the citation
display in the UI must show only the URL and section reference, not the text itself. The AI
response can still be grounded on the text (it just cannot be reproduced verbatim in the UI).

**Action:** Read the Lovdata Pro API terms before building the citation display component.
Build the citation component to display URL + section reference by default, with the full text
display behind a feature flag (`NEXT_PUBLIC_SHOW_LOVDATA_TEXT=true`). This way you can flip it
off without a rewrite if needed.

**Deadline:** Before writing any Lovdata display UI.

### Decision 2: Railway DPA for GDPR

**What hangs on it:** Whether Railway can be used as the backend host for EU users.

**Stakes:** If Railway does not have an adequate GDPR DPA (Data Processing Agreement), you
cannot legally run user data through a Railway-hosted backend serving EU users. Alternatives:
Render (has EU region and DPA), Fly.io (EU region available, DPA available).

**Action:** Check `railway.app/legal` for DPA documentation before launch. If unavailable,
switch to Render EU at the same point in Phase 1 (same Node.js deployment, same config).
The switch costs 2 hours, not 2 days -- but it is much easier to decide now than after deployment.

**Deadline:** Before deploying the backend with any real user data.

### Decision 3: Supabase vs. pgvector vs. External Vector Store

**What hangs on it:** The entire RAG pipeline architecture.

**The choice:** pgvector (built into Supabase, free) vs. Pinecone/Weaviate (external, paid).

**Recommendation:** pgvector in Supabase for Phase 1 and 2. The free tier gives you 500MB
which holds ~500,000 chunks at 1536 dimensions. You will not hit that limit in Phase 1.
pgvector query performance is adequate up to ~100,000 chunks with an HNSW index.
The only reason to leave pgvector is if you hit performance limits at scale -- a good problem
to have, solvable in Phase 3.

**Action:** Build the embedding pipeline against pgvector from day one. Do not build an
abstraction layer that supports multiple vector stores -- YAGNI. If you need to migrate later,
migrate then.

**Deadline:** Before writing the document chunking pipeline.

---

## Phase 1 -- Foundation and MVP

**Goal:** A working product that Ferdinand can show to 10 real Norwegian founders and get honest
feedback from. Not polished. Not feature-complete. Provably useful for the core use case:
asking a legal question and getting a grounded, cited Norwegian-language answer.

**Definition of done:**
- User can sign up, ask a legal question, get a streamed response with Lovdata citations
- User can upload a PDF or DOCX and ask questions about it
- Free tier rate limiting works correctly
- Stripe Pro subscription flow works end-to-end (including webhook)
- Zero critical security issues (RLS working, no exposed secrets, JWT validated server-side)
- Deployed and accessible at the production domain
- All user-facing text is in Norwegian
- Privacy Policy and Terms of Service published

---

### Day 1 -- Repository and Infrastructure Setup

**Tasks:**

- [DONE] Fork `willchen96/mike` into Ferdinand's GitHub account as `juridisk`
- [DONE] Create `/src/core/` directory, move all Mike-derived files into it, add `README.md` with
      AGPL-3.0 notice and link to upstream repo
- [DONE] Create `/src/proprietary/` directory with `.gitkeep` and a `LICENSE` file (proprietary)
- [DONE] Set up `tsconfig.json` with strict mode in both root and `/backend/`
- [DONE] Install root dependencies: Next.js 14, TypeScript, Tailwind, shadcn/ui init
      > Note: Current frontend package uses Next.js 16, React 19, and Tailwind 4.
- [DONE] Install backend dependencies: Express, @anthropic-ai/sdk, @supabase/supabase-js,
      stripe, zod, pdf-parse, cors, helmet
- [DONE] Create `.env.example` with all required variables (no real values)
- [DONE] Create `.gitignore` that excludes `.env*` files (except `.env.example`)
- [DONE] Create Supabase project (eu-west-1 region)
- [DONE] Enable pgvector extension in Supabase: `create extension if not exists vector`
- [DONE] Create Railway project, link to GitHub repo `/backend` directory
- [DONE] Create Vercel project, link to GitHub repo root directory
- [DONE] Create Cloudflare R2 bucket named `juridisk-documents` (EU region)
- [DONE] Commit baseline with message: `chore: initial project structure, AGPL separation`

**Deliverable:** Repo exists, deploys are configured (not yet deploying real code), directories
are correctly separated, no secrets are committed.

---

### Day 2 -- Database Schema and Auth

**Tasks:**

- [DONE] Write Supabase migration: `profiles`, `documents`, `conversations`, `messages` tables
      (schema in `CLAUDE.md` Section 12)
- [DONE] Write Supabase migration: `document_chunks` table for pgvector embeddings
      ```sql
      create table public.document_chunks (
        id uuid primary key default gen_random_uuid(),
        document_id uuid references public.documents(id) on delete cascade not null,
        user_id uuid references auth.users(id) not null,
        chunk_index integer not null,
        chunk_text text not null,
        embedding vector(1536),
        created_at timestamptz not null default now()
      );
      create index on document_chunks using hnsw (embedding vector_cosine_ops);
      ```
- [DONE] Write RLS policies for all tables (pattern from `CLAUDE.md` Section 12)
- [DONE] Apply migrations: `supabase db push`
- [DONE] Generate TypeScript types: `supabase gen types typescript > src/types/database.ts`
- [ ] Configure Supabase Auth: enable magic link, enable Google OAuth
      (Google OAuth: register app in Google Cloud Console, add redirect URL)
      > Note: Auth middleware exists; login UI/OAuth runtime verification is still pending.
- [ ] Build auth pages: `/app/(auth)/login/page.tsx` -- magic link form + Google button
- [ ] Build auth callback handler: `/app/(auth)/callback/route.ts`
- [ ] Test: sign up with magic link, confirm session persists, confirm `profiles` row created
      (use a Supabase Auth trigger to auto-create the profile row on `auth.users` insert)
- [DONE] Write the trigger:
      ```sql
      create or replace function public.handle_new_user()
      returns trigger as $$
      begin
        insert into public.profiles (id, email)
        values (new.id, new.email);
        return new;
      end;
      $$ language plpgsql security definer;

      create trigger on_auth_user_created
        after insert on auth.users
        for each row execute procedure public.handle_new_user();
      ```

**Deliverable:** User can sign up and log in. Database schema is applied with RLS. TypeScript
types are generated.

---

### Day 3 -- Backend Foundation

**Tasks:**

- [DONE] Create `backend/src/index.ts`: Express app with `helmet`, `cors` (whitelist Vercel domain),
      JSON body parser, health check at `GET /health`
- [DONE] Create `backend/src/middleware/auth.ts`: JWT validation via Supabase
      ```typescript
      // SECURITY: extract Bearer token, call supabase.auth.getUser(token)
      // Attach user to req.user, reject 401 if invalid
      // Never trust user_id from request body
      ```
- [DONE] Create `backend/src/middleware/ratelimit.ts`: per-user rate limiting (see `AGENTS.md` 2.3)
- [DONE] Create `backend/src/middleware/validate.ts`: zod-based request validation wrapper
- [DONE] Create `backend/src/services/anthropic.ts`: single file that owns all Claude API calls,
      exports `streamLegalResponse()`
- [DONE] Create `backend/src/services/lovdata.ts`: Lovdata retrieval service
      (semantic search over ingested `law_chunks`)
      > Note: Day 3 implementation performs semantic search against ingested `law_chunks`; caching is deferred to Phase 2.
- [ ] Verify Railway deployment: push to main, confirm `GET /health` returns 200
      > Note: deferred to next session -- no Railway credentials/log access were used in this local build session.
- [ ] Set all environment variables in Railway dashboard
      > Note: deferred to next session -- `ANTHROPIC_MODEL` should be confirmed in Railway.

**Deliverable:** Backend is deployed to Railway, health check passes, auth middleware is working
(test with a Supabase JWT from the frontend).

---

### Day 4 -- Core Chat (No Documents)

**Tasks:**

- [DONE] Create `backend/src/routes/ai.ts`: `POST /api/v1/ai/chat`
      - Validate request (zod: `{ message: string, conversationId: string }`)
      - Auth middleware (req.user populated)
      - Rate limit middleware
      - Call `searchLovdata(message)` in parallel with context preparation
      - Build system prompt from `legal-assistant.ts` with injected context
      - Call `streamLegalResponse()` -- stream SSE to client
      - On stream end: save assistant message + citations to `messages` table
      - On stream end: increment `profiles.queries_today`
- [DONE] Create `backend/src/routes/conversations.ts`:
      - `POST /api/v1/conversations` -- create new conversation, return id
      - `GET /api/v1/conversations` -- list user's conversations (last 20)
      - `GET /api/v1/conversations/:id/messages` -- get messages for conversation
- [DONE] Create the Legal Assistant system prompt file:
      `src/proprietary/prompts/legal-assistant.ts` (full prompt from `AGENTS.md` Section 3.2)
      > Note: Actual backend path is `backend/src/proprietary/prompts/legal-assistant.ts`.
- [DONE] Build chat UI: `/app/(dashboard)/chat/page.tsx`
      > Note: Actual frontend path is `frontend/src/app/(dashboard)/chat/page.tsx`.
      - Message list with streaming (Vercel AI SDK `useChat` or manual SSE reader)
      - Input box, send button
      - Disclaimer footer
      - Citation display below each assistant message
      - Loading skeleton while streaming
      - Error state in Norwegian with retry button
- [ ] Test end-to-end: ask "Hva er oppsigelsestiden for en fast ansatt?" -- verify Lovdata
      citations appear, disclaimer is present, rate limit counter decrements
      > Note: pending live Supabase JWT and Railway runtime verification.

**Deliverable:** Core chat works. A user can ask a Norwegian legal question and get a grounded,
cited, streamed response. This is the product's core value. Everything else is infrastructure.

---

### Day 5 -- Document Upload and Processing

**Tasks:**

- [x] Install LibreOffice on Railway (add to Dockerfile or nixpacks config)
      > Note: `backend/nixpacks.toml` and `backend/Dockerfile` exist; Railway startup log availability is not yet verified.
- [x] Create `backend/src/services/documents.ts`:
      - `processDocument(file, userId, documentId)`:
        1. Validate MIME type and size
        2. Upload original to R2 at `{userId}/{documentId}/{filename}`
        3. If DOCX: convert to PDF with LibreOffice (`child_process.execSync`)
        4. Extract text with `pdf-parse`
        5. Chunk text (800 tokens, 100-token overlap)
        6. Generate embeddings with OpenAI `text-embedding-3-small`
        7. Upsert chunks to `document_chunks` via Supabase
        8. Update `documents.status` to `'ready'`
        9. On error: set status to `'error'`, log error metadata
- [x] Create `backend/src/routes/documents.ts`:
      - `POST /api/v1/documents/upload` -- multer middleware, trigger processDocument async
      - `GET /api/v1/documents` -- list user's documents
      - `DELETE /api/v1/documents/:id` -- delete document, R2 object, and chunks
- [x] Add document context to chat route: if `documentId` is in the request, retrieve relevant
      chunks via pgvector similarity search and inject into `{{DOCUMENT_CONTEXT}}`
      > Note: Juridisk v1 document routes now live in `backend/src/routes/documents.ts`; the Mike-derived router is preserved inactive under `backend/src/core/routes/documents.ts`.
- [x] Build document upload UI: drag-and-drop + file picker, progress indicator
      > Note: Implemented in `frontend/src/components/documents/DocumentUpload.tsx`; live upload verification is pending credentials.
- [x] Build document library sidebar: list with status badges, Supabase Realtime status updates
      > Note: Phase 1 uses 3-second polling through `GET /api/v1/documents`; Supabase Realtime is deferred to Phase 2.
- [x] Live E2E (production): core chat — sign in, new conversation, streamed answer, persistence
      at `https://ai.fpvetleseter.com` against Railway `mike-production-bc69.up.railway.app`
      > Note: **Day 5 live E2E verification** marked complete for this scope. Production bugs listed under *Fix at start of Day 6*.
- [ ] Test: upload a PDF employment contract, ask "hva er oppsigelsestiden?", verify the
      response references the specific contract clauses (production — not yet verified)

**Deliverable:** Document upload, processing, and Q&A working end-to-end.

---

### Day 6 -- Billing and Rate Limiting

**Fix first (production issues from Day 5 live verification):**
- [DONE] SSE stream cutoff hardening in `backend/src/routes/ai.ts`.
- [DONE] Lovdata retrieval diagnostics in `backend/src/routes/ai.ts` and `backend/src/services/anthropic.ts`.
- [DONE] Duplicate assistant disclaimer removal in chat message renderers.
- [PENDING] Live authenticated chat retest with Railway logs and screenshot.

**Tasks:**

- [DONE] Create Stripe account, create product "Juridisk Pro" at NOK 299/month
      > Note: Code expects `STRIPE_PRO_PRICE_ID`; live Stripe dashboard verification is pending.
- [DONE] Create `backend/src/routes/billing.ts`:
      - `POST /api/v1/billing/checkout` -- create Stripe Checkout Session, return URL
      - `POST /api/v1/billing/portal` -- create Stripe Customer Portal Session, return URL
      - `POST /api/v1/webhooks/stripe` -- handle `checkout.session.completed`,
        `customer.subscription.deleted` -- update `profiles.tier`
- [DONE] Implement webhook signature verification (critical -- see `CLAUDE.md` axiom 8)
- [DONE] Build upgrade prompt component: shown when rate limit is hit, shows remaining queries,
      links to settings
- [DONE] Build settings page: `/app/(dashboard)/settings/page.tsx`
      - Shows current tier, usage stats
      - Upgrade button (free users) or "Administrer abonnement" (Pro users -> portal)
- [ ] Test full billing flow: upgrade, verify tier changes, cancel, verify tier reverts
      > Note: local TypeScript/Next builds pass; live Stripe E2E requires deployed env and webhook setup.
- [ ] Set hard spend cap in Anthropic console: $20/month

**Deliverable:** Free and Pro tiers working. Stripe webhooks updating the database correctly.
A user can upgrade from free to Pro and get immediate unlimited access.

---

### Day 7 -- Landing Page, Onboarding, and Polish

**Tasks:**

- [ ] Build landing page: `/app/page.tsx`
      - Hero: "Norsk juridisk rådgiver for gründere -- tilgjengelig 24/7"
      - Three feature highlights with icons
      - Pricing table: Free vs Pro (NOK 299/month)
      - CTA: "Kom i gang gratis"
      - Footer: disclaimer, privacy policy link, terms link
- [ ] Build onboarding modal: shown once after first login
      - What Juridisk does
      - What it does not do (not a lawyer, not binding advice)
      - Free tier limits
      - "Kom i gang" button to dismiss
      - Store dismissal in `profiles` (add `onboarded_at timestamptz` column)
- [ ] Write Privacy Policy in Norwegian (`/app/personvern/page.tsx`)
- [ ] Write Terms of Service in Norwegian (`/app/vilkar/page.tsx`)
- [ ] Add Vercel Analytics (no cookies, no GDPR consent required)
- [ ] Mobile responsiveness pass: test all core flows on 375px viewport
- [ ] Accessibility pass: add aria labels to all interactive elements, test tab navigation
- [ ] Final security check:
      - [ ] No `NEXT_PUBLIC_` prefixed secrets
      - [ ] All tables have RLS enabled (`select tablename from pg_tables where schemaname = 'public'`
            cross-referenced with `select tablename, rowsecurity from pg_tables`)
      - [ ] Anthropic API key not in any frontend bundle (check with `grep -r "sk-ant" ./src/app/`)
      - [ ] Stripe secret key not in any frontend bundle
- [ ] Deploy to production domain

**Deliverable:** The complete Phase 1 product is live at the production domain. All P1 user
stories are satisfied. No critical security issues. Privacy Policy and Terms of Service published.

---

### Phase 1 Cut List (if time is short)

Cut these in order if Phase 1 is taking too long. They do not affect the core value proof.

1. **Google OAuth** -- magic link alone is sufficient for launch. Add Google OAuth in Phase 2.
2. **Supabase Realtime status updates** -- poll the document status endpoint every 3 seconds
   instead. Less elegant, works fine.
3. **Vercel Analytics** -- skip entirely, add in Phase 2.
4. **Mobile drag-and-drop** -- file picker is sufficient. Drag-and-drop is a UX nicety.
5. **Conversation history sidebar** -- show last 5 conversations only (no pagination).

Do not cut: rate limiting, RLS, JWT validation, the disclaimer, the Privacy Policy, Stripe
webhook signature verification. These are non-negotiable.

---

## Phase 2 -- Quality, Retention, and First Revenue

**Goal:** Turn the MVP into a product that Pro users pay for consistently. Add the features
that convert curious free users into paying Pro users.

**Trigger to start Phase 2:** At least 5 users have used the product for more than 3 days,
at least 1 paying Pro subscriber, and Ferdinand has read the Lovdata API ToS carefully.

### Technical Deliverables

- [ ] Document risk analysis: two-pass pipeline (Haiku + Sonnet) per `AGENTS.md` Section 4
- [ ] Document risk UI: structured risk summary with color-coded severity
- [ ] `search_lovdata` tool use: agent can call Lovdata mid-response for missing citations
- [ ] Redis cache on Railway: replace in-process node-cache with Redis (better performance,
      survives restarts)
- [ ] Conversation export to PDF (Pro only): server-side generation with `puppeteer` or `pdfkit`
- [ ] Multi-turn conversation context: inject last N messages into prompt (context budget: 4,000 tokens)
- [ ] Usage dashboard: "Du har brukt X av 10 spørsmål i dag"
- [ ] Email notifications: document processing complete (Resend.com -- free tier 100 emails/day)
- [ ] Google OAuth (deferred from Phase 1)
- [ ] Rate limit by hour (burst protection): no more than 5 queries in any 10-minute window

### Legal and Compliance Deliverables

- [ ] Have a Norwegian advokat review the disclaimer language and Terms of Service
      (estimated NOK 3,000-6,000 one-time cost -- budget for this from first Pro revenue)
- [ ] Sign or click-accept DPAs with all sub-processors (list in `PRD.md` Section 8)
- [ ] Verify Railway GDPR DPA; switch to Render EU if unavailable
- [ ] Confirm Lovdata ToS permits displaying retrieved text to end users
- [ ] Add GDPR Article 15 data export: JSON download of all user data
- [ ] Add GDPR Article 17 account deletion: cascade delete all user data including R2 objects

### Product Deliverables

- [ ] Document drafting: NDA and Arbeidskontrakt (Norwegian-law-compliant templates)
- [ ] Drafting output as downloadable DOCX
- [ ] Improved citation UI: show section title, not just URL
- [ ] Conversation search (within user's own history)
- [ ] "Hva kan jeg spørre om?" -- suggested prompts on empty state
- [ ] Pro-only badge and features clearly differentiated in UI

### Definition of Done (Phase 2)

- Document risk analysis working and tested on 5 real documents
- At least one paying Pro subscriber
- Advokat has reviewed disclaimer language
- All GDPR sub-processor DPAs in place
- Conversation export working for Pro users

---

## Phase 3 -- Scale and Expansion

**Goal:** Build the features that justify a Team tier and expand the addressable market.
Only begin Phase 3 when Phase 2 has produced consistent monthly revenue.

**Trigger to start Phase 3:** NOK 5,000+ MRR (approximately 17 Pro subscribers), stable
infrastructure (no repeated Railway restarts or Supabase quota issues).

### Potential Deliverables (to be prioritized with real user feedback)

- [ ] Team tier (NOK 799/month): multi-user, shared document library, admin dashboard
- [ ] Altinn integration: fetch company data (org number, registered roles) to pre-fill context
- [ ] Brønnøysund API integration: validate company details, fetch articles of association
- [ ] Full document suite: Aksjonæravtale, Leiekontrakt, Konsulentavtale, Opsjonsavtale
- [ ] Clause library: searchable index of standard Norwegian contract clauses with explanations
- [ ] Webhook API for developers: allow third-party integrations (requires AGPL analysis)
- [ ] White-label option for law firms and accelerators
- [ ] Advanced analytics dashboard for Ferdinand: cost per query, conversion funnel, churn rate
- [ ] Automated GDPR compliance audit: upload your data processing register, get a gap analysis

### Architecture decisions deferred to Phase 3

- External vector store (Pinecone) if pgvector performance degrades at scale
- Separate embedding service if OpenAI costs become significant
- Multi-region deployment if Norwegian latency is a user complaint
- SOC2 / ISO 27001 if enterprise customers require it

---

## Appendix: What This Roadmap Intentionally Does Not Include

- **Time estimates.** You are a solo founder in law school. Time estimates become sources of guilt,
  not productivity. Phases are the unit of progress.
- **Gantt charts.** Same reason.
- **Investor milestones.** This is a bootstrap product. The milestone is revenue, not a deck.
- **Marketing plan.** Separate document. Phase 1 distribution is Ferdinand's network in the Oslo
  startup scene. The product has to earn word of mouth before it earns a marketing budget.
