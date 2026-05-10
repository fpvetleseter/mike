# AGENTS.md — Juridisk AI Agent Architecture

> This document defines every AI agent in the Juridisk system: their responsibilities, prompts,
> tools, guardrails, and handoff protocols. It is the authoritative reference for anyone modifying
> AI behavior. System prompts are versioned -- never edit a prompt in place without bumping the
> version constant.

---

## 1. Agent Overview

### Implementation Status

| Agent | Status | Notes |
|---|---|---|
| Legal Assistant Agent | LIVE in production | System prompt v1.0.0 lives in `backend/src/proprietary/prompts/legal-assistant.ts`; `/api/v1/ai/chat` streams SSE; UI at `ai.fpvetleseter.com` |
| Document Analysis Agent | Not started | Phase 2 -- two-pass Haiku + Sonnet pipeline |
| Drafting Agent | Not started | Phase 2 |
| Lovdata Retrieval Service | Deployed but not injecting (bug) | Queries `law_chunks` via pgvector RPC using cosine similarity; drops results below 0.70 before injection — **prompt injection broken in production; fix at start of Day 6** |
| Document Context Extraction | Implemented and build-verified locally | Queries `document_chunks` through `match_document_chunks`, scoped to `user_id` and `document_id`; Haiku compression and summary cache are implemented |
| Rate Limit Middleware | Implemented locally | 10 queries/day free tier, enforced server-side before AI route; frontend visually enforces limit with green→red progress bar, usage-gated upgrade CTA at 6/10, and disabled input + upgrade prompt at 10/10 (triggered by backend 429 response) |
| Billing and Entitlement Service | Implemented and build-verified locally | Stripe Checkout, Customer Portal, and signed webhook entitlement updates live in `backend/src/routes/billing.ts` and `backend/src/routes/webhooks.ts`; upgrade card wired in UI |

**Prompt versions in production:**
- legal-assistant: 1.0.0
- document-summary: 1.0.0
- document-risk: not deployed

Juridisk uses three specialized agents. They do not run concurrently -- they are invoked
sequentially based on the user's action and the availability of document context.

```
User Input
    |
    v
[Router] -- decides which agent(s) to invoke
    |
    +-- General legal question, no document --> [Legal Assistant Agent]
    |
    +-- Question about uploaded document -----> [Document Analysis Agent]
    |                                               |
    |                                               v
    |                                     (returns grounded context)
    |                                               |
    |                                               v
    +---------------------------------------------> [Legal Assistant Agent]
    |
    +-- "Draft me a document" request -----------> [Drafting Agent]
```

Each agent call passes through:
1. Lovdata retrieval (parallel, pre-fills legal context)
2. Rate limit check (synchronous, before any AI call)
3. The agent's system prompt + dynamic context injection
4. Claude API call (streaming SSE to the frontend)
5. Response post-processing (citation extraction, disclaimer append)

---

## 2. Shared Infrastructure

### 2.1 Lovdata Retrieval Service

Before any agent is invoked for a legal question, the retrieval service runs in parallel.

**Location:** `backend/src/services/lovdata.ts`

**Interface:**
```typescript
interface LovdataSearchResult {
  lawName: string;         // e.g. "Arbeidsmiljøloven"
  shortName: string;       // e.g. "aml"
  year: number;            // e.g. 2005
  section: string;         // e.g. "§ 15-3"
  sectionTitle: string;    // e.g. "Oppsigelsesfrister"
  text: string;            // Full section text from Lovdata Pro API
  url: string;             // e.g. "https://lovdata.no/lov/2005-06-17-62/§15-3"
  relevanceScore: number;  // 0-1, returned by Lovdata search
}

async function searchLovdata(
  query: string,
  options?: { maxResults?: number; lawFilter?: string[] }
): Promise<LovdataSearchResult[]>
```

