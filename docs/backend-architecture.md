# AFRIBN Backend Architecture

AFRIBN is implemented as one intelligence lifecycle backend. Product surfaces such as Feed, Country Intelligence, Policy Monitor, Deal Tracker, Event Tracker, Risk Dashboard, Reports, Alerts, and Watchlists read from the same verified intelligence warehouse.

## Layers

1. Collection & Intelligence Production
   Sources, scrape jobs, raw articles, AI distillation, scoring, gap detection, field tasks, agent reports, verification reviews.

2. Intelligence Warehouse
   Stories, events, entities, graph nodes/edges, scores, policies, deals, risks, published intelligence.

3. Intelligence Products
   Feed, country intelligence, policy monitor, deal tracker, risk dashboard, alerts, watchlists, and reports.

## Stage Contract

Each stage returns a concrete object for the next stage.

```text
Source creates ScrapeJob
ScrapeJob creates RawArticle
RawArticle creates Story/Event
Event creates Score
Score creates GapReport
GapReport creates FieldTask
FieldTask creates AgentReport
AgentReport creates VerificationReview
VerificationReview creates PublishedIntelligence
PublishedIntelligence feeds Dashboards
```

## Main Endpoints

```text
GET  /health
GET  /pipeline/stages
POST /pipeline/demo-run
POST /workers/scrape

POST /sources
GET  /sources
POST /sources/{id}/test-scrape
POST /sources/{id}/queue-scrape

POST /scrape-jobs/{id}/collect
POST /raw-articles/{id}/distill
POST /raw-articles/{id}/ai-distill
POST /events/{id}/score
POST /scores/{id}/gaps
POST /gap-reports/{id}/tasks
POST /field-tasks/{id}/submit
POST /verification/{agentReportId}/review
POST /verification/{verificationReviewId}/publish

GET  /feed
GET  /countries/{country}
GET  /policies
GET  /deals
GET  /events
GET  /risk/countries
GET  /watchlists
GET  /alerts
POST /reports/generate
GET  /dashboard
GET  /graph
```

## Current Implementation Notes

This first version is a dependency-free Node modular monolith with SQLite persistence. It is designed to validate domain contracts and API shape before moving to PostgreSQL, Redis/BullMQ or Celery, OpenSearch, and S3-compatible storage.

## Production-Facing Infrastructure Added

### Real Database Persistence

The store now uses Node's built-in SQLite runtime through `node:sqlite`.

Environment:

```text
AFRIBN_DB_PATH=./data/afribn.sqlite
```

The store keeps the same domain API:

```text
insert(collection, object)
list(collection, predicate)
get(collection, id)
update(collection, id, patch)
remove(collection, id)
```

Records are stored durably in SQLite as collection/id JSON documents. This preserves speed of iteration while making data survive server restarts.

### Postgres Schema And Migrations

Production SQL migrations live in:

```text
migrations/001_initial_schema.sql
migrations/002_seed_roles_prompts.sql
```

Run later with:

```bash
DATABASE_URL=postgres://user:pass@host:5432/afribn node scripts/migrate-postgres.mjs
```

The SQL schema includes normalized tables, JSONB payloads where intelligence needs flexibility, indexes for feed/search/risk access, and the full lifecycle chain.

### Real Authentication / JWT

Auth is implemented with:

- `scrypt` password hashing
- HMAC SHA-256 JWT signing
- bearer-token resolution through `Authorization: Bearer <token>`

Demo seeded credentials:

```text
admin@afribn.local / afribn-admin-demo
analyst@afribn.local / afribn-analyst-demo
agent@afribn.local / afribn-agent-demo
verifier@afribn.local / afribn-verifier-demo
client@afribn.local / afribn-client-demo
```

Environment:

```text
AFRIBN_JWT_SECRET=replace-with-a-long-random-production-secret
```

RBAC is enforced on mutation/workflow routes. Important permissions include:

