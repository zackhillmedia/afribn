# AFRIBN Content Pipeline Launch TDR

## 1. Purpose

This Technical Design Requirements document defines the launch-version AFRIBN content production pipeline.

The goal is to simplify the original intelligence lifecycle into a practical, production-ready workflow for the first release:

```text
Source
→ Collection
→ Raw Article Review
→ Intelligence Item
→ Verification
→ Approval
→ Publication
→ Feed / Products / Dashboards
```

The deeper scoring, gap-report, field-task, and agent-report chain remains in the backend for later releases, but it must not block the launch workflow.

## 2. Scope

### In Scope For Launch

- Add and manage sources.
- Run initial source scrape/probe immediately after source creation.
- Produce a source assessment with score, recommendation, and sample articles.
- Allow admins to approve, put on probation, pause, blacklist, reactivate, and edit sources.
- Run collection jobs from RSS, direct website scraping, and API adapters.
- Store raw articles for review.
- Convert raw articles into Intelligence Items through AI automation.
- Use Qwen/OpenAI-compatible AI when configured.
- Fall back to deterministic local rules when AI is unavailable or times out.
- Let analysts edit Intelligence Items.
- Support workflow states: draft, submitted for verification, verified, approved, published.
- Publish approved Intelligence Items into Published Intelligence and Feed.
- Keep published items persisted in the system.
- Expose the workflow through backend API and AFRIBN UI pages.

### Out Of Scope For Launch

- Mandatory scoring before publication.
- Mandatory gap reports.
- Mandatory field tasks.
- Mandatory agent reports.
- Advanced knowledge graph enrichment beyond existing entity mentions.
- Fully automated web research/corroboration across multiple external sources.
- Payment/subscription enforcement.
- Enterprise SSO.

## 3. Product Workflow

### 3.1 Source Onboarding

When an admin adds a source:

1. Backend validates required fields.
2. Source is inserted with pending review metadata.
3. Backend immediately runs an initial scrape/probe.
4. Backend stores sample Raw Articles.
5. Backend calculates a Source Probe Result.
6. Backend updates the source with:
   - `initialAssessmentId`
   - `initialAssessmentScore`
   - `initialAssessmentRecommendation`
   - `initialAssessedAt`
7. UI displays the source plus probe result.
8. Admin chooses one of:
   - Approve Source
   - Put on 7-day Probation
   - Pause Source
   - Blacklist Source
   - Edit Source
   - Rerun Assessment

### 3.2 Collection

Collection jobs create Raw Articles.

Expected object transition:

```text
Source creates ScrapeJob
ScrapeJob creates RawArticle[]
```

Collection must:

- Respect blacklisted/suppressed sources.
- Support RSS/Atom XML.
- Support direct HTML extraction.
- Support existing API adapters.
- Deduplicate by URL/checksum.
- Store collection job status and created raw article IDs.
- Preserve source lineage on every Raw Article.

### 3.3 Raw Article Review

Raw Articles are listed for analyst/admin review.

Each raw article must show:

- Headline
- Source
- Source country
- Provider
- Publication date
- Collection status
- URL
- Raw body/summary preview
- Duplicate marker when applicable

Actions:

- View Raw Article
- Open Source URL
- Convert to Intelligence Item
- Reject / Archive

### 3.4 Convert To Intelligence Item

Clicking Convert to Intelligence Item triggers AI automation.

Expected transition:

```text
RawArticle creates IntelligenceItem
```

Internally, launch Intelligence Items are stored in the existing `stories` collection, with `workflowStatus` and launch-specific fields.

AI must populate:

- Title
- Summary
- Key Facts
- What Happened
- Why It Matters
- Potential Consequences
- What To Watch Next
- Supporting Context
- Missing Facts
- Country
- Region
- Sector
- Event Type
- Impact
- Organizations
- People
- Projects
- Value
- Confidence Hint

If AI fails, local fallback rules must still create an editable Intelligence Item.

### 3.5 Intelligence Item Editing