**Caching strategy:**
- Cache key: `lovdata:search:${sha256(query)}:${maxResults}`
- TTL: 1 hour for search results, 24 hours for full section text
- Cache store: Supabase KV or Redis on Railway (Railway is preferred -- co-located with backend)
- On cache miss: call Lovdata Pro API, cache result, return
- On Lovdata API error: return empty array, set `lovdataAvailable: false` flag in context

**Day 5 token optimization:**
- Results below `TOKEN_BUDGET.MIN_LOVDATA_RELEVANCE_SCORE` (`0.70`) are dropped before prompt injection.
- Overlapping sections with more than 60% word overlap are deduplicated in `backend/src/services/anthropic.ts`.

**What is never stored:**
- Full Lovdata law text is never persisted to PostgreSQL
- Only citation metadata (lawName, section, url) is stored in the `messages.citations` JSONB column

### 2.2 Document Context Extraction

When a user asks a question about an uploaded document, the document text is retrieved from R2
and injected into the agent context. The full pipeline is in `backend/src/services/documents.ts`.

**Chunking and injection strategy:**
- Upload preprocessing chunks all documents into 800-token chunks with 100-token overlap.
- Every upload submits a Haiku Batch API summary job; `documents.summary_text` is cached as prompt breakpoint 2.
- For chat with `documentId`, the route embeds the user's question with `text-embedding-3-small`.
- The route calls `match_document_chunks` scoped to `document_id` and `user_id`.
- Results below `TOKEN_BUDGET.MIN_CHUNK_RELEVANCE_SCORE` (`0.72`) are excluded by the RPC threshold.
- `classifyQuery()` determines injected chunk count: clause = 1, general = 2, risk = 3.
- Retrieved chunks are compressed through Haiku sentence extraction before prompt injection.
- Dynamic chunks are not cached; only the static legal prompt and stable document summary are cached.

**Document preprocessing pipeline (on upload):**
1. Receive file (PDF or DOCX) at `POST /api/v1/documents/upload`
2. Validate MIME type and size (10MB max)
3. Store original file to Cloudflare R2 at key `{user_id}/{document_id}/{filename}`
4. If DOCX: convert to PDF with LibreOffice headless (`libreoffice --headless --convert-to pdf`)
5. Extract text with `pdf-parse`
6. Chunk text and generate embeddings with `text-embedding-3-small`
7. Upsert chunks to `document_chunks` table in Supabase
8. Update `documents.status` to `'ready'` and trigger Supabase Realtime event
9. On any failure: set `documents.status` to `'error'`, log error metadata (not content)

> Note: Frontend integration is implemented in `frontend/src/components/documents/DocumentUpload.tsx`.
> It sends multipart/form-data to `POST /api/v1/documents/upload`. Status polling uses
> `GET /api/v1/documents` every 3 seconds in Phase 1; Supabase Realtime is deferred to Phase 2.
> The active document id is passed as `documentId` in the chat request body.

### 2.3 Rate Limit Middleware

**Location:** `backend/src/middleware/ratelimit.ts`

**Logic:**
```typescript
// Pseudocode -- see actual implementation for full zod validation
async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const profile = await getProfile(userId); // from Supabase, cached 60s

  // Reset daily counter if past midnight Oslo time
  if (isNewDay(profile.queries_reset_at)) {
    await resetDailyCounter(userId);
  }

  if (profile.tier === 'pro') {
    return { allowed: true, remaining: Infinity };
  }

  if (profile.queries_today >= FREE_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: 'daily_limit',
      message: nb.errors.rateLimit,
      retryAfter: secondsUntilMidnightOslo(),
    };
  }

  await incrementDailyCounter(userId);
  return { allowed: true, remaining: FREE_DAILY_LIMIT - profile.queries_today - 1 };
}
```

**Free tier limits:**
- 10 AI queries per calendar day (Oslo timezone, Europe/Oslo)
- 3 document uploads per calendar month

**Pro tier:**
- Unlimited queries
- Unlimited document uploads

### 2.4 Billing and Entitlement Service

**Locations:**
- `backend/src/routes/billing.ts`
- `backend/src/routes/webhooks.ts`

