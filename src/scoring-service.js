const {
  FORMULA_VERSION,
  calculateFullScoring,
  signalBand
} = require("./scoring");
const { notFound, badRequest } = require("./http");

const SCORE_COLLECTIONS = Object.freeze({
  impact: "impactScores",
  confidence: "confidenceScores",
  signal: "signalScores",
  risk: "riskScores",
  decisionRelevance: "decisionRelevanceScores",
  negotiationLeverage: "negotiationLeverageScores",
  scenario: "scenarioScores",
  intelligenceValue: "intelligenceValueScores"
});

function calculateAndStoreScore(store, input = {}) {
  const objectType = input.objectType || input.object_type;
  const objectId = input.objectId || input.object_id;
  if (!objectType || !objectId) throw badRequest("objectType and objectId are required");
  const target = fetchScoringTarget(store, objectType, objectId);
  const context = buildScoringContext(store, target, input.userContext || input.user_context || {});
  const factors = mergeDeep(deriveFactors(target, context), input.factors || {});
  const scores = calculateFullScoring(factors);
  const stored = {};

  for (const [key, result] of Object.entries(scores)) {
    const collection = SCORE_COLLECTIONS[key];
    if (!collection) continue;
    stored[key] = storeScore(store, collection, objectType, objectId, target, factors, result);
  }

  store.insert("scoringAuditLogs", {
    objectType,
    objectId,
    action: "score.calculated",
    formulaVersion: FORMULA_VERSION,
    previousValues: latestScores(store, objectType, objectId, { before: Object.values(stored).map((score) => score.id) }),
    newValues: Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, value.score])),
    explanation: stored.signal?.explanation || scores.signal.explanation
  });

  store.insert("workerJobs", {
    queue: "events",
    type: "score.updated",
    status: "completed",
    payload: { objectType, objectId, scores: Object.fromEntries(Object.entries(stored).map(([key, value]) => [key, value.id])) },
    attempts: 1,
    maxAttempts: 1,
    runAfter: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result: { emitted: true }
  });

  updateTargetWithScores(store, target, stored);
  return {
    objectType,
    objectId,
    formulaVersion: FORMULA_VERSION,
    band: signalBand(stored.signal.score),
    factors,
    scores: stored
  };
}

function fetchScoringTarget(store, objectType, objectId) {
  const collection = collectionForObjectType(objectType);
  const object = store.get(collection, objectId);
  if (!object) throw notFound(`${objectType} not found`);
  return { objectType, collection, object };
}

function collectionForObjectType(objectType) {
  const key = String(objectType).toLowerCase();
  const map = {
    story: "stories",
    event: "events",
    policy: "policies",
    deal: "deals",
    country: "countryRiskSnapshots",
    entity: "entities",
    published_intelligence: "publishedIntelligence",
    publishedintelligence: "publishedIntelligence"
  };
  if (!map[key]) throw badRequest(`Unsupported scoring objectType: ${objectType}`);
  return map[key];
}

function buildScoringContext(store, target, userContext) {
  const object = target.object;
  const story = target.collection === "stories"
    ? object
    : object.storyId ? store.get("stories", object.storyId) : null;
  const event = target.collection === "events"
    ? object
    : object.eventId ? store.get("events", object.eventId) : story ? store.list("events", (item) => item.storyId === story.id)[0] : null;
  const sources = story ? store.list("storySources", (item) => item.storyId === story.id) : [];
  const gapReports = story ? store.list("gapReports", (item) => item.storyId === story.id) : [];
  const verificationReviews = story ? store.list("verificationReviews", (item) => item.storyId === story.id) : [];
  const watchlistItems = store.list("watchlistItems");
  const entityMentions = story ? store.list("entityMentions", (item) => item.storyId === story.id) : [];
  return { store, story, event, sources, gapReports, verificationReviews, watchlistItems, entityMentions, userContext };
}

function deriveFactors(target, context) {
  const story = context.story || target.object;
  const event = context.event || target.object;
  const sector = story.sector || event.sector || target.object.sector || "General";
  const country = story.country || event.country || target.object.country || "Pan-African";
  const signal = inferSignalFlags(story, event, context);
  const impact = inferImpactFactors(story, event);
  const confidence = inferConfidenceFactors(context);
  const decisionRelevance = inferDecisionRelevance(country, sector, context);
  const negotiationLeverage = inferNegotiationLeverage(story, event);
  const scenario = inferScenario(story, event);
  const risk = inferRisk(story, event);
  const gaps = inferGapPenalty(context);
  const intelligenceValue = {
    probability: confidence.sourceReliability,
    actionability: signal.watchlistMatch ? 80 : 55,
    timeSensitivity: signal.urgency === "immediate" ? 90 : signal.urgency === "within_7_days" ? 75 : 55,
    opportunity: story.opportunities?.length ? 75 : event.eventType === "Deal" ? 70 : 35,
    stakeholderExposure: context.entityMentions.length ? Math.min(100, 40 + context.entityMentions.length * 10) : 45
  };
  return { impact, confidence, decisionRelevance, negotiationLeverage, scenario, risk, gaps, signal, intelligenceValue };
}

