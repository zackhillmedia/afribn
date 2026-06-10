# AFRIBN Frontend Technical Design Requirements

## Purpose

This document is a frontend handoff brief for Claude. The goal is to design and build a production-ready AFRIBN frontend that matches the existing AFRIBN dark intelligence-platform aesthetic while exposing the backend capabilities already implemented.

AFRIBN is not only a client-facing news dashboard. It is an intelligence production system:

```text
Source
→ ScrapeJob
→ RawArticle
→ Story/Event
→ Score
→ GapReport
→ FieldTask
→ AgentReport
→ VerificationReview
→ PublishedIntelligence
→ Dashboards / Products
```

The UI must support both:

1. Client-facing intelligence products.
2. Internal intelligence production workflows for analysts, field agents, verifiers, and admins.

## Product Identity

Name: AFRIBN  
Full name: Africa Bureau of News  
Positioning: Africa strategic intelligence network for leaders, investors, diplomats, corporations, development partners, analysts, and policy teams.

Core promise:

> Real-time African news, source reliability, verification, scoring, and decision-grade strategic intelligence.

## Visual Direction

The frontend should preserve the existing AFRIBN aesthetic from the mockups:

- Dark background: near-black / navy-black.
- Primary accent: strong red.
- Secondary accents: orange, yellow, green, blue, purple only for status/category encoding.
- Thin borders, subtle glow, restrained gradients.
- Dense dashboard layout, not a marketing-heavy SaaS layout.
- Sidebar navigation with icons.
- Top search bar across authenticated app pages.
- Cards should feel operational and data-rich.
- Tables should be compact, scannable, and filterable.
- Use status pills, score cards, confidence indicators, source badges, country flags, and timeline elements.

Avoid:

- Bright white dashboards.
- Generic startup landing page styling.
- Oversized empty hero sections inside the app.
- Decorative UI that does not support intelligence work.
- Overly rounded cards.
- One-note purple/blue SaaS palette.

## User Roles

The frontend must be role-aware.

### Admin

Can manage users, sources, scraping, source reliability, queues, prompts, system health, and all intelligence objects.

### Analyst

Can review raw articles, create/edit stories and events, score intelligence, create gap reports, publish drafts for verification.

### Field Agent

Can view assigned field tasks, upload evidence, and submit agent reports.

### Verifier

Can review agent reports and intelligence drafts, approve/reject/request clarification, and publish verified intelligence.

### Client

Can consume published intelligence products: feed, dashboards, country intelligence, watchlist, alerts, reports, policy/deal/event trackers, and risk dashboard.

## Required Application Shell

All authenticated pages should share:

- Left sidebar navigation.
- AFRIBN logo.
- Global search input.
- Notification icon.
- Message/comment icon.
- User avatar menu.
- Role-aware navigation visibility.
- Mobile responsive sidebar/drawer.

Main navigation should include:

- Home
- Real-time Feed
- Alerts
- Watchlist
- Country Intelligence
- Dashboards
- Reports
- Policy Monitor
- Deal Tracker
- Event Tracker
- Risk Dashboard
- Sources
- Collection Jobs
- Raw Articles
- Intelligence Workspace
- Scoring
- Gap Reports
- Field Tasks
- Verification
- Published Intelligence
- Admin / Operations

Some items may be hidden by role.

## Screen Requirements

### 1. Authentication

Build:

- Login screen.
- Session persistence using JWT.
- Logout.
- Expired session handling.
- Role-aware redirect after login.

Expected demo credentials may exist in backend seed data:

- admin@afribn.local
- analyst@afribn.local
- agent@afribn.local
- verifier@afribn.local
- client@afribn.local

Passwords should be provided by backend/project owner during integration.

### 2. Home Dashboard

Purpose: executive overview of AFRIBN intelligence activity.

Elements:

- Total stories.
- Policy changes.
- Deals tracked.
- Events tracked.
- Current risk level.
- Top stories.
- Risk overview donut.
- Latest alerts.
- Recent updates.
- Trending topics.
- Coverage stats: countries, sources, languages, last updated.

### 3. Real-Time Feed

Purpose: live stream of published intelligence updates.

Elements:

- Filter by keyword.
- Filter by country.
- Filter by topic.
- Filter by category.
- Filter by source.
- Live updates toggle.
- Feed item list with:
  - headline
  - summary
  - country
  - topic/category
  - source
  - timestamp
  - impact level
  - source reliability indicator
  - signal score