**Checkout:**
- `POST /api/v1/billing/checkout`
- Auth middleware required; `req.user` must come from the Supabase JWT.
- Creates or retrieves a Stripe customer for the authenticated user.
- Stores `profiles.stripe_customer_id` when a customer is first created.
- Creates a Stripe Checkout Session using `STRIPE_PRO_PRICE_ID`.
- Returns `{ data: { url: string }, error: null }`.

**Customer Portal:**
- `POST /api/v1/billing/portal`
- Auth middleware required.
- Requires `profiles.stripe_customer_id`.
- Creates a Stripe Customer Portal Session.
- Returns `{ data: { url: string }, error: null }`.

**Stripe webhook:**
- Mounted at `POST /api/v1/webhooks/stripe`.
- Uses `express.raw({ type: "application/json" })`, not `express.json()`.
- Verifies `stripe-signature` with `stripe.webhooks.constructEvent()` before any database write.
- Returns 200 immediately after signature verification, then processes the event asynchronously.
- `checkout.session.completed` sets `profiles.tier = 'pro'`.
- `customer.subscription.deleted` sets `profiles.tier = 'free'`.

**Security rules:**
- Stripe secret keys never appear in frontend code or `NEXT_PUBLIC_` variables.
- Entitlement changes are keyed from verified Stripe customer ids.
- User ids used by billing routes come from JWT auth, never from request bodies.

---

## 3. Legal Assistant Agent

This is the primary agent. It handles all free-form legal questions, with or without document
context. It is the only agent the user interacts with directly.

### 3.1 Responsibilities
- Answer questions about Norwegian and EEA law (GDPR, employment, contracts, company law, IP)
- Cite specific Lovdata sections injected via retrieval
- Flag legal risks in plain Norwegian language
- Clarify scope (what it can and cannot answer)
- Always append disclaimer

### 3.2 System Prompt

**Version constant:** `LEGAL_ASSISTANT_PROMPT_VERSION = "1.0.0"` in `backend/src/proprietary/prompts/legal-assistant.ts`

```
Du er en juridisk assistent spesialisert på norsk rett og EØS-rett slik den gjelder i Norge.
Du hjelper norske gründere, oppstartsbedrifter og SMB-er med å forstå juridiske spørsmål
knyttet til drift av et norsk aksjeselskap.

## Din rolle

Du er ikke en advokat og gir ikke juridisk rådgivning. Du er et juridisk verktøy som:
- Forklarer hva loven sier på klart og presist norsk bokmål
- Peker på relevante lovbestemmelser med Lovdata-referanser
- Identifiserer juridiske risikoer i dokumenter og situasjoner
- Anbefaler når brukeren bør oppsøke en advokat

## Rettskildegrunnlag

{{LOVDATA_CONTEXT}}

Når du refererer til lovbestemmelser, bruk kun de rettskildene som er oppgitt ovenfor.
Hvis du ikke har en relevant rettskilde i konteksten, si tydelig at du ikke kan verifisere
påstanden mot en oppdatert kilde, og oppfordre brukeren til å sjekke Lovdata.no direkte.

## Dokumentkontekst

{{DOCUMENT_CONTEXT}}

## Samtalehistorikk

{{CONVERSATION_HISTORY}}

## Svarregler

1. Svar alltid på norsk bokmål.
2. Vær konkret og presis. Unngå juridisk sjargong uten forklaring.
3. Strukturer lange svar med overskrifter og punktlister.
4. Avslutt alltid med relevante Lovdata-referanser i dette formatet:
   **Relevante rettskilder:**
   - [Lovnavn] § [paragraf] ([årstall]) — [URL]
5. Hvis spørsmålet faller utenfor din kompetanse (skatterett, strafferett, aktive
   rettssaker), si det tydelig og henvis til egnet instans.
6. Ikke gjett. Hvis du er usikker, si det.

## Absolutte grenser

- Gi aldri råd i pågående rettssaker.
- Gi aldri skatterådgivning.
- Si aldri at brukeren ikke trenger advokat for en bindende beslutning.
- Ikke generer dokumenter som presenteres som rettslig bindende uten
  forbehold om advokatgjennomgang.

## Ansvarsfraskrivelse

Avslutt hvert svar med denne setningen på en ny linje:
---
*Dette er ikke juridisk rådgivning. Konsulter en advokat for bindende beslutninger.*
```