```text
sources:manage
ai:process
tasks:submit
attachments:create
verification:approve
verification:reject
alerts:manage
alerts:deliver
reports:create
reports:download
workers:manage
search:manage
```

### Real File Uploads

Multipart uploads are supported without third-party dependencies.

```text
POST /uploads
POST /agent/reports/{id}/attachments
```

Environment:

```text
AFRIBN_UPLOAD_DIR=./uploads
```

Uploaded files are written to disk, hashed with SHA-256, and recorded in `uploadedFiles`. Agent evidence uploads also create `attachments`.

### Real Email / SMS Alerts

Queued alert deliveries can be sent through provider APIs:

```text
POST /workers/deliver-alerts
```

Email uses SendGrid:

```text
SENDGRID_API_KEY=
ALERT_EMAIL_FROM=
ALERT_EMAIL_TO=
```

SMS uses Twilio:

```text
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
ALERT_SMS_TO=
```

If credentials are not configured, deliveries are marked as `held` rather than silently pretending to send.

### Durable Worker Queue

The backend now includes an internal durable queue abstraction:

```text
POST /queue/jobs
POST /queue/process
GET  /queue
```

Supported job types:

```text
scrape_source
ai_distill_article
score_event
detect_gaps
deliver_alerts
generate_report
rebuild_search
resolve_entities
```

The current implementation stores jobs in SQLite/`workerJobs`; the Postgres schema includes `worker_jobs` for production, and this can later be backed by Redis/BullMQ without changing product routes.

### Search And Indexing

Search is available at:

```text
GET  /search?q=energy
POST /search/reindex
```

The local implementation indexes stories, events, policies, deals, reports, entities, and published intelligence into `searchDocuments`. The Postgres migration includes a `search_documents` table with `tsvector` and a GIN index.

### Entity Resolution And Graph

Entity resolution now canonicalizes entity names, stores aliases, creates mentions, and writes evidence-backed graph edges. This is the bridge toward the knowledge graph moat.

```text
POST /queue/jobs { "queue": "graph_queue", "type": "resolve_entities", "payload": { "storyId": "..." } }
```

## Scoring Engine

The scoring module implements the AFRIBN algorithm from the scoring PDFs as pure formulas plus service-layer persistence.

Core formula:

```text
AIV = [(P × I × A × T × C) + (O × E) - K]
```

Where:

```text
P = Probability
I = Impact
A = Actionability
T = Time Sensitivity
C = Confidence
O = Opportunity
E = Stakeholder Exposure
K = Knowledge Gap Penalty
```

Implemented scores:

```text
Impact Score
Confidence Score
Signal Score
Decision Relevance
Negotiation Leverage
Scenario Risk
Risk Score
Gap Penalty
AFRIBN Intelligence Value
```

Endpoints:

```text
POST /scoring/calculate
GET  /scoring/{object_type}/{object_id}
POST /scoring/recalculate/{object_type}/{object_id}
GET  /scoring/{object_type}/{object_id}/explanation
GET  /scoring/top-signals
GET  /scoring/risk/countries
GET  /scoring/version
```

Each stored score includes:

```text
rawInputFactors
normalizedFactors
score
formulaVersion
formula
explanation
confidenceLevel
createdAt
updatedAt
```

Formula code lives in:

```text
src/scoring.js
src/scoring-service.js
tests/scoring-formulas.mjs
```

## Source Reliability Engine

The Source Reliability Engine implements the AFRIBN source reliability PDF as a separate module. It does not collapse source trust into a single generic score.

Implemented outputs:

```text
SRS = Source Reliability Score
ICS = Information Credibility Score
CPS = Collection Priority Score
SCV = Strategic Collection Value
```

Formula version:

```text
AFRIBN_SOURCE_RELIABILITY_V1
```

Core formulas:

