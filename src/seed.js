const { calculateRiskScore } = require("./scoring");
const { hashPassword } = require("./auth");

function seedStore(store) {
  if (store.count && store.count("roles") > 0) return;

  const adminRole = store.insert("roles", {
    name: "Platform Administrator",
    permissions: ["*"]
  });
  const analystRole = store.insert("roles", {
    name: "Intelligence Analyst",
    permissions: ["stories:review", "reports:create", "sources:read", "ai:process", "scoring:calculate"]
  });
  const agentRole = store.insert("roles", {
    name: "Country Agent",
    permissions: ["tasks:read", "tasks:submit", "attachments:create"]
  });
  const verifierRole = store.insert("roles", {
    name: "Verification Officer",
    permissions: ["verification:approve", "verification:reject", "verification:request_more_info", "reports:create", "reports:download", "scoring:calculate"]
  });
  const clientRole = store.insert("roles", {
    name: "Enterprise Client",
    permissions: ["feed:read", "alerts:manage", "watchlists:manage", "reports:download"]
  });

  const organization = store.insert("organizations", {
    name: "AFRIBN Demo Organization",
    type: "enterprise",
    country: "Pan-African"
  });

  store.insert("promptVersions", {
    name: "intelligence_distillation",
    version: "v1",
    prompt: "Extract conservative structured intelligence from raw source material. Do not invent facts.",
    schema: {},
    status: "active"
  });

  const user = store.insert("users", {
    email: "admin@afribn.local",
    name: "AFRIBN Admin",
    passwordHash: hashPassword("afribn-admin-demo"),
    roleId: adminRole.id,
    organizationId: organization.id,
    status: "active"
  });

  const analystUser = store.insert("users", {
    email: "analyst@afribn.local",
    name: "Intelligence Analyst",
    passwordHash: hashPassword("afribn-analyst-demo"),
    roleId: analystRole.id,
    organizationId: organization.id,
    status: "active"
  });
  const agentUser = store.insert("users", {
    email: "agent@afribn.local",
    name: "Country Agent",
    passwordHash: hashPassword("afribn-agent-demo"),
    roleId: agentRole.id,
    organizationId: organization.id,
    status: "active"
  });
  const verifierUser = store.insert("users", {
    email: "verifier@afribn.local",
    name: "Verification Officer",
    passwordHash: hashPassword("afribn-verifier-demo"),
    roleId: verifierRole.id,
    organizationId: organization.id,
    status: "active"
  });
  store.insert("users", {
    email: "client@afribn.local",
    name: "Enterprise Client",
    passwordHash: hashPassword("afribn-client-demo"),
    roleId: clientRole.id,
    organizationId: organization.id,
    status: "active"
  });

  store.insert("messages", {
    fromUserId: analystUser.id,
    toUserId: user.id,
    subject: "Kenya energy brief ready for review",
    body: "I pushed the Kenya renewable deal through scoring. Please review the source reliability notes before publication.",
    status: "unread",
    priority: "normal",
    threadId: "thread_kenya_energy"
  });
  store.insert("messages", {
    fromUserId: verifierUser.id,
    toUserId: user.id,
    subject: "Verification queue update",
    body: "Two agent reports are ready for verification. Sudan ceasefire still needs a second official source.",
    status: "unread",
    priority: "high",
    threadId: "thread_verification_queue"
  });
  store.insert("messages", {
    fromUserId: user.id,
    toUserId: agentUser.id,
    subject: "Field evidence request",
    body: "Please prioritize the Garissa site photos and Ministry confirmation for the Kenya energy item.",
    status: "sent",
    priority: "normal",
    threadId: "thread_field_evidence"
  });

  store.insert("subscriptions", {
    organizationId: organization.id,
    plan: "enterprise",
    status: "trial",
    seats: 25
  });

  const categories = ["News", "Government", "Parliament", "Tender", "Corporate", "NGO", "Think Tank", "Multilateral"];
  for (const category of categories) store.insert("sourceCategories", { name: category });

  const sources = [
    ["The East African", "Kenya", "News", "https://www.theeastafrican.co.ke", 82, "NewsScraperWorker"],
    ["Nigeria Budget Office", "Nigeria", "Government", "https://budgetoffice.gov.ng", 88, "GovScraperWorker"],
    ["Ghana Ministry of Finance", "Ghana", "Government", "https://mofep.gov.gh", 84, "GovScraperWorker"],
    ["AfCFTA Secretariat", "Pan-African", "Multilateral", "https://au-afcfta.org", 86, "DocumentParserWorker"]
  ];

  for (const [name, country, type, url, reliability, collectorType] of sources) {
    const source = store.insert("sources", {
      name,
      country,
      type,
      url,
      frequency: "15min",
      reliability,
      collectorType,
      status: "active"
    });
    store.insert("sourceHealth", {
      sourceId: source.id,
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
      uptimePct: 99.1,
      lastLatencyMs: 182
    });
  }

  const watchlist = store.insert("watchlists", {
    userId: user.id,
    name: "Strategic Africa Watchlist",
    description: "Countries, sectors, and entities that drive executive alerts."
  });

  for (const item of [
    ["Country", "Nigeria", "Politics"],
    ["Country", "Kenya", "Energy"],
    ["Topic", "Renewable Energy", "Energy"],
    ["Company", "Dangote Group", "Energy"],
    ["Topic", "AfCFTA", "Trade"]
  ]) {
    store.insert("watchlistItems", {
      watchlistId: watchlist.id,
      itemType: item[0],
      itemName: item[1],
      category: item[2],
      riskLevel: item[2] === "Energy" ? "medium" : "high"
    });
  }

  store.insert("alertRules", {
    userId: user.id,
    name: "High-signal Nigeria policy and energy",
    country: "Nigeria",
    sector: null,
    minimumSignalScore: 70,
    channel: "in_app",
    status: "active"
  });
  store.insert("alertRules", {
    userId: user.id,
    name: "High-value energy developments",
    country: null,
    sector: "Energy",
    minimumSignalScore: 75,
    channel: "email",
    status: "active"
  });

  for (const country of ["Nigeria", "Kenya", "Ghana", "DR Congo", "Ethiopia"]) {
    const score = calculateRiskScore({
      political: country === "DR Congo" ? 82 : 58,
      security: country === "DR Congo" ? 88 : 55,
      economic: country === "Nigeria" ? 72 : 52,
      regulatory: 60,
      social: 48
    });
    store.insert("countryRiskSnapshots", {
      country,
      overallRisk: score,
      categories: {
        political: country === "DR Congo" ? 82 : 58,
        security: country === "DR Congo" ? 88 : 55,
        economic: country === "Nigeria" ? 72 : 52,
        regulatory: 60,
        social: 48
      },
      calculatedAt: new Date().toISOString()
    });
  }
}

module.exports = { seedStore };
