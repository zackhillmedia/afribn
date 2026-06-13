// Seeds one working source per launch market so the scheduler has something to
// collect the moment automation is enabled. Uses Google News RSS *search* (one
// query per country) — it returns real, recent articles for every market
// (unlike the country editions, which don't exist for some). Each source is
// pre-approved and carries its country mandate, so the relevance gate keeps the
// feed on-topic. Idempotent: re-running only adds markets that are missing.
const { STRATEGIC_MARKETS } = require("./strategic-markets");

function marketFeedUrl(market) {
  const query = `${market.name} when:7d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

function seedStrategicMarketSources(store, options = {}) {
  const created = [];
  const skipped = [];
  for (const market of STRATEGIC_MARKETS) {
    const exists = store.list("sources", (s) => s.seedKey === market.slug).length > 0;
    if (exists) {
      skipped.push(market.slug);
      continue;
    }
    const source = store.insert("sources", {
      name: `${market.name} — Google News`,
      country: market.name,
      type: "News",
      url: marketFeedUrl(market),
      seedKey: market.slug,
      frequency: options.frequency || "30min",
      tier: options.tier || "standard",
      reliability: 70,
      collectorType: "NewsScraperWorker",
      // RSS feed: use the feed's own item titles rather than crawling each
      // Google News redirect (which would overwrite titles with "Google News").
      scrapingConfig: { crawlArticles: false },
      mandate: { countries: [market.name, ...(market.aliases || [])], region: "Africa" },
      status: "active",
      approvalStatus: "approved",
      approvedAt: new Date().toISOString()
    });
    created.push({ id: source.id, name: source.name, country: source.country, url: source.url });
  }
  return { created: created.length, skipped: skipped.length, sources: created };
}

module.exports = { seedStrategicMarketSources, marketFeedUrl };