The Intelligence Item workspace is the main analyst editing surface.

Required editable fields:

- Title
- Summary
- What Happened
- Why It Matters
- Potential Consequences
- What To Watch Next
- Internal Notes

Actions:

- Save Draft
- Submit for Verification
- Mark Verified
- Open Version History

Saving a draft must create a `storyVersions` snapshot before updating the current item.

### 3.6 Verification And Approval

Expected workflow:

```text
Draft
→ Submitted for Verification
→ Verified
→ Approved
→ Published
```

Verification screen must list Intelligence Items with status:

- `submitted_for_verification`
- `verified`
- `approved`

Actions:

- Verify
- Approve
- Approve & Publish
- Return to Draft
- Edit

Each transition creates a lightweight `verificationReviews` record for auditability.

### 3.7 Publication

Only approved Intelligence Items can be published.

Publishing creates:

- `publishedIntelligence`
- `feedItems`
- search document
- alert rule evaluation

Published Intelligence feeds:

- Feed
- Country Intelligence
- Alerts
- Reports
- Dashboards

Publishing should be idempotent by default: if a story already has an active published record, reuse it unless `forceNew` is explicitly provided.

## 4. Object Model

### 4.1 Source

Collection: `sources`

Required fields:

```json
{
  "name": "string",
  "country": "string",
  "type": "RSS | Website | API | News",
  "url": "string"
}
```

Launch fields:

```json
{
  "status": "pending_review | active | probation | inactive | blacklisted",
  "approvalStatus": "pending_review | approved | probation | blacklisted",
  "topic": "string",
  "language": "string",
  "frequency": "string",
  "reliability": "number",
  "collectorType": "NewsScraperWorker",
  "initialAssessmentId": "string",
  "initialAssessmentScore": "number",
  "initialAssessmentRecommendation": "approve | probation | blacklist",
  "initialAssessedAt": "ISO datetime",
  "probationStartedAt": "ISO datetime",
  "probationEndsAt": "ISO datetime",
  "lastScrapedAt": "ISO datetime"
}
```

### 4.2 Source Probe Result

Collection: `sourceProbeResults`

```json
{
  "sourceId": "string",
  "status": "completed | failed | skipped",
  "provider": "qwen_ready | rules",
  "score": "number",
  "recommendation": "approve | probation | blacklist",
  "summary": "string",
  "sampleArticles": [
    {
      "rawArticleId": "string",
      "title": "string",
      "url": "string",
      "publishedAt": "ISO datetime",
      "confidenceScore": "number"
    }
  ]
}
```

### 4.3 Scrape Job

Collection: `scrapeJobs`

```json
{
  "stage": "ScrapeJob",
  "sourceId": "string",
  "status": "queued | running | completed | failed | cancelled",
  "collectorType": "string",
  "outputType": "RawArticle",
  "attempts": "number",
  "discoveredCount": "number",
  "acceptedCount": "number",
  "createdCount": "number",
  "nextObject": {
    "type": "RawArticle[]",
    "ids": ["string"]
  }
}
```

### 4.4 Raw Article

Collection: `rawArticles`

```json
{
  "stage": "RawArticle",
  "scrapeJobId": "string",
  "sourceId": "string",
  "sourceName": "string",
  "sourceCountry": "string",
  "provider": "string",
  "url": "string",
  "title": "string",
  "summary": "string",
  "body": "string",
  "language": "string",
  "publishedAt": "ISO datetime",
  "checksum": "string",
  "duplicateOf": "string | null",
  "status": "collected | rejected | ai_distilled | rules_distilled",
  "nextObject": {
    "type": "Story/Event",
    "storyId": "string",
    "eventId": "string"
  }
}
```

### 4.5 Intelligence Item

Collection: `stories`

