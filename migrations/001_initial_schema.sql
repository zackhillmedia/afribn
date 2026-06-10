BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'enterprise',
  country TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  email CITEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT '15min',
  reliability INTEGER NOT NULL DEFAULT 70 CHECK (reliability BETWEEN 0 AND 100),
  collector_type TEXT NOT NULL DEFAULT 'NewsScraperWorker',
  status TEXT NOT NULL DEFAULT 'active',
  scraping_config JSONB NOT NULL DEFAULT '{}',
  last_scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  uptime_pct NUMERIC,
  last_latency_ms INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_reliability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  base_reliability_score NUMERIC,
  adjusted_reliability_score NUMERIC NOT NULL CHECK (adjusted_reliability_score >= 0 AND adjusted_reliability_score <= 100),
  source_grade TEXT NOT NULL,
  track_record_score NUMERIC,
  competency_access_score NUMERIC,
  authenticity_score NUMERIC,
  trustworthiness_score NUMERIC,
  recency_modifier NUMERIC,
  recent_accuracy_modifier NUMERIC,
  consistency_modifier NUMERIC,
  independence_modifier NUMERIC,
  bias_penalty NUMERIC,
  contradiction_penalty NUMERIC,
  formula_version TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS information_credibility_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  credibility_score NUMERIC NOT NULL CHECK (credibility_score >= 0 AND credibility_score <= 100),
  credibility_grade TEXT NOT NULL,
  independent_corroboration_score NUMERIC,
  evidence_quality_score NUMERIC,
  specificity_score NUMERIC,
  plausibility_score NUMERIC,
  timeliness_score NUMERIC,
  claim_consistency_score NUMERIC,
  contradiction_penalty NUMERIC,
  formula_version TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_collection_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  collection_priority_score NUMERIC NOT NULL CHECK (collection_priority_score >= 0 AND collection_priority_score <= 100),
  strategic_collection_value NUMERIC CHECK (strategic_collection_value >= 0 AND strategic_collection_value <= 100),
  decision TEXT NOT NULL,
  reason TEXT,
  scrape_frequency TEXT,
  scrape_depth TEXT,
  manual_review_required BOOLEAN NOT NULL DEFAULT false,
  formula_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_validation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  result TEXT NOT NULL,
  reason TEXT,
  verification_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_probe_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  http_status INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_topic_reliability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  reliability_score NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_country_reliability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  reliability_score NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corroboration_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  canonical_claim TEXT NOT NULL,
  independent_source_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'ScrapeJob',
  status TEXT NOT NULL,
  collector_type TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_job_id UUID REFERENCES scrape_jobs(id) ON DELETE SET NULL,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_name TEXT,
  url TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  published_at TIMESTAMPTZ,
  checksum TEXT,
  duplicate_of UUID REFERENCES raw_articles(id),
  status TEXT NOT NULL DEFAULT 'collected',
  ai_provider TEXT,
  ai_model TEXT,
  ai_response_id TEXT,
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_articles_checksum ON raw_articles(checksum) WHERE checksum IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_articles_source ON raw_articles(source_id);

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_article_id UUID REFERENCES raw_articles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  country TEXT NOT NULL,
  region TEXT,
  sector TEXT NOT NULL,
  event_type TEXT NOT NULL,
  impact TEXT NOT NULL,
  key_claims JSONB NOT NULL DEFAULT '[]',
  opportunities JSONB NOT NULL DEFAULT '[]',
  risk_indicators JSONB NOT NULL DEFAULT '[]',
  organizations JSONB NOT NULL DEFAULT '[]',
  people JSONB NOT NULL DEFAULT '[]',
  projects JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  ai_provider TEXT,
  ai_model TEXT,
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stories_country_sector ON stories(country, sector);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'pipeline',
  event_type TEXT NOT NULL,
  country TEXT NOT NULL,
  sector TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  occurred_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  timezone TEXT DEFAULT 'UTC',
  format TEXT DEFAULT 'in_person',
  access_type TEXT DEFAULT 'in_person',
  access_link TEXT,
  address TEXT,
  venue TEXT,
  organizer TEXT,
  speakers JSONB NOT NULL DEFAULT '[]',
  key_documents JSONB NOT NULL DEFAULT '[]',
  tags JSONB NOT NULL DEFAULT '[]',
  value TEXT,
  status TEXT NOT NULL DEFAULT 'identified',
  approval_status TEXT NOT NULL DEFAULT 'approved',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  impact TEXT,
  signal_score_id UUID,
  confidence_score_id UUID,
  risk_score_id UUID,
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_type_country ON events(event_type, country);

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_type_canonical ON entities(type, lower(canonical_name));