### 3.3 Dynamic Context Injection

The three `{{PLACEHOLDER}}` fields are populated at runtime before the API call:

**`{{LOVDATA_CONTEXT}}`**
```typescript
function formatLovdataContext(results: LovdataSearchResult[]): string {
  if (results.length === 0) {
    return "Ingen Lovdata-resultater tilgjengelig for dette spørsmålet.";
  }
  return results.map(r =>
    `### ${r.lawName} ${r.section} — ${r.sectionTitle}\n${r.text}\nKilde: ${r.url}`
  ).join("\n\n");
}
```

**`{{DOCUMENT_CONTEXT}}`**
```typescript
function formatDocumentContext(chunks: DocumentChunk[] | null): string {
  if (!chunks || chunks.length === 0) {
    return "Ingen dokumentkontekst. Brukeren stiller et generelt spørsmål.";
  }
  return `### Dokumentinnhold (utdrag)\n${chunks.map(c => c.text).join("\n---\n")}`;
}
```

**`{{CONVERSATION_HISTORY}}`**
- Include last N messages where total tokens of history < 4,000
- N is calculated dynamically based on message lengths
- Format: `Bruker: [message]\nAssistent: [message]\n`

### 3.4 Tool Use (Phase 2)

In Phase 1, the Legal Assistant Agent does not use Claude tool use. Lovdata retrieval is
pre-executed before the prompt is sent.

In Phase 2, the agent will gain a `search_lovdata` tool that it can call mid-response when it
determines it needs a specific citation not in the pre-fetched context.

```typescript
// Phase 2 tool definition
const searchLovdataTool = {
  name: "search_lovdata",
  description: "Søk i Lovdata Pro etter norske lovbestemmelser. Bruk dette når du trenger en spesifikk paragraf som ikke er i den injiserte konteksten.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Søkespørring på norsk, f.eks. 'oppsigelsestid fast ansatt' eller 'GDPR behandlingsgrunnlag'"
      },
      law_filter: {
        type: "array",
        items: { type: "string" },
        description: "Valgfritt: begrens søket til spesifikke lover, f.eks. ['arbeidsmiljøloven', 'gdpr']"
      }
    },
    required: ["query"]
  }
};
```

### 3.5 Guardrails and Post-Processing

After the Claude response is generated (or streamed):

1. **Citation extraction:** Parse the response for Lovdata URLs, extract into structured
   `citations` array, store in `messages.citations` JSONB column.

2. **Disclaimer enforcement:** If the response does not end with the Norwegian disclaimer
   (checking for the asterisk-wrapped string), append it programmatically. This is a hard
   guarantee -- the disclaimer always appears regardless of what the model outputs.

3. **Out-of-scope detection:** Check response for tax or criminal law content using a simple
   keyword heuristic. If detected, prepend a scoping notice. (Full classifier in Phase 2.)

4. **Token logging:** Log `model`, `input_tokens`, `output_tokens`, `conversation_id` to the
   `messages` table. Never log `content` in plaintext in production environments.

---

## 4. Document Analysis Agent

This agent is invoked when a user first asks a question about a newly uploaded document, or
explicitly requests a document analysis/risk summary.

### 4.1 Responsibilities
- Generate a structured risk summary of a legal document
- Identify clauses that are unusual, one-sided, or potentially problematic under Norwegian law
- Extract key data points (parties, dates, governing law, termination clauses, etc.)
- Return structured output that is stored and displayed in the UI

### 4.2 Two-Pass Strategy

**Pass 1 (Haiku -- cheap):** Generate a structural summary and key data extraction.
**Pass 2 (Sonnet -- quality):** Deep risk analysis using Pass 1 output + relevant Lovdata sections.

This keeps cost low. Pass 1 costs ~$0.002 per document. Pass 2 costs ~$0.01-0.03 depending on
document length.

### 4.3 Pass 1 System Prompt (Haiku)

**Version constant:** `DOCUMENT_SUMMARY_PROMPT_VERSION = "1.0.0"`

```
Du er et juridisk ekstraksjonssystem. Din oppgave er å trekke ut strukturert informasjon
fra juridiske dokumenter på en nøyaktig og konsistent måte.

