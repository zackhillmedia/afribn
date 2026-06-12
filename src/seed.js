const { hashPassword } = require("./auth");

// Seeds only what the platform needs to operate: roles, the demo organization,
// the AI prompt version, login accounts, and source-category reference data.
// No demo intelligence content is seeded — sources, stories, risk snapshots,
// the feed, etc. all start empty so the real workflow (add source → … →
// published intelligence) populates them.
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

  const accounts = [
    ["admin@afribn.local", "AFRIBN Admin", "afribn-admin-demo", adminRole.id],
    ["analyst@afribn.local", "Intelligence Analyst", "afribn-analyst-demo", analystRole.id],
    ["agent@afribn.local", "Country Agent", "afribn-agent-demo", agentRole.id],
    ["verifier@afribn.local", "Verification Officer", "afribn-verifier-demo", verifierRole.id],
    ["client@afribn.local", "Enterprise Client", "afribn-client-demo", clientRole.id]
  ];
  for (const [email, name, password, roleId] of accounts) {
    store.insert("users", {
      email,
      name,
      passwordHash: hashPassword(password),
      roleId,
      organizationId: organization.id,
      status: "active"
    });
  }

  const categories = ["News", "Government", "Parliament", "Tender", "Corporate", "NGO", "Think Tank", "Multilateral"];
  for (const category of categories) store.insert("sourceCategories", { name: category });
}

module.exports = { seedStore };
