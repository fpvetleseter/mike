# PRD.md — Juridisk Product Requirements Document

**Version:** 1.0
**Author:** Ferdinand (sole founder)
**Status:** Active -- Phase 1 build target

---

## 1. Problem Statement

Norwegian founders and SME operators face a persistent, structural problem: everyday legal
questions are either unanswered or prohibitively expensive to answer.

The median Norwegian AS has no legal counsel on retainer. A single hour with an advokat costs
NOK 2,500-4,500. Most founders accumulate legal questions for months before consulting a lawyer
-- by which point they have often already made the mistake. The questions are not exotic: "Do I
need a written employment contract for a part-time hire?" "Does my NDA cover this situation?"
"What notice period am I legally required to give?" "Am I GDPR-compliant?"

These are questions a competent law student could answer in 10 minutes with access to Lovdata.
They are questions that do not require a billable hour -- they require accessible, accurate
information grounded in Norwegian law.

Existing tools fail this user:

- **Generic AI chatbots (ChatGPT, Claude.ai):** Not grounded in current Norwegian law. Will
  confidently cite the wrong statute or invent a provision. No Lovdata integration.
- **Norwegian lawyer marketplaces:** Solve a different problem (finding a lawyer). Still expensive.
- **Lovdata itself:** Raw law text, no interpretation, no plain-language explanation.
- **Legal template sites:** Static, not interactive, not grounded in the user's specific situation.

Juridisk solves this by combining real-time Lovdata retrieval with Claude's reasoning capability,
tuned to the Norwegian legal context, delivered in plain Norwegian, at near-zero marginal cost.

---

## 2. Target User

**Primary persona: The Norwegian AS founder**

- Age 25-45, based in Norway (Oslo-heavy, but national)
- Running or building an AS with 1-20 employees
- Technically literate -- comfortable with SaaS products
- Has signed (or needs to sign) employment contracts, NDAs, shareholder agreements
- Has GDPR obligations they do not fully understand
- Cannot afford a lawyer on retainer
- Has legal questions at 11pm that they cannot wait until Monday to answer
- Would pay NOK 299/month if the product reliably saved them one lawyer hour per quarter

**Secondary persona: The early employee or co-founder**

- Trying to understand what they are signing before they sign it
- Wants to know if a clause is standard or unusual
- Does not have leverage to negotiate but wants to understand their position

**Out of scope for v1 targeting:**

- Large enterprises with in-house legal
- Individuals with personal legal matters (family law, criminal, consumer disputes)
- Non-Norwegian legal systems

---

## 3. User Stories

Stories are prioritized: **[P1]** = must have in v1.0, **[P2]** = v1.1, **[P3]** = later.

---

**US-01 [P1]** — As a founder who just received a draft NDA from a potential partner, I want to
upload the document and ask what the most one-sided clauses are, so that I know what to push back
on before signing.

**Acceptance criteria:**
- User can upload a PDF or DOCX file up to 10MB
- Upload completes with a visible progress indicator
- Document is processed and ready within 60 seconds
- User can type a question about the document
- Response cites specific clauses from the document and relevant Norwegian law
- Response includes a disclaimer

---

**US-02 [P1]** — As a founder preparing to hire my first employee, I want to ask what a
Norwegian employment contract must legally contain, so that I do not accidentally create a
non-compliant contract.

**Acceptance criteria:**
- User can ask a free-form question without uploading a document
- Response cites Arbeidsmiljøloven and Lovdata URLs
- Response is in plain Norwegian, not legalese
- Response includes specific section references (e.g. "§ 14-6")
- Disclaimer is present

---

**US-03 [P1]** — As a founder who received a termination request from an employee, I want to
understand what notice periods apply in my situation, so that I do not accidentally breach the
employment contract.

**Acceptance criteria:**
- User can describe their situation in free text
- System retrieves relevant Arbeidsmiljøloven sections on notice periods
- Response accounts for the specific situation described (tenure, age if mentioned)
- Response flags that individual circumstances may affect the answer
- Disclaimer present, recommendation to consult advokat for binding decisions

---

**US-04 [P1]** — As a founder storing customer data, I want to know if I need a data processing
agreement with my third-party SaaS providers, so that I am GDPR-compliant.

**Acceptance criteria:**
- System retrieves GDPR Article 28 context from Lovdata
- Response explains the processor/controller distinction in plain Norwegian
- Response gives a concrete yes/no with the reasoning
- Response lists what a DPA must contain per GDPR Article 28(3)
- Disclaimer present