```json
{
  "stage": "Story/Event",
  "rawArticleId": "string",
  "title": "string",
  "summary": "string",
  "whatHappened": "string",
  "country": "string",
  "region": "string",
  "sector": "string",
  "eventType": "Story | Event | Policy | Deal | Risk | Alert",
  "impact": "low | medium | high | critical",
  "keyFacts": ["string"],
  "keyClaims": ["string"],
  "whyItMatters": ["string"],
  "potentialConsequences": ["string"],
  "watchNext": ["string"],
  "whatToWatchNext": ["string"],
  "supportingContext": ["string"],
  "missingFacts": ["string"],
  "sourceLinks": [
    {
      "title": "string",
      "url": "string",
      "sourceName": "string"
    }
  ],
  "organizations": ["string"],
  "people": ["string"],
  "projects": ["string"],
  "riskIndicators": ["string"],
  "opportunities": ["string"],
  "aiProvider": "qwen | openai | rules_fallback | null",
  "aiModel": "string | null",
  "workflowStatus": "draft | submitted_for_verification | verified | approved | published",
  "status": "draft | submitted_for_verification | verified | approved | published",
  "version": "number"
}
```

### 4.6 Story Version

Collection: `storyVersions`

```json
{
  "storyId": "string",
  "version": "number",
  "reason": "draft_saved | submit_verification | verify | approve | revise",
  "snapshot": {}
}
```

### 4.7 Verification Review

Collection: `verificationReviews`

```json
{
  "stage": "VerificationReview",
  "storyId": "string",
  "reviewedBy": "string",
  "decision": "submitted_for_verification | verified | approved | draft",
  "evidenceChainComplete": "boolean",
  "notes": "string",
  "status": "string",
  "source": "intelligence_item_workflow"
}
```

### 4.8 Published Intelligence

Collection: `publishedIntelligence`

```json
{
  "stage": "PublishedIntelligence",
  "storyId": "string",
  "eventId": "string | null",
  "title": "string",
  "summary": "string",
  "country": "string",
  "sector": "string",
  "eventType": "string",
  "impact": "string",
  "keyFacts": ["string"],
  "whyItMatters": ["string"],
  "potentialConsequences": ["string"],
  "watchNext": ["string"],
  "signalScore": "number | null",
  "confidenceScore": "number | null",
  "publishedAt": "ISO datetime",
  "audience": ["government", "investor", "corporate", "diplomatic"],
  "status": "published | unpublished"
}
```

## 5. AI Provider Requirements

### 5.1 Provider Priority

AI distillation must choose provider in this order:

1. `AI_PRIMARY_PROVIDER=qwen`
2. Qwen available through `QWEN_API_KEY` or `DASHSCOPE_API_KEY`
3. `AI_PRIMARY_PROVIDER=openai`
4. OpenAI available through `OPENAI_API_KEY`
5. Local rules fallback

### 5.2 Qwen Configuration

Environment variables:

```bash
QWEN_API_KEY=
DASHSCOPE_API_KEY=
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
AI_PRIMARY_PROVIDER=qwen
AFRIBN_AI_TIMEOUT_MS=20000
```

Qwen must be called through the OpenAI-compatible chat completions endpoint:

```text
POST {QWEN_BASE_URL}/chat/completions
```

### 5.3 AI Timeout

AI calls must not block the pipeline indefinitely.

Requirement:

- Default timeout: 20 seconds.
- Configurable by `AFRIBN_AI_TIMEOUT_MS`.
- On timeout or provider error, create a rules-based Intelligence Item and log the AI failure.

### 5.4 Distillation Prompt Requirements

System instruction:

```text
You are AFRIBN's launch-version intelligence item generator.
Convert raw African news, policy, corporate, market, or public-interest text into an editable intelligence item.
Return JSON only. Be conservative. Do not invent facts. If something is unknown, say what is missing.
The title must be agency style and 50 to 65 characters when possible.
The summary must be about 200 words, factual, and explain what happened.
Provide keyFacts, exactly four whyItMatters items, potentialConsequences, and whatToWatchNext.
```

Field instructions:

- Title: generate a 50 to 65 character agency-style title.
- Summary: create a 200 word factual narrative.
- Key Facts: list supported factual claims.
- Why It Matters: exactly four decision-maker reasons.
- Potential Consequences: plausible consequences, separated from confirmed facts.
- What To Watch Next: next indicators, dates, documents, decisions, or stakeholders.

