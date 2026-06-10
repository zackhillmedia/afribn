const {
  FORMULA_VERSION,
  calculateCollectionPriority,
  calculateContextModifier,
  calculateInformationCredibility,
  calculateSourceReliability,
  calculateStrategicCollectionValue
} = require("./source-reliability");
const { badRequest, notFound } = require("./http");

function calculateSourceReliabilityForSource(store, sourceId, input = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  const previous = latestSourceReliability(store, sourceId);
  const history = sourceHistory(store, sourceId);
  const factors = {
    sourceType: normalizeSourceType(source.type),
    trueReports: history.trueReports,
    falseReports: history.falseReports,
    competencyAccessScore: input.competencyAccessScore ?? source.reliability ?? 60,
    authenticityScore: input.authenticityScore ?? defaultAuthenticity(source.type),
    trustworthinessScore: input.trustworthinessScore ?? source.reliability ?? 60,
    recencyModifier: input.recencyModifier ?? recencyModifier(source.lastScrapedAt),
    recentAccuracyModifier: input.recentAccuracyModifier ?? recentAccuracyModifier(history),
    consistencyModifier: input.consistencyModifier ?? consistencyModifier(history),
    independenceModifier: input.independenceModifier ?? 1.0,
    biasPenalty: input.biasPenalty ?? 0,
    contradictionPenalty: input.contradictionPenalty ?? history.contradictions * 5,
    insufficientHistory: input.insufficientHistory ?? history.trueReports + history.falseReports < 3
  };
  const reliability = calculateSourceReliability(factors);
  const context = calculateContextModifier(input.context || deriveContext(store, source));
  const credibility = input.credibilityScore
    ? { credibilityScore: input.credibilityScore }
    : latestInformationCredibility(store, sourceId) || { credibilityScore: reliability.adjustedReliabilityScore };
  const collection = calculateCollectionPriority({
    adjustedReliabilityScore: reliability.adjustedReliabilityScore,
    sourceGrade: reliability.sourceGrade,
    relevanceScore: input.relevanceScore ?? source.relevanceScore ?? 60,
    coverageGapScore: input.coverageGapScore ?? source.coverageGapScore ?? 60,
    freshnessScore: input.freshnessScore ?? freshnessScore(source.lastScrapedAt),
    technicalStabilityScore: input.technicalStabilityScore ?? technicalStabilityScore(store, sourceId),
    legalSafetyScore: input.legalSafetyScore ?? source.legalSafetyScore ?? 75,
    manuallyBlacklisted: isBlacklisted(store, sourceId)
  });
  const strategic = calculateStrategicCollectionValue({
    adjustedReliabilityScore: reliability.adjustedReliabilityScore,
    credibilityScore: credibility.credibilityScore,
    contextModifier: context.contextModifier,
    relevanceScore: input.relevanceScore ?? source.relevanceScore ?? 60,
    coverageGapScore: input.coverageGapScore ?? source.coverageGapScore ?? 60,
    signalValueScore: historicalSignalValue(store, sourceId)
  });
  const reliabilityRecord = store.insert("sourceReliabilityScores", { sourceId, ...reliability });
  const decisionRecord = store.insert("sourceCollectionDecisions", { sourceId, ...collection, strategicCollectionValue: strategic.strategicCollectionValue, formulaVersion: FORMULA_VERSION });
  store.update("sources", sourceId, {
    reliability: reliability.adjustedReliabilityScore,
    reliabilityGrade: reliability.sourceGrade,
    collectionDecision: collection.decision,
    frequency: collection.scrapeFrequency,
    scrapingConfig: { ...(source.scrapingConfig || {}), scrapeDepth: collection.scrapeDepth, manualReviewRequired: collection.manualReviewRequired }
  });
  audit(store, sourceId, "source.reliability.updated", previous, { reliabilityRecord, decisionRecord, strategic }, input.reason || "calculated");
  emit(store, "source.reliability.updated", { sourceId, reliabilityScoreId: reliabilityRecord.id, decisionId: decisionRecord.id });
  emit(store, "source.collection.priority.updated", { sourceId, decision: collection.decision });
  return { source: store.get("sources", sourceId), reliability: reliabilityRecord, context, collection: decisionRecord, strategic };
}

function calculateCredibilityForObject(store, input = {}) {
  const sourceId = input.sourceId || input.source_id;
  const objectType = input.objectType || input.object_type;
  const objectId = input.objectId || input.object_id;
  if (!sourceId || !objectType || !objectId) throw badRequest("sourceId, objectType and objectId are required");
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  const object = objectFor(store, objectType, objectId);
  const factors = {
    independentCorroborationScore: input.independentCorroborationScore ?? independentCorroborationScore(store, object, sourceId),
    evidenceQualityScore: input.evidenceQualityScore ?? evidenceQualityScore(object, source),
    specificityScore: input.specificityScore ?? specificityScore(object),
    plausibilityScore: input.plausibilityScore ?? 65,
    timelinessScore: input.timelinessScore ?? timelinessScore(object),
    claimConsistencyScore: input.claimConsistencyScore ?? 65,
    contradictionPenalty: input.contradictionPenalty ?? 0
  };
  const credibility = calculateInformationCredibility(factors);
  const record = store.insert("informationCredibilityScores", { sourceId, objectType, objectId, ...credibility });
  audit(store, sourceId, "source.credibility.updated", latestInformationCredibility(store, sourceId), record, input.reason || "calculated");
  updateConfidenceFromCredibility(store, sourceId, objectType, objectId, record);
  emit(store, "source.credibility.updated", { sourceId, objectType, objectId, credibilityScoreId: record.id });
  return record;
}