---

**US-05 [P1]** — As a user who has hit the free tier limit, I want to understand what I get with
a Pro subscription and be able to upgrade immediately, so that I can continue working.

**Acceptance criteria:**
- When rate limit is hit, response is in Norwegian explaining the limit
- Upgrade prompt is shown inline, not as a blocking modal on first use
- Upgrade flow completes via Stripe in under 60 seconds
- After payment confirmation, rate limit is lifted immediately (within one Stripe webhook cycle)
- User does not lose the question they were trying to ask

---

**US-06 [P1]** — As a returning user, I want to see my previous conversations and documents in a
sidebar, so that I can continue where I left off.

**Acceptance criteria:**
- Conversations are listed by most recent first
- Each conversation shows: date, first message (truncated), document name if applicable
- Documents are listed with their status (processing / ready / error)
- Clicking a conversation loads the full history
- History persists across sessions (stored in Supabase, not localStorage)

---

**US-07 [P1]** — As a mobile user checking a contract while out, I want the interface to work on
my phone, so that I can get a quick answer without needing a laptop.

**Acceptance criteria:**
- Chat interface is fully functional on 375px viewport (iPhone SE baseline)
- Document upload works on mobile (file picker, not drag-and-drop required)
- Text is legible at default zoom
- AI responses stream correctly on mobile browsers

---

**US-08 [P1]** — As a user who just signed up, I want to understand what the product does and
does not do within 30 seconds, so that I have calibrated expectations before my first query.

**Acceptance criteria:**
- Onboarding screen (shown once, after first login) explains: what Juridisk does, what it does
  not do (not a lawyer, not binding advice), and what the free tier includes
- User can dismiss with one tap
- No email drip required -- the product speaks for itself
- Disclaimer is visible on the onboarding screen

---

**US-09 [P2]** — As a founder who needs a basic NDA, I want to generate a Norwegian-law-compliant
draft with my company's details filled in, so that I do not start from a blank page.

**Acceptance criteria:**
- User specifies: parties, purpose, duration, one-way or mutual
- Draft is generated in DOCX format, downloadable
- Document includes a prominent review disclaimer in the header
- Clauses that need customization are marked [TILPASS:]
- Model: Sonnet (quality over cost for drafting)

---

**US-10 [P2]** — As a Pro user, I want to export my conversation history as a PDF, so that I can
share it with my actual lawyer as context.

**Acceptance criteria:**
- Export button in conversation view (Pro only)
- PDF includes: conversation history, all citations, Juridisk branding, disclaimer
- Export is generated server-side (no client-side PDF generation)
- Exported file is downloaded directly, not stored or emailed

---

**US-11 [P2]** — As a founder, I want to ask a follow-up question that refers to a previous
answer in the same conversation, so that I can have a real back-and-forth legal discussion.

**Acceptance criteria:**
- Conversation maintains context across turns (last N messages included in prompt)
- User can say "hva med i det scenarioet hvis..." and the system understands the reference
- Conversation length is capped at 20 turns before user is prompted to start a new conversation
  (context window management)

---

## 4. Feature List: v1.0 (MVP)

### Authentication
**Status: Partial -- Day 2 has backend auth middleware, but login UI is not verified as complete.**

- Magic link login (Supabase Auth)
- Google OAuth login
- Session persistence (30-day refresh token)

### Chat Interface
**Status: Live in production (`ai.fpvetleseter.com`).** Core chat (auth, streaming, conversations) verified end-to-end. Day 6 follow-up fixes shipped for SSE keep-alive headers/heartbeat, Lovdata retrieval diagnostics, and duplicate assistant disclaimer rendering; live authenticated retest with Railway logs is still pending.

- Free-form legal Q&A (no document required)
- Streaming AI responses (SSE from `/api/v1/ai/chat`)
- Lovdata citations extracted, stored, and displayed in the chat UI
- Disclaimer appended to every response by backend post-processing
- Conversation history routes and functional glass sidebar (rebuilt in Iteration 2)
- New conversation button
- Fixed tagline readability in empty state

### Document Management
**Status: Implemented locally; not yet verified live in production.**