function inferImpactFactors(story, event) {
  const text = `${story.title || ""} ${story.summary || ""} ${event.description || ""}`.toLowerCase();
  const isDeal = event.eventType === "Deal" || story.eventType === "Deal";
  const isPolicy = event.eventType === "Policy" || story.eventType === "Policy";
  const isRisk = event.eventType === "Risk" || story.eventType === "Risk";
  const valueBoost = /\$?\d+(?:\.\d+)?\s?(?:bn|billion|tn|trillion)/i.test(text) ? 20 : 0;
  return {
    strategicImpact: baseByType({ isDeal, isPolicy, isRisk }, 60) + (text.includes("strategic") ? 10 : 0),
    economicImpact: (isDeal ? 75 : 50) + valueBoost,
    politicalImpact: isPolicy ? 75 : text.includes("government") || text.includes("election") ? 65 : 45,
    securityImpact: isRisk ? 85 : text.includes("security") || text.includes("attack") ? 80 : 35,
    regulatoryImpact: isPolicy ? 80 : text.includes("regulation") || text.includes("licensing") ? 70 : 40,
    crossBorderImpact: text.includes("regional") || text.includes("cross-border") || story.country === "Pan-African" ? 75 : 45,
    humanSocialImpact: text.includes("community") || text.includes("jobs") || text.includes("protest") ? 65 : 40
  };
}

function inferConfidenceFactors(context) {
  const sourceReliability = context.sources.length
    ? context.sources.reduce((sum, item) => sum + Number(item.reliability || item.sourceReliabilityScore || 60), 0) / context.sources.length
    : 55;
  const credibilityScores = context.sources
    .flatMap((source) => context.store?.list?.("informationCredibilityScores", (score) => score.sourceId === source.sourceId && score.objectId === context.story?.id) || []);
  const informationCredibility = credibilityScores.length
    ? credibilityScores.reduce((sum, item) => sum + Number(item.credibilityScore || 0), 0) / credibilityScores.length
    : null;
  const corroboration = Math.min(100, context.sources.length * 25);
  const humanVerification = context.verificationReviews.some((review) => ["verified", "published"].includes(review.status)) ? 95 : 20;
  const documentaryEvidence = context.sources.some((source) => source.evidenceUrl) ? 65 : 30;
  const contradictionPenalty = context.gapReports.some((gap) => gap.missingItems?.includes("Contradiction")) ? 60 : 0;
  return {
    sourceReliability: informationCredibility ? (sourceReliability + informationCredibility) / 2 : sourceReliability,
    corroboration,
    humanVerification,
    documentaryEvidence,
    contradictionPenalty
  };
}

function inferDecisionRelevance(country, sector, context) {
  const user = context.userContext || {};
  const watchlistMatch = context.watchlistItems.some((item) => [country, sector].includes(item.itemName) || item.category === sector) ? 100 : 40;
  return {
    geographyMatch: user.countries?.includes(country) ? 100 : country === "Pan-African" ? 75 : 55,
    sectorMatch: user.sectors?.includes(sector) ? 100 : 60,
    watchlistMatch,
    userProfileMatch: user.audience ? 75 : 55
  };
}

function inferNegotiationLeverage(story, event) {
  const isDeal = event.eventType === "Deal" || story.eventType === "Deal";
  return {
    batna: isDeal ? 65 : 20,
    counterpartyDependency: isDeal ? 70 : 20,
    strategicScarcity: isDeal ? 68 : 25,
    timelinePressure: /deadline|expires|closing|urgent/i.test(`${story.summary} ${event.description}`) ? 80 : 45,
    politicalConstraint: /government|ministry|parliament/i.test(`${story.summary} ${event.description}`) ? 60 : 35,
    concessionPattern: 45
  };
}