function overrideSourceReliability(store, sourceId, input = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  const previous = latestSourceReliability(store, sourceId);
  const record = store.insert("sourceReliabilityScores", {
    sourceId,
    baseReliabilityScore: input.baseReliabilityScore ?? input.adjustedReliabilityScore,
    adjustedReliabilityScore: input.adjustedReliabilityScore,
    sourceGrade: input.sourceGrade,
    trackRecordScore: input.trackRecordScore ?? null,
    competencyAccessScore: input.competencyAccessScore ?? null,
    authenticityScore: input.authenticityScore ?? null,
    trustworthinessScore: input.trustworthinessScore ?? null,
    formulaVersion: FORMULA_VERSION,
    explanation: input.explanation || `Manual override: ${input.reason || "No reason supplied"}`
  });
  store.update("sources", sourceId, { reliability: record.adjustedReliabilityScore, reliabilityGrade: record.sourceGrade });
  audit(store, sourceId, "source.reliability.override", previous, record, input.reason || "manual override", input.createdBy);
  return record;
}

function blacklistSource(store, sourceId, input = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  const record = store.insert("sourceBlacklist", { sourceId, reason: input.reason || "manual blacklist", createdBy: input.createdBy || null, active: true });
  store.update("sources", sourceId, { status: "blacklisted", collectionDecision: "SUPPRESS_OR_BLACKLIST" });
  audit(store, sourceId, "source.blacklisted", source, record, input.reason || "manual blacklist", input.createdBy);
  emit(store, "source.blacklisted", { sourceId });
  return record;
}

function whitelistSource(store, sourceId, input = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  for (const item of store.list("sourceBlacklist", (entry) => entry.sourceId === sourceId && entry.active !== false)) {
    store.update("sourceBlacklist", item.id, { active: false, deactivatedReason: "whitelisted" });
  }
  const record = store.insert("sourceWhitelist", { sourceId, reason: input.reason || "manual whitelist", createdBy: input.createdBy || null, active: true });
  store.update("sources", sourceId, { status: "active" });
  audit(store, sourceId, "source.whitelisted", source, record, input.reason || "manual whitelist", input.createdBy);
  emit(store, "source.whitelisted", { sourceId });
  return record;
}

function latestSourceReliability(store, sourceId) {
  return store.list("sourceReliabilityScores", (item) => item.sourceId === sourceId).sort(desc)[0] || null;
}

function latestInformationCredibility(store, sourceId) {
  return store.list("informationCredibilityScores", (item) => item.sourceId === sourceId).sort(desc)[0] || null;
}

function latestCollectionDecision(store, sourceId) {
  return store.list("sourceCollectionDecisions", (item) => item.sourceId === sourceId).sort(desc)[0] || null;
}

function sourceReliabilitySummary(store, sourceId) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  return {
    source,
    reliability: latestSourceReliability(store, sourceId),
    credibility: latestInformationCredibility(store, sourceId),
    collection: latestCollectionDecision(store, sourceId),
    audit: store.list("sourceAuditLogs", (item) => item.sourceId === sourceId).sort(desc).slice(0, 10)
  };
}

function sourceReliabilityExplanation(store, sourceId) {
  const summary = sourceReliabilitySummary(store, sourceId);
  return {
    sourceId,
    explanation: [
      summary.reliability?.explanation,
      summary.collection?.reason,
      summary.credibility?.explanation
    ].filter(Boolean).join(" ") || "No source reliability score has been calculated yet.",
    summary
  };
}

function sourceHistory(store, sourceId) {
  const verification = store.list("sourceValidationHistory", (item) => item.sourceId === sourceId);
  const scrapeFailures = store.list("scrapeJobs", (item) => item.sourceId === sourceId && item.status === "failed").length;
  return {
    trueReports: verification.filter((item) => item.result === "true").length,
    falseReports: verification.filter((item) => item.result === "false").length,
    contradictions: verification.filter((item) => item.result === "contradicted").length,
    scrapeFailures
  };
}

function objectFor(store, objectType, objectId) {
  const map = { raw_article: "rawArticles", rawarticle: "rawArticles", story: "stories", event: "events", policy: "policies", deal: "deals", published_intelligence: "publishedIntelligence" };
  const collection = map[String(objectType).toLowerCase()];
  if (!collection) throw badRequest(`Unsupported objectType: ${objectType}`);
  const object = store.get(collection, objectId);
  if (!object) throw notFound(`${objectType} not found`);
  return object;
}