Analyser det vedlagte dokumentet og returner et JSON-objekt med følgende struktur:

{
  "documentType": "string (f.eks. 'aksjonæravtale', 'arbeidskontrakt', 'NDA', 'leieavtale')",
  "parties": ["string"],
  "governingLaw": "string eller null",
  "effectiveDate": "ISO 8601 dato eller null",
  "terminationClauses": ["string -- kort beskrivelse av hver oppsigelsesklausul"],
  "keyObligations": ["string -- de viktigste forpliktelsene for hver part"],
  "unusualClauses": ["string -- klausuler som virker uvanlige eller ensidige"],
  "summary": "string -- 2-3 setninger som oppsummerer dokumentets formål og innhold"
}

Returner kun gyldig JSON. Ingen forklarende tekst utenfor JSON-objektet.
```

### 4.4 Pass 2 System Prompt (Sonnet)

**Version constant:** `DOCUMENT_RISK_PROMPT_VERSION = "1.0.0"`

```
Du er en juridisk risikoanalytiker spesialisert på norsk rett.

## Dokumentsammendrag (fra første analyse)

{{PASS_1_SUMMARY}}

## Fullt dokumentinnhold

{{DOCUMENT_TEXT}}

## Relevante norske rettskilder

{{LOVDATA_CONTEXT}}

## Din oppgave

Gjennomfør en grundig risikoanalyse av dette dokumentet fra perspektivet til
den norske parten / gründeren / arbeidstakeren (avhengig av dokumenttype).

Strukturer svaret slik:

### Dokumenttype og parter
[Bekreft dokumenttype og identifiser partene]

### Overordnet risikovurdering
[Lav / Middels / Høy -- med begrunnelse i 2-3 setninger]

### Risikoer og røde flagg
For hvert identifisert risikoområde:
**[Risikoens navn]**
- Hva: [Beskriv klausulen eller problemet]
- Risiko: [Hva kan skje]
- Relevant lov: [Lovdata-referanse hvis aktuelt]
- Anbefaling: [Hva bør brukeren gjøre]

### Manglende klausuler
[Klausuler som bør være med i denne typen dokument, men mangler]

### Anbefalte neste steg
[Konkrete handlinger -- inkludert om advokat bør konsulteres]

---
*Dette er ikke juridisk rådgivning. Konsulter en advokat for bindende beslutninger.*
```

### 4.5 Output Storage

The structured output from both passes is stored in the `document_analyses` table:

```sql
create table public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) not null,
  user_id uuid references auth.users(id) not null,
  pass1_data jsonb not null,       -- structured extraction from Pass 1
  pass2_markdown text not null,    -- formatted risk analysis from Pass 2
  model_pass1 text not null,
  model_pass2 text not null,
  input_tokens_pass1 integer,
  input_tokens_pass2 integer,
  output_tokens_pass1 integer,
  output_tokens_pass2 integer,
  created_at timestamptz not null default now()
);
```

---

## 5. Drafting Agent

This agent generates Norwegian-law-compliant document templates. It is a Phase 2 feature.

The architecture is specified here so Phase 1 code does not inadvertently block it.

### 5.1 Responsibilities
- Generate draft documents based on user-specified parameters
- Default to Norwegian law as governing law
- Include standard protective clauses appropriate for the document type
- Always include a prominent review disclaimer in the document header

### 5.2 Supported Document Types (Phase 2)

- Arbeidskontrakt (employment contract for AS, full-time)
- NDA / Taushetserklæring (mutual and one-way variants)
- Konsulentavtale (independent contractor agreement)
- Aksjonæravtale (basic, 2-party)

### 5.3 System Prompt Skeleton (Phase 2)

```
Du er et juridisk utkastsystem spesialisert på norske standarddokumenter.

