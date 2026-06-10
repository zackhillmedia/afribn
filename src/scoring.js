const FORMULA_VERSION = "afribn-scoring-v1";

const IMPACT_WEIGHTS = Object.freeze({
  strategicImpact: 0.25,
  economicImpact: 0.20,
  politicalImpact: 0.15,
  securityImpact: 0.15,
  regulatoryImpact: 0.10,
  crossBorderImpact: 0.10,
  humanSocialImpact: 0.05
});

const CONFIDENCE_WEIGHTS = Object.freeze({
  sourceReliability: 0.40,
  corroboration: 0.25,
  humanVerification: 0.20,
  documentaryEvidence: 0.10
});

const DECISION_RELEVANCE_WEIGHTS = Object.freeze({
  geographyMatch: 0.35,
  sectorMatch: 0.25,
  watchlistMatch: 0.20,
  userProfileMatch: 0.20
});

const NEGOTIATION_LEVERAGE_WEIGHTS = Object.freeze({
  batna: 0.30,
  counterpartyDependency: 0.20,
  strategicScarcity: 0.15,
  timelinePressure: 0.15,
  politicalConstraint: 0.10,
  concessionPattern: 0.10
});

const RISK_WEIGHTS = Object.freeze({
  political: 0.30,
  security: 0.25,
  economic: 0.20,
  regulatory: 0.15,
  social: 0.10
});