## 6. API Requirements

### 6.1 Sources

#### List sources

```http
GET /sources
```

#### Create source and initial assessment

```http
POST /sources
Content-Type: application/json
Authorization: Bearer <admin_jwt>

{
  "name": "Tanzania Strategic RSS",
  "country": "Tanzania",
  "type": "RSS",
  "url": "https://rss.app/feeds/RrLLgXw18GhKhr6m.xml",
  "topic": "General",
  "language": "en",
  "reliability": 72,
  "initialLimit": 10
}
```

Response:

```json
{
  "data": {
    "id": "sources_0009",
    "source": {},
    "assessment": {}
  }
}
```

The response keeps top-level source fields for backward compatibility and also includes nested `source`.

#### Update source

```http
PATCH /sources/:id
```

#### Run source test scrape

```http
POST /sources/:id/test-scrape
```

#### Rerun initial assessment

```http
POST /sources/:id/initial-assessment
```

#### Approve source

```http
POST /sources/:id/approve
```

#### Put source on 7-day probation

```http
POST /sources/:id/probation
```

#### Blacklist source

```http
POST /sources/:id/blacklist
```

#### Pause source

```http
POST /sources/:id/pause
```

#### Reactivate source

```http
POST /sources/:id/reactivate
```

### 6.2 Workers / Collection

#### Run scrape worker

```http
POST /workers/scrape

{
  "sourceId": "sources_0009",
  "limit": 10
}
```

### 6.3 Raw Articles

#### List raw articles

```http
GET /raw-articles
```

#### Reject raw article

```http
POST /raw-articles/:id/reject
```

#### Convert raw article to Intelligence Item

```http
POST /raw-articles/:id/convert-intelligence

{
  "timeoutMs": 20000
}
```

Backward-compatible alias:

```http
POST /raw-articles/:id/ai-distill
```

### 6.4 Intelligence Items

#### List items

```http
GET /intelligence-items
GET /intelligence-items?status=draft
GET /intelligence-items?status=submitted_for_verification,verified,approved
```

#### Create item from raw article

```http
POST /intelligence-items

{
  "rawArticleId": "raw_articles_0001"
}
```

#### Get item

```http
GET /intelligence-items/:id
```

#### Update draft

```http
PATCH /intelligence-items/:id

{
  "title": "string",
  "summary": "string",
  "whatHappened": "string",
  "whyItMatters": ["string"],
  "potentialConsequences": ["string"],
  "watchNext": ["string"],
  "internalNotes": "string"
}
```

#### Get versions

```http
GET /intelligence-items/:id/versions
```

#### Submit for verification

```http
POST /intelligence-items/:id/submit-verification
```

#### Return to draft

```http
POST /intelligence-items/:id/return-draft
```

#### Verify

```http
POST /intelligence-items/:id/verify
```

#### Approve

```http
POST /intelligence-items/:id/approve
```

#### Publish

```http
POST /intelligence-items/:id/publish
```

#### Unpublish

```http
POST /intelligence-items/:id/unpublish
```

#### Revise

```http
POST /intelligence-items/:id/revise
```

### 6.5 Published Intelligence

```http
GET /published-intelligence
GET /published-intelligence/:id
PATCH /published-intelligence/:id
POST /published-intelligence/:id/unpublish
```

## 7. UI Requirements

### 7.1 Navigation

Production nav for launch must show:

- Sources
- Collection Jobs
- Raw Articles
- Intelligence Items
- Verification
- Published Intelligence

Production nav must hide for launch:

- Scoring
- Gap Reports
- Field Tasks

Those pages can remain accessible by URL for internal/backlog use, but they must not be primary launch navigation.

### 7.2 Sources Page

Required UI:

- Stats cards:
  - Total Sources
  - Active
  - Average Reliability
  - On Probation
  - Blacklisted
