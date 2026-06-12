# ADR-001: Collection scheduler, quality gating, and resilience

Status: Proposed (Phase 1 implemented)
Date: 2026-06-12

## Context

The collection pipeline (add source → scrape → distill → score → verify →
publish → feed) works but is **fully manual** — nothing drives it on a
schedule. For a real-time intelligence product we need automated collection
that (a) runs at a sensible cadence per source, (b) ingests only
strategically valuable items rather than everything, and (c) stays resilient
when a source rate-limits, geofences, or blocks us.

This ADR records the design and a phased rollout. The worker queue
(`src/workers/queue.js`) already provides job persistence with exponential
retry/backoff, and `src/workers/processor.js` already has handlers
(`scrape_source`, `ai_distill_article`, `calculate_score`, …). What is missing
is the loop that enqueues and drains on a timer, plus quality and resilience
layers.

## Decision

### 1. Scheduler — tiered + adaptive cadence

A scheduler tick runs every ~60s, finds sources whose `nextRunAt <= now`,
enqueues `scrape_source` jobs, and drains the `collection` queue with
per-domain spacing. The *effective* cadence is per source, derived from:

| Tier | Examples | Base cadence |
|------|----------|--------------|
| `breaking` | active-conflict markets, top-reliability wires | 5–15 min |
| `standard` | general news / RSS | 30–60 min |
| `slow` | government, tenders, filings, multilaterals | 6–24 h |
| `probation` | new / unreliable sources | daily or paused |

Modifiers:
- **Adaptive backoff** — multiply the interval (up to a cap) after consecutive
  empty/unchanged runs; reset on yield. Source-reliability collection-priority
  feeds this later.
- **Conditional fetch** — `ETag` / `If-Modified-Since` + body content hashing,
  so an unchanged page is detected with a `304` or a hash match and skipped
  without re-processing. Applied only to scheduler-driven runs (manual
  `test-scrape` and initial assessment always fetch fresh).
- **Jitter** — ±10% so polling is not a detectable, synchronized pattern.
- **Per-domain rate limit** — a minimum spacing between fetches to the same
  host, enforced at enqueue time so one domain is never hammered.

Off by default; enabled with `SCHEDULER_ENABLED=true` so tests and ad-hoc runs
are unaffected.

### 2. Quality gate — discover broadly, promote narrowly

A funnel that puts cheap filters first and expensive AI last:

1. **Source mandate (pre-fetch)** — each source gets
   `{countries, sectors, includeKeywords, excludeKeywords, watchlistEntities}`;
   off-mandate items are dropped before crawling.
2. **Dedupe + cross-source clustering** — same event across outlets collapses
   to one item with a corroboration count (itself a value signal).
3. **Relevance triage (pre-AI)** — a lightweight classifier decides whether an
   item is worth a full distill, so AI spend goes only to likely-relevant items.
4. **AI distill + strategic scoring** — survivors get distilled and scored
   (signal / impact / intelligence-value via `scoring-service.js`).
5. **Promotion threshold** — only items above a signal / intelligence-value
   threshold are surfaced into the editorial queue / feed. The rest stay as
   `RawArticle` for corroboration and audit but are not published.

### 3. Resilience — fallback chain + circuit breaker

Best defense is politeness: per-domain rate limits, concurrency caps,
`robots.txt` compliance, and **API/RSS first**. When direct fetch fails:

1. plain `fetch`
2. site **RSS / sitemap**
3. `fetch` via **rotating proxy** (geo-targeted where a source geofences)
4. **headless (Playwright)**, optionally via residential proxy
5. **aggregator fallback** — query GDELT/NewsAPI/NewsData by domain (the
   adapters are a built-in contingency)
6. cache/archive (Wayback) as last resort

Block detection classifies `403/429`/captcha/login-wall as **blocked**
(distinct from `failed`) and triggers the fallback chain. After N consecutive
all-method failures a **circuit opens**: stop hammering, back off, flag for
review, and degrade gracefully (serve last-known data, lean on corroborating
sources). Failures are isolated per source so one blocked site never stalls the
queue. Proxy providers are env-configured with a health-checked, rotating pool.

#### Compliance stance

Proxies are for **resilience and legitimate geo-access**, not for evading
access controls or paywalls. Per-source policy preference order:
**official API > RSS > polite crawl > proxy crawl**. Respect `robots.txt` and
ToS; avoid sources that explicitly forbid automated access. This is a
deliberate constraint for an intelligence product sold to institutions.

## Rollout phases

- **Phase 1 (this change): scheduler + per-domain rate limiting + conditional
  fetch.** No external dependencies. Off unless `SCHEDULER_ENABLED=true`.
- **Phase 2: source mandate + relevance triage gate + promotion threshold.**
- **Phase 3: proxy pool + fallback chain + block detection + circuit breaker.**
  Requires a proxy-provider decision.

## Consequences

- Collection becomes autonomous and cost-aware (conditional fetch + relevance
  triage cut wasted fetches and AI calls).
- Builds on existing primitives (worker queue retry/backoff, adapters,
  source-reliability engine, scoring engine) rather than introducing new
  systems.
- Phase 3 carries legal/operational weight; gated behind an explicit decision
  and the compliance stance above.

## Configuration

- `SCHEDULER_ENABLED` (default `false`)
- `SCHEDULER_TICK_MS` (default `60000`)
- `SCHEDULER_DOMAIN_MIN_INTERVAL_MS` (default `4000`)
- `SCHEDULER_MAX_JOBS_PER_TICK` (default `25`)
