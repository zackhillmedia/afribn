import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// Force the offline rules fallback so triage never makes a network AI call.
process.env.OPENAI_API_KEY = "";
process.env.QWEN_API_KEY = "";
process.env.DASHSCOPE_API_KEY = "";
process.env.AI_PRIMARY_PROVIDER = "";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { seedStore } = require("../src/seed");
const { sourceMandate, scoreRelevance, passesMandate } = require("../src/relevance");
const { triageAndDistill } = require("../src/pipeline");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- relevance scoring ---
const rwanda = sourceMandate({ country: "Rwanda" });
const texas = scoreRelevance("Midland, Texas mass shooting leaves one dead and ten injured in standoff", rwanda);
assert(!texas.relevant, `off-mandate US story should be filtered, got ${texas.score}`);

const ramaphosa = scoreRelevance(
  "President Ramaphosa of South Africa seeks a court interdict to halt the parliament impeachment inquiry",
  sourceMandate({ country: "South Africa" })
);
assert(ramaphosa.relevant && ramaphosa.score >= 50, `on-mandate strategic story should pass, got ${ramaphosa.score}`);

// exclude keyword hard-penalty
const excluded = scoreRelevance("Kenya government energy investment deal sponsored advertisement", sourceMandate({ country: "Kenya", mandate: { excludeKeywords: ["advertisement"] } }));
assert(!excluded.relevant, "excluded keyword should drop relevance");

// passesMandate: required include keyword absent -> dropped
assert(!passesMandate({ title: "general news" }, { includeKeywords: ["energy"] }), "required include keyword should gate at discovery");
assert(passesMandate({ title: "energy policy" }, { includeKeywords: ["energy"] }), "matching include keyword should pass");

// --- triage gate end-to-end (offline fallback distillation) ---
const store = createStore({ dbPath: join(mkdtempSync(join(tmpdir(), "afribn-rel-")), "afribn.sqlite") });
seedStore(store);
const source = store.insert("sources", { name: "Test", country: "Kenya", type: "News", url: "data:,x", status: "active", approvalStatus: "approved", reliability: 75 });

const job = store.insert("scrapeJobs", { stage: "ScrapeJob", sourceId: source.id, status: "completed" });
store.insert("rawArticles", { stage: "RawArticle", scrapeJobId: job.id, sourceId: source.id, sourceName: source.name, title: "Kenya signs $2bn renewable energy investment deal with the government", body: "Kenya government renewable energy investment deal agreement worth two billion dollars.", status: "collected", url: "data:,a" });
store.insert("rawArticles", { stage: "RawArticle", scrapeJobId: job.id, sourceId: source.id, sourceName: source.name, title: "Suburban county fair announces this year's cat show winners", body: "Local cat show winners announced at the county fair.", status: "collected", url: "data:,b" });

const summary = await triageAndDistill(store, {});
assert(summary.distilled === 1, `exactly one relevant article should be distilled, got ${summary.distilled}`);
assert(summary.filtered === 1, `exactly one off-mandate article should be filtered, got ${summary.filtered}`);

const filtered = store.list("rawArticles", (a) => a.status === "filtered_low_relevance");
assert(filtered.length === 1 && /cat show/.test(filtered[0].title), "the cat-show item should be the filtered one");

store.close?.();
console.log("AFRIBN relevance/triage test passed");
