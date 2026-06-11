const { badRequest, notFound } = require("./http");
const { distillArticleWithOpenAI } = require("./openai-client");
const { calculateConfidenceScore, calculateRiskScore, calculateSignalScore } = require("./scoring");
const { resolveEntitiesForStory } = require("./graph/entity-resolution");
const { upsertSearchDocument } = require("./search/indexer");

const STAGE = Object.freeze({
  SOURCE: "Source",
  SCRAPE_JOB: "ScrapeJob",
  RAW_ARTICLE: "RawArticle",
  STORY_EVENT: "Story/Event",
  SCORE: "Score",
  GAP_REPORT: "GapReport",
  FIELD_TASK: "FieldTask",
  AGENT_REPORT: "AgentReport",
  VERIFICATION_REVIEW: "VerificationReview",
  PUBLISHED_INTELLIGENCE: "PublishedIntelligence",
  DASHBOARD: "Dashboards"
});

function tokenize(text) {
  return String(text || "")
    .replace(/[^\w\s.$-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function inferCountry(text, fallback = "Pan-African") {
  const countries = ["Nigeria", "Kenya", "Ghana", "Ethiopia", "DR Congo", "South Sudan", "Morocco", "South Africa"];
  return countries.find((country) => text.toLowerCase().includes(country.toLowerCase())) || fallback;
}

function inferSector(text) {
  const lower = text.toLowerCase();
  if (lower.includes("energy") || lower.includes("renewable") || lower.includes("oil") || lower.includes("gas")) return "Energy";
  if (lower.includes("budget") || lower.includes("central bank") || lower.includes("inflation")) return "Economy";
  if (lower.includes("security") || lower.includes("attack") || lower.includes("unrest")) return "Security";
  if (lower.includes("policy") || lower.includes("regulation") || lower.includes("tariff")) return "Policy";
  if (lower.includes("trade") || lower.includes("afcfta")) return "Trade";
  return "General";
}

function inferEventType(text) {
  const lower = text.toLowerCase();
  if (lower.includes("deal") || lower.includes("$") || lower.includes("agreement")) return "Deal";
  if (lower.includes("policy") || lower.includes("regulation") || lower.includes("tariff")) return "Policy";
  if (lower.includes("attack") || lower.includes("risk") || lower.includes("alert")) return "Risk";
  if (lower.includes("summit") || lower.includes("conference") || lower.includes("election")) return "Event";
  return "Story";
}

function extractEntities(store, story, text) {
  const tokens = tokenize(text);
  const candidates = [...new Set(tokens.filter((token) => /^[A-Z][A-Za-z0-9-]+$/.test(token)).slice(0, 10))];
  return candidates.map((name) => {
    let entity = store.list("entities", (item) => item.name.toLowerCase() === name.toLowerCase())[0];
    if (!entity) {
      entity = store.insert("entities", {
        name,
        type: name === story.country ? "Country" : "Organization",
        canonicalName: name,
        metadata: {}
      });
      store.insert("graphNodes", {
        nodeType: entity.type,
        refType: "entity",
        refId: entity.id,
        label: entity.name
      });
    }
    store.insert("entityMentions", {
      entityId: entity.id,
      storyId: story.id,
      mentionText: name,
      confidence: 72
    });
    return entity;
  });
}

function createScrapeJob(store, sourceId, options = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  return store.insert("scrapeJobs", {
    stage: STAGE.SCRAPE_JOB,
    sourceId,
    status: "queued",
    scheduledFor: options.scheduledFor || new Date().toISOString(),
    collectorType: options.collectorType || source.collectorType || "NewsScraperWorker",
    outputType: "RawArticle",
    attempts: 0,
    nextObject: null
  });
}

function createRawArticle(store, scrapeJobId, input = {}) {
  const job = store.get("scrapeJobs", scrapeJobId);
  if (!job) throw notFound("ScrapeJob not found");
  const source = store.get("sources", job.sourceId);
  const title = input.title || `${source.country} strategic development from ${source.name}`;
  const body = input.body || `${title}. The development may affect policy, investment, and risk signals across ${source.country}.`;
  const rawArticle = store.insert("rawArticles", {
    stage: STAGE.RAW_ARTICLE,
    scrapeJobId,
    sourceId: source.id,
    sourceName: source.name,
    url: input.url || source.url,
    title,
    body,
    language: input.language || "en",
    publishedAt: input.publishedAt || new Date().toISOString(),
    checksum: Buffer.from(`${source.id}:${title}`).toString("base64url"),
    duplicateOf: null,
    status: "collected",
    nextObject: null
  });
  store.update("scrapeJobs", scrapeJobId, {
    status: "completed",
    completedAt: new Date().toISOString(),
    nextObject: { type: "RawArticle", id: rawArticle.id }
  });
  return rawArticle;
}

function createStoryEvent(store, rawArticleId, overrides = {}) {
  const rawArticle = store.get("rawArticles", rawArticleId);
  if (!rawArticle) throw notFound("RawArticle not found");
  const source = store.get("sources", rawArticle.sourceId);
  const text = `${rawArticle.title} ${rawArticle.body}`;
  const country = overrides.country || inferCountry(text, source.country);
  const sector = overrides.sector || inferSector(text);
  const eventType = overrides.eventType || inferEventType(text);
  const summary = overrides.summary || rawArticle.body.split(".").slice(0, 2).join(".").trim();
  const impact = overrides.impact || (eventType === "Risk" ? "high" : eventType === "Deal" ? "high" : "medium");

  const story = store.insert("stories", {
    stage: STAGE.STORY_EVENT,
    rawArticleId,
    title: overrides.title || rawArticle.title,
    summary,
    country,
    region: overrides.region || "Africa",
    sector,
    eventType,
    impact,
    keyClaims: overrides.keyClaims || [summary],
    opportunities: overrides.opportunities || [],
    riskIndicators: overrides.riskIndicators || [],
    organizations: overrides.organizations || [],
    people: overrides.people || [],
    projects: overrides.projects || [],
    aiProvider: overrides.aiProvider || null,
    aiModel: overrides.aiModel || null,
    status: "draft",
    nextObject: null
  });

  const event = store.insert("events", {
    stage: STAGE.STORY_EVENT,
    storyId: story.id,
    eventType,
    country,
    sector,
    title: story.title,
    description: summary,
    occurredAt: rawArticle.publishedAt,
    value: overrides.value || null,
    status: "identified",
    nextObject: null
  });

  store.insert("storySources", {
    storyId: story.id,
    sourceId: rawArticle.sourceId,
    rawArticleId,
    evidenceUrl: rawArticle.url,
    reliability: source.reliability
  });

  store.insert("storyTags", { storyId: story.id, tag: sector });
  store.insert("storyTags", { storyId: story.id, tag: eventType });

  const entities = extractEntities(store, story, text);
  for (const entity of entities) {
    store.insert("graphEdges", {
      fromType: "entity",
      fromId: entity.id,
      relationship: "mentioned_in",
      toType: "story",
      toId: story.id,
      confidence: 72
    });
  }

  if (eventType === "Policy") {
    store.insert("policies", {
      storyId: story.id,
      eventId: event.id,
      country,
      sector,
      title: story.title,
      policyType: "Policy",
      status: "proposed",
      impact
    });
  }

  if (eventType === "Deal") {
    store.insert("deals", {
      storyId: story.id,
      eventId: event.id,
      country,
      sector,
      title: story.title,
      value: overrides.value || extractValue(text),
      stage: "signed",
      status: "in_progress",
      counterparties: entities.map((entity) => entity.name).slice(0, 4)
    });
  }

  store.update("rawArticles", rawArticleId, {
    status: "distilled",
    nextObject: { type: "Story/Event", storyId: story.id, eventId: event.id }
  });

  return { story, event, entities };
}

async function distillRawArticleWithAI(store, rawArticleId, options = {}) {
  const rawArticle = store.get("rawArticles", rawArticleId);
  if (!rawArticle) throw notFound("RawArticle not found");
  const source = store.get("sources", rawArticle.sourceId);
  const promptVersion = options.promptVersion || getActivePromptVersion(store, "intelligence_distillation") || "v1";
  let result;
  try {
    result = await distillArticleWithOpenAI(rawArticle, source, { ...options, promptVersion });
  } catch (error) {
    store.insert("aiProcessingLogs", {
      rawArticleId,
      provider: "openai",
      model: options.model || process.env.OPENAI_MODEL || "gpt-5.4",
      promptVersion,
      status: "failed",
      error: error.message
    });
    const fallback = createStoryEvent(store, rawArticleId, {
      country: options.country,
      sector: options.sector,
      eventType: options.eventType,
      impact: options.impact,
      aiProvider: null,
      aiModel: null
    });
    store.update("rawArticles", rawArticleId, {
      status: "rules_distilled",
      aiProvider: "rules_fallback",
      aiModel: null,
      aiError: error.message
    });
    store.insert("aiProcessingLogs", {
      rawArticleId,
      provider: "rules_fallback",
      model: "local-rules",
      promptVersion,
      status: "completed_with_fallback",
      error: error.message,
      structuredOutput: {
        title: fallback.story.title,
        summary: fallback.story.summary,
        country: fallback.story.country,
        sector: fallback.story.sector,
        eventType: fallback.story.eventType,
        impact: fallback.story.impact
      }
    });
    return {
      ai: {
        provider: "rules_fallback",
        model: "local-rules",
        status: "fallback",
        error: error.message
      },
      ...fallback
    };
  }
  const distilled = result.data;

  const storyEvent = createStoryEvent(store, rawArticleId, {
    title: distilled.title,
    summary: distilled.summary,
    country: distilled.country,
    region: distilled.region,
    sector: distilled.sector,
    eventType: distilled.eventType,
    impact: distilled.impact,
    value: distilled.value,
    keyClaims: distilled.keyClaims,
    opportunities: distilled.opportunities,
    riskIndicators: distilled.riskIndicators,
    organizations: distilled.organizations,
    people: distilled.people,
    projects: distilled.projects,
    aiProvider: result.provider,
    aiModel: result.model
  });
  resolveEntitiesForStory(store, storyEvent.story.id);

  store.update("rawArticles", rawArticleId, {
    status: "ai_distilled",
    aiProvider: result.provider,
    aiModel: result.model,
    aiResponseId: result.responseId || null
  });

  store.insert("aiProcessingLogs", {
    rawArticleId,
    provider: result.provider,
    model: result.model,
    promptVersion,
    responseId: result.responseId || null,
    status: "completed",
    inputTokens: result.usage?.inputTokens || null,
    outputTokens: result.usage?.outputTokens || null,
    structuredOutput: distilled
  });

  return {
    ai: {
      provider: result.provider,
      model: result.model,
      responseId: result.responseId || null,
      structuredOutput: distilled
    },
    ...storyEvent
  };
}

function getActivePromptVersion(store, name) {
  return store
    .list("promptVersions", (prompt) => prompt.name === name && prompt.status === "active")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.version;
}

function extractValue(text) {
  const match = text.match(/\$?\d+(?:\.\d+)?\s?(?:bn|billion|m|million|tn|trillion)/i);
  return match ? match[0] : null;
}

function createScore(store, eventId, inputs = {}) {
  const event = store.get("events", eventId);
  if (!event) throw notFound("Event not found");
  const story = store.get("stories", event.storyId);
  const sourceRecord = store.list("storySources", (item) => item.storyId === story.id)[0];
  const sourceReliability = sourceRecord?.reliability || 70;

  const strategicBase = event.eventType === "Deal" ? 84 : event.eventType === "Risk" ? 88 : event.eventType === "Policy" ? 78 : 62;
  const signalInputs = {
    impact: inputs.impact ?? strategicBase,
    urgency: inputs.urgency ?? 72,
    novelty: inputs.novelty ?? 68,
    countryImportance: inputs.countryImportance ?? 75,
    sectorImportance: inputs.sectorImportance ?? 70,
    crossBorderEffect: inputs.crossBorderEffect ?? (event.country === "Pan-African" ? 90 : 62),
    sourceCredibility: inputs.sourceCredibility ?? sourceReliability
  };
  const confidenceInputs = {
    sourceReliability: inputs.sourceReliability ?? sourceReliability,
    corroborationCount: inputs.corroborationCount ?? 45,
    humanVerification: inputs.humanVerification ?? 0,
    documentEvidence: inputs.documentEvidence ?? 30,
    aiUncertaintyPenalty: inputs.aiUncertaintyPenalty ?? 20
  };
  const signalScoreValue = calculateSignalScore(signalInputs);
  const confidenceScoreValue = calculateConfidenceScore(confidenceInputs);

  const signalScore = store.insert("signalScores", {
    stage: STAGE.SCORE,
    eventId,
    storyId: story.id,
    score: signalScoreValue,
    factors: signalInputs,
    modelVersion: inputs.modelVersion || "rules-v1",
    nextObject: null
  });

  const confidenceScore = store.insert("confidenceScores", {
    stage: STAGE.SCORE,
    eventId,
    storyId: story.id,
    score: confidenceScoreValue,
    factors: confidenceInputs,
    verified: false,
    modelVersion: inputs.modelVersion || "rules-v1",
    nextObject: null
  });

  const riskScore = store.insert("riskScores", {
    eventId,
    storyId: story.id,
    country: event.country,
    category: event.sector,
    score: calculateRiskScore({
      political: inputs.politicalRisk ?? 55,
      security: inputs.securityRisk ?? (event.eventType === "Risk" ? 88 : 50),
      economic: inputs.economicRisk ?? 58,
      regulatory: inputs.regulatoryRisk ?? (event.eventType === "Policy" ? 75 : 50),
      social: inputs.socialRisk ?? 48
    })
  });

  store.update("events", eventId, {
    status: "scored",
    signalScoreId: signalScore.id,
    confidenceScoreId: confidenceScore.id,
    riskScoreId: riskScore.id,
    nextObject: { type: "Score", signalScoreId: signalScore.id, confidenceScoreId: confidenceScore.id }
  });
  store.update("stories", story.id, {
    status: story.status === "draft" ? "scored" : story.status,
    signalScoreId: signalScore.id,
    confidenceScoreId: confidenceScore.id,
    riskScoreId: riskScore.id,
    nextObject: { type: "Score", signalScoreId: signalScore.id, confidenceScoreId: confidenceScore.id, riskScoreId: riskScore.id }
  });

  return { signalScore, confidenceScore, riskScore };
}

function createGapReport(store, scoreId, input = {}) {
  const signalScore = store.get("signalScores", scoreId);
  if (!signalScore) throw notFound("Signal Score not found");
  const story = store.get("stories", signalScore.storyId);
  const missing = input.missingItems || inferGaps(story, signalScore);
  const gapReport = store.insert("gapReports", {
    stage: STAGE.GAP_REPORT,
    storyId: story.id,
    eventId: signalScore.eventId,
    signalScoreId: signalScore.id,
    missingItems: missing,
    priority: signalScore.score >= 80 ? "high" : "medium",
    recommendedTasks: missing.map((item) => taskForGap(item, story)),
    status: "open",
    nextObject: null
  });
  store.update("signalScores", scoreId, {
    nextObject: { type: "GapReport", id: gapReport.id }
  });
  return gapReport;
}

function inferGaps(story, signalScore) {
  const gaps = [];
  if (!story.keyClaims || story.keyClaims.length < 2) gaps.push("Additional corroborating source");
  if (story.eventType === "Deal") gaps.push("Contract structure");
  if (story.eventType === "Policy") gaps.push("Implementation timeline");
  if (signalScore.score >= 80) gaps.push("Stakeholder quote");
  if (gaps.length === 0) gaps.push("Document evidence");
  return gaps;
}

function taskForGap(gap, story) {
  if (gap.includes("Contract")) return `Verify contract details for ${story.title}`;
  if (gap.includes("timeline")) return `Confirm implementation timeline for ${story.title}`;
  if (gap.includes("quote")) return `Collect stakeholder comment for ${story.country}`;
  return `Collect evidence for ${story.title}`;
}

function createFieldTask(store, gapReportId, input = {}) {
  const gapReport = store.get("gapReports", gapReportId);
  if (!gapReport) throw notFound("GapReport not found");
  const story = store.get("stories", gapReport.storyId);
  const fieldTask = store.insert("fieldTasks", {
    stage: STAGE.FIELD_TASK,
    gapReportId,
    storyId: story.id,
    country: story.country,
    assignedTo: input.assignedTo || null,
    taskType: input.taskType || "field_verification",
    instructions: input.instructions || gapReport.recommendedTasks[0],
    dueAt: input.dueAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "assigned",
    nextObject: null
  });
  store.update("gapReports", gapReportId, {
    status: "task_created",
    nextObject: { type: "FieldTask", id: fieldTask.id }
  });
  return fieldTask;
}

function createAgentReport(store, fieldTaskId, input = {}) {
  const fieldTask = store.get("fieldTasks", fieldTaskId);
  if (!fieldTask) throw notFound("FieldTask not found");
  const agentReport = store.insert("agentReports", {
    stage: STAGE.AGENT_REPORT,
    fieldTaskId,
    storyId: fieldTask.storyId,
    submittedBy: input.submittedBy || fieldTask.assignedTo || "agent_demo",
    findings: input.findings || "Field source confirmed the core facts and identified one implementation risk.",
    evidenceSummary: input.evidenceSummary || "Phone confirmation and public document reference.",
    confidenceDelta: input.confidenceDelta ?? 18,
    status: "submitted",
    nextObject: null
  });
  store.update("fieldTasks", fieldTaskId, {
    status: "submitted",
    nextObject: { type: "AgentReport", id: agentReport.id }
  });
  return agentReport;
}

function createVerificationReview(store, agentReportId, input = {}) {
  const agentReport = store.get("agentReports", agentReportId);
  if (!agentReport) throw notFound("AgentReport not found");
  const story = store.get("stories", agentReport.storyId);
  const decision = input.decision || "approved";
  const verificationReview = store.insert("verificationReviews", {
    stage: STAGE.VERIFICATION_REVIEW,
    agentReportId,
    storyId: story.id,
    reviewedBy: input.reviewedBy || "verifier_demo",
    decision,
    evidenceChainComplete: input.evidenceChainComplete ?? true,
    notes: input.notes || "Evidence chain is sufficient for v1 publication.",
    status: decision === "approved" ? "verified" : "rejected",
    nextObject: null
  });

  const confidenceScore = store.list("confidenceScores", (score) => score.storyId === story.id).at(-1);
  if (confidenceScore && decision === "approved") {
    store.update("confidenceScores", confidenceScore.id, {
      verified: true,
      score: Math.min(100, confidenceScore.score + Number(agentReport.confidenceDelta || 0))
    });
  }

  store.update("stories", story.id, { status: verificationReview.status });
  store.update("agentReports", agentReportId, {
    status: "reviewed",
    nextObject: { type: "VerificationReview", id: verificationReview.id }
  });
  return verificationReview;
}

function publishIntelligence(store, verificationReviewId, input = {}) {
  const review = store.get("verificationReviews", verificationReviewId);
  if (!review) throw notFound("VerificationReview not found");
  if (review.status !== "verified") throw badRequest("Only verified reviews can be published");
  const story = store.get("stories", review.storyId);
  const event = store.list("events", (item) => item.storyId === story.id)[0];
  const signalScore = store.list("signalScores", (score) => score.storyId === story.id).at(-1);
  const confidenceScore = store.list("confidenceScores", (score) => score.storyId === story.id).at(-1);

  const published = store.insert("publishedIntelligence", {
    stage: STAGE.PUBLISHED_INTELLIGENCE,
    storyId: story.id,
    eventId: event.id,
    title: story.title,
    summary: story.summary,
    country: story.country,
    sector: story.sector,
    eventType: event.eventType,
    impact: story.impact,
    signalScore: signalScore?.score || null,
    confidenceScore: confidenceScore?.score || null,
    publishedAt: input.publishedAt || new Date().toISOString(),
    audience: input.audience || ["government", "investor", "corporate", "diplomatic"],
    status: "published",
    nextObject: { type: STAGE.DASHBOARD, products: ["Feed", "Country Intelligence", "Alerts", "Reports"] }
  });

  const feedItem = store.insert("feedItems", {
    publishedIntelligenceId: published.id,
    storyId: story.id,
    title: story.title,
    summary: story.summary,
    country: story.country,
    sector: story.sector,
    impact: story.impact,
    signalScore: published.signalScore,
    publishedAt: published.publishedAt
  });
  upsertSearchDocument(store, "published_intelligence", published.id, {
    title: published.title,
    body: published.summary,
    country: published.country,
    sector: published.sector,
    tags: [published.eventType, published.impact]
  });

  store.update("verificationReviews", verificationReviewId, {
    status: "published",
    nextObject: { type: "PublishedIntelligence", id: published.id }
  });
  store.update("stories", story.id, { status: "published" });

  evaluateAlertRules(store, published, feedItem);
  return { publishedIntelligence: published, feedItem };
}

function evaluateAlertRules(store, published, feedItem) {
  for (const rule of store.list("alertRules", (item) => item.status === "active")) {
    const matchesCountry = !rule.country || rule.country === published.country;
    const matchesSector = !rule.sector || rule.sector === published.sector;
    const matchesImpact = !rule.minimumSignalScore || Number(published.signalScore || 0) >= Number(rule.minimumSignalScore);
    if (matchesCountry && matchesSector && matchesImpact) {
      const alert = store.insert("alerts", {
        ruleId: rule.id,
        feedItemId: feedItem.id,
        userId: rule.userId,
        title: published.title,
        country: published.country,
        sector: published.sector,
        priority: published.signalScore >= 80 ? "high" : "medium",
        status: "new",
        triggeredAt: new Date().toISOString()
      });
      store.insert("alertDeliveries", {
        alertId: alert.id,
        channel: rule.channel || "in_app",
        status: "queued"
      });
    }
  }
}

function runDemoPipeline(store, sourceId, input = {}) {
  const scrapeJob = createScrapeJob(store, sourceId, input.scrapeJob);
  const rawArticle = createRawArticle(store, scrapeJob.id, input.rawArticle);
  const { story, event, entities } = createStoryEvent(store, rawArticle.id, input.storyEvent);
  const score = createScore(store, event.id, input.score);
  const gapReport = createGapReport(store, score.signalScore.id, input.gapReport);
  const fieldTask = createFieldTask(store, gapReport.id, input.fieldTask);
  const agentReport = createAgentReport(store, fieldTask.id, input.agentReport);
  const verificationReview = createVerificationReview(store, agentReport.id, input.verificationReview);
  const published = publishIntelligence(store, verificationReview.id, input.publishedIntelligence);
  return {
    source: store.get("sources", sourceId),
    scrapeJob,
    rawArticle,
    story,
    event,
    entities,
    score,
    gapReport,
    fieldTask,
    agentReport,
    verificationReview,
    ...published
  };
}

module.exports = {
  STAGE,
  createScrapeJob,
  createRawArticle,
  createStoryEvent,
  distillRawArticleWithAI,
  createScore,
  createGapReport,
  createFieldTask,
  createAgentReport,
  createVerificationReview,
  publishIntelligence,
  runDemoPipeline
};
