import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { seedStore } = require("../src/seed");
const { runScrapeWorker } = require("../src/scrapers");
const { tick, intervalMsFor, dueSources } = require("../src/scheduler");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const store = createStore({ dbPath: join(mkdtempSync(join(tmpdir(), "afribn-sched-")), "afribn.sqlite") });
seedStore(store);

// --- interval mapping ---
assert(intervalMsFor({ tier: "breaking" }) === 10 * 60_000, "breaking tier should be 10min");
assert(intervalMsFor({ frequency: "daily" }) === 24 * 60 * 60_000, "daily frequency should be 24h");
assert(intervalMsFor({ frequency: "30min", emptyStreak: 2 }) > 30 * 60_000, "empty streak should back off the interval");
assert(intervalMsFor({ pollIntervalMs: 7 * 60_000 }) === 7 * 60_000, "explicit pollIntervalMs should win");

// --- due selection only picks active + approved ---
const fixture = [
  "<html><body>",
  '<a href="/a.html">Kenya signs a major renewable energy agreement worth two billion dollars in a landmark deal</a>',
  '<a href="/b.html">Nigeria announces a sweeping new foreign exchange policy implementation plan for commercial banks</a>',
  "</body></html>"
].join("");
const dataUrl = `data:text/html,${encodeURIComponent(fixture)}`;

const active = store.insert("sources", { name: "Sched Wire", country: "Kenya", type: "News", url: dataUrl, frequency: "15min", status: "active", approvalStatus: "approved" });
store.insert("sources", { name: "Pending Wire", country: "Ghana", type: "News", url: dataUrl, status: "pending_review", approvalStatus: "pending_review" });

const due = dueSources(store, Date.now());
assert(due.some((s) => s.id === active.id), "approved+active source should be due");
assert(!due.some((s) => s.approvalStatus === "pending_review"), "pending sources should never be scheduled");

// --- tick enqueues exactly one job for the due source and sets nextRunAt ---
const result = tick(store, {});
assert(result.enqueued === 1, `tick should enqueue one job, got ${result.enqueued}`);
assert(store.get("sources", active.id).nextRunAt, "tick should set nextRunAt");
const pending = store.list("workerJobs", (j) => j.type === "scrape_source" && j.payload?.sourceId === active.id);
assert(pending.length === 1, "exactly one scrape_source job should be queued");
// A second tick must not double-enqueue while one is pending.
assert(tick(store, {}).enqueued === 0, "tick should not double-enqueue a pending source");

// --- conditional fetch: first run collects, second run is unchanged ---
const first = await runScrapeWorker(store, active.id, { limit: 3, conditional: true });
assert(first.rawArticles.length >= 1, "first conditional run should collect raw articles");
assert(!first.unchanged, "first run should not be marked unchanged");

const second = await runScrapeWorker(store, active.id, { limit: 3, conditional: true });
assert(second.unchanged === true, "second conditional run should detect unchanged content");
assert(second.rawArticles.length === 0, "unchanged run should create no new raw articles");

// A manual (non-conditional) run never short-circuits as "unchanged".
const manual = await runScrapeWorker(store, active.id, { limit: 3 });
assert(!manual.unchanged, "manual runs should not be short-circuited by the conditional path");

store.close?.();
console.log("AFRIBN scheduler test passed");
