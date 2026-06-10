function listFeed(store, query) {
  return store.list("feedItems", (item) => {
    if (query.country && item.country !== query.country) return false;
    if (query.sector && item.sector !== query.sector) return false;
    if (query.impact && item.impact !== query.impact) return false;
    if (query.search) {
      const haystack = `${item.title} ${item.summary} ${item.country} ${item.sector}`.toLowerCase();
      if (!haystack.includes(String(query.search).toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

function countryIntelligence(store, country) {
  const stories = store.list("stories", (item) => item.country.toLowerCase() === country.toLowerCase());
  const published = store.list("publishedIntelligence", (item) => item.country.toLowerCase() === country.toLowerCase());
  const policies = store.list("policies", (item) => item.country.toLowerCase() === country.toLowerCase());
  const deals = store.list("deals", (item) => item.country.toLowerCase() === country.toLowerCase());
  const risk = store.list("countryRiskSnapshots", (item) => item.country.toLowerCase() === country.toLowerCase()).at(-1);

  return {
    country,
    summary: {
      storyCount: stories.length,
      publishedCount: published.length,
      policyCount: policies.length,
      dealCount: deals.length,
      riskLevel: risk ? riskLabel(risk.overallRisk) : "unknown"
    },
    politics: policies.filter((item) => item.sector === "Policy" || item.policyType),
    economy: stories.filter((item) => item.sector === "Economy"),
    security: stories.filter((item) => item.sector === "Security"),
    investments: deals,
    risk,
    keyDevelopments: published.slice(-10).reverse()
  };
}

function riskLabel(score) {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function dashboardSummary(store) {
  const published = store.list("publishedIntelligence");
  const policies = store.list("policies");
  const deals = store.list("deals");
  const events = store.list("events");
  const risks = store.list("countryRiskSnapshots");

  const byCountry = groupCount(published, "country");
  const bySector = groupCount(published, "sector");
  const highImpact = published.filter((item) => Number(item.signalScore || 0) >= 80);

  return {
    metrics: {
      publishedIntelligence: published.length,
      policyChanges: policies.length,
      dealsTracked: deals.length,
      eventsTracked: events.length,
      highImpactStories: highImpact.length,
      countriesCovered: new Set([...published.map((item) => item.country), ...risks.map((item) => item.country)]).size
    },
    byCountry,
    bySector,
    latest: published.slice(-8).reverse(),
    risk: risks.sort((a, b) => b.overallRisk - a.overallRisk)
  };
}

function groupCount(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildReport(store, input = {}) {
  const published = store.list("publishedIntelligence").slice(-10).reverse();
  const title = input.title || "Daily Executive Brief";
  const report = store.insert("reports", {
    title,
    reportType: input.reportType || "Executive Brief",
    status: "generated",
    generatedAt: new Date().toISOString(),
    filters: input.filters || {}
  });

  store.insert("reportSections", {
    reportId: report.id,
    order: 1,
    heading: "Brief Summary",
    body: "Africa's political and economic landscape continues to evolve with notable developments across energy, policy, trade, and security."
  });

  store.insert("reportSections", {
    reportId: report.id,
    order: 2,
    heading: "Top Developments",
    body: published.map((item, index) => `${index + 1}. ${item.title} (${item.country}, score ${item.signalScore})`).join("\n")
  });

  return {
    ...report,
    sections: store.list("reportSections", (section) => section.reportId === report.id)
  };
}

module.exports = { listFeed, countryIntelligence, dashboardSummary, buildReport, riskLabel };