function inferScenario(story, event) {
  const isRisk = event.eventType === "Risk" || story.eventType === "Risk";
  const isDeal = event.eventType === "Deal" || story.eventType === "Deal";
  return {
    bestCase: { probability: isDeal ? 55 : 35, consequence: isDeal ? 75 : 45 },
    baseCase: { probability: 60, consequence: isRisk ? 65 : isDeal ? 70 : 50 },
    worstCase: { probability: isRisk ? 45 : 25, consequence: isRisk ? 95 : 65 },
    wildcard: { probability: isRisk ? 20 : 10, consequence: isRisk ? 90 : 55 }
  };
}

function inferRisk(story, event) {
  const text = `${story.title} ${story.summary} ${event.description}`.toLowerCase();
  return {
    political: text.includes("government") || text.includes("election") ? 70 : 45,
    security: text.includes("attack") || text.includes("security") || event.eventType === "Risk" ? 85 : 40,
    economic: text.includes("budget") || text.includes("bank") || event.eventType === "Deal" ? 70 : 45,
    regulatory: text.includes("policy") || text.includes("regulation") ? 75 : 45,
    social: text.includes("protest") || text.includes("community") ? 65 : 40
  };
}

function inferGapPenalty(context) {
  const openGaps = context.gapReports.filter((gap) => !["closed", "resolved"].includes(gap.status));
  const missing = openGaps.flatMap((gap) => gap.missingItems || []);
  return {
    missingCriticalFacts: missing.includes("Additional corroborating source") ? 60 : 10,
    missingSources: context.sources.length < 2 ? 65 : 10,
    missingDocuments: missing.some((item) => /document|contract/i.test(item)) ? 70 : 15,
    missingStakeholders: missing.some((item) => /stakeholder|quote/i.test(item)) ? 60 : 15,
    missingTimelines: missing.some((item) => /timeline/i.test(item)) ? 55 : 10
  };
}

function inferSignalFlags(story, event, context) {
  const text = `${story.title} ${story.summary} ${event.description}`.toLowerCase();
  const urgent = text.includes("attack") || text.includes("coup") || text.includes("deadline");
  const watchlistMatch = context.watchlistItems.some((item) => [story.country, story.sector].includes(item.itemName) || item.category === story.sector);
  return {
    urgency: urgent ? "immediate" : event.eventType === "Deal" ? "within_30_days" : "monitoring",
    novelty: story.rawArticleId ? "first_report" : "update",
    watchlistMatch,
    negotiationLeverageShift: event.eventType === "Deal",
    dealCollapseRisk: false,
    tailRiskHigh: event.eventType === "Risk"
  };
}

function baseByType(flags, fallback) {
  if (flags.isRisk) return 80;
  if (flags.isDeal) return 75;
  if (flags.isPolicy) return 68;
  return fallback;
}

function storeScore(store, collection, objectType, objectId, target, factors, result) {
  return store.insert(collection, {
    objectType,
    objectId,
    storyId: target.object.storyId || (target.collection === "stories" ? target.object.id : null),
    eventId: target.object.eventId || (target.collection === "events" ? target.object.id : null),
    score: result.score,
    rawInputFactors: factors,
    normalizedFactors: result.normalizedFactors,
    formulaVersion: result.formulaVersion,
    formula: result.formula,
    explanation: result.explanation,
    confidenceLevel: result.confidenceLevel
  });
}

function latestScores(store, objectType, objectId, options = {}) {
  const exclude = new Set(options.before || []);
  return Object.fromEntries(Object.entries(SCORE_COLLECTIONS).map(([key, collection]) => {
    const score = store
      .list(collection, (item) => item.objectType === objectType && item.objectId === objectId && !exclude.has(item.id))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return [key, score || null];
  }));
}

function getScoresForObject(store, objectType, objectId) {
  return latestScores(store, objectType, objectId);
}

function getScoreExplanation(store, objectType, objectId) {
  const scores = latestScores(store, objectType, objectId);
  const signal = scores.signal;
  return {
    objectType,
    objectId,
    formulaVersion: signal?.formulaVersion || FORMULA_VERSION,
    summary: signal?.explanation || "No score has been calculated yet.",
    scores
  };
}

function updateTargetWithScores(store, target, stored) {
  const patch = {};
  if (stored.signal) patch.signalScoreId = stored.signal.id;
  if (stored.confidence) patch.confidenceScoreId = stored.confidence.id;
  if (stored.risk) patch.riskScoreId = stored.risk.id;
  if (Object.keys(patch).length) store.update(target.collection, target.object.id, patch);
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeDeep(output[key] || {}, value)
      : value;
  }
  return output;
}

module.exports = {
  SCORE_COLLECTIONS,
  calculateAndStoreScore,
  getScoresForObject,
  getScoreExplanation,
  fetchScoringTarget,
  deriveFactors
};