function clampScore(value) {
  return Math.max(0, Math.min(100, round(value)));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeFactor(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return clampScore(fallback);
  return clampScore(Number(value));
}

function normalizeFactors(input, keys, fallback = 0) {
  return Object.fromEntries(keys.map((key) => [key, normalizeFactor(input?.[key], fallback)]));
}

function weightedRaw(factors, weights) {
  return Object.entries(weights).reduce((total, [key, weight]) => total + normalizeFactor(factors[key]) * weight, 0);
}

function weightedScore(factors, weights) {
  return clampScore(weightedRaw(factors, weights));
}

function confidenceModifier(confidence) {
  const score = normalizeFactor(confidence);
  if (score >= 90) return 1.05;
  if (score >= 75) return 1.00;
  if (score >= 60) return 0.90;
  if (score >= 40) return 0.75;
  return 0.55;
}

function urgencyModifier(value) {
  if (typeof value === "number") return value;
  const key = String(value || "monitoring").toLowerCase();
  if (["immediate", "critical", "now"].includes(key)) return 1.25;
  if (["7d", "week", "within_7_days"].includes(key)) return 1.15;
  if (["30d", "month", "within_30_days"].includes(key)) return 1.05;
  if (["monitoring", "long_term"].includes(key)) return 0.95;
  if (["background", "context"].includes(key)) return 0.85;
  return Number(value) || 1.0;
}

function noveltyModifier(value) {
  if (typeof value === "number") return value;
  const key = String(value || "update").toLowerCase();
  if (["first_report", "first", "major_new"].includes(key)) return 1.15;
  if (["new_verified_detail", "verified_detail"].includes(key)) return 1.10;
  if (["update", "important_update", "ongoing"].includes(key)) return 1.00;
  if (["repeated", "no_new_facts"].includes(key)) return 0.70;
  if (["duplicate"].includes(key)) return 0.20;
  return Number(value) || 1.0;
}

function relevanceModifier(value) {
  if (typeof value === "number" && value <= 2) return value;
  const score = normalizeFactor(value, 50);
  if (score >= 90) return 1.25;
  if (score >= 75) return 1.15;
  if (score >= 60) return 1.10;
  if (score >= 40) return 1.00;
  return 0.75;
}

function calculateImpactScore(input = {}) {
  const normalized = normalizeFactors(input, Object.keys(IMPACT_WEIGHTS), 0);
  return scoreResult("Impact Score", normalized, weightedScore(normalized, IMPACT_WEIGHTS), {
    formula: "0.25 strategic + 0.20 economic + 0.15 political + 0.15 security + 0.10 regulatory + 0.10 cross-border + 0.05 human/social"
  });
}

function calculateConfidenceScoreDetailed(input = {}) {
  const normalized = normalizeFactors(input, Object.keys(CONFIDENCE_WEIGHTS), 0);
  const contradictionPenalty = normalizeFactor(input.contradictionPenalty || input.aiUncertaintyPenalty || 0);
  const raw = weightedRaw(normalized, CONFIDENCE_WEIGHTS) - 0.15 * contradictionPenalty;
  return scoreResult("Confidence Score", { ...normalized, contradictionPenalty }, clampScore(raw), {
    formula: "0.40 source reliability + 0.25 corroboration + 0.20 human verification + 0.10 documentary evidence - 0.15 contradiction penalty"
  });
}

function calculateDecisionRelevance(input = {}) {
  const normalized = normalizeFactors(input, Object.keys(DECISION_RELEVANCE_WEIGHTS), 50);
  return scoreResult("Decision Relevance", normalized, weightedScore(normalized, DECISION_RELEVANCE_WEIGHTS), {
    formula: "0.35 geography + 0.25 sector + 0.20 watchlist + 0.20 user profile"
  });
}

function calculateNegotiationLeverage(input = {}) {
  const normalized = normalizeFactors(input, Object.keys(NEGOTIATION_LEVERAGE_WEIGHTS), 0);
  return scoreResult("Negotiation Leverage", normalized, weightedScore(normalized, NEGOTIATION_LEVERAGE_WEIGHTS), {
    formula: "0.30 BATNA + 0.20 counterparty dependency + 0.15 strategic scarcity + 0.15 timeline pressure + 0.10 political constraint + 0.10 concession pattern"
  });
}

function calculateScenarioScore(input = {}) {
  const scenarios = {
    bestCase: normalizeScenario(input.bestCase, 0),
    baseCase: normalizeScenario(input.baseCase, 50),
    worstCase: normalizeScenario(input.worstCase, 0),
    wildcard: normalizeScenario(input.wildcard, 0)
  };
  const bestValue = expectedValue(scenarios.bestCase);
  const baseValue = expectedValue(scenarios.baseCase);
  const worstValue = expectedValue(scenarios.worstCase);
  const wildcardValue = expectedValue(scenarios.wildcard);
  const worstCaseTailRiskBonus = worstValue >= 50 ? Math.min(15, worstValue * 0.15) : 0;
  const wildcardBonus = wildcardValue >= 40 ? Math.min(10, wildcardValue * 0.12) : 0;
  const finalScore = clampScore(baseValue + worstCaseTailRiskBonus + wildcardBonus);
  return scoreResult("Scenario Risk", { scenarios, bestValue, baseValue, worstValue, wildcardValue, worstCaseTailRiskBonus, wildcardBonus }, finalScore, {
    formula: "base case expected value + worst-case tail risk bonus + wildcard bonus"
  });
}

function calculateRiskScoreDetailed(input = {}) {
  const normalized = normalizeFactors(input, Object.keys(RISK_WEIGHTS), 0);
  return scoreResult("Risk Score", normalized, weightedScore(normalized, RISK_WEIGHTS), {
    formula: "0.30 political + 0.25 security + 0.20 economic + 0.15 regulatory + 0.10 social"
  });
}

function calculateGapPenalty(input = {}) {
  const missingCriticalFacts = normalizeFactor(input.missingCriticalFacts || 0);
  const missingSources = normalizeFactor(input.missingSources || 0);
  const missingDocuments = normalizeFactor(input.missingDocuments || 0);
  const missingStakeholders = normalizeFactor(input.missingStakeholders || 0);
  const missingTimelines = normalizeFactor(input.missingTimelines || 0);
  const penalty = clampScore(
    0.30 * missingCriticalFacts +
    0.20 * missingSources +
    0.20 * missingDocuments +
    0.15 * missingStakeholders +
    0.15 * missingTimelines
  );
  return scoreResult("Gap Penalty", { missingCriticalFacts, missingSources, missingDocuments, missingStakeholders, missingTimelines }, penalty, {
    formula: "0.30 critical facts + 0.20 sources + 0.20 documents + 0.15 stakeholders + 0.15 timelines"
  });
}

function calculateSignalScoreDetailed(input = {}) {
  const impactScore = input.impactScore ?? calculateImpactScore(input.impact || input).score;
  const confidenceScore = input.confidenceScore ?? calculateConfidenceScoreDetailed(input.confidence || {}).score;
  const decisionRelevanceScore = input.decisionRelevanceScore ?? calculateDecisionRelevance(input.decisionRelevance || {}).score;
  const negotiationLeverageScore = input.negotiationLeverageScore ?? calculateNegotiationLeverage(input.negotiationLeverage || {}).score;
  const scenarioRiskScore = input.scenarioRiskScore ?? calculateScenarioScore(input.scenario || {}).score;
  const modifiers = {
    urgency: urgencyModifier(input.urgencyModifier ?? input.urgency),
    confidence: confidenceModifier(confidenceScore),
    novelty: noveltyModifier(input.noveltyModifier ?? input.novelty),
    decisionRelevance: relevanceModifier(decisionRelevanceScore),
    negotiationLeverage: negotiationLeverageScore >= 80 ? 1.05 : 1.0,
    scenarioRisk: scenarioRiskScore >= 75 ? 1.07 : 1.0
  };
  const additiveBonuses = {
    negotiationLeverageShift: input.negotiationLeverageShift ? 8 : 0,
    dealCollapseRisk: input.dealCollapseRisk ? 10 : 0,
    tailRiskHigh: input.tailRiskHigh || scenarioRiskScore >= 85 ? 7 : 0,
    watchlistMatch: input.watchlistMatch ? 5 : 0
  };
  const multiplied = impactScore * modifiers.urgency * modifiers.confidence * modifiers.novelty * modifiers.decisionRelevance * modifiers.negotiationLeverage * modifiers.scenarioRisk;
  const score = clampScore(multiplied + Object.values(additiveBonuses).reduce((sum, value) => sum + value, 0));
  return scoreResult("Signal Score", { impactScore, confidenceScore, decisionRelevanceScore, negotiationLeverageScore, scenarioRiskScore, modifiers, additiveBonuses }, score, {
    formula: "Impact × confidence modifier × urgency modifier × novelty modifier × decision relevance modifier × negotiation leverage modifier × scenario risk modifier + bonuses"
  });
}

function calculateIntelligenceValue(input = {}) {
  const probability = normalizeFactor(input.probability ?? input.P ?? input.confidenceScore ?? 50) / 100;
  const impact = normalizeFactor(input.impact ?? input.I ?? input.impactScore ?? 50) / 100;
  const actionability = normalizeFactor(input.actionability ?? input.A ?? 50) / 100;
  const timeSensitivity = normalizeFactor(input.timeSensitivity ?? input.T ?? 50) / 100;
  const confidence = normalizeFactor(input.confidence ?? input.C ?? input.confidenceScore ?? 50) / 100;
  const opportunity = normalizeFactor(input.opportunity ?? input.O ?? 0);
  const stakeholderExposure = normalizeFactor(input.stakeholderExposure ?? input.E ?? 0) / 100;
  const gapPenalty = normalizeFactor(input.gapPenalty ?? input.K ?? 0);
  const multiplicativeValue = probability * impact * actionability * timeSensitivity * confidence * 100;
  const opportunityValue = opportunity * stakeholderExposure;
  const score = clampScore(multiplicativeValue + opportunityValue - gapPenalty);
  return scoreResult("AFRIBN Intelligence Value", {
    probability: round(probability * 100),
    impact: round(impact * 100),
    actionability: round(actionability * 100),
    timeSensitivity: round(timeSensitivity * 100),
    confidence: round(confidence * 100),
    opportunity,
    stakeholderExposure: round(stakeholderExposure * 100),
    gapPenalty,
    multiplicativeValue: round(multiplicativeValue),
    opportunityValue: round(opportunityValue)
  }, score, {
    formula: "[(P × I × A × T × C) + (O × E) - K], normalized to 0-100"
  });
}

function calculateFullScoring(input = {}) {
  const impact = calculateImpactScore(input.impact || input);
  const confidence = calculateConfidenceScoreDetailed(input.confidence || input);
  const decisionRelevance = calculateDecisionRelevance(input.decisionRelevance || {});
  const negotiationLeverage = calculateNegotiationLeverage(input.negotiationLeverage || {});
  const scenario = calculateScenarioScore(input.scenario || {});
  const risk = calculateRiskScoreDetailed(input.risk || input);
  const gapPenalty = calculateGapPenalty(input.gaps || {});
  const signal = calculateSignalScoreDetailed({
    ...input.signal,
    impactScore: impact.score,
    confidenceScore: confidence.score,
    decisionRelevanceScore: decisionRelevance.score,
    negotiationLeverageScore: negotiationLeverage.score,
    scenarioRiskScore: scenario.score
  });
  const intelligenceValue = calculateIntelligenceValue({
    ...input.intelligenceValue,
    impactScore: impact.score,
    confidenceScore: confidence.score,
    gapPenalty: gapPenalty.score
  });
  return { impact, confidence, decisionRelevance, negotiationLeverage, scenario, risk, gapPenalty, signal, intelligenceValue };
}

function normalizeScenario(input, fallback) {
  return {
    probability: normalizeFactor(input?.probability, fallback),
    consequence: normalizeFactor(input?.consequence, fallback)
  };
}

function expectedValue(scenario) {
  return round((scenario.probability / 100) * scenario.consequence);
}

function scoreResult(name, normalizedFactors, score, extra = {}) {
  return {
    name,
    score: clampScore(score),
    formulaVersion: FORMULA_VERSION,
    normalizedFactors,
    explanation: explain(name, clampScore(score), normalizedFactors),
    confidenceLevel: scoreConfidenceLevel(normalizedFactors),
    ...extra
  };
}

function explain(name, score, factors) {
  const high = Object.entries(flattenFactors(factors)).filter(([, value]) => Number(value) >= 75).map(([key]) => key);
  const low = Object.entries(flattenFactors(factors)).filter(([, value]) => Number(value) > 0 && Number(value) < 40).map(([key]) => key);
  const parts = [`${name} is ${score}/100.`];
  if (high.length) parts.push(`Strong drivers: ${high.slice(0, 4).join(", ")}.`);
  if (low.length) parts.push(`Weak or limiting factors: ${low.slice(0, 4).join(", ")}.`);
  return parts.join(" ");
}

function flattenFactors(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, item]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "number") acc[name] = item;
    else if (item && typeof item === "object" && !Array.isArray(item)) Object.assign(acc, flattenFactors(item, name));
    return acc;
  }, {});
}

