import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { seedStore } = require("../src/seed");

const tempDir = mkdtempSync(join(tmpdir(), "afribn-persist-"));
const dbPath = join(tempDir, "afribn.sqlite");

let store = createStore({ dbPath });
seedStore(store);
const created = store.insert("sources", {
  name: "Persistent Test Source",
  country: "Ghana",
  type: "News",
  url: "data:text/html,persistent",
  reliability: 77,
  collectorType: "NewsScraperWorker",
  status: "active"
});
store.close();

store = createStore({ dbPath });
const persisted = store.get("sources", created.id);
store.close();

if (!persisted || persisted.name !== "Persistent Test Source") {
  throw new Error("SQLite persistence did not survive store restart");
}

console.log("AFRIBN persistence smoke test passed");
