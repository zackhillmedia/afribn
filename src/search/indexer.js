function indexAll(store) {
  const indexed = [];
  for (const story of store.list("stories")) indexed.push(upsertSearchDocument(store, "story", story.id, storyToDoc(story)));
  for (const event of store.list("events")) indexed.push(upsertSearchDocument(store, "event", event.id, eventToDoc(event)));
  for (const policy of store.list("policies")) indexed.push(upsertSearchDocument(store, "policy", policy.id, productToDoc(policy)));
  for (const deal of store.list("deals")) indexed.push(upsertSearchDocument(store, "deal", deal.id, productToDoc(deal)));
  for (const report of store.list("reports")) {
    const sections = store.list("reportSections", (section) => section.reportId === report.id);
    indexed.push(upsertSearchDocument(store, "report", report.id, {
      title: report.title,
      body: sections.map((section) => `${section.heading}\n${section.body}`).join("\n\n"),
      country: report.filters?.country || null,
      sector: report.filters?.sector || null,
      tags: [report.reportType]
    }));
  }
  for (const entity of store.list("entities")) indexed.push(upsertSearchDocument(store, "entity", entity.id, {
    title: entity.canonicalName || entity.name,
    body: `${entity.name} ${entity.type}`,
    country: null,
    sector: null,
    tags: [entity.type]
  }));
  return indexed;
}

function upsertSearchDocument(store, refType, refId, doc) {
  const existing = store.list("searchDocuments", (item) => item.refType === refType && item.refId === refId)[0];
  const payload = {
    refType,
    refId,
    title: doc.title || "Untitled",
    body: doc.body || "",
    country: doc.country || null,
    sector: doc.sector || null,
    tags: doc.tags || []
  };
  return existing ? store.update("searchDocuments", existing.id, payload) : store.insert("searchDocuments", payload);
}

function searchDocuments(store, query = {}) {
  const term = String(query.q || query.search || "").toLowerCase();
  return store.list("searchDocuments", (doc) => {
    if (query.refType && doc.refType !== query.refType) return false;
    if (query.country && doc.country !== query.country) return false;
    if (query.sector && doc.sector !== query.sector) return false;
    if (!term) return true;
    return `${doc.title} ${doc.body} ${(doc.tags || []).join(" ")}`.toLowerCase().includes(term);
  }).map((doc) => ({
    ...doc,
    score: term ? scoreDoc(doc, term) : 1
  })).sort((a, b) => b.score - a.score);
}

function scoreDoc(doc, term) {
  const title = String(doc.title || "").toLowerCase();
  const body = String(doc.body || "").toLowerCase();
  return (title.includes(term) ? 5 : 0) + (body.includes(term) ? 1 : 0);
}

function storyToDoc(story) {
  return {
    title: story.title,
    body: `${story.summary} ${(story.keyClaims || []).join(" ")} ${(story.riskIndicators || []).join(" ")}`,
    country: story.country,
    sector: story.sector,
    tags: [story.eventType, story.impact]
  };
}

function eventToDoc(event) {
  return {
    title: event.title,
    body: event.description || "",
    country: event.country,
    sector: event.sector,
    tags: [event.eventType, event.status]
  };
}

function productToDoc(item) {
  return {
    title: item.title,
    body: `${item.country} ${item.sector} ${item.status || ""} ${item.stage || ""}`,
    country: item.country,
    sector: item.sector,
    tags: [item.status, item.stage, item.policyType].filter(Boolean)
  };
}

module.exports = { indexAll, upsertSearchDocument, searchDocuments };
