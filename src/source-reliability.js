const FORMULA_VERSION = "AFRIBN_SOURCE_RELIABILITY_V1";

const SOURCE_TYPE_RULES = Object.freeze({
  GOVERNMENT: { authenticityBoost: 10, competencyBoost: 8, biasPenalty: 8 },
  LOCAL_MEDIA: { competencyBoost: 8, corroborationPenalty: 5, biasPenalty: 5 },
  COMPANY_PRESS_RELEASE: { competencyBoost: 10, authenticityBoost: 8, biasPenalty: 12 },
  SOCIAL_ACCOUNT: { competencyBoost: 5, authenticityPenalty: 15, biasPenalty: 10 },
  THINK_TANK: { competencyBoost: 10, biasPenalty: 8 },
  NGO: { competencyBoost: 8, biasPenalty: 8 },
  MULTILATERAL: { authenticityBoost: 10, competencyBoost: 10, biasPenalty: 3 },
  PARLIAMENT: { authenticityBoost: 12, competencyBoost: 10, biasPenalty: 5 },
  TENDER_PORTAL: { authenticityBoost: 12, competencyBoost: 8, biasPenalty: 2 },
  COURT_RECORD: { authenticityBoost: 12, competencyBoost: 8, biasPenalty: 2 },
  REGULATOR: { authenticityBoost: 12, competencyBoost: 10, biasPenalty: 4 },
  BLOG: { biasPenalty: 10, authenticityPenalty: 5 },
  FORUM: { biasPenalty: 12, authenticityPenalty: 10 }
});

