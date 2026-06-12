import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { seedStore } = require("../src/seed");
const { TOPICS, topicBySlug, topicsWithCounts, itemsForTopic } = require("../src/topics");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(TOPICS.filter((t) => t.tier === 1).length === 5, "five Tier-1 topics expected");
assert(TOPICS.filter((t) => t.tier === 2).length === 5, "five Tier-2 topics expected");
assert(topicBySlug("nope") === undefined, "unknown slug should be undefined");

const store = createStore({ dbPath: join(mkdtempSync(join(tmpdir(), "afribn-topics-")), "afribn.sqlite") });
seedStore(store);

// empty store => all counts zero, no leaked terms
const empty = topicsWithCounts(store);
assert(empty.every((t) => t.count === 0), "counts should be zero on an empty store");
assert(empty.every((t) => t.terms === undefined), "topic terms must not leak to the API shape");

store.insert("publishedIntelligence", { status: "published", title: "Nigeria central bank moves amid devaluation and forex crisis", summary: "Naira devaluation deepens.", sector: "Economy", country: "Nigeria", publishedAt: new Date().toISOString() });
store.insert("publishedIntelligence", { status: "published", title: "Mali military junta seizes power in a coup", summary: "Soldiers detain the president.", sector: "Security", country: "Mali", publishedAt: new Date().toISOString() });

const counts = topicsWithCounts(store);
const byId = Object.fromEntries(counts.map((t) => [t.slug, t.count]));
assert(byId["sovereign-macro-risk"] >= 1, "devaluation/forex should count under sovereign-macro-risk");
assert(byId["political-stability"] >= 1, "coup should count under political-stability");
assert(byId["security-conflict"] >= 1, "coup/seizes-power should count under security-conflict");

const secConflict = itemsForTopic(store, "security-conflict");
assert(secConflict.items.some((i) => /junta/i.test(i.title)), "security-conflict items should include the coup story");
assert(itemsForTopic(store, "nope") === null, "unknown topic slug should return null");

store.close?.();
console.log("AFRIBN topics test passed");