- Right sidebar:
  - live feed summary
  - top countries
  - top topics

### 4. Story / Event Detail

Purpose: user-facing intelligence detail page.

Elements:

- Headline.
- Tags: category, region, impact level.
- Date/time.
- What happened.
- Why it matters.
- Potential consequences.
- Watch next.
- Signal score.
- Impact assessment by audience:
  - governments
  - investors
  - diplomats
  - corporates
  - development partners
- Source evidence list.
- Save/bookmark/share actions.

### 5. Country Intelligence

Purpose: country-level intelligence profile.

Elements:

- Country selector.
- Tabs:
  - Overview
  - Politics
  - Economy
  - Security
  - Investments
  - Key Sectors
  - Relations
- Key indicators.
- Risk rating.
- Latest high-impact stories.
- Major projects.
- Watchlist action.
- Export/share action.

### 6. Source Management

Purpose: manage data sources used by collection workers.

Elements:

- Source table.
- Add/edit source modal.
- Source fields:
  - name
  - URL
  - type: RSS, website, API, social, document, field report
  - country coverage
  - topic coverage
  - sector coverage
  - language
  - scrape frequency
  - active/inactive status
- Source health:
  - last scraped
  - last successful scrape
  - failure count
  - articles collected
- Actions:
  - run scrape
  - edit
  - disable
  - view reliability
  - blacklist
  - whitelist

### 7. Source Reliability Engine

Purpose: expose backend source reliability scoring and collection decision logic.

Elements:

- Source Reliability Score card.
- Information Credibility Score card.
- Collection Priority Score card.
- AIR indicator.
- SCV indicator.
- Reliability decision:
  - normal
  - enhanced
  - partial
  - probation
  - suppressed
  - blacklisted
  - whitelisted
- Formula factor breakdown:
  - Trust Record
  - Correction Accuracy
  - Authoritativeness
  - Timeliness Window
  - Reliability Volatility
  - Recent Accuracy
  - Corroboration Offset
  - Independence
  - Bias Penalty
  - Conflict Penalty
- Explanation panel.
- Audit log timeline.
- Override score action.
- Blacklist/whitelist action.
- Probation source list.
- Top priority source list.

### 8. Collection Jobs

Purpose: observe and control scraping jobs.

Elements:

- Scrape job table.
- Status:
  - queued
  - running
  - completed
  - failed
  - cancelled
- Source.
- Started/completed timestamp.
- Articles found.
- Articles imported.
- Error details.
- Retry button.
- Cancel button.
- Job detail drawer.

### 9. Raw Article Review

Purpose: analyst inbox for collected content before intelligence creation.

Elements:

- Raw article list.
- Filters:
  - source
  - country
  - topic
  - status
  - date
  - reliability decision
- Article preview:
  - title
  - body excerpt
  - source
  - URL
  - author
  - published date
  - scraped date
  - language
  - detected entities
  - duplicate/near-duplicate marker
- Actions:
  - convert to story
  - convert to event
  - send to AI extraction
  - reject/archive
  - open source URL

### 10. Intelligence Workspace

Purpose: analyst editor for turning raw content into decision-grade intelligence.

Elements:

- Story/event editor.
- Fields:
  - headline
  - summary
  - what happened
  - why it matters
  - potential consequences
  - watch next
  - countries
  - topics
  - sectors
  - entities: people, companies, organizations
  - source links
  - internal notes
- AI-generated draft comparison.
- Analyst edits tracking.
- Submit for scoring button.
- Save draft button.
- Submit for verification button.

### 11. Scoring Workspace

Purpose: expose AFRIBN scoring formulas and allow analysts to inspect/recalculate.

Elements:

- Impact score.
- Confidence score.
- Signal score.
- Decision relevance score.
- Negotiation leverage score.
- Scenario risk score.
- Risk score.
- Gap penalty.
- AFRIBN Intelligence Value.
- Factor sliders/inputs.
- Formula explanation panel.
- Score version history.
- Recalculate button.
- Save score button.

Score factors should be transparent. The UI should make it clear why an intelligence item has a high or low score.

### 12. Gap Reports

Purpose: show what information is missing before intelligence can be trusted or published.

Elements:

- Gap report list.
- Missing facts.
- Missing source corroboration.
- Contradictory evidence warnings.
- Confidence gaps.
- Required follow-up questions.
- Priority.
- Due date.
- Linked story/event.
- Create field task action.
- Assign to agent action.

### 13. Field Tasks