function updateConfidenceFromCredibility(store, sourceId, objectType, objectId, credibility) {
  if (!["story", "event", "raw_article", "rawarticle"].includes(String(objectType).toLowerCase())) return;
  const object = objectFor(store, objectType, objectId);
  const storyId = object.storyId || object.id;
  const latestConfidence = store.list("confidenceScores", (score) => score.storyId === storyId).sort(desc)[0];
  if (latestConfidence) {
    store.update("confidenceScores", latestConfidence.id, {
      sourceReliabilityScore: store.get("sources", sourceId)?.reliability || null,
      informationCredibilityScore: credibility.credibilityScore
    });
  }
}

function audit(store, sourceId, eventType, previousValues, newValues, reason, createdBy = null) {
  return store.insert("sourceAuditLogs", { sourceId, eventType, previousValues, newValues, reason, createdBy });
}

function emit(store, type, payload) {
  return store.insert("workerJobs", {
    queue: "events",
    type,
    status: "completed",
    payload,
    attempts: 1,
    maxAttempts: 1,
    runAfter: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    result: { emitted: true }
  });
}

function deriveContext(store, source) {
  return {
    freshness: freshnessScore(source.lastScrapedAt),
    volumeReliability: 65,
    technicalStability: technicalStabilityScore(store, source.id),
    domainAuthority: source.reliability || 60,
    relevance: source.relevanceScore || 60,
    coverageGap: source.coverageGapScore || 60,
    legalSafety: source.legalSafetyScore || 75,
    externalReputation: source.reliability || 60,
    crossSourceSupport: 60
  };
}

function freshnessScore(lastScrapedAt) {
  if (!lastScrapedAt) return 50;
  const ageHours = (Date.now() - new Date(lastScrapedAt).getTime()) / 36e5;
  if (ageHours <= 1) return 95;
  if (ageHours <= 24) return 80;
  if (ageHours <= 168) return 60;
  return 35;
}

function recencyModifier(lastScrapedAt) {
  return 0.5 + freshnessScore(lastScrapedAt) / 100;
}

function recentAccuracyModifier(history) {
  const total = history.trueReports + history.falseReports;
  if (!total) return 1.0;
  return 0.5 + Math.min(100, (history.trueReports / total) * 100) / 100;
}

function consistencyModifier(history) {
  return history.contradictions ? Math.max(0.7, 1 - history.contradictions * 0.05) : 1.0;
}

function technicalStabilityScore(store, sourceId) {
  const health = store.list("sourceHealth", (item) => item.sourceId === sourceId).sort(desc).slice(0, 10);
  if (!health.length) return 65;
  return Math.round((health.filter((item) => item.status === "healthy").length / health.length) * 100);
}

function historicalSignalValue(store, sourceId) {
  const storySources = store.list("storySources", (item) => item.sourceId === sourceId);
  const signalScores = storySources.flatMap((source) => store.list("signalScores", (score) => score.storyId === source.storyId));
  if (!signalScores.length) return 50;
  return Math.min(100, signalScores.reduce((sum, score) => sum + Number(score.score || 0), 0) / signalScores.length);
}

function independentCorroborationScore(store, object, sourceId) {
  const storyId = object.storyId || object.id;
  const independentSources = new Set(store.list("storySources", (item) => item.storyId === storyId && item.sourceId !== sourceId).map((item) => item.sourceId));
  return Math.min(100, independentSources.size * 30);
}

function evidenceQualityScore(object, source) {
  if (object.url || object.evidenceUrl) return 75;
  if (source.type && /government|parliament|court|regulator|tender/i.test(source.type)) return 80;
  return 50;
}

function specificityScore(object) {
  const text = `${object.title || ""} ${object.body || ""} ${object.summary || ""}`;
  let score = 45;
  if (/\d/.test(text)) score += 15;
  if (/\$|₦|bn|million|trillion/i.test(text)) score += 15;
  if (text.length > 300) score += 10;
  return Math.min(100, score);
}

function timelinessScore(object) {
  const date = object.publishedAt || object.occurredAt || object.createdAt;
  return freshnessScore(date);
}

function defaultAuthenticity(type) {
  return /government|parliament|court|regulator|tender|multilateral/i.test(type || "") ? 80 : 60;
}

function isBlacklisted(store, sourceId) {
  return store.list("sourceBlacklist", (item) => item.sourceId === sourceId && item.active !== false).length > 0;
}

function normalizeSourceType(type) {
  return String(type || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function desc(a, b) {
  return String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || ""));
}

module.exports = {
  calculateSourceReliabilityForSource,
  calculateCredibilityForObject,
  overrideSourceReliability,
  blacklistSource,
  whitelistSource,
  sourceReliabilitySummary,
  sourceReliabilityExplanation,
  latestSourceReliability,
  latestCollectionDecision
};