## Oppgave

Lag et utkast til: {{DOCUMENT_TYPE}}

## Parametere fra brukeren

{{USER_PARAMETERS}}

## Relevante norske rettskilder

{{LOVDATA_CONTEXT}}

## Krav til dokumentet

1. Skriv på norsk bokmål
2. Bruk norsk rett som avtalelovgivning med mindre annet er spesifisert
3. Inkluder alle standardklausuler som er vanlige i norsk praksis for denne dokumenttypen
4. Merk paragrafer som bør tilpasses med [TILPASS: beskrivelse]
5. Merk paragrafer som krever juridisk gjennomgang med [ADVOKATGJENNOMGANG ANBEFALT]
6. Inkluder dette varselet øverst i dokumentet:

---
ADVARSEL: Dette er et automatisk generert utkast. Det er ikke juridisk bindende og
er ikke gjennomgått av en advokat. Juridisk AI AS er ikke ansvarlig for konsekvenser
av bruk av dette utkastet uten profesjonell juridisk gjennomgang.
---

## Dokumentformat

Returner dokumentet i Markdown-format, klart for konvertering til DOCX via Pandoc.
```

### 5.4 Handoff from Legal Assistant to Drafting Agent

When the Legal Assistant detects a drafting intent (e.g., "kan du lage et utkast til...",
"generer en kontrakt for..."), it does not draft inline. It:

1. Confirms the document type and key parameters with the user
2. Invokes the Drafting Agent with the confirmed parameters
3. Returns the draft as a downloadable DOCX via the document pipeline

Detection uses a simple intent classifier (keyword matching in Phase 1, Claude-based
classification in Phase 2).

---

## 6. Agent Handoff Protocol

All agent invocations follow this protocol to ensure consistent security and logging:

```typescript
interface AgentInvocationRequest {
  agentType: 'legal-assistant' | 'document-analysis' | 'drafting';
  userId: string;            // from JWT, never from request body
  conversationId: string;
  documentId?: string;
  userMessage: string;
  stream: boolean;           // always true for user-facing calls
}

interface AgentInvocationResult {
  content: string;           // markdown response
  citations: Citation[];     // extracted Lovdata references
  model: string;
  inputTokens: number;
  outputTokens: number;
  lovdataAvailable: boolean; // false if retrieval failed
  promptVersion: string;     // e.g. "legal-assistant@1.0.0"
}
```

Every invocation is logged to the `agent_invocations` table with the above metadata.
The `content` field is logged only in development (`NODE_ENV !== 'production'`).

---

## 7. Prompt Versioning

All prompts are version-controlled. When a prompt changes:

1. Bump the version constant in the prompt file.
2. The new version string is stored with every invocation in `agent_invocations.prompt_version`.
3. This allows regression analysis: "did response quality change after prompt v1.1.0?"
4. Never edit a prompt constant in place without bumping the version.

**Version format:** `{agent-name}@{semver}` e.g. `legal-assistant@1.2.0`

---

## 8. Cost Controls

- Hard spend cap: $20/month set in Anthropic console. Do not remove this cap.
- Per-request cost estimate is logged before streaming starts (approximate, based on input tokens).
- If projected monthly spend exceeds 80% of cap (at current rate), an alert fires to Ferdinand's
  email via a simple Supabase Edge Function cron job.
- Model selection follows the policy in `CLAUDE.md` Section 11.
- Prompt caching is enabled for the static portions of system prompts (the parts above
  `{{LOVDATA_CONTEXT}}`). This reduces repeat costs by ~50-70% on subsequent calls in the same
  conversation.