- Upload PDF or DOCX (up to 10MB)
- Processing status display via 3-second polling in Phase 1
- Document library sidebar
- Ask questions about a specific document
- Document-grounded responses via `document_chunks` similarity search, Haiku chunk compression, and cached `summary_text` if `documentId` is present

### Rate Limiting and Billing
**Status: Implemented locally (Iteration 3). Sidebar glass fixed, conditional upgrade CTA implemented.**

- Free tier: 10 queries/day, 3 document uploads/month
- Rate limit messaging in Norwegian with inline upgrade prompt and sidebar upgrade card
- Stripe Pro subscription (NOK 299/month) through backend Checkout Session creation
- Stripe webhook-driven entitlement via signed webhook verification before any database write
- Basic billing management through Stripe Customer Portal
- Settings page shows current tier and usage
- Usage progress bar visible in sidebar (green→amber→orange→red) and mobile bottom nav
- Upgrade card is usage-gated: shown only at 6+ queries (free tier), fades in at 6/10, fully visible at 10/10
- Ambient brand copy shown below progress bar when queries < 6 (no premature CTA)
- Upgrade card wired to `POST /api/v1/billing/checkout` (dependency: deployed backend with Stripe keys)
- Input bar disabled at 10/10 when backend returns 429; sidebar shows "Du har brukt alle dagens spørsmål."

### Onboarding
**Status: Not started (Day 7).**

- Single-screen onboarding modal (first login only)
- Explains product scope and limitations
- Persistent disclaimer in UI footer

### Landing Page
**Status: Not started (Day 7).**

- Above-the-fold value proposition in Norwegian
- Feature highlights
- Pricing table (Free vs Pro)
- CTA to sign up
- Legal disclaimer in footer

---

## 5. Feature List: v1.1

- Document risk analysis (two-pass: Haiku summary + Sonnet risk flags)
- Basic document drafting: Arbeidskontrakt, NDA, Konsulentavtale
- Conversation export to PDF (Pro only)
- Multi-turn conversation context (up to 20 turns)
- `search_lovdata` tool use mid-response (Phase 2 agent architecture)
- Email notifications for document processing completion
- Usage dashboard (queries used today, documents this month)

---

## 6. Out of Scope for v1

The following are explicitly excluded. Do not build, hint at, or create infrastructure for these
in v1 unless specified:

- Tax advice of any kind
- Criminal law
- Family law
- Active litigation support
- Multi-user / team accounts
- API access for third-party developers
- Mobile native app (iOS / Android)
- Integration with Norwegian government systems (Altinn, Brønnøysund API)
- Document e-signing
- Automated contract negotiation
- Any feature requiring a lawyer in the loop

---

## 7. Success Metrics

### Phase 1 Definition of Success (MVP launch)

| Metric | Target |
|---|---|
| Time to first meaningful answer (new user) | Under 60 seconds from signup |
| Document processing time (median, 10-page PDF) | Under 45 seconds (pipeline implemented, measure in live E2E test) |
| Citation accuracy (manual spot-check, 20 queries) | Lovdata URL resolves and is relevant in 90%+ of cases |
| Streaming response initiation latency | Under 2 seconds from query submission (frontend wired, measure in Day 5 E2E test) |
| Mobile usability (manual test, iPhone SE + Android mid-range) | No broken layouts, all core flows completable (implemented in Day 4, manual test pending) |
| Zero critical security issues | No exposed secrets, RLS working on all tables |
| AI cost target | < $0.01 per query with full optimization stack |

### Post-Launch (first 30 days)

| Metric | Target |
|---|---|
| Signups | 50+ (warm network, no paid ads) |
| Free-to-Pro conversion rate | 5%+ of active free users |
| Day-7 retention | 30%+ of signed-up users return |
| NPS (informal, direct outreach) | 40+ |
| Monthly API cost | Under $20 |

### North Star Metric

**Weekly active users who ask at least one legal question.** This is the metric that determines
whether the product is actually useful, not just signed up for. Everything else is a proxy.

---

## 8. GDPR and Legal Compliance Requirements

### Data Controller Identity
Juridisk AS (to be incorporated as Norwegian AS before launch) is the data controller.
Ferdinand is the responsible person until incorporation.

### Legal Basis for Processing (GDPR Article 6)
- User account data, conversation history: Article 6(1)(b) -- performance of contract
- Usage analytics (anonymized): Article 6(1)(f) -- legitimate interest
- No special category data (Article 9) is collected or solicited