- Source table:
  - Name
  - URL
  - Type/provider
  - Country/topic
  - Reliability score
  - Decision/status
  - Last scraped
  - Probe recommendation
- Row actions:
  - Run scrape
  - Rerun assessment
  - Edit
  - Approve
  - Probation
  - Blacklist
  - Pause

### 7.3 Raw Articles Page

Required UI:

- Left list of raw articles.
- Right preview of selected raw article.
- Article metadata.
- Source URL button.
- Convert to Intelligence Item.
- Reject.

Convert must call:

```text
POST /raw-articles/:id/convert-intelligence
```

After conversion:

```text
redirect to workspace.html?storyId=:storyId
```

### 7.4 Intelligence Items Page

Current file:

```text
AFRIBN_design/workspace.html
```

Launch label:

```text
Intelligence Item
```

Required fields:

- Title
- Summary
- What Happened
- Why It Matters
- Potential Consequences
- What To Watch Next
- Internal Notes

Required actions:

- Save Draft
- Submit for Verification
- Verify

### 7.5 Verification Page

Required UI:

- Queue of items awaiting verification.
- Detail panel with:
  - Status
  - Title
  - Summary
  - Why It Matters
  - Watch Next
- Actions:
  - Verify
  - Approve
  - Approve & Publish
  - Return to Draft
  - Edit

This page must not use Agent Reports as the primary launch object.

### 7.6 Published Intelligence Page

Required UI:

- Cards or table of published items.
- Title
- Summary preview
- Country
- Sector
- Published date
- Status
- Audience chips
- Unpublish action

### 7.7 Feed

Published Intelligence must appear in the feed through `feedItems`.

Feed item fields:

- Title
- Summary
- Country
- Sector/category
- Impact
- Signal score when available
- Published timestamp

## 8. Acceptance Criteria

### 8.1 Source Workflow

Given an admin adds:

```text
https://rss.app/feeds/RrLLgXw18GhKhr6m.xml
```

When the source is submitted:

- A `sources` record is created.
- An initial scrape runs.
- At least one `scrapeJobs` record is created.
- Raw articles are collected if the feed has articles.
- A `sourceProbeResults` record is created.
- The source shows probe score/recommendation in the UI.
- Admin can approve the source.

### 8.2 Raw Article Workflow

Given raw articles exist:

- Raw Articles page lists them.
- Selecting one shows a preview.
- Convert to Intelligence Item creates:
  - `stories` record
  - `events` record
  - `storySources` record
  - `storyTags` records
  - entity mentions where applicable
- Raw article status changes to `ai_distilled` or `rules_distilled`.

### 8.3 Intelligence Item Workflow

Given an Intelligence Item exists:

- Workspace loads the item by `storyId`.
- Save Draft updates the item.
- A story version snapshot is created.
- Submit for Verification updates status to `submitted_for_verification`.
- Verification page lists the item.
- Verify updates status to `verified`.
- Approve updates status to `approved`.
- Publish creates Published Intelligence and Feed Item.

### 8.4 Publication Workflow

Given 10 raw articles from the Tanzania RSS source:

- 10 Intelligence Items can be generated.
- 10 items can be submitted, verified, approved, and published.
- All 10 remain persisted in the system.
- Published page displays the 10 items.
- Feed includes the published items.

### 8.5 Resilience

- If Qwen/OpenAI is unavailable, conversion still succeeds using fallback rules.
- AI provider timeout does not block the workflow.
- Duplicate raw articles are not recreated by repeated scrapes.
- Blacklisted sources cannot be scraped.
- Existing API smoke tests continue to pass.

## 9. Test Plan

### 9.1 Automated Tests

Run:

```bash
npm test
```

Expected:

- Scoring formula tests pass.
- Source reliability tests pass.
- API adapter tests pass.
- API smoke test passes.
- Persistence smoke test passes.

### 9.2 Local Server

Start:

```bash
PORT=3002 AFRIBN_AI_TIMEOUT_MS=6000 node server.js
```

Open:

```text
http://127.0.0.1:3002/design/login.html
```

