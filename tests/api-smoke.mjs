import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const port = 3107;
const base = `http://127.0.0.1:${port}`;
const tempDir = mkdtempSync(join(tmpdir(), "afribn-smoke-"));
const server = spawn("node", ["server.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(port),
    AFRIBN_ENV_FILE: "0",
    AFRIBN_DB_PATH: join(tempDir, "afribn.sqlite"),
    AFRIBN_UPLOAD_DIR: join(tempDir, "uploads"),
    AFRIBN_JWT_SECRET: "smoke-test-secret",
    OPENAI_API_KEY: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const json = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      await request("/health");
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Server did not start. Output:\n${output}`);
}

try {
  await waitForServer();

  const health = await request("/health");
  assert(health.status === "ok", "health should be ok");
  const ready = await request("/ready");
  assert(ready.status === "ready", "readiness should be ready");

  const stages = await request("/pipeline/stages");
  assert(stages.data.length === 10, "pipeline should expose 10 stage transitions");

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@afribn.local", password: "afribn-admin-demo" })
  });
  assert(login.token.split(".").length === 3, "login should return JWT");

  const me = await request("/users/me", { headers: { Authorization: `Bearer ${login.token}` } });
  assert(me.data.email === "admin@afribn.local", "JWT should resolve current user");
  const authHeaders = { Authorization: `Bearer ${login.token}` };

  const sources = await request("/sources");
  assert(sources.data.length >= 1, "seed sources should exist");

  const html = [
    "<html><head><title>AFRIBN Test Source</title>",
    "<meta name=\"description\" content=\"Verified energy and policy intelligence.\">",
    "</head><body>",
    "<a href=\"/kenya-energy.html\">Kenya signs $2.1bn renewable energy agreement with UAE consortium</a>",
    "<a href=\"/nigeria-policy.html\">Nigeria announces new renewable energy policy implementation plan</a>",
    "</body></html>"
  ].join("");
  const source = await request("/sources", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Local Smoke Source",
      country: "Kenya",
      type: "News",
      url: `data:text/html,${encodeURIComponent(html)}`,
      reliability: 91
    })
  });

  const scrape = await request("/workers/scrape", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ sourceId: source.data.id, limit: 2 })
  });
  assert(scrape.data.scrapeJob.status === "completed", "real scrape worker should complete");
  assert(scrape.data.rawArticles.length === 2, "scrape worker should create raw articles");

  const aiDistilled = await request(`/raw-articles/${scrape.data.rawArticles[0].id}/ai-distill`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ model: "test-model-not-used-without-key" })
  });
  assert(aiDistilled.data.ai.provider === "fallback", "AI distillation should fall back without OPENAI_API_KEY");
  assert(aiDistilled.data.story.stage === "Story/Event", "AI distillation should create Story/Event objects");

  const reliability = await request(`/source-reliability/calculate/${source.data.id}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      trueReports: 8,
      falseReports: 2,
      competencyAccessScore: 80,
      authenticityScore: 75,
      trustworthinessScore: 70,
      insufficientHistory: false
    })
  });
  assert(reliability.data.reliability.adjustedReliabilityScore > 0, "source reliability should calculate SRS");
  assert(reliability.data.collection.collectionPriorityScore > 0, "source reliability should calculate CPS");

  const reliabilityRead = await request(`/source-reliability/${source.data.id}`);
  assert(reliabilityRead.data.reliability.id === reliability.data.reliability.id, "source reliability read should return latest score");

  const reliabilityExplanation = await request(`/source-reliability/${source.data.id}/explanation`);
  assert(reliabilityExplanation.data.explanation.includes("source"), "source reliability explanation should be human-readable");

  const credibility = await request("/source-reliability/credibility/calculate", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      sourceId: source.data.id,
      objectType: "story",
      objectId: aiDistilled.data.story.id,
      independentCorroborationScore: 70,
      evidenceQualityScore: 75,
      specificityScore: 80,
      plausibilityScore: 75,
      timelinessScore: 90,
      claimConsistencyScore: 70,
      contradictionPenalty: 0
    })
  });
  assert(credibility.data.credibilityScore > 70, "information credibility should calculate ICS");

  const collectionPriority = await request(`/source-reliability/collection-priority/${source.data.id}`);
  assert(collectionPriority.data.decision, "collection priority endpoint should return decision");

  const blacklist = await request(`/source-reliability/${source.data.id}/blacklist`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ reason: "smoke test blacklist" })
  });
  assert(blacklist.data.active === true, "blacklist endpoint should create active record");

  const whitelist = await request(`/source-reliability/${source.data.id}/whitelist`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ reason: "smoke test whitelist" })
  });
  assert(whitelist.data.active === true, "whitelist endpoint should create active record");

  const demo = await request("/pipeline/demo-run", {
    method: "POST",
    body: JSON.stringify({
      sourceId: sources.data[0].id,
      rawArticle: {
        title: "Kenya signs $2.1bn renewable energy agreement with UAE consortium",
        body: "Kenya signed a $2.1 billion renewable energy agreement. The project affects energy security, investment flows, and regional partnerships."
      }
    })
  });

  const data = demo.data;
  assert(data.scrapeJob.stage === "ScrapeJob", "source should create ScrapeJob");
  assert(data.rawArticle.stage === "RawArticle", "ScrapeJob should create RawArticle");
  assert(data.story.stage === "Story/Event", "RawArticle should create Story");
  assert(data.event.stage === "Story/Event", "RawArticle should create Event");
  assert(data.score.signalScore.stage === "Score", "Event should create Score");
  assert(data.gapReport.stage === "GapReport", "Score should create GapReport");
  assert(data.fieldTask.stage === "FieldTask", "GapReport should create FieldTask");
  assert(data.agentReport.stage === "AgentReport", "FieldTask should create AgentReport");
  assert(data.verificationReview.stage === "VerificationReview", "AgentReport should create VerificationReview");
  assert(data.publishedIntelligence.stage === "PublishedIntelligence", "VerificationReview should create PublishedIntelligence");

  const scoring = await request("/scoring/calculate", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      objectType: "story",
      objectId: data.story.id,
      userContext: {
        countries: ["Kenya"],
        sectors: ["Energy"],
        audience: "energy_investor"
      },
      factors: {
        impact: {
          strategicImpact: 80,
          economicImpact: 85,
          politicalImpact: 60,
          securityImpact: 45,
          regulatoryImpact: 55,
          crossBorderImpact: 70,
          humanSocialImpact: 50
        }
      }
    })
  });
  assert(scoring.data.scores.impact.score === 67.75, "scoring API should calculate specified impact");
  assert(scoring.data.scores.signal.score > 0, "scoring API should calculate signal");

  const scoringRead = await request(`/scoring/story/${data.story.id}`);
  assert(scoringRead.data.signal.score === scoring.data.scores.signal.score, "scoring read should return latest signal");

  const explanation = await request(`/scoring/story/${data.story.id}/explanation`);
  assert(explanation.data.summary.includes("Signal"), "scoring explanation should describe signal");

  const topSignals = await request("/scoring/top-signals");
  assert(topSignals.data.length >= 1, "top signals should include calculated score");

  const feed = await request("/feed?country=Kenya");
  assert(feed.data.some((item) => item.publishedIntelligenceId === data.publishedIntelligence.id), "published intelligence should feed feed items");

  const dashboard = await request("/dashboard");
  assert(dashboard.data.metrics.publishedIntelligence >= 1, "dashboard should aggregate published intelligence");

  const country = await request("/countries/Kenya");
  assert(country.data.keyDevelopments.length >= 1, "country intelligence should read from published intelligence");

  const report = await request("/reports/generate", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ title: "Smoke Test Executive Brief" })
  });
  assert(report.data.sections.length >= 2, "report generation should create structured sections");

  const pdf = await request(`/reports/${report.data.id}/download`, { headers: authHeaders });
  assert(Buffer.from(pdf).subarray(0, 4).toString() === "%PDF", "report download should return a PDF");

  const boundary = "----AFRIBNSmokeBoundary";
  const multipart = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="agentReportId"',
    "",
    data.agentReport.id,
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="evidence.txt"',
    "Content-Type: text/plain",
    "",
    "field evidence",
    `--${boundary}--`,
    ""
  ].join("\r\n"));
  const upload = await request("/uploads", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: multipart
  });
  assert(upload.data.originalName === "evidence.txt", "multipart upload should persist file metadata");

  const deliveries = await request("/workers/deliver-alerts", { method: "POST", headers: authHeaders, body: JSON.stringify({}) });
  assert(Array.isArray(deliveries.data), "alert delivery worker should return delivery results");

  const queued = await request("/queue/jobs", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ queue: "search_queue", type: "rebuild_search", payload: {} })
  });
  assert(queued.data.status === "queued", "queue should persist worker job");
  const processed = await request("/queue/process", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ queue: "search_queue", limit: 1 })
  });
  assert(processed.data[0].status === "completed", "queue processor should complete job");

  const search = await request("/search?q=Kenya");
  assert(search.data.length >= 1, "search should return indexed results");

  const appHtml = await request("/app");
  assert(Buffer.from(appHtml).toString().includes("AFRIBN MVP Console"), "server should serve frontend");

  console.log("AFRIBN API smoke test passed");
} finally {
  server.kill("SIGTERM");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