### User Rights Implementation (required at launch)
- **Right to access (Article 15):** User can view all their data in the dashboard
- **Right to erasure (Article 17):** "Slett konto og alle data" button in settings,
  executes a cascade delete on all user data including R2 documents
- **Right to portability (Article 20):** JSON export of conversation history (v1.1)

### Data Retention
- Conversation history: retained until user deletes account or explicitly deletes conversation
- Uploaded documents: retained until user deletes the document or account
- System logs (metadata only): 30-day rolling retention
- Stripe data: governed by Stripe's retention policy (not our database)

### Sub-processors (Article 28 -- must have DPAs in place before launch)
| Processor | Purpose | Location | DPA Status |
|---|---|---|---|
| Supabase | Database, Auth | EU (AWS eu-west-1) | Available at supabase.com/dpa |
| Anthropic | AI inference | USA | Available at anthropic.com/legal/dpa |
| Cloudflare | File storage (R2) | EU region configurable | Available at cloudflare.com/gdpr |
| Stripe | Payments | USA/EU | Available at stripe.com/privacy |
| Railway | Backend hosting | USA | TODO: verify DPA availability before launch |
| Lovdata | Legal data retrieval | Norway | TODO: confirm API terms re: GDPR |

**Action required before launch:** Sign or click-accept DPAs with all sub-processors.
Verify Railway has an adequate DPA (if not, consider Render EU or Fly.io EU as alternatives).

### Privacy Policy Requirements
Must cover: controller identity, purposes, legal basis, retention periods, sub-processors,
user rights, how to exercise rights, DPA contact (datatilsynet.no for complaints).

Written in Norwegian. Published at `juridisk.no/personvern` before any user can sign up.

### Cookie Policy
- Supabase Auth uses a session cookie: necessary, no consent required
- No third-party tracking cookies in v1
- No analytics cookies in v1 (Vercel Analytics uses edge-side, no cookies -- acceptable)
- Cookie banner is not required for v1 (no non-necessary cookies)

### AI Act Compliance (EU AI Act -- applicable via EEA)
Juridisk is a **limited-risk AI system** under the EU AI Act (not high-risk):
- It does not make decisions with legal effects on individuals (it provides information)
- It does not fall under Annex III high-risk categories (legal advice AI is not currently listed)
- **Transparency obligation applies:** Users must be informed they are interacting with an AI
  (Article 50). This is satisfied by the product name, onboarding screen, and persistent disclaimer.

### Disclaimer Strategy
Three tiers:

1. **Persistent UI disclaimer** (always visible in chat footer):
   "Juridisk AI gir ikke juridisk rådgivning. Konsulter en advokat for bindende beslutninger."

2. **Per-response disclaimer** (appended to every AI response):
   "*Dette er ikke juridisk rådgivning. Konsulter en advokat for bindende beslutninger.*"

3. **Full legal disclaimer** (in Terms of Service and Privacy Policy):
   Covers: no lawyer-client relationship, no liability for reliance on AI output,
   recommendation to verify all legal information with a qualified Norwegian advokat.

**Action required before launch:** Have a Norwegian advokat review the disclaimer language and
Terms of Service. This is a one-time cost (estimated NOK 3,000-6,000) that substantially reduces
liability exposure.

---

## 9. Technical Constraints

- **Solo founder:** No task that requires two people working in parallel is scheduled in Phase 1.
- **Zero infrastructure budget:** All services must have a usable free tier through Phase 1.
- **Railway free tier:** 500 hours/month execution time. Sufficient for early users; upgrade
  ($5/month) is triggered when consistently hitting the limit.
- **Anthropic $20/month hard cap:** All feature decisions are made with this cap in mind.
  A feature that could cause runaway spend (e.g. automated document processing on every upload
  without user initiation) is not built until Pro revenue covers it.
- **Lovdata Pro API:** Rate limits and terms must be respected. Caching is mandatory.
  Terms of Service must be reviewed to confirm that API results can be shown to end users
  (they can be attributed, not reproduced wholesale). TODO: confirm with Lovdata before launch.
- **AGPL-3.0 compliance:** All changes to Mike-derived files are published. The competitive moat
  is in proprietary files, not in hiding modified open-source code.
- **Single deployment region:** EU (Vercel EU, Railway EU, Supabase eu-west-1). Do not deploy
  to US regions for user-facing services -- GDPR data residency preference.