Login as admin:

```text
admin@afribn.local
```

### 9.3 Browser Workflow Test

Test these pages:

- `/design/login.html`
- `/design/sources.html`
- `/design/raw.html`
- `/design/workspace.html?storyId=:id`
- `/design/verification.html`
- `/design/published.html`
- `/design/feed.html`

Required browser assertions:

- Login completes through the normal form.
- Production nav shows Intelligence Items.
- Production nav hides Scoring, Gap Reports, Field Tasks.
- Sources page shows the Tanzania RSS source.
- Sources page shows probe recommendation.
- Raw Articles page shows Tanzania source items.
- Workspace opens generated Intelligence Item.
- Verification page uses Intelligence Items, not Agent Reports.
- Published page displays 10 source-lineage items.
- Feed includes published items.
- Browser console has no `TypeError`, `ReferenceError`, or `SyntaxError`.

### 9.4 Tanzania RSS End-to-End Test

Source:

```text
https://rss.app/feeds/RrLLgXw18GhKhr6m.xml
```

Expected:

- Source added as Tanzania RSS.
- Source approved.
- Collection runs.
- 10 raw articles are available by source lineage.
- 10 Intelligence Items are generated.
- 10 Intelligence Items are published.

Important note:

Country extraction should follow article content. A Tanzania source may contain a regional article about another country. Therefore, success is measured by source lineage, not only by `country === "Tanzania"`.

## 10. Deployment Requirements

### 10.1 Required Environment Variables

Minimum:

```bash
NODE_ENV=production
AFRIBN_JWT_SECRET=
AFRIBN_DB_PATH=
AFRIBN_UPLOAD_DIR=
AFRIBN_AI_TIMEOUT_MS=20000
```

AI:

```bash
AI_PRIMARY_PROVIDER=qwen
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
OPENAI_API_KEY=
```

Source APIs:

```bash
NEWSAPI_API_KEY=
NEWSDATA_API_KEY=
WORLDNEWS_API_KEY=
```

Alerts:

```bash
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

### 10.2 Render Deployment

After code is pushed:

1. Render redeploys the backend.
2. Confirm health:

```text
https://www.afribn.com/health
```

3. Confirm readiness/config:

```text
https://www.afribn.com/ready
```

4. Confirm UI:

```text
https://www.afribn.com/design/index.html
```

5. Run deployed workflow test with admin credentials.

## 11. Implementation Map

### Backend Files

- `src/router.js`
  - Source management endpoints.
  - Intelligence Item endpoints.
  - Launch workflow transitions.

- `src/pipeline.js`
  - Story/Event creation.
  - Intelligence Item fields.
  - Draft updates.
  - Workflow transitions.
  - Direct publication.

- `src/openai-client.js`
  - Qwen/OpenAI provider selection.
  - Structured distillation.
  - AI timeout.
  - Rules fallback.

- `src/scrapers.js`
  - RSS/Atom parsing.
  - CDATA cleanup.
  - Raw article creation support.

- `src/store.js`
  - Adds `storyVersions`.

- `src/config.js`
  - Adds Qwen readiness and provider config.

### Frontend Files

- `AFRIBN_design/assets/afribn.js`
  - Launch production nav.

- `AFRIBN_design/assets/backend.js`
  - Sources workflow.
  - Raw Articles conversion.
  - Intelligence Item workspace integration.
  - Verification page integration.
  - Published page integration.

## 12. Backlog For V2

- Activate score-first publishing for high-risk topics.
- Bring Gap Reports back into the main production nav.
- Bring Field Tasks and Agent Reports back for field corroboration.
- Add multi-source corroboration before verification.
- Add source-level Qwen quality narrative, not only rules score.
- Add advanced duplicate clustering.
- Add user assignment for verifiers.
- Add approval permissions by role and organization.
- Add revision comparison UI.
- Add public/private publish channels.
- Add article-level source credibility score.
- Add batch approve/publish for trusted sources.
- Add automatic re-scrape schedule by source priority.