```text
TR = (T + alpha) / (T + F + alpha + beta) * 100
SRS_base = 0.40 TR + 0.25 CA + 0.20 AU + 0.15 TW
SRS_adjusted = SRS_base * RV * RA * CO * IN - BP - CP

ICS = 0.30 IC + 0.20 EQ + 0.15 SP + 0.15 PL + 0.10 TM + 0.10 CC - CD

CM = (FR * VR * TS * DA * RL * CG * LS * XR * CS) ^ (1/9)

CPS = 0.35 SRS + 0.25 RL + 0.15 CG + 0.10 FR + 0.10 TS + 0.05 LS

AIR = sqrt(SRS * ICS) * CM
SCV = AIR * RL * CG * SV
```

Endpoints:

```text
POST /source-reliability/calculate/{source_id}
GET  /source-reliability/{source_id}
GET  /source-reliability/{source_id}/explanation
POST /source-reliability/{source_id}/override
POST /source-reliability/{source_id}/blacklist
POST /source-reliability/{source_id}/whitelist
POST /source-reliability/credibility/calculate
GET  /source-reliability/collection-priority/{source_id}
GET  /source-reliability/top-priority-sources
GET  /source-reliability/probation-sources
GET  /source-reliability/version
```

Connections now active:

- `ScrapeWorker` reads latest collection decision and blocks suppressed/blacklisted sources.
- Probation and partial scrape decisions reduce scrape depth/limit.
- Source reliability updates write back to `sources.reliability`, `sources.reliabilityGrade`, `sources.collectionDecision`, and `sources.frequency`.
- Information credibility can update confidence-score metadata for the linked story/event/raw article.
- Queue workers support `calculate_source_reliability`, `calculate_information_credibility`, `recalculate_all_source_reliability`, `update_source_after_scrape_failure`, and `update_source_after_verification`.
- Events are emitted through the internal worker event queue for downstream modules.

Code:

```text
src/source-reliability.js
src/source-reliability-service.js
tests/source-reliability-formulas.mjs
```

### Real PDF Report Export

Reports can now export PDF:

```text
GET /reports/{id}/download
```

The current renderer creates a valid dependency-free PDF from report sections. This is enough for MVP export and can later be replaced with a richer HTML-to-PDF renderer.

### Real Frontend Integration

The backend serves the current static prototype:

```text
GET /app
GET /index.html
GET /styles.css
GET /app.js
GET /frontend-api.js
```

`frontend-api.js` exposes:

```text
AFRIBNApi.login()
AFRIBNApi.me()
AFRIBNApi.feed()
AFRIBNApi.dashboard()
AFRIBNApi.country()
AFRIBNApi.alerts()
AFRIBNApi.watchlists()
AFRIBNApi.generateReport()
AFRIBNApi.runPipelineDemo()
```

Claude's frontend can either import/copy that client or call the same REST endpoints directly.

### Deployment Setup

Deployment files:

```text
Dockerfile
docker-compose.yml
.env.example
.dockerignore
```

Local container flow:

```bash
cp .env.example .env
docker compose up --build
```

Deployment hardening now includes:

- `/ready` readiness endpoint
- security headers
- in-process rate limiting
- graceful shutdown
- Docker healthcheck
- `.env.example` for required external credentials

## Real Workers Added

### ScrapeWorker

`POST /workers/scrape` and `POST /sources/{id}/test-scrape` now perform a real `fetch` against the configured source URL.

The worker can parse:

- RSS and Atom feeds
- HTML pages with article links
- Simple standalone HTML pages through title/meta/body extraction

It creates real `RawArticle` records and marks the `ScrapeJob` as `completed` or `failed`.

### AIDistillationWorker

`POST /raw-articles/{id}/ai-distill` calls the OpenAI Responses API when `OPENAI_API_KEY` is configured.

Environment variables:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4
```

If no key is configured, the worker uses a deterministic fallback distiller so local development and tests continue to work.

The AI output is validated into this object shape:

```text
title
summary
country
region
sector
eventType
impact
organizations
people
projects
riskIndicators
opportunities
keyClaims
value
confidenceHint
```