function scoreConfidenceLevel(factors) {
  const values = Object.values(flattenFactors(factors)).filter((value) => Number.isFinite(value));
  if (!values.length) return "low";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average >= 75) return "high";
  if (average >= 50) return "medium";
  return "low";
}

function signalBand(score) {
  if (score >= 90) return "Critical Signal";
  if (score >= 75) return "High Signal";
  if (score >= 60) return "Medium-High Signal";
  if (score >= 40) return "Medium Signal";
  if (score >= 20) return "Low Signal";
  return "Noise";
}

// Backward-compatible exports used by the existing pipeline.
function calculateSignalScore(input) {
  return calculateSignalScoreDetailed(input).score;
}

function calculateConfidenceScore(input) {
  return calculateConfidenceScoreDetailed({
    sourceReliability: input.sourceReliability,
    corroboration: input.corroboration ?? input.corroborationCount,
    humanVerification: input.humanVerification,
    documentaryEvidence: input.documentEvidence ?? input.documentaryEvidence,
    contradictionPenalty: input.contradictionPenalty ?? input.aiUncertaintyPenalty
  }).score;
}

function calculateRiskScore(input) {
  return calculateRiskScoreDetailed(input).score;
}

module.exports = {
  FORMULA_VERSION,
  IMPACT_WEIGHTS,
  CONFIDENCE_WEIGHTS,
  DECISION_RELEVANCE_WEIGHTS,
  NEGOTIATION_LEVERAGE_WEIGHTS,
  RISK_WEIGHTS,
  calculateImpactScore,
  calculateConfidenceScoreDetailed,
  calculateDecisionRelevance,
  calculateNegotiationLeverage,
  calculateScenarioScore,
  calculateRiskScoreDetailed,
  calculateGapPenalty,
  calculateSignalScoreDetailed,
  calculateIntelligenceValue,
  calculateFullScoring,
  calculateSignalScore,
  calculateConfidenceScore,
  calculateRiskScore,
  confidenceModifier,
  urgencyModifier,
  noveltyModifier,
  relevanceModifier,
  signalBand,
  weightedScore,
  clampScore
};