Purpose: field agent workflow.

Elements:

- Assigned task list.
- Task detail page.
- Task status:
  - assigned
  - in progress
  - submitted
  - accepted
  - rejected
- Required evidence checklist.
- Location/country/topic.
- Deadline.
- Upload files/photos/documents.
- Notes field.
- Submit agent report.

### 14. Agent Reports

Purpose: review field-submitted evidence before verification.

Elements:

- Agent report list.
- Linked field task.
- Agent name.
- Submission date.
- Evidence attachments.
- Summary.
- Confidence.
- Location/context.
- Status.
- Send to verification action.

### 15. Verification Review

Purpose: verifier/editor workspace for quality control before publication.

Elements:

- Verification queue.
- Intelligence draft.
- Linked source evidence.
- Linked agent reports.
- Source reliability summary.
- Score summary.
- Contradictions and gaps.
- Review notes.
- Actions:
  - approve
  - reject
  - request clarification
  - publish
- Verification timeline.

### 16. Published Intelligence

Purpose: library of verified intelligence items that power products.

Elements:

- Published intelligence table/grid.
- Filters:
  - country
  - topic
  - product
  - type
  - date
  - score
- Published item detail.
- Audience visibility.
- Attach to:
  - feed
  - reports
  - dashboards
  - alerts
  - country intelligence
- Update/unpublish action.
- Version history.

### 17. Alerts

Purpose: alert management and alert consumption.

Elements:

- Alert list.
- Priority cards:
  - high
  - medium
  - low
  - acknowledged
- Search/filter alerts.
- Alert status:
  - new
  - in progress
  - acknowledged
  - resolved
- Alert rule builder.
- Trigger options:
  - country
  - topic
  - source
  - score threshold
  - watchlist item
  - risk change
- Delivery channels:
  - in-app
  - email
  - SMS
- Delivery log.

### 18. Watchlist

Purpose: user-specific monitoring of countries, companies, topics, people.

Elements:

- Watchlist table.
- Tabs:
  - all
  - countries
  - companies
  - topics
  - people
- Add item.
- Manage watchlist.
- Alert counts.
- Risk level.
- Recent alerts sidebar.
- Watchlist summary chart.

### 19. Reports

Purpose: report library and report generation.

Elements:

- Featured reports.
- All reports table.
- Report filters.
- Create report action.
- Report builder:
  - title
  - executive summary
  - selected intelligence items
  - key themes
  - countries
  - charts
  - analyst notes
- PDF preview.
- Download PDF.
- Recently viewed reports.

### 20. Policy Monitor

Purpose: policy and regulatory tracking.

Elements:

- Policy table.
- Filter by country, sector, type, status.
- Policy status:
  - new
  - under review
  - implemented
  - repealed/amended
  - public consultation
- Policy activity trend.
- Policy by status chart.
- Recent policy alerts.

### 21. Deal Tracker

Purpose: monitor strategic deals and projects.

Elements:

- Deal table.
- Search/filter by status, country, sector, deal type.
- Deal stats:
  - total
  - in progress
  - completed
  - on hold
  - cancelled
- Deal fields:
  - name
  - country
  - sector
  - deal type
  - value
  - stage
  - status
  - updated date
- Add deal.
- Export.

### 22. Event Tracker

Purpose: monitor upcoming and past events impacting Africa.

Elements:

- Event table.
- Calendar sidebar.
- Event status:
  - live now
  - upcoming
  - completed
  - past due
- Event fields:
  - name
  - organizer
  - country
  - category
  - type
  - date
  - status
  - impact
- Upcoming highlights.
- Event impact summary.

### 23. Risk Dashboard

Purpose: country and regional risk visualization.

Elements:

- Africa risk map.
- Risk zone list.
- Overall risk score.
- Country risk filters.
- Risk dimensions:
  - political
  - security
  - economic
  - regulatory
  - social
- Risk trend sparklines.
- Map/table view toggle.

### 24. Dashboards

Purpose: broad analytics and trend visualization.

Elements:

- Total stories.
- Policy changes.
- Deals tracked.
- Events tracked.
- Stories over time.
- Stories by category.
- Stories by country.
- Top topics.
- Intelligence summary.
- Recent alerts.
- Auto-refresh toggle.
- Data updated timestamp.

### 25. Admin / Operations

Purpose: manage backend operations.

Elements:

- Worker queue dashboard.
- Failed jobs.
- Retry failed jobs.
- AI call logs.
- Scrape health.
- Source health.
- Email/SMS delivery health.
- API/provider status.
- Prompt version manager.
- System audit logs.
- User and role management.

## API Integration Expectations

The backend exposes JSON APIs. The frontend should use a centralized API client with:

- Base URL configuration.
- JWT token attachment.
- Error normalization.
- Loading states.
- Empty states.
- Pagination helpers.
- Filter/query helper utilities.
- Auth refresh/expired-session handling.

Expected integration objects:

- users
- sources
- scrape jobs
- raw articles
- stories
- events
- scores
- gap reports
- field tasks
- agent reports
- verification reviews
- published intelligence
- alerts
- watchlists
- reports
- dashboards
- source reliability records

## State Requirements

The frontend should support:

- Authenticated user state.
- Role and permission state.
- Current organization/workspace if introduced later.
- Global search state.
- Notifications state.
- Filters and pagination state per page.
- Optimistic updates for lightweight actions where safe.
- Toast notifications for save/publish/approve/reject actions.

## Critical UX Workflows

### Workflow A: Source to Raw Article

1. Admin adds source.
2. Admin/analyst runs scrape.
3. Collection job appears.
4. Raw articles appear in review inbox.
5. Source reliability is visible beside collected content.

### Workflow B: Raw Article to Intelligence

1. Analyst opens raw article.
2. Analyst uses AI extraction or manually creates story/event.
3. Analyst edits intelligence fields.
4. Analyst sends item to scoring.

### Workflow C: Scoring to Gap Report

1. Analyst opens scoring workspace.
2. System calculates impact/confidence/signal/risk scores.
3. If confidence is low or gaps exist, analyst creates a gap report.
4. Gap report creates field task.

### Workflow D: Field Task to Verification

1. Field agent opens assigned task.
2. Agent uploads evidence and submits report.
3. Verifier reviews report and evidence.
4. Verifier approves/rejects/request clarification.

### Workflow E: Verification to Published Intelligence

1. Verified intelligence is published.
2. Published item appears in feed/product pages.
3. Alerts fire when user rules/watchlists match.
4. Dashboards update.

## Components To Build

Reusable components should include:

- AppShell
- SidebarNav
- TopSearchBar
- RoleGuard
- DataTable
- FilterBar
- MetricCard
- ScoreCard
- StatusPill
- RiskPill
- SourceReliabilityBadge
- CountryFlagLabel
- EntityTag
- Timeline
- EvidenceList
- AuditLog
- FormulaBreakdown
- ScoreFactorSlider
- DetailDrawer
- ConfirmDialog
- UploadDropzone
- PDFPreview
- EmptyState
- LoadingSkeleton
- ErrorPanel

## Responsiveness

Desktop is primary, because this is a dense intelligence platform.

Still, the UI must support:

- Laptop widths.
- Tablet widths.
- Mobile read-only consumption for feed, alerts, tasks, and reports.

On small screens:

- Sidebar becomes drawer.
- Tables become stacked cards or horizontally scrollable tables.
- Right side panels collapse under main content.

## Frontend Deliverable Expected From Claude

Claude should produce:

1. A working frontend codebase.
2. A route map.
3. Reusable component library.
4. API client layer.
5. Auth/JWT handling.
6. Role-based page access.
7. Mock data fallback only where backend endpoints are not yet connected.
8. Clear TODO comments for backend endpoint assumptions.
9. Styling that matches AFRIBN screenshots.

## Highest Priority Screens

If time is limited, prioritize these first:

1. Login / authenticated app shell.
2. Source Management.
3. Source Reliability Engine.
4. Collection Jobs.
5. Raw Article Review.
6. Intelligence Workspace.
7. Scoring Workspace.
8. Gap Reports.
9. Field Tasks.
10. Verification Review.
11. Published Intelligence.
12. Real-Time Feed.
13. Alerts.
14. Home Dashboard.

These screens make the backend usable. The other product dashboards can be refined after the production pipeline is operable.

## Success Criteria

The frontend is successful when:

- A user can log in.
- An admin can add/manage sources.
- A source can be scraped.
- Raw articles can be reviewed.
- A story/event can be created.
- Scores can be calculated and inspected.
- A gap report can create a field task.
- A field agent can submit a report.
- A verifier can approve/publish intelligence.
- Published intelligence appears in feed/dashboard/product screens.
- Alerts and watchlists are visible and manageable.
- The UI visually matches the AFRIBN dark red intelligence aesthetic.

