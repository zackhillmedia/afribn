import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  calculateImpactScore,
  calculateConfidenceScoreDetailed,
  calculateDecisionRelevance,
  calculateNegotiationLeverage,
  calculateSignalScoreDetailed,
  calculateIntelligenceValue,
  confidenceModifier,
  signalBand
} = require("../src/scoring");

const kenyaImpact = calculateImpactScore({
  strategicImpact: 80,
  economicImpact: 85,
  politicalImpact: 60,
  securityImpact: 45,
  regulatoryImpact: 55,
  crossBorderImpact: 70,
  humanSocialImpact: 50
});

assert(kenyaImpact.score === 67.75, `expected Kenya impact 67.75, got ${kenyaImpact.score}`);
assert(confidenceModifier(92) === 1.05, "90+ confidence modifier should be 1.05");
assert(confidenceModifier(80) === 1.00, "75-89 confidence modifier should be 1.00");
assert(confidenceModifier(65) === 0.90, "60-74 confidence modifier should be 0.90");
assert(confidenceModifier(45) === 0.75, "40-59 confidence modifier should be 0.75");
assert(confidenceModifier(20) === 0.55, "below 40 confidence modifier should be 0.55");

const confidence = calculateConfidenceScoreDetailed({
  sourceReliability: 85,
  corroboration: 80,
  humanVerification: 60,
  documentaryEvidence: 70,
  contradictionPenalty: 20
});
assert(confidence.score === 70, `expected confidence 70, got ${confidence.score}`);

const relevance = calculateDecisionRelevance({
  geographyMatch: 100,
  sectorMatch: 100,
  watchlistMatch: 100,
  userProfileMatch: 80
});
assert(relevance.score === 96, `expected relevance 96, got ${relevance.score}`);

const leverage = calculateNegotiationLeverage({
  batna: 80,
  counterpartyDependency: 70,
  strategicScarcity: 65,
  timelinePressure: 60,
  politicalConstraint: 50,
  concessionPattern: 40
});
assert(leverage.score === 65.75, `expected leverage 65.75, got ${leverage.score}`);

const signal = calculateSignalScoreDetailed({
  impactScore: kenyaImpact.score,
  confidenceScore: 80,
  decisionRelevanceScore: 80,
  negotiationLeverageScore: 70,
  scenarioRiskScore: 50,
  urgency: "within_30_days",
  novelty: "new_verified_detail",
  negotiationLeverageShift: false,
  tailRiskHigh: false,
  watchlistMatch: false
});
assert(signal.score === 89.99, `expected signal 89.99, got ${signal.score}`);
assert(signalBand(signal.score) === "High Signal", "89.99 should be high");

const aiv = calculateIntelligenceValue({
  probability: 80,
  impactScore: kenyaImpact.score,
  actionability: 75,
  timeSensitivity: 70,
  confidenceScore: 80,
  opportunity: 70,
  stakeholderExposure: 75,
  gapPenalty: 20
});
assert(aiv.score === 55.26, `expected AIV 55.26, got ${aiv.score}`);

console.log("AFRIBN scoring formula tests passed");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