function clampScore(value) {
  return Math.max(0, Math.min(100, round(value)));
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function bayesianTrackRecord(trueReports = 0, falseReports = 0, priorSuccess = 1, priorFailure = 1) {
  return clampScore(((Number(trueReports) + priorSuccess) / (Number(trueReports) + Number(falseReports) + priorSuccess + priorFailure)) * 100);
}

function sourceGrade(score, insufficientHistory = false) {
  if (insufficientHistory) return "F";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  if (score >= 10) return "E";
  return "F";
}

function credibilityGrade(score, unknown = false) {
  if (unknown) return "6";
  if (score >= 85) return "1";
  if (score >= 70) return "2";
  if (score >= 55) return "3";
  if (score >= 35) return "4";
  if (score >= 10) return "5";
  return "6";
}

function calculateSourceReliability(input = {}) {
  const typeRule = SOURCE_TYPE_RULES[String(input.sourceType || "").toUpperCase()] || {};
  const trueReports = Number(input.trueReports || 0);
  const falseReports = Number(input.falseReports || 0);
  const insufficientHistory = input.insufficientHistory ?? (trueReports + falseReports < 3);
  const trackRecordScore = bayesianTrackRecord(trueReports, falseReports, input.priorSuccess ?? 1, input.priorFailure ?? 1);
  const competencyAccessScore = clampScore(Number(input.competencyAccessScore ?? input.competencyAccess ?? 60) + Number(typeRule.competencyBoost || 0));
  const authenticityScore = clampScore(Number(input.authenticityScore ?? input.authenticity ?? 60) + Number(typeRule.authenticityBoost || 0) - Number(typeRule.authenticityPenalty || 0));
  const trustworthinessScore = clampScore(Number(input.trustworthinessScore ?? input.trustworthiness ?? 60));
  const baseReliabilityScore = clampScore(
    0.40 * trackRecordScore +
    0.25 * competencyAccessScore +
    0.20 * authenticityScore +
    0.15 * trustworthinessScore
  );
  const recencyModifier = modifier(input.recencyModifier, 1.0);
  const recentAccuracyModifier = modifier(input.recentAccuracyModifier, 1.0);
  const consistencyModifier = modifier(input.consistencyModifier, 1.0);
  const independenceModifier = modifier(input.independenceModifier, 1.0);
  const biasPenalty = clampScore(Number(input.biasPenalty || 0) + Number(typeRule.biasPenalty || 0));
  const contradictionPenalty = clampScore(Number(input.contradictionPenalty || 0));
  const adjustedReliabilityScore = clampScore(
    baseReliabilityScore * recencyModifier * recentAccuracyModifier * consistencyModifier * independenceModifier -
    biasPenalty -
    contradictionPenalty
  );
  const grade = sourceGrade(adjustedReliabilityScore, insufficientHistory);
  return {
    formulaVersion: FORMULA_VERSION,
    baseReliabilityScore,
    adjustedReliabilityScore,
    sourceGrade: grade,
    trackRecordScore,
    competencyAccessScore,
    authenticityScore,
    trustworthinessScore,
    recencyModifier,
    recentAccuracyModifier,
    consistencyModifier,
    independenceModifier,
    biasPenalty,
    contradictionPenalty,
    explanation: explainSourceReliability(grade, adjustedReliabilityScore, { trackRecordScore, competencyAccessScore, authenticityScore, trustworthinessScore, biasPenalty, contradictionPenalty })
  };
}

function calculateInformationCredibility(input = {}) {
  const independentCorroborationScore = clampScore(input.independentCorroborationScore ?? input.independentCorroboration ?? 40);
  const evidenceQualityScore = clampScore(input.evidenceQualityScore ?? input.evidenceQuality ?? 40);
  const specificityScore = clampScore(input.specificityScore ?? input.specificity ?? 50);
  const plausibilityScore = clampScore(input.plausibilityScore ?? input.plausibility ?? 55);
  const timelinessScore = clampScore(input.timelinessScore ?? input.timeliness ?? 55);
  const claimConsistencyScore = clampScore(input.claimConsistencyScore ?? input.claimConsistency ?? 50);
  const contradictionPenalty = clampScore(input.contradictionPenalty ?? 0);
  const credibilityScore = clampScore(
    0.30 * independentCorroborationScore +
    0.20 * evidenceQualityScore +
    0.15 * specificityScore +
    0.15 * plausibilityScore +
    0.10 * timelinessScore +
    0.10 * claimConsistencyScore -
    contradictionPenalty
  );
  const grade = credibilityGrade(credibilityScore, input.unknown === true);
  return {
    formulaVersion: FORMULA_VERSION,
    credibilityScore,
    credibilityGrade: grade,
    independentCorroborationScore,
    evidenceQualityScore,
    specificityScore,
    plausibilityScore,
    timelinessScore,
    claimConsistencyScore,
    contradictionPenalty,
    explanation: explainCredibility(grade, credibilityScore, { independentCorroborationScore, evidenceQualityScore, contradictionPenalty })
  };
}

function calculateContextModifier(input = {}) {
  const multipliers = {
    freshness: contextMultiplier(input.freshness ?? input.FR),
    volumeReliability: contextMultiplier(input.volumeReliability ?? input.VR),
    technicalStability: contextMultiplier(input.technicalStability ?? input.TS),
    domainAuthority: contextMultiplier(input.domainAuthority ?? input.DA),
    relevance: contextMultiplier(input.relevance ?? input.RL),
    coverageGap: contextMultiplier(input.coverageGap ?? input.CG),
    legalSafety: contextMultiplier(input.legalSafety ?? input.LS),
    externalReputation: contextMultiplier(input.externalReputation ?? input.XR),
    crossSourceSupport: contextMultiplier(input.crossSourceSupport ?? input.CS)
  };
  const product = Object.values(multipliers).reduce((total, value) => total * value, 1);
  return {
    formulaVersion: FORMULA_VERSION,
    contextModifier: Math.max(0.5, Math.min(1.5, round(product ** (1 / 9), 4))),
    multipliers
  };
}

function calculateCollectionPriority(input = {}) {
  const sourceGradeValue = input.sourceGrade || sourceGrade(input.adjustedReliabilityScore || input.srs || 0);
  const collectionPriorityScore = clampScore(
    0.35 * clampScore(input.adjustedReliabilityScore ?? input.srs ?? 50) +
    0.25 * clampScore(input.relevanceScore ?? 50) +
    0.15 * clampScore(input.coverageGapScore ?? 50) +
    0.10 * clampScore(input.freshnessScore ?? 50) +
    0.10 * clampScore(input.technicalStabilityScore ?? 50) +
    0.05 * clampScore(input.legalSafetyScore ?? 50)
  );
  const decision = collectionDecision(collectionPriorityScore, sourceGradeValue, input.manuallyBlacklisted);
  return {
    formulaVersion: FORMULA_VERSION,
    collectionPriorityScore,
    decision,
    scrapeFrequency: scrapeFrequency(decision),
    scrapeDepth: scrapeDepth(decision),
    manualReviewRequired: ["PROBATION_SAMPLING_MANUAL_REVIEW", "SUPPRESS_OR_BLACKLIST"].includes(decision),
    reason: explainCollectionDecision(decision, collectionPriorityScore, sourceGradeValue)
  };
}

function calculateStrategicCollectionValue(input = {}) {
  const context = input.contextModifier ?? calculateContextModifier(input.context || {}).contextModifier;
  const srs = clampScore(input.adjustedReliabilityScore ?? input.srs ?? 50);
  const ics = clampScore(input.credibilityScore ?? input.ics ?? 50);
  const air = Math.sqrt(srs * ics) * context;
  const relevanceMultiplier = contextMultiplier(input.relevance ?? input.relevanceScore ?? 50);
  const coverageGapMultiplier = contextMultiplier(input.coverageGap ?? input.coverageGapScore ?? 50);
  const signalValueMultiplier = contextMultiplier(input.historicalSignalValue ?? input.signalValueScore ?? 50);
  const strategicCollectionValue = clampScore(air * relevanceMultiplier * coverageGapMultiplier * signalValueMultiplier);
  return {
    formulaVersion: FORMULA_VERSION,
    afribnIntelligenceReliability: clampScore(air),
    strategicCollectionValue,
    relevanceMultiplier,
    coverageGapMultiplier,
    signalValueMultiplier,
    contextModifier: context,
    explanation: `Strategic collection value is ${strategicCollectionValue}/100 based on reliability, credibility, context, relevance, coverage gap, and historical signal value.`
  };
}

function modifier(value, fallback) {
  const numeric = Number(value ?? fallback);
  return Math.max(0.5, Math.min(1.5, numeric));
}

function contextMultiplier(value) {
  if (value === undefined || value === null) return 1.0;
  const numeric = Number(value);
  if (numeric <= 1.5 && numeric >= 0.5) return numeric;
  return Math.max(0.5, Math.min(1.5, 0.5 + clampScore(numeric) / 100));
}

function collectionDecision(score, grade, manuallyBlacklisted = false) {
  if (manuallyBlacklisted) return "SUPPRESS_OR_BLACKLIST";
  if (grade === "F") return "PROBATION_SAMPLING_MANUAL_REVIEW";
  if (score >= 85) return "FULL_SCRAPE_HIGH_FREQUENCY";
  if (score >= 70) return "FULL_SCRAPE_NORMAL_FREQUENCY";
  if (score >= 55) return "PARTIAL_SCRAPE";
  if (score >= 40) return "MONITOR_ONLY";
  if (score >= 25) return "PROBATION_SAMPLING_MANUAL_REVIEW";
  return "SUPPRESS_OR_BLACKLIST";
}

function scrapeFrequency(decision) {
  return {
    FULL_SCRAPE_HIGH_FREQUENCY: "5min",
    FULL_SCRAPE_NORMAL_FREQUENCY: "15min",
    PARTIAL_SCRAPE: "60min",
    MONITOR_ONLY: "6h",
    PROBATION_SAMPLING_MANUAL_REVIEW: "24h",
    SUPPRESS_OR_BLACKLIST: "disabled"
  }[decision] || "24h";
}

function scrapeDepth(decision) {
  return {
    FULL_SCRAPE_HIGH_FREQUENCY: "full",
    FULL_SCRAPE_NORMAL_FREQUENCY: "full",
    PARTIAL_SCRAPE: "partial",
    MONITOR_ONLY: "metadata",
    PROBATION_SAMPLING_MANUAL_REVIEW: "sample",
    SUPPRESS_OR_BLACKLIST: "none"
  }[decision] || "sample";
}

function explainSourceReliability(grade, score, factors) {
  return `This source is graded ${grade} with an adjusted reliability score of ${score}/100. Track record is ${factors.trackRecordScore}/100, competency/access is ${factors.competencyAccessScore}/100, authenticity is ${factors.authenticityScore}/100, and trustworthiness is ${factors.trustworthinessScore}/100. Bias penalty is ${factors.biasPenalty}; contradiction penalty is ${factors.contradictionPenalty}.`;
}

function explainCredibility(grade, score, factors) {
  return `This item has credibility grade ${grade} with an information credibility score of ${score}/100. Independent corroboration is ${factors.independentCorroborationScore}/100 and evidence quality is ${factors.evidenceQualityScore}/100. Claim contradiction penalty is ${factors.contradictionPenalty}.`;
}

function explainCollectionDecision(decision, score, grade) {
  return `Collection decision is ${decision} because CPS is ${score}/100 and source grade is ${grade}.`;
}

module.exports = {
  FORMULA_VERSION,
  SOURCE_TYPE_RULES,
  bayesianTrackRecord,
  sourceGrade,
  credibilityGrade,
  calculateSourceReliability,
  calculateInformationCredibility,
  calculateContextModifier,
  calculateCollectionPriority,
  calculateStrategicCollectionValue,
  collectionDecision,
  clampScore
};
