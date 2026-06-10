const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const collections = [
  "users",
  "roles",
  "permissions",
  "organizations",
  "subscriptions",
  "sources",
  "sourceCategories",
  "sourceHealth",
  "sourceReliabilityScores",
  "sourceProbeResults",
  "sourceValidationHistory",
  "sourceTopicReliability",
  "sourceCountryReliability",
  "sourceCollectionDecisions",
  "sourceBlacklist",
  "sourceWhitelist",
  "informationCredibilityScores",
  "corroborationClusters",
  "sourceAuditLogs",
  "scrapeJobs",
  "rawArticles",
  "rawDocuments",
  "rawEvents",
  "stories",
  "events",
  "policies",
  "deals",
  "risks",
  "entities",
  "entityAliases",
  "entityMentions",
  "storySources",
  "storyTags",
  "confidenceScores",
  "signalScores",
  "riskScores",
  "impactScores",
  "decisionRelevanceScores",
  "negotiationLeverageScores",
  "scenarioScores",
  "intelligenceValueScores",
  "scoringProfiles",
  "scoringAuditLogs",
  "countryRiskSnapshots",
  "gapReports",
  "fieldTasks",
  "agentReports",
  "attachments",
  "uploadedFiles",
  "verificationReviews",
  "graphNodes",
  "graphEdges",
  "publishedIntelligence",
  "feedItems",
  "alertRules",
  "alerts",
  "alertDeliveries",
  "messages",
  "watchlists",
  "watchlistItems",
  "reports",
  "reportSections",
  "reportExports",
  "workerJobs",
  "aiProcessingLogs",
  "promptVersions",
  "searchDocuments",
  "auditLogs"
];

function createStore(options = {}) {
  const state = {};
  const counters = {};
  const dbPath = options.dbPath || process.env.AFRIBN_DB_PATH || path.join(process.cwd(), "data", "afribn.sqlite");
  const persist = options.persist !== false && process.env.AFRIBN_DB_DISABLED !== "1";
  let db = null;

  if (persist) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
    `);
  }

  for (const collection of collections) {
    state[collection] = db ? loadCollection(db, collection) : [];
    counters[collection] = inferCounter(collection, state[collection]);
  }

  function nextId(collection) {
    counters[collection] += 1;
    const prefix = collection.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
    return `${prefix}_${String(counters[collection]).padStart(4, "0")}`;
  }

  function insert(collection, input) {
    const now = new Date().toISOString();
    const record = {
      id: input.id || nextId(collection),
      createdAt: input.createdAt || now,
      updatedAt: now,
      ...input
    };
    state[collection].push(record);
    persistRecord(db, collection, record);
    return record;
  }

  function list(collection, predicate = () => true) {
    return state[collection].filter(predicate);
  }

  function get(collection, id) {
    return state[collection].find((item) => item.id === id);
  }

  function update(collection, id, patch) {
    const item = get(collection, id);
    if (!item) return null;
    Object.assign(item, patch, { updatedAt: new Date().toISOString() });
    persistRecord(db, collection, item);
    return item;
  }

  function remove(collection, id) {
    const index = state[collection].findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [item] = state[collection].splice(index, 1);
    deleteRecord(db, collection, id);
    return item;
  }

  function count(collection) {
    return state[collection].length;
  }

  function close() {
    if (db) db.close();
  }

  return { state, dbPath, insert, list, get, update, remove, count, close };
}

function loadCollection(db, collection) {
  const rows = db.prepare("SELECT data FROM records WHERE collection = ? ORDER BY created_at ASC").all(collection);
  return rows.map((row) => JSON.parse(row.data));
}

function persistRecord(db, collection, record) {
  if (!db) return;
  db.prepare(`
    INSERT INTO records (collection, id, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(collection, id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(collection, record.id, JSON.stringify(record), record.createdAt, record.updatedAt);
}

function deleteRecord(db, collection, id) {
  if (!db) return;
  db.prepare("DELETE FROM records WHERE collection = ? AND id = ?").run(collection, id);
}

function inferCounter(collection, records) {
  const prefix = collection.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  return records.reduce((max, record) => {
    const match = String(record.id || "").match(new RegExp(`^${prefix}_(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

module.exports = { createStore, collections };