CREATE TABLE IF NOT EXISTS entity_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  mention_text TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  raw_article_id UUID REFERENCES raw_articles(id) ON DELETE SET NULL,
  evidence_url TEXT,
  reliability INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  sector TEXT NOT NULL,
  title TEXT NOT NULL,
  policy_type TEXT,
  status TEXT NOT NULL,
  impact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  sector TEXT NOT NULL,
  title TEXT NOT NULL,
  value TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  counterparties JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT,
  object_id UUID,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  factors JSONB NOT NULL DEFAULT '{}',
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  model_version TEXT,
  formula_version TEXT,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS impact_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  formula_version TEXT NOT NULL,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_relevance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  formula_version TEXT NOT NULL,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS negotiation_leverage_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  formula_version TEXT NOT NULL,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  formula_version TEXT NOT NULL,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intelligence_value_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  formula_version TEXT NOT NULL,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scoring_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geography_preferences JSONB NOT NULL DEFAULT '[]',
  sector_preferences JSONB NOT NULL DEFAULT '[]',
  audience_type TEXT,
  weights JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scoring_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id UUID NOT NULL,
  action TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS confidence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT,
  object_id UUID,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  factors JSONB NOT NULL DEFAULT '{}',
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  verified BOOLEAN NOT NULL DEFAULT false,
  model_version TEXT,
  formula_version TEXT,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT,
  object_id UUID,
  story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  country TEXT,
  category TEXT,
  score NUMERIC NOT NULL CHECK (score >= 0 AND score <= 100),
  raw_input_factors JSONB NOT NULL DEFAULT '{}',
  normalized_factors JSONB NOT NULL DEFAULT '{}',
  formula_version TEXT,
  formula TEXT,
  explanation TEXT,
  confidence_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS country_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  overall_risk INTEGER NOT NULL CHECK (overall_risk BETWEEN 0 AND 100),
  categories JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gap_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  signal_score_id UUID REFERENCES signal_scores(id) ON DELETE SET NULL,
  missing_items JSONB NOT NULL DEFAULT '[]',
  priority TEXT NOT NULL,
  recommended_tasks JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open',
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_report_id UUID REFERENCES gap_reports(id) ON DELETE CASCADE,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  instructions TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'assigned',
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_task_id UUID REFERENCES field_tasks(id) ON DELETE CASCADE,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  findings TEXT NOT NULL,
  evidence_summary TEXT,
  confidence_delta INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  path TEXT NOT NULL,
  size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_report_id UUID REFERENCES agent_reports(id) ON DELETE CASCADE,
  uploaded_file_id UUID REFERENCES uploaded_files(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_report_id UUID REFERENCES agent_reports(id) ON DELETE SET NULL,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decision TEXT NOT NULL,
  evidence_chain_complete BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL,
  next_object JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id UUID,
  label TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type TEXT NOT NULL,
  from_id UUID,
  relationship TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id UUID,
  confidence INTEGER NOT NULL DEFAULT 70,
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS published_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  country TEXT NOT NULL,
  sector TEXT NOT NULL,
  event_type TEXT NOT NULL,
  impact TEXT NOT NULL,
  signal_score INTEGER,
  confidence_score INTEGER,
  audience JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'published',
  next_object JSONB,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_published_country_sector ON published_intelligence(country, sector);
CREATE INDEX IF NOT EXISTS idx_published_at ON published_intelligence(published_at DESC);

CREATE TABLE IF NOT EXISTS feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_intelligence_id UUID REFERENCES published_intelligence(id) ON DELETE CASCADE,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  country TEXT NOT NULL,
  sector TEXT NOT NULL,
  impact TEXT NOT NULL,
  signal_score INTEGER,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  country TEXT,
  sector TEXT,
  minimum_signal_score INTEGER,
  channel TEXT NOT NULL DEFAULT 'in_app',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  feed_item_id UUID REFERENCES feed_items(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  country TEXT,
  sector TEXT,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  provider_message_id TEXT,
  note TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID REFERENCES watchlists(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT,
  risk_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  last_export_id UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  heading TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  bytes BIGINT,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_article_id UUID REFERENCES raw_articles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  response_id TEXT,
  status TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_estimate NUMERIC,
  error TEXT,
  structured_output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schema JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS worker_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_jobs_ready ON worker_jobs(queue, status, run_after);

CREATE TABLE IF NOT EXISTS search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type TEXT NOT NULL,
  ref_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  country TEXT,
  sector TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ref_type, ref_id)
);

CREATE INDEX IF NOT EXISTS idx_search_documents_tsv ON search_documents USING GIN(tsv);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  priority TEXT NOT NULL DEFAULT 'normal',
  thread_id TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_to_status ON messages(to_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from_created ON messages(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
