import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  bayesianTrackRecord,
  calculateCollectionPriority,
  calculateContextModifier,
  calculateInformationCredibility,
  calculateSourceReliability,
  calculateStrategicCollectionValue,
  collectionDecision,
  credibilityGrade,
  sourceGrade
} = require("../src/source-reliability");

assert(bayesianTrackRecord(8, 2) === 75, "Bayesian track record should smooth to 75");

const reliability = calculateSourceReliability({
  sourceType: "GOVERNMENT",
  trueReports: 8,
  falseReports: 2,
  competencyAccessScore: 80,
  authenticityScore: 75,
  trustworthinessScore: 70,
  recencyModifier: 1.05,
  recentAccuracyModifier: 1.02,
  consistencyModifier: 1.00,
  independenceModifier: 1.05,
  biasPenalty: 0,
  contradictionPenalty: 0,
  insufficientHistory: false
});
assert(reliability.sourceGrade === "B", `expected grade B, got ${reliability.sourceGrade}`);
assert(reliability.adjustedReliabilityScore > 70, "adjusted reliability should be above 70");

const credibility = calculateInformationCredibility({
  independentCorroborationScore: 80,
  evidenceQualityScore: 75,
  specificityScore: 70,
  plausibilityScore: 80,
  timelinessScore: 90,
  claimConsistencyScore: 75,
  contradictionPenalty: 5
});
assert(credibility.credibilityScore === 73, `expected credibility 73, got ${credibility.credibilityScore}`);
assert(credibility.credibilityGrade === "2", "credibility grade should be 2");

const context = calculateContextModifier({
  freshness: 80,
  volumeReliability: 70,
  technicalStability: 90,
  domainAuthority: 75,
  relevance: 85,
  coverageGap: 80,
  legalSafety: 90,
  externalReputation: 70,
  crossSourceSupport: 75
});
assert(context.contextModifier >= 1 && context.contextModifier <= 1.5, "context modifier should be clamped multiplier");

const priority = calculateCollectionPriority({
  adjustedReliabilityScore: reliability.adjustedReliabilityScore,
  sourceGrade: reliability.sourceGrade,
  relevanceScore: 85,
  coverageGapScore: 80,
  freshnessScore: 90,
  technicalStabilityScore: 85,
  legalSafetyScore: 90
});
assert(priority.decision === "FULL_SCRAPE_NORMAL_FREQUENCY" || priority.decision === "FULL_SCRAPE_HIGH_FREQUENCY", "priority should allow full scrape");
assert(collectionDecision(90, "F") === "PROBATION_SAMPLING_MANUAL_REVIEW", "F source should go to probation exception");

const scv = calculateStrategicCollectionValue({
  adjustedReliabilityScore: 75,
  credibilityScore: 80,
  contextModifier: 1.1,
  relevanceScore: 85,
  coverageGapScore: 80,
  signalValueScore: 70
});
assert(scv.strategicCollectionValue > 70, "SCV should be high for reliable, credible, relevant source");
assert(sourceGrade(85) === "A", "85 should grade A");
assert(credibilityGrade(55) === "3", "55 should grade credibility 3");

console.log("AFRIBN source reliability formula tests passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
