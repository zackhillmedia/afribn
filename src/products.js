const { STRATEGIC_MARKETS, isStrategicMarket } = require("./strategic-markets");

function listFeed(store, query) {
  return store.list("feedItems", (item) => {
    if (query.strategicMarkets !== "0" && query.scope !== "all" && !query.country && !isStrategicMarket(item.country)) return false;
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

  const strategicMarket = STRATEGIC_MARKETS.find((market) => market.name.toLowerCase() === country.toLowerCase());
  return {
    country,
    productLabel: "Country Brief",
    strategicMarket: strategicMarket || null,
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
    keyDevelopments: published.slice(-10).reverse(),
    brief: buildCountryBriefSections({ country, stories, published, policies, deals, risk })
  };
}

function buildCountryBriefSections({ country, stories, published, policies, deals, risk }) {
  const latest = published.slice(-5).reverse();
  return {
    overview: {
      executiveSummary: latest[0]?.summary || `${country} is monitored as part of AFRIBN's Strategic Markets launch coverage, combining verified intelligence, policy changes, investment activity, event signals, and risk indicators.`,
      keyIndicators: {
        riskLevel: risk ? riskLabel(risk.overallRisk) : "unknown",
        publishedItems: published.length,
        policyDevelopments: policies.length,
        investmentActivity: deals.length
      },
      countrySnapshot: `${country} brief generated from existing AFRIBN intelligence objects.`
    },
    political: {
      developments: policies.slice(-5).reverse(),
      outlook: policies.length ? "Policy activity requires active monitoring." : "No major policy signal currently published.",
      publicPolicyDevelopments: policies
    },
    economicInvestment: {
      indicators: stories.filter((item) => /econom|finance|investment/i.test(item.sector || "")),
      investmentActivity: deals,
      emergingOpportunities: deals.map((deal) => deal.title).slice(0, 5)
    },
    regulatoryInfrastructure: {
      regulatoryDevelopments: policies.filter((item) => /regulat|policy/i.test(`${item.policyType} ${item.title}`)),
      infrastructureProjects: deals.filter((item) => /infrastructure|project|rail|road|port|energy/i.test(`${item.sector} ${item.title}`)),
      majorInitiatives: [...policies, ...deals].slice(-6).reverse()
    },
    securityRisk: {
      riskAssessment: risk || null,
      securityOutlook: stories.filter((item) => /security|risk/i.test(`${item.sector} ${item.title}`)).slice(-5).reverse(),
      businessEnvironment: risk ? `Overall risk is ${riskLabel(risk.overallRisk)}.` : "Risk profile pending."
    },
    outlook: {
      opportunities: deals.map((deal) => deal.title).slice(0, 5),
      risks: stories.filter((item) => /risk|security|inflation|debt/i.test(`${item.title} ${item.summary}`)).map((item) => item.title).slice(0, 5),
      emergingTrends: latest.map((item) => item.sector).filter(Boolean).slice(0, 5),
      analystObservations: "AFRIBN will update this brief quarterly as new verified intelligence is published.",
      sources: latest.map((item) => item.title)
    }
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
    executiveBrief: input.executiveBrief || "Executive-level AFRIBN intelligence brief generated from verified published intelligence.",
    summary: input.summary || "Research, analysis, strategic assessment, and intelligence notes from AFRIBN's intelligence pipeline.",
    country: input.country || input.filters?.country || "Pan-African",
    category: input.category || input.filters?.category || "Strategic Brief",
    publicationDate: new Date().toISOString(),
    sources: input.sources || published.slice(0, 5).map((item) => item.title),
    methodologyNote: input.methodologyNote || "Generated from existing AFRIBN intelligence objects, source reliability records, scoring outputs, and verified published intelligence.",
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
