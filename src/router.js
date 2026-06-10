const { parsePath, readBody, sendJson, notFound, badRequest } = require("./http");
const { hashPassword, requireFields, requireUser, signJwt, userFromRequest, verifyPassword } = require("./auth");
const { parseMultipartUpload, saveUploadedFile } = require("./uploads");
const { deliverQueuedAlerts } = require("./alert-delivery");
const { renderReportPdf, sendPdf } = require("./pdf");
const { requirePermission } = require("./middleware/rbac");
const { enqueueJob } = require("./workers/queue");
const { processWorkerQueue } = require("./workers/processor");
const { indexAll, searchDocuments } = require("./search/indexer");
const { FORMULA_VERSION } = require("./scoring");
const { calculateAndStoreScore, getScoreExplanation, getScoresForObject } = require("./scoring-service");
const {
  blacklistSource,
  calculateCredibilityForObject,
  calculateSourceReliabilityForSource,
  overrideSourceReliability,
  sourceReliabilityExplanation,
  sourceReliabilitySummary,
  whitelistSource
} = require("./source-reliability-service");
const { FORMULA_VERSION: SOURCE_RELIABILITY_VERSION } = require("./source-reliability");
const {
  createAgentReport,
  createFieldTask,
  createGapReport,
  createRawArticle,
  createScore,
  createScrapeJob,
  createStoryEvent,
  distillRawArticleWithAI,
  createVerificationReview,
  publishIntelligence,
  runDemoPipeline
} = require("./pipeline");
const { buildReport, countryIntelligence, dashboardSummary, listFeed } = require("./products");
const { runScrapeWorker } = require("./scrapers");
const { listSourceAdapters } = require("./adapters");

