import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { seedStore } = require("../src/seed");
const { seedStrategicMarketSources } = require("../src/seed-sources");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const store = createStore({ dbPath: join(mkdtempSync(join(tmpdir(), "afribn-seedsrc-")), "afribn.sqlite") });
seedStore(store);

const first = seedStrategicMarketSources(store);
assert(first.created === 10, `should seed 10 market sources, got ${first.created}`);

const sources = store.list("sources");
assert(sources.length === 10, "store should hold the 10 seeded sources");
assert(sources.every((s) => s.status === "active" && s.approvalStatus === "approved"), "seeded sources must be active + approved so the scheduler runs them");
assert(sources.every((s) => s.scrapingConfig && s.scrapingConfig.crawlArticles === false), "RSS sources should not crawl article links");
assert(sources.every((s) => s.mandate && s.mandate.countries.length), "each source must carry a country mandate");
assert(sources.every((s) => /news\.google\.com\/rss\/search/.test(s.url)), "sources should use the Google News RSS search feed");

const second = seedStrategicMarketSources(store);
assert(second.created === 0 && second.skipped === 10, "re-seeding must be idempotent");

store.close?.();
console.log("AFRIBN seed-sources test passed");
