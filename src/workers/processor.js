const { runScrapeWorker } = require("../scrapers");
const { distillRawArticleWithAI, createScore, createGapReport, triageAndDistill } = require("../pipeline");
const { calculateAndStoreScore } = require("../scoring-service");
const { calculateSourceReliabilityForSource, calculateCredibilityForObject } = require("../source-reliability-service");
const { deliverQueuedAlerts } = require("../alert-delivery");
const { buildReport } = require("../products");
const { indexAll } = require("../search/indexer");
const { resolveEntitiesForStory } = require("../graph/entity-resolution");
const { processQueue } = require("./queue");

async function processWorkerQueue(store, queue, options = {}) {
  const handlers = {
    scrape_source: async (payload) => runScrapeWorker(store, payload.sourceId, payload),
    triage_and_distill: async (payload) => triageAndDistill(store, payload),
    ai_distill_article: async (payload) => distillRawArticleWithAI(store, payload.rawArticleId, payload),
    calculate_score: async (payload) => calculateAndStoreScore(store, payload),
    score_event: async (payload) => createScore(store, payload.eventId, payload),
    detect_gaps: async (payload) => createGapReport(store, payload.signalScoreId, payload),
    deliver_alerts: async (payload) => deliverQueuedAlerts(store, payload),
    generate_report: async (payload) => buildReport(store, payload),
    rebuild_search: async () => indexAll(store),
    resolve_entities: async (payload) => resolveEntitiesForStory(store, payload.storyId),
    calculate_source_reliability: async (payload) => calculateSourceReliabilityForSource(store, payload.sourceId, payload),
    calculate_information_credibility: async (payload) => calculateCredibilityForObject(store, payload),
    recalculate_all_source_reliability: async () => {
      const results = [];
      for (const source of store.list("sources")) results.push(calculateSourceReliabilityForSource(store, source.id, {}));
      return results;
    },
    update_source_after_scrape_failure: async (payload) => {
      store.insert("sourceValidationHistory", { sourceId: payload.sourceId, result: "false", reason: payload.failureReason || "scrape failure" });
      return calculateSourceReliabilityForSource(store, payload.sourceId, { reason: "scrape failure" });
    },
    update_source_after_verification: async (payload) => {
      store.insert("sourceValidationHistory", { sourceId: payload.sourceId, result: payload.verificationResult || "true", reason: "verification update" });
      return calculateSourceReliabilityForSource(store, payload.sourceId, { reason: "verification update" });
    }
  };
  return processQueue(store, queue, handlers, options);
}

module.exports = { processWorkerQueue };