function createRouter(store) {
  const currentUser = (req) => {
    const authenticated = userFromRequest(store, req);
    if (authenticated) return publicUser(authenticated);
    const user = store.list("users")[0];
    const role = store.get("roles", user.roleId);
    const organization = store.get("organizations", user.organizationId);
    return publicUser({ ...user, role, organization });
  };

  async function handle(req, res, url, context) {
    const method = req.method;
    const parts = parsePath(url.pathname);
    const query = Object.fromEntries(url.searchParams.entries());

    if (method === "GET" && parts.length === 0) {
      return sendJson(res, 200, {
        name: "AFRIBN Backend",
        description: "Intelligence lifecycle backend. Use /health, /pipeline/stages, /feed, /dashboard.",
        requestId: context.requestId
      });
    }

    if (method === "GET" && parts[0] === "health") {
      return sendJson(res, 200, {
        status: "ok",
        modules: ["identity", "source", "collection", "intelligence", "verification", "knowledge_graph", "publishing", "alerting"],
        products: ["feed", "country_intelligence", "policy_monitor", "deal_tracker", "event_tracker", "risk_dashboard", "reports", "watchlists"],
        uptimeMs: Date.now() - context.startedAt
      });
    }

    if (parts[0] === "auth") return handleAuth(req, res, parts);
    if (parts[0] === "users") return handleUsers(req, res, parts, currentUser);
    if (parts[0] === "users-directory") return handleUsersDirectory(req, res);
    if (parts[0] === "organizations") return handleCollection(req, res, parts, "organizations", ["name", "type", "country"]);
    if (parts[0] === "roles") return sendJson(res, 200, { data: store.list("roles") });
    if (parts[0] === "sources") return handleSources(req, res, parts);
    if (parts[0] === "source-adapters") return sendJson(res, 200, { data: listSourceAdapters() });
    if (parts[0] === "pipeline") return handlePipeline(req, res, parts);
    if (parts[0] === "workers") return handleWorkers(req, res, parts);
    if (parts[0] === "queue") return handleQueue(req, res, parts);
    if (parts[0] === "uploads") return handleUploads(req, res, parts);
    if (parts[0] === "scrape-jobs") return handleScrapeJobs(req, res, parts);
    if (parts[0] === "raw-articles") return handleRawArticles(req, res, parts);
    if (parts[0] === "events") return handleEvents(req, res, parts, query);
    if (parts[0] === "stories") return handleStories(req, res, parts, query);
    if (parts[0] === "scores") return handleScores(req, res, parts);
    if (parts[0] === "gap-reports") return handleGapReports(req, res, parts);
    if (parts[0] === "field-tasks" || parts[0] === "agent") return handleFieldOps(req, res, parts);
    if (parts[0] === "verification") return handleVerification(req, res, parts);
    if (parts[0] === "published-intelligence") return handlePublishedIntelligence(req, res, parts);
    if (parts[0] === "feed") return sendJson(res, 200, { data: listFeed(store, query) });
    if (parts[0] === "countries") return handleCountries(res, parts);
    if (parts[0] === "policies") return handleProductList(res, "policies", query);
    if (parts[0] === "deals") return handleProductList(res, "deals", query);
    if (parts[0] === "risk") return handleRisk(res, parts);
    if (parts[0] === "watchlists") return handleWatchlists(req, res, parts);
    if (parts[0] === "alerts") return handleAlerts(req, res, parts);
    if (parts[0] === "messages") return handleMessages(req, res, parts, query);
    if (parts[0] === "reports") return handleReports(req, res, parts);
    if (parts[0] === "dashboard" || parts[0] === "dashboards") return sendJson(res, 200, { data: dashboardSummary(store) });
    if (parts[0] === "graph") return handleGraph(res, parts);
    if (parts[0] === "search") return handleSearch(req, res, parts, query);
    if (parts[0] === "ai") return handleAi(req, res, parts);
    if (parts[0] === "scoring") return handleScoring(req, res, parts, query);
    if (parts[0] === "source-reliability") return handleSourceReliability(req, res, parts, query);

    throw notFound("Route not found");
  }

  async function handleAuth(req, res, parts) {
    const body = await readBody(req);
    if (req.method === "POST" && parts[1] === "login") {
      requireFields(body, ["email", "password"]);
      const user = store.list("users", (item) => item.email === body.email)[0];
      if (!user || !verifyPassword(body.password, user.passwordHash)) {
        throw badRequest("Invalid email or password");
      }
      return sendJson(res, 200, {
        token: signJwt({ sub: user.id, roleId: user.roleId, organizationId: user.organizationId }),
        user: publicUser(user)
      });
    }
    if (req.method === "POST" && parts[1] === "register") {
      requireFields(body, ["email", "password"]);
      if (store.list("users", (item) => item.email === body.email).length) throw badRequest("Email is already registered");
      const role = store.list("roles", (item) => item.name === "Enterprise Client")[0];
      const organization = store.list("organizations")[0];
      const user = store.insert("users", {
        email: body.email,
        name: body.name || body.email,
        passwordHash: hashPassword(body.password),
        roleId: role.id,
        organizationId: body.organizationId || organization.id,
        status: "active"
      });
      return sendJson(res, 201, {
        token: signJwt({ sub: user.id, roleId: user.roleId, organizationId: user.organizationId }),
        user: publicUser(user)
      });
    }
    if (req.method === "POST" && parts[1] === "refresh") {
      const user = requireUser(store, req);
      return sendJson(res, 200, { token: signJwt({ sub: user.id, roleId: user.roleId, organizationId: user.organizationId }) });
    }
    throw notFound("Auth route not found");
  }

  async function handleUsers(req, res, parts, currentUser) {
    if (req.method === "GET" && parts[1] === "me") return sendJson(res, 200, { data: currentUser(req) });
    throw notFound("User route not found");
  }

  function handleUsersDirectory(req, res) {
    requireUser(store, req);
    return sendJson(res, 200, {
      data: store.list("users", (user) => user.status !== "inactive").map(publicUser)
    });
  }

  async function handleCollection(req, res, parts, collection, allowedFields) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list(collection) });
    if (req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      const payload = {};
      for (const field of allowedFields) if (body[field] !== undefined) payload[field] = body[field];
      return sendJson(res, 201, { data: store.insert(collection, payload) });
    }
    throw notFound("Collection route not found");
  }

  async function handleSources(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "sources:read");
      return sendJson(res, 200, { data: store.list("sources") });
    }
    if (req.method === "POST" && parts.length === 1) {
      requirePermission(store, req, "sources:manage");
      const body = await readBody(req);
      for (const field of ["name", "country", "type", "url"]) {
        if (!body[field]) throw badRequest(`${field} is required`);
      }
      const source = store.insert("sources", {
        frequency: body.frequency || "15min",
        reliability: body.reliability || 70,
        collectorType: body.collectorType || "NewsScraperWorker",
        status: "active",
        ...body
      });
      return sendJson(res, 201, { data: source });
    }
    const id = parts[1];
    const source = store.get("sources", id);
    if (!source) throw notFound("Source not found");
    if (req.method === "GET" && parts.length === 2) return sendJson(res, 200, { data: source });
    if (req.method === "PATCH" && parts.length === 2) {
      requirePermission(store, req, "sources:manage");
      return sendJson(res, 200, { data: store.update("sources", id, await readBody(req)) });
    }
    if (req.method === "DELETE" && parts.length === 2) {
      requirePermission(store, req, "sources:manage");
      return sendJson(res, 200, { data: store.remove("sources", id) });
    }
    if (req.method === "POST" && parts[2] === "test-scrape") {
      requirePermission(store, req, "sources:manage");
      return sendJson(res, 201, { data: await runScrapeWorker(store, id, await readBody(req)) });
    }
    if (req.method === "POST" && parts[2] === "queue-scrape") {
      requirePermission(store, req, "sources:manage");
      const scrapeJob = createScrapeJob(store, id, { collectorType: source.collectorType });
      return sendJson(res, 201, { data: scrapeJob });
    }
    throw notFound("Source route not found");
  }

  async function handlePipeline(req, res, parts) {
    if (req.method === "GET" && parts[1] === "stages") {
      return sendJson(res, 200, {
        data: [
          "Source creates ScrapeJob",
          "ScrapeJob creates RawArticle",
          "RawArticle creates Story/Event",
          "Event creates Score",
          "Score creates GapReport",
          "GapReport creates FieldTask",
          "FieldTask creates AgentReport",
          "AgentReport creates VerificationReview",
          "VerificationReview creates PublishedIntelligence",
          "PublishedIntelligence feeds Dashboards"
        ]
      });
    }
    if (req.method === "POST" && parts[1] === "demo-run") {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "ai:process");
      const body = await readBody(req);
      const source = body.sourceId ? store.get("sources", body.sourceId) : store.list("sources")[0];
      if (!source) throw notFound("Source not found");
      return sendJson(res, 201, { data: runDemoPipeline(store, source.id, body) });
    }
    throw notFound("Pipeline route not found");
  }

  async function handleWorkers(req, res, parts) {
    if (req.method === "POST" && parts[1] === "scrape") {
      requirePermission(store, req, "sources:manage");
      const body = await readBody(req);
      if (!body.sourceId) throw badRequest("sourceId is required");
      return sendJson(res, 201, { data: await runScrapeWorker(store, body.sourceId, body) });
    }
    if (req.method === "POST" && parts[1] === "deliver-alerts") {
      requirePermission(store, req, "alerts:deliver");
      return sendJson(res, 200, { data: await deliverQueuedAlerts(store, await readBody(req)) });
    }
    throw notFound("Worker route not found");
  }

  async function handleQueue(req, res, parts) {
    requirePermission(store, req, "workers:manage");
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("workerJobs") });
    if (req.method === "POST" && parts[1] === "jobs") {
      const body = await readBody(req);
      if (!body.queue || !body.type) throw badRequest("queue and type are required");
      return sendJson(res, 201, { data: enqueueJob(store, body.queue, body.type, body.payload || {}, body) });
    }
    if (req.method === "POST" && parts[1] === "process") {
      const body = await readBody(req);
      if (!body.queue) throw badRequest("queue is required");
      return sendJson(res, 200, { data: await processWorkerQueue(store, body.queue, body) });
    }
    throw notFound("Queue route not found");
  }

  async function handleUploads(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("uploadedFiles") });
    if (req.method === "POST" && parts.length === 1) {
      requirePermission(store, req, "attachments:create");
      const partsList = await parseMultipartUpload(req);
      const filePart = partsList.find((part) => part.filename);
      const fields = Object.fromEntries(partsList.filter((part) => !part.filename).map((part) => [part.name, part.data.toString("utf8")]));
      const uploaded = saveUploadedFile(store, filePart, fields);
      if (fields.agentReportId) {
        store.insert("attachments", {
          agentReportId: fields.agentReportId,
          uploadedFileId: uploaded.id,
          evidenceType: fields.evidenceType || "supporting_document",
          description: fields.description || uploaded.originalName
        });
      }
      return sendJson(res, 201, { data: uploaded });
    }
    throw notFound("Upload route not found");
  }

  async function handleScrapeJobs(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("scrapeJobs") });
    const job = parts[1] ? store.get("scrapeJobs", parts[1]) : null;
    if (parts[1] && !job) throw notFound("ScrapeJob not found");
    if (req.method === "PATCH" && parts.length === 2) return sendJson(res, 200, { data: store.update("scrapeJobs", parts[1], await readBody(req)) });
    if (req.method === "POST" && parts[2] === "retry") {
      return sendJson(res, 201, { data: await runScrapeWorker(store, job.sourceId, await readBody(req)) });
    }
    if (req.method === "POST" && parts[2] === "cancel") {
      return sendJson(res, 200, { data: store.update("scrapeJobs", parts[1], { status: "cancelled", cancelledAt: new Date().toISOString() }) });
    }
    if (req.method === "POST" && parts[2] === "collect") {
      return sendJson(res, 201, { data: createRawArticle(store, parts[1], await readBody(req)) });
    }
    throw notFound("ScrapeJob route not found");
  }

  async function handleRawArticles(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("rawArticles") });
    const rawArticle = parts[1] ? store.get("rawArticles", parts[1]) : null;
    if (parts[1] && !rawArticle) throw notFound("RawArticle not found");
    if (req.method === "GET" && parts.length === 2) return sendJson(res, 200, { data: rawArticle });
    if (req.method === "PATCH" && parts.length === 2) return sendJson(res, 200, { data: store.update("rawArticles", parts[1], await readBody(req)) });
    if (req.method === "POST" && parts[2] === "reject") {
      return sendJson(res, 200, { data: store.update("rawArticles", parts[1], { status: "rejected", rejectedAt: new Date().toISOString(), ...(await readBody(req)) }) });
    }
    if (req.method === "POST" && parts[2] === "distill") {
      return sendJson(res, 201, { data: createStoryEvent(store, parts[1], await readBody(req)) });
    }
    if (req.method === "POST" && parts[2] === "ai-distill") {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "ai:process");
      return sendJson(res, 201, { data: await distillRawArticleWithAI(store, parts[1], await readBody(req)) });
    }
    throw notFound("RawArticle route not found");
  }

  async function handleStories(req, res, parts, query) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: filterRecords(store.list("stories"), query) });
    if (req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      if (!body.rawArticleId) throw badRequest("rawArticleId is required");
      return sendJson(res, 201, { data: createStoryEvent(store, body.rawArticleId, body) });
    }
    const story = store.get("stories", parts[1]);
    if (!story) throw notFound("Story not found");
    if (req.method === "PATCH" && parts.length === 2) return sendJson(res, 200, { data: store.update("stories", parts[1], await readBody(req)) });
    return sendJson(res, 200, { data: story });
  }

  async function handleEvents(req, res, parts, query) {
    if (req.method === "GET" && parts.length === 1) {
      const user = userFromRequest(store, req);
      const visible = filterRecords(store.list("events"), query).filter((event) => {
        if (!user) return (event.approvalStatus || event.status) !== "pending_review" && event.status !== "rejected";
        if (isAdminUser(user)) return true;
        return (event.approvalStatus || event.status) === "approved" || event.status === "approved" || event.submittedByUserId === user.id;
      });
      return sendJson(res, 200, { data: visible.map(enrichEvent) });
    }
    if (req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      if (!body.rawArticleId) throw badRequest("rawArticleId is required");
      return sendJson(res, 201, { data: createStoryEvent(store, body.rawArticleId, { ...body, eventType: body.eventType || "Event" }) });
    }
    if (req.method === "POST" && parts[1] === "manual") {
      const user = requireUser(store, req);
      const body = await readBody(req);
      for (const field of ["title", "description", "country", "sector", "eventType", "startsAt"]) {
        if (!body[field]) throw badRequest(`${field} is required`);
      }
      const admin = isAdminUser(user);
      const event = store.insert("events", {
        sourceType: "manual",
        submittedByUserId: user.id,
        organizationId: user.organizationId,
        eventType: body.eventType,
        country: body.country,
        sector: body.sector,
        title: body.title,
        description: body.description,
        summary: body.summary || body.description,
        occurredAt: body.startsAt,
        startsAt: body.startsAt,
        endsAt: body.endsAt || null,
        timezone: body.timezone || "UTC",
        format: body.format || "in_person",
        accessType: body.accessType || body.format || "in_person",
        accessLink: body.accessLink || "",
        address: body.address || "",
        venue: body.venue || "",
        organizer: body.organizer || "",
        speakers: normalizeList(body.speakers),
        keyDocuments: normalizeDocuments(body.keyDocuments),
        tags: normalizeList(body.tags),
        status: admin ? "approved" : "pending_review",
        approvalStatus: admin ? "approved" : "pending_review",
        approvedByUserId: admin ? user.id : null,
        approvedAt: admin ? new Date().toISOString() : null,
        rejectionReason: "",
        submittedAt: new Date().toISOString(),
        signalScore: Number(body.signalScore || 0) || null,
        impact: body.impact || "medium",
        value: body.value || "",
        nextObject: { type: admin ? "Published Event" : "AdminApprovalQueue", eventId: null }
      });
      store.update("events", event.id, {
        nextObject: { type: admin ? "Published Event" : "AdminApprovalQueue", eventId: event.id }
      });
      return sendJson(res, 201, { data: enrichEvent(store.get("events", event.id)) });
    }
    if (req.method === "POST" && parts[2] === "score") {
      return sendJson(res, 201, { data: createScore(store, parts[1], await readBody(req)) });
    }
    const event = store.get("events", parts[1]);
    if (!event) throw notFound("Event not found");
    if (req.method === "PATCH" && parts.length === 2) {
      const user = requireUser(store, req);
      const patch = await readBody(req);
      if (!isAdminUser(user) && event.submittedByUserId !== user.id) throw forbidden("Only the submitter or an admin can update this event");
      const protectedFields = isAdminUser(user) ? patch : Object.fromEntries(Object.entries(patch).filter(([key]) => !["status", "approvalStatus", "approvedAt", "approvedByUserId"].includes(key)));
      return sendJson(res, 200, { data: enrichEvent(store.update("events", parts[1], protectedFields)) });
    }
    if (req.method === "DELETE" && parts.length === 2) {
      const user = requireUser(store, req);
      if (!isAdminUser(user) && event.submittedByUserId !== user.id) throw forbidden("Only the submitter or an admin can delete this event");
      return sendJson(res, 200, { data: store.remove("events", parts[1]) });
    }
    if (req.method === "POST" && parts[2] === "approve") {
      const user = requireAdmin(req);
      return sendJson(res, 200, {
        data: enrichEvent(store.update("events", parts[1], {
          status: "approved",
          approvalStatus: "approved",
          approvedByUserId: user.id,
          approvedAt: new Date().toISOString(),
          rejectionReason: ""
        }))
      });
    }
    if (req.method === "POST" && parts[2] === "reject") {
      const user = requireAdmin(req);
      const body = await readBody(req);
      return sendJson(res, 200, {
        data: enrichEvent(store.update("events", parts[1], {
          status: "rejected",
          approvalStatus: "rejected",
          approvedByUserId: null,
          approvedAt: null,
          rejectedByUserId: user.id,
          rejectedAt: new Date().toISOString(),
          rejectionReason: body.reason || "Rejected by admin"
        }))
      });
    }
    return sendJson(res, 200, { data: enrichEvent(event) });
  }

  async function handleScores(req, res, parts) {
    if (req.method === "GET") {
      return sendJson(res, 200, {
        data: {
          signalScores: store.list("signalScores"),
          confidenceScores: store.list("confidenceScores"),
          riskScores: store.list("riskScores")
        }
      });
    }
    if (req.method === "POST" && parts[2] === "gaps") {
      return sendJson(res, 201, { data: createGapReport(store, parts[1], await readBody(req)) });
    }
    throw notFound("Score route not found");
  }

  async function handleGapReports(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("gapReports") });
    if (req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      const scoreId = body.scoreId || body.signalScoreId || store.list("signalScores", (score) => !body.storyId || score.storyId === body.storyId).at(-1)?.id;
      if (!scoreId) throw badRequest("scoreId or storyId with an existing signal score is required");
      return sendJson(res, 201, { data: createGapReport(store, scoreId, body) });
    }
    if (req.method === "PATCH" && parts.length === 2) {
      const updated = store.update("gapReports", parts[1], await readBody(req));
      if (!updated) throw notFound("GapReport not found");
      return sendJson(res, 200, { data: updated });
    }
    if (req.method === "POST" && parts[2] === "tasks") {
      return sendJson(res, 201, { data: createFieldTask(store, parts[1], await readBody(req)) });
    }
    throw notFound("GapReport route not found");
  }

  async function handleFieldOps(req, res, parts) {
    if (parts[0] === "agent" && req.method === "GET" && parts[1] === "tasks") return sendJson(res, 200, { data: store.list("fieldTasks") });
    if (parts[0] === "agent" && req.method === "GET" && parts[1] === "reports") return sendJson(res, 200, { data: store.list("agentReports") });
    if (parts[0] === "agent" && req.method === "POST" && parts[1] === "tasks" && parts[3] === "submit") {
      requirePermission(store, req, "tasks:submit");
      return sendJson(res, 201, { data: createAgentReport(store, parts[2], await readBody(req)) });
    }
    if (parts[0] === "agent" && req.method === "POST" && parts[1] === "reports" && parts[3] === "send-to-verification") {
      const report = store.get("agentReports", parts[2]);
      if (!report) throw notFound("AgentReport not found");
      return sendJson(res, 200, { data: store.update("agentReports", report.id, { status: "sent_to_verification", sentToVerificationAt: new Date().toISOString() }) });
    }
    if (parts[0] === "agent" && req.method === "POST" && parts[1] === "reports" && parts[3] === "attachments") {
      requirePermission(store, req, "attachments:create");
      const report = store.get("agentReports", parts[2]);
      if (!report) throw notFound("AgentReport not found");
      const partsList = await parseMultipartUpload(req);
      const uploaded = saveUploadedFile(store, partsList.find((part) => part.filename), { agentReportId: report.id });
      const attachment = store.insert("attachments", {
        agentReportId: report.id,
        uploadedFileId: uploaded.id,
        evidenceType: "agent_evidence",
        description: uploaded.originalName
      });
      return sendJson(res, 201, { data: { uploaded, attachment } });
    }
    if (parts[0] === "field-tasks" && req.method === "GET") return sendJson(res, 200, { data: store.list("fieldTasks") });
    if (parts[0] === "field-tasks" && req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      const gapReportId = body.gapReportId || store.list("gapReports").at(-1)?.id;
      if (!gapReportId) throw badRequest("gapReportId is required");
      return sendJson(res, 201, { data: createFieldTask(store, gapReportId, body) });
    }
    if (parts[0] === "field-tasks" && req.method === "PATCH" && parts.length === 2) {
      const updated = store.update("fieldTasks", parts[1], await readBody(req));
      if (!updated) throw notFound("FieldTask not found");
      return sendJson(res, 200, { data: updated });
    }
    if (parts[0] === "field-tasks" && req.method === "POST" && parts[2] === "submit") {
      requirePermission(store, req, "tasks:submit");
      return sendJson(res, 201, { data: createAgentReport(store, parts[1], await readBody(req)) });
    }
    throw notFound("Field operation route not found");
  }

  async function handleVerification(req, res, parts) {
    if (req.method === "GET") return sendJson(res, 200, { data: store.list("verificationReviews") });
    if (req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      if (!body.agentReportId) throw badRequest("agentReportId is required");
      return sendJson(res, 201, { data: createVerificationReview(store, body.agentReportId, body) });
    }
    if (req.method === "POST" && parts[2] === "review") {
      requirePermission(store, req, "verification:approve");
      return sendJson(res, 201, { data: createVerificationReview(store, parts[1], await readBody(req)) });
    }
    if (req.method === "POST" && parts[2] === "publish") {
      requirePermission(store, req, "verification:approve");
      return sendJson(res, 201, { data: publishIntelligence(store, parts[1], await readBody(req)) });
    }
    if (["approve", "reject", "request-more-info"].includes(parts[2])) {
      requirePermission(store, req, parts[2] === "reject" ? "verification:reject" : "verification:approve");
      const decision = parts[2] === "approve" ? "approved" : parts[2] === "reject" ? "rejected" : "more_info";
      return sendJson(res, 201, { data: createVerificationReview(store, parts[1], { ...(await readBody(req)), decision }) });
    }
    throw notFound("Verification route not found");
  }

  async function handlePublishedIntelligence(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("publishedIntelligence") });
    const published = parts[1] ? store.get("publishedIntelligence", parts[1]) : null;
    if (parts[1] && !published) throw notFound("PublishedIntelligence not found");
    if (req.method === "GET" && parts.length === 2) return sendJson(res, 200, { data: published });
    if (req.method === "PATCH" && parts.length === 2) return sendJson(res, 200, { data: store.update("publishedIntelligence", parts[1], await readBody(req)) });
    if (req.method === "POST" && parts[2] === "unpublish") {
      const updated = store.update("publishedIntelligence", parts[1], { status: "unpublished", unpublishedAt: new Date().toISOString() });
      store.list("feedItems", (item) => item.publishedIntelligenceId === parts[1]).forEach((item) => store.update("feedItems", item.id, { status: "unpublished" }));
      return sendJson(res, 200, { data: updated });
    }
    throw notFound("Published intelligence route not found");
  }

  function handleCountries(res, parts) {
    if (!parts[1]) return sendJson(res, 200, { data: [...new Set(store.list("sources").map((source) => source.country))] });
    const country = decodeURIComponent(parts[1]);
    const data = countryIntelligence(store, country);
    if (parts[2] && data[parts[2]]) return sendJson(res, 200, { data: data[parts[2]] });
    return sendJson(res, 200, { data });
  }

  function handleProductList(res, collection, query) {
    return sendJson(res, 200, { data: filterRecords(store.list(collection), query) });
  }

  function handleRisk(res, parts) {
    if (parts[1] === "countries" && !parts[2]) return sendJson(res, 200, { data: store.list("countryRiskSnapshots") });
    if (parts[1] === "countries" && parts[2]) {
      const country = decodeURIComponent(parts[2]);
      return sendJson(res, 200, {
        data: store.list("countryRiskSnapshots", (item) => item.country.toLowerCase() === country.toLowerCase())
      });
    }
    throw notFound("Risk route not found");
  }

  async function handleWatchlists(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) {
      return sendJson(res, 200, {
        data: store.list("watchlists").map((watchlist) => ({
          ...watchlist,
          items: store.list("watchlistItems", (item) => item.watchlistId === watchlist.id)
        }))
      });
    }
    if (req.method === "POST" && parts.length === 1) {
      requirePermission(store, req, "watchlists:manage");
      const body = await readBody(req);
      return sendJson(res, 201, { data: store.insert("watchlists", { userId: body.userId || store.list("users")[0].id, name: body.name }) });
    }
    if (req.method === "POST" && parts[2] === "items") {
      requirePermission(store, req, "watchlists:manage");
      const body = await readBody(req);
      return sendJson(res, 201, { data: store.insert("watchlistItems", { watchlistId: parts[1], ...body }) });
    }
    if (req.method === "DELETE" && parts[2] === "items") {
      requirePermission(store, req, "watchlists:manage");
      return sendJson(res, 200, { data: store.remove("watchlistItems", parts[3]) });
    }
    throw notFound("Watchlist route not found");
  }

  async function handleAlerts(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("alerts") });
    if (req.method === "POST" && parts[1] === "rules") {
      requirePermission(store, req, "alerts:manage");
      const body = await readBody(req);
      return sendJson(res, 201, { data: store.insert("alertRules", { userId: body.userId || store.list("users")[0].id, status: "active", ...body }) });
    }
    if (req.method === "PATCH" && parts[2] === "acknowledge") {
      requirePermission(store, req, "alerts:manage");
      const alert = store.update("alerts", parts[1], { status: "acknowledged", acknowledgedAt: new Date().toISOString() });
      if (!alert) throw notFound("Alert not found");
      return sendJson(res, 200, { data: alert });
    }
    throw notFound("Alert route not found");
  }

  async function handleMessages(req, res, parts, query) {
    const user = requireUser(store, req);
    if (req.method === "GET" && parts.length === 1) {
      const box = query.box || "inbox";
      const messages = store
        .list("messages", (message) => {
          if (message.status === "deleted") return false;
          if (box === "sent") return message.fromUserId === user.id;
          if (box === "all") return message.fromUserId === user.id || message.toUserId === user.id;
          return message.toUserId === user.id;
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(enrichMessage);
      return sendJson(res, 200, {
        data: {
          box,
          unreadCount: store.list("messages", (message) => message.toUserId === user.id && message.status === "unread").length,
          messages
        }
      });
    }
    if (req.method === "POST" && parts.length === 1) {
      const body = await readBody(req);
      requireFields(body, ["toUserId", "subject", "body"]);
      if (!store.get("users", body.toUserId)) throw notFound("Recipient user not found");
      const message = store.insert("messages", {
        fromUserId: user.id,
        toUserId: body.toUserId,
        subject: body.subject,
        body: body.body,
        status: "unread",
        priority: body.priority || "normal",
        threadId: body.threadId || `thread_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
      });
      return sendJson(res, 201, { data: enrichMessage(message) });
    }
    const message = store.get("messages", parts[1]);
    if (!message) throw notFound("Message not found");
    if (message.fromUserId !== user.id && message.toUserId !== user.id) throw notFound("Message not found");
    if (req.method === "GET" && parts.length === 2) return sendJson(res, 200, { data: enrichMessage(message) });
    if (req.method === "PATCH" && parts.length === 2) {
      const patch = await readBody(req);
      const allowed = {};
      for (const field of ["status", "priority"]) if (patch[field]) allowed[field] = patch[field];
      return sendJson(res, 200, { data: enrichMessage(store.update("messages", message.id, allowed)) });
    }
    if (req.method === "POST" && parts[2] === "read") {
      return sendJson(res, 200, { data: enrichMessage(store.update("messages", message.id, { status: "read", readAt: new Date().toISOString() })) });
    }
    if (req.method === "DELETE" && parts.length === 2) {
      return sendJson(res, 200, { data: enrichMessage(store.update("messages", message.id, { status: "deleted", deletedAt: new Date().toISOString() })) });
    }
    throw notFound("Message route not found");
  }

  function enrichMessage(message) {
    const from = store.get("users", message.fromUserId);
    const to = store.get("users", message.toUserId);
    return {
      ...message,
      from: from ? publicUser(from) : null,
      to: to ? publicUser(to) : null
    };
  }

  async function handleReports(req, res, parts) {
    if (req.method === "GET" && parts.length === 1) return sendJson(res, 200, { data: store.list("reports") });
    if (req.method === "POST" && parts[1] === "generate") {
      requirePermission(store, req, "reports:create");
      return sendJson(res, 201, { data: buildReport(store, await readBody(req)) });
    }
    if (req.method === "GET" && parts[1] && parts[2] === "download") {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "reports:download");
      const report = store.get("reports", parts[1]);
      if (!report) throw notFound("Report not found");
      const sections = store.list("reportSections", (item) => item.reportId === report.id);
      const pdf = renderReportPdf(report, sections);
      const exportRecord = store.insert("reportExports", {
        reportId: report.id,
        format: "pdf",
        bytes: pdf.length,
        exportedAt: new Date().toISOString()
      });
      store.update("reports", report.id, { lastExportId: exportRecord.id });
      return sendPdf(res, `${report.title.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`, pdf);
    }
    if (req.method === "GET" && parts[1]) {
      const report = store.get("reports", parts[1]);
      if (!report) throw notFound("Report not found");
      return sendJson(res, 200, { data: { ...report, sections: store.list("reportSections", (item) => item.reportId === report.id) } });
    }
    throw notFound("Report route not found");
  }

  function handleGraph(res, parts) {
    if (parts[1] === "nodes") return sendJson(res, 200, { data: store.list("graphNodes") });
    if (parts[1] === "edges") return sendJson(res, 200, { data: store.list("graphEdges") });
    return sendJson(res, 200, { data: { nodes: store.list("graphNodes"), edges: store.list("graphEdges") } });
  }

  async function handleSearch(req, res, parts, query) {
    if (req.method === "POST" && parts[1] === "reindex") {
      requirePermission(store, req, "search:manage");
      return sendJson(res, 200, { data: indexAll(store) });
    }
    return sendJson(res, 200, { data: searchDocuments(store, query) });
  }

  async function handleAi(req, res, parts) {
    if (parts[1] === "logs") {
      requirePermission(store, req, "ai:process");
      return sendJson(res, 200, { data: store.list("aiProcessingLogs") });
    }
    if (parts[1] === "prompts") {
      if (req.method === "GET") return sendJson(res, 200, { data: store.list("promptVersions") });
      if (req.method === "POST") {
        requirePermission(store, req, "ai:process");
        return sendJson(res, 201, { data: store.insert("promptVersions", await readBody(req)) });
      }
    }
    throw notFound("AI route not found");
  }

  async function handleScoring(req, res, parts, query) {
    if (req.method === "GET" && parts[1] === "version") {
      return sendJson(res, 200, { data: { formulaVersion: FORMULA_VERSION } });
    }
    if (req.method === "POST" && parts[1] === "calculate") {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "scoring:calculate");
      return sendJson(res, 201, { data: calculateAndStoreScore(store, await readBody(req)) });
    }
    if (req.method === "POST" && parts[1] === "recalculate") {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "scoring:calculate");
      return sendJson(res, 201, {
        data: calculateAndStoreScore(store, {
          objectType: parts[2],
          objectId: parts[3],
          ...(await readBody(req))
        })
      });
    }
    if (req.method === "GET" && parts[1] === "top-signals") {
      const limit = Number(query.limit || 10);
      return sendJson(res, 200, {
        data: store
          .list("signalScores")
          .sort((a, b) => Number(b.score) - Number(a.score))
          .slice(0, limit)
      });
    }
    if (req.method === "GET" && parts[1] === "risk" && parts[2] === "countries") {
      return sendJson(res, 200, {
        data: store
          .list("riskScores", (item) => item.objectType === "country" || item.country)
          .sort((a, b) => Number(b.score) - Number(a.score))
      });
    }
    if (req.method === "GET" && parts[3] === "explanation") {
      return sendJson(res, 200, { data: getScoreExplanation(store, parts[1], parts[2]) });
    }
    if (req.method === "GET" && parts[1] && parts[2]) {
      return sendJson(res, 200, { data: getScoresForObject(store, parts[1], parts[2]) });
    }
    throw notFound("Scoring route not found");
  }

  async function handleSourceReliability(req, res, parts, query) {
    if (req.method === "GET" && parts[1] === "version") {
      return sendJson(res, 200, { data: { formulaVersion: SOURCE_RELIABILITY_VERSION } });
    }
    if (req.method === "POST" && parts[1] === "calculate" && parts[2]) {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "sources:manage");
      return sendJson(res, 201, { data: calculateSourceReliabilityForSource(store, parts[2], await readBody(req)) });
    }
    if (req.method === "POST" && parts[1] === "credibility" && parts[2] === "calculate") {
      const user = userFromRequest(store, req);
      if (user) requirePermission(store, req, "sources:manage");
      return sendJson(res, 201, { data: calculateCredibilityForObject(store, await readBody(req)) });
    }
    if (req.method === "GET" && parts[1] === "collection-priority" && parts[2]) {
      return sendJson(res, 200, { data: sourceReliabilitySummary(store, parts[2]).collection });
    }
    if (req.method === "GET" && parts[1] === "top-priority-sources") {
      return sendJson(res, 200, {
        data: store.list("sourceCollectionDecisions").sort((a, b) => Number(b.collectionPriorityScore) - Number(a.collectionPriorityScore)).slice(0, Number(query.limit || 10))
      });
    }
    if (req.method === "GET" && parts[1] === "probation-sources") {
      return sendJson(res, 200, {
        data: store.list("sourceCollectionDecisions", (item) => item.decision === "PROBATION_SAMPLING_MANUAL_REVIEW")
      });
    }
    if (req.method === "GET" && parts[1] && parts[2] === "explanation") {
      return sendJson(res, 200, { data: sourceReliabilityExplanation(store, parts[1]) });
    }
    if (req.method === "POST" && parts[1] && parts[2] === "override") {
      requirePermission(store, req, "sources:manage");
      return sendJson(res, 201, { data: overrideSourceReliability(store, parts[1], await readBody(req)) });
    }
    if (req.method === "POST" && parts[1] && parts[2] === "blacklist") {
      requirePermission(store, req, "sources:manage");
      return sendJson(res, 201, { data: blacklistSource(store, parts[1], await readBody(req)) });
    }
    if (req.method === "POST" && parts[1] && parts[2] === "whitelist") {
      requirePermission(store, req, "sources:manage");
      return sendJson(res, 201, { data: whitelistSource(store, parts[1], await readBody(req)) });
    }
    if (req.method === "GET" && parts[1]) {
      return sendJson(res, 200, { data: sourceReliabilitySummary(store, parts[1]) });
    }
    throw notFound("Source reliability route not found");
  }

  function filterRecords(records, query) {
    return records.filter((record) => {
      for (const [key, value] of Object.entries(query)) {
        if (value && String(record[key] || "").toLowerCase() !== String(value).toLowerCase()) return false;
      }
      return true;
    });
  }

  function publicUser(user) {
    if (!user) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  function enrichEvent(event) {
    if (!event) return event;
    return {
      ...event,
      submittedBy: publicUser(store.get("users", event.submittedByUserId)),
      approvedBy: publicUser(store.get("users", event.approvedByUserId)),
      rejectedBy: publicUser(store.get("users", event.rejectedByUserId))
    };
  }

  function isAdminUser(user) {
    return user?.role?.permissions?.includes("*") || /admin/i.test(user?.role?.name || "");
  }

  function requireAdmin(req) {
    const user = requireUser(store, req);
    if (!isAdminUser(user)) throw forbidden("Admin approval is required");
    return user;
  }

  function forbidden(message) {
    const error = new Error(message);
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    return error;
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item.trim() : item).filter(Boolean);
    if (!value) return [];
    return String(value).split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  function normalizeDocuments(value) {
    const rows = Array.isArray(value) ? value : normalizeList(value);
    return rows.map((item) => {
      if (typeof item === "object" && item) return { title: item.title || item.name || "Document", url: item.url || item.href || "", type: item.type || "document" };
      const [title, url] = String(item).split("|").map((part) => part.trim());
      return { title: title || "Document", url: url || "", type: "document" };
    }).filter((item) => item.title || item.url);
  }

  return { handle };
}

module.exports = { createRouter };
