// Strategic topic catalog, grouped by the Tier 1 / Tier 2 taxonomy (see
// docs/ADR-001 and src/relevance.js). Each topic maps published intelligence to
// a decision-maker theme and connects to live counts + matching items.

const TOPICS = [
  // --- Tier 1: moves capital and operations directly ---
  { slug: "political-stability", name: "Political Stability", tier: 1, icon: "sliders",
    blurb: "Coups, elections, transitions and power shifts.",
    terms: ["coup", "junta", "putsch", "military takeover", "election", "impeachment", "succession", "transition of power", "state of emergency", "cabinet", "reshuffle"] },
  { slug: "security-conflict", name: "Security & Conflict", tier: 1, icon: "shield",
    blurb: "Insurgency, terrorism, clashes and ceasefires.",
    terms: ["insurgency", "insurgent", "jihadist", "militant", "terrorism", "terror", "armed group", "offensive", "ceasefire", "civil war", "conflict", "clashes", "abduction", "piracy", "attack", "security", "unrest"] },
  { slug: "sovereign-macro-risk", name: "Sovereign & Macro Risk", tier: 1, icon: "gauge",
    blurb: "Defaults, devaluations, FX and IMF programmes.",
    terms: ["default", "debt distress", "debt restructuring", "devaluation", "currency crisis", "forex", "fx", "capital controls", "eurobond", "imf", "bailout", "downgrade", "inflation"] },
  { slug: "energy-resources", name: "Energy & Resources", tier: 1, icon: "trendUp",
    blurb: "Oil & gas, critical minerals, power and mining.",
    terms: ["oil", "gas", "lng", "cobalt", "lithium", "copper", "gold", "critical minerals", "mining", "licensing round", "load-shedding", "load shedding", "blackout", "power", "pipeline", "renewable", "energy"] },
  { slug: "sanctions-expropriation", name: "Sanctions & Expropriation", tier: 1, icon: "bell",
    blurb: "Sanctions, nationalisation and resource nationalism.",
    terms: ["sanctions", "expropriation", "nationalization", "nationalisation", "resource nationalism", "seizure"] },

  // --- Tier 2: reshapes the operating environment ---
  { slug: "policy-regulation", name: "Policy & Regulation", tier: 2, icon: "file",
    blurb: "Local content, tax, mining codes, AfCFTA, licensing.",
    terms: ["policy", "regulation", "regulatory", "local content", "mining code", "tax", "levy", "tariff", "licensing", "indigenization", "afcfta", "trade agreement", "data protection"] },
  { slug: "geopolitics", name: "Geopolitics & Influence", tier: 2, icon: "globe",
    blurb: "China, Russia, Gulf and multilateral influence.",
    terms: ["china", "russia", "wagner", "africa corps", "belt and road", "gulf", "uae", "saudi", "qatar", "turkey", "european union", "world bank", "afdb", "diplomatic"] },
  { slug: "infrastructure", name: "Infrastructure & Projects", tier: 2, icon: "grid",
    blurb: "Ports, rail, dams, SEZs and digital infrastructure.",
    terms: ["port", "railway", "rail", "gerd", "dam", "special economic zone", "infrastructure", "concession", "ppp", "fibre", "fiber", "data centre", "data center", "road", "bridge"] },
  { slug: "trade-investment", name: "Trade, Investment & Deals", tier: 2, icon: "handshake",
    blurb: "FDI, M&A, private equity, fintech and trade.",
    terms: ["investment", "fdi", "acquisition", "merger", "private equity", "venture", "deal", "agreement", "fintech", "ipo", "stake", "trade"] },
  { slug: "governance-signals", name: "Governance & Macro Signals", tier: 2, icon: "bank",
    blurb: "Central banks, budgets, subsidies, protests, graft.",
    terms: ["central bank", "interest rate", "budget", "gdp", "subsidy", "fuel subsidy", "government", "minister", "ministry", "parliament", "president", "ecowas", "african union", "sadc", "protest", "strike", "corruption"] }
];

function topicBySlug(slug) {
  return TOPICS.find((t) => t.slug === String(slug || "").toLowerCase());
}

function matchesTopic(item, topic) {
  const text = `${item.title || ""} ${item.summary || ""} ${item.sector || ""} ${item.country || ""}`.toLowerCase();
  return topic.terms.some((term) => text.includes(term));
}

function publishedItems(store) {
  return store.list("publishedIntelligence", (p) => p.status === "published");
}

function topicsWithCounts(store) {
  const published = publishedItems(store);
  return TOPICS.map((topic) => {
    const { terms, ...rest } = topic;
    return { ...rest, count: published.filter((item) => matchesTopic(item, topic)).length };
  });
}

function itemsForTopic(store, slug) {
  const topic = topicBySlug(slug);
  if (!topic) return null;
  const items = publishedItems(store)
    .filter((item) => matchesTopic(item, topic))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .map((item) => ({
      id: item.id,
      storyId: item.storyId,
      title: item.title,
      summary: item.summary,
      country: item.country,
      sector: item.sector,
      signalScore: item.signalScore,
      publishedAt: item.publishedAt
    }));
  const { terms, ...rest } = topic;
  return { topic: rest, items };
}

module.exports = { TOPICS, topicBySlug, topicsWithCounts, itemsForTopic, matchesTopic };
