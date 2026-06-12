// Collection scheduler (Phase 1): tiered + adaptive cadence, per-domain rate
// limiting, and conditional fetch. A tick enqueues scrape jobs for sources that
// are due; a drain processes the collection queue. See
// docs/ADR-001-collection-scheduler-and-resilience.md.
const { enqueueJob } = require("./workers/queue");
const { processWorkerQueue } = require("./workers/processor");

const COLLECTION_QUEUE = "collection";

const FREQUENCY_MS = {
  "5min": 5 * 60_000,
  "10min": 10 * 60_000,
  "15min": 15 * 60_000,
  "30min": 30 * 60_000,
  "hourly": 60 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "daily": 24 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "weekly": 7 * 24 * 60 * 60_000
};
const TIER_MS = {
  breaking: 10 * 60_000,
  standard: 30 * 60_000,
  slow: 6 * 60 * 60_000,
  probation: 24 * 60 * 60_000
};
const MIN_INTERVAL_MS = 5 * 60_000;
const MAX_INTERVAL_MS = 7 * 24 * 60 * 60_000;
const MAX_BACKOFF = 6;

function baseIntervalMs(source) {
  if (Number(source.pollIntervalMs) > 0) return Number(source.pollIntervalMs);
  if (source.tier && TIER_MS[source.tier]) return TIER_MS[source.tier];
  return FREQUENCY_MS[source.frequency] || TIER_MS.standard;
}

// Adaptive: back off (capped) after consecutive empty/unchanged runs.
function intervalMsFor(source) {
  const base = baseIntervalMs(source);
  const streak = Math.min(Number(source.emptyStreak || 0), MAX_BACKOFF);
  const adaptive = streak > 0 ? base * Math.min(2 ** streak, MAX_BACKOFF * 2) : base;
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, adaptive));
}

function withJitter(ms) {
  return Math.round(ms * (0.9 + Math.random() * 0.2));
}

function isSchedulable(source) {
  return source.status === "active" && source.approvalStatus === "approved";
}

function dueSources(store, nowMs) {
  return store.list("sources", (s) => isSchedulable(s) && (!s.nextRunAt || Date.parse(s.nextRunAt) <= nowMs));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url).slice(0, 40);
  }
}

function hasPendingJob(store, sourceId) {
  return store.list(
    "workerJobs",
    (j) => j.queue === COLLECTION_QUEUE && j.type === "scrape_source" && ["queued", "running"].includes(j.status) && j.payload?.sourceId === sourceId
  ).length > 0;
}

function tick(store, options = {}) {
  const nowMs = options.now || Date.now();
  const domainMinMs = Number(process.env.SCHEDULER_DOMAIN_MIN_INTERVAL_MS || 4000);
  const maxJobs = Number(options.maxJobs || process.env.SCHEDULER_MAX_JOBS_PER_TICK || 25);
  const domainLastAt = options.domainLastAt || new Map();
  let enqueued = 0;

  for (const source of dueSources(store, nowMs)) {
    if (enqueued >= maxJobs) break;
    const host = hostOf(source.url);
    // Per-domain rate limit: leave a cooling-down host for a later tick.
    if (nowMs - (domainLastAt.get(host) || 0) < domainMinMs) continue;
    if (hasPendingJob(store, source.id)) continue;

    enqueueJob(store, COLLECTION_QUEUE, "scrape_source", { sourceId: source.id, conditional: true, scheduledBy: "scheduler" });
    domainLastAt.set(host, nowMs);
    store.update("sources", source.id, { nextRunAt: new Date(nowMs + withJitter(intervalMsFor(source))).toISOString() });
    enqueued += 1;
  }
  return { enqueued };
}

function drain(store, options = {}) {
  const limit = Number(options.limit || process.env.SCHEDULER_MAX_JOBS_PER_TICK || 25);
  return processWorkerQueue(store, COLLECTION_QUEUE, { limit });
}

function startScheduler(store, options = {}) {
  const enabled = options.enabled ?? String(process.env.SCHEDULER_ENABLED || "").toLowerCase() === "true";
  if (!enabled) return { enabled: false, stop() {} };

  const tickMs = Number(options.tickMs || process.env.SCHEDULER_TICK_MS || 60_000);
  const domainLastAt = new Map();
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      tick(store, { domainLastAt });
      await drain(store);
    } catch (error) {
      console.warn(`SCHEDULER ERROR: ${error.message}`);
    } finally {
      running = false;
    }
  };

  const handle = setInterval(run, tickMs);
  if (handle.unref) handle.unref();
  run();
  return { enabled: true, stop() { clearInterval(handle); } };
}

module.exports = { startScheduler, tick, drain, intervalMsFor, dueSources, COLLECTION_QUEUE };
