(function () {
  const DEMO_PASSWORDS = {
    "admin@afribn.local": "afribn-admin-demo",
    "analyst@afribn.local": "afribn-analyst-demo",
    "agent@afribn.local": "afribn-agent-demo",
    "verifier@afribn.local": "afribn-verifier-demo",
    "client@afribn.local": "afribn-client-demo"
  };

  const ROLE_BY_EMAIL = {
    "admin@afribn.local": "admin",
    "analyst@afribn.local": "analyst",
    "agent@afribn.local": "agent",
    "verifier@afribn.local": "verifier",
    "client@afribn.local": "client"
  };

  const PAGE = location.pathname.split("/").pop() || "index.html";
  const API = {
    token: () => localStorage.getItem("afribn_token") || "",
    headers(extra = {}) {
      return {
        ...(extra.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(API.token() ? { Authorization: `Bearer ${API.token()}` } : {}),
        ...extra.headers
      };
    },
    async request(path, options = {}) {
      const response = await fetch(path, { ...options, headers: API.headers(options) });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json() : await response.blob();
      if (!response.ok) throw new Error(payload?.error?.message || `${response.status} ${response.statusText}`);
      return payload.data !== undefined ? payload.data : payload;
    },
    get(path) { return API.request(path); },
    post(path, body = {}) { return API.request(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) }); },
    patch(path, body = {}) { return API.request(path, { method: "PATCH", body: JSON.stringify(body) }); },
    del(path) { return API.request(path, { method: "DELETE" }); }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const ic = (name, attrs = "") => window.AFRIBN?.ic?.(name, attrs) || "";
  const toast = (message, kind) => window.AFRIBN?.toast?.(message, kind) || console.log(message);
  const pill = (text, color = "#8B949E") => window.AFRIBN?.statusPill?.(escapeHtml(text), color) || `<span>${escapeHtml(text)}</span>`;

  window.AFRIBN_API = API;

  window.addEventListener("load", () => {
    if (PAGE === "login.html" && new URLSearchParams(location.search).get("logout") === "1") {
      localStorage.removeItem("afribn_token");
      localStorage.removeItem("afribn_user");
      localStorage.removeItem("afribn_role");
    }
    if (requiresAuth(PAGE) && !API.token()) {
      location.href = `login.html?next=${encodeURIComponent(PAGE + location.search)}`;
      return;
    }
    const handlers = {
      "login.html": initLogin,
      "sources.html": initSources,
      "jobs.html": initJobs,
      "raw.html": initRawArticles,
      "reliability.html": initReliability,
      "workspace.html": initWorkspace,
      "scoring.html": initScoring,
      "gaps.html": initGaps,
      "tasks.html": initTasks,
      "agentreports.html": initAgentReports,
      "verification.html": initVerification,
      "published.html": initPublished,
      "feed.html": initFeed,
      "home.html": initHome,
      "dashboards.html": initDashboards,
      "country.html": initCountryBrief,
      "alerts.html": initAlerts,
      "event.html": initEventTracker,
      "event-detail.html": initEventDetail,
      "watchlist.html": initWatchlist,
      "reports.html": initReports
    };
    if (handlers[PAGE]) handlers[PAGE]().catch((error) => toast(error.message, "warn"));
    if (requiresAuth(PAGE)) initMessaging().catch((error) => console.warn(error.message));
  });

  async function initLogin() {
    const form = $("#loginForm");
    if (!form) return;
    const emailInput = $("#email");
    const passwordInput = $("#password");
    if (passwordInput && passwordInput.value.includes("•")) passwordInput.value = "";

    async function login(email, password) {
      const result = await API.post("/auth/login", { email, password });
      localStorage.setItem("afribn_token", result.token);
      localStorage.setItem("afribn_user", JSON.stringify(result.user));
      localStorage.setItem("afribn_role", ROLE_BY_EMAIL[email] || roleFromUser(result.user));
      toast("Signed in", "ok");
      const next = new URLSearchParams(location.search).get("next");
      location.href = next || landingForRole(localStorage.getItem("afribn_role"));
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await login(emailInput.value.trim(), passwordInput.value || DEMO_PASSWORDS[emailInput.value.trim()]);
    }, true);

    $$(".role-chip").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const email = button.dataset.email;
        emailInput.value = email;
        passwordInput.value = DEMO_PASSWORDS[email] || "";
        toast("Demo credentials filled. Press Sign in to continue.", "ok");
      }, true);
    });
  }

  async function initSources() {
    await ensureDemoData();
    addProviderFields();
    const sources = await API.get("/sources");
    const reliability = await Promise.all(sources.map((source) => API.get(`/source-reliability/${source.id}`).catch(() => null)));
    const summaries = Object.fromEntries(sources.map((source, index) => [source.id, reliability[index]]));
    renderSourceStats(sources, summaries);
    renderSourceRows(sources, summaries);

    $("#mSave")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const type = $("#m_type")?.value || "Website";
      const provider = $("#m_provider")?.value || "";
      const source = await API.post("/sources", {
        name: $("#m_name")?.value || "New AFRIBN Source",
        url: $("#m_url")?.value || (provider === "gdelt" ? "https://api.gdeltproject.org/api/v2/doc/doc" : "https://example.com"),
        type,
        country: $("#m_country")?.value || "Pan-African",
        topic: $("#m_topic")?.value || "",
        language: normalizeLanguage($("#m_lang")?.value),
        frequency: $("#m_freq")?.value || "15min",
        status: ($("#m_status")?.value || "Active").toLowerCase(),
        provider: provider || undefined,
        scrapingConfig: provider ? { provider, query: $("#m_topic")?.value || "Africa", limit: 25 } : {}
      });
      await API.post(`/source-reliability/calculate/${source.id}`, {});
      toast("Source added", "ok");
      setTimeout(() => location.reload(), 500);
    }, true);

    $("#runAll")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      for (const source of sources.filter((item) => item.status !== "inactive").slice(0, 5)) {
        await API.post("/queue/jobs", { queue: "collection", type: "scrape_source", payload: { sourceId: source.id, limit: 5 } }).catch(() => null);
      }
      const processed = await API.post("/queue/process", { queue: "collection", limit: 5 }).catch(() => null);
      const completed = Array.isArray(processed) ? processed.length : processed?.processed?.length || 0;
      toast(completed ? `Processed ${completed} scrape jobs` : "Queued scrapes for active sources", "ok");
      setTimeout(() => location.reload(), 700);
    }, true);
  }

  async function initMessaging() {
    const button = $("#messageBtn");
    if (!button || $("#messagePanel")) return;
    const data = await API.get("/messages").catch(() => ({ unreadCount: 0, messages: [] }));
    updateMessageBadge(data.unreadCount || 0);
    const panel = document.createElement("div");
    panel.id = "messagePanel";
    panel.innerHTML = `
      <div class="msg-back" id="msgBack"></div>
      <aside class="msg-drawer" id="msgDrawer">
        <div class="msg-head">
          <div><div class="eyebrow red">Internal Comms</div><h2>Team Messages</h2></div>
          <button class="icon-btn" id="msgClose" style="width:36px;height:36px">${ic("x")}</button>
        </div>
        <div class="msg-tabs"><button class="on" data-box="inbox">Inbox</button><button data-box="sent">Sent</button><button data-box="all">All</button></div>
        <div class="msg-compose">
          <div class="field"><label>To</label><select id="msgTo"></select></div>
          <div class="field"><label>Subject</label><input id="msgSubject" placeholder="Subject"></div>
          <div class="field"><label>Message</label><textarea id="msgBody" placeholder="Write a note to the AFRIBN team..."></textarea></div>
          <button class="btn btn-primary" id="msgSend" style="width:100%">${ic("send", 'width="16" height="16"')} Send Message</button>
        </div>
        <div class="msg-list" id="msgList"></div>
      </aside>`;
    document.body.appendChild(panel);
    injectMessageStyles();
    const users = await API.get("/users-directory").catch(async () => {
      const me = await API.get("/users/me").catch(() => ({ data: null }));
      return [me.data || me].filter(Boolean);
    });
    $("#msgTo").innerHTML = users.map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name || user.email)} · ${escapeHtml(user.email)}</option>`).join("");

    let box = "inbox";
    async function loadMessages() {
      const payload = await API.get(`/messages?box=${encodeURIComponent(box)}`);
      updateMessageBadge(payload.unreadCount || 0);
      $("#msgList").innerHTML = payload.messages.map((message) => {
        const inbound = message.toUserId !== message.fromUserId && box !== "sent";
        const person = box === "sent" ? message.to : message.from;
        const unread = message.status === "unread" && box !== "sent";
        return `<article class="msg-item ${unread ? "unread" : ""}" data-id="${message.id}">
          <div class="msg-row"><strong>${escapeHtml(message.subject)}</strong>${message.priority === "high" ? '<span class="msg-prio">High</span>' : ""}</div>
          <div class="msg-meta">${inbound ? "From" : "To"} ${escapeHtml(person?.name || person?.email || "AFRIBN Team")} · ${formatDate(message.createdAt)}</div>
          <p>${escapeHtml(message.body)}</p>
          <div class="msg-actions">${unread ? `<button data-read="${message.id}">${ic("check", 'width="14" height="14"')} Mark read</button>` : ""}<button data-reply="${escapeAttr(person?.id || message.fromUserId)}" data-subject="${escapeAttr(message.subject)}">${ic("message", 'width="14" height="14"')} Reply</button></div>
        </article>`;
      }).join("") || `<div class="empty">${ic("message")}<div>No messages.</div></div>`;
    }

    function openPanel() {
      $("#msgBack").classList.add("open");
      $("#msgDrawer").classList.add("open");
      loadMessages().catch((error) => toast(error.message, "warn"));
    }
    function closePanel() {
      $("#msgBack").classList.remove("open");
      $("#msgDrawer").classList.remove("open");
    }

    button.addEventListener("click", openPanel);
    $("#msgClose").addEventListener("click", closePanel);
    $("#msgBack").addEventListener("click", closePanel);
    $$(".msg-tabs button").forEach((tab) => tab.addEventListener("click", () => {
      $$(".msg-tabs button").forEach((item) => item.classList.remove("on"));
      tab.classList.add("on");
      box = tab.dataset.box;
      loadMessages().catch((error) => toast(error.message, "warn"));
    }));
    $("#msgSend").addEventListener("click", async () => {
      const toUserId = $("#msgTo").value;
      const subject = $("#msgSubject").value.trim();
      const body = $("#msgBody").value.trim();
      if (!toUserId || !subject || !body) return toast("Recipient, subject and message are required", "warn");
      await API.post("/messages", { toUserId, subject, body });
      $("#msgSubject").value = "";
      $("#msgBody").value = "";
      toast("Message sent", "ok");
      box = "sent";
      $$(".msg-tabs button").forEach((item) => item.classList.toggle("on", item.dataset.box === "sent"));
      await loadMessages();
    });
    $("#msgList").addEventListener("click", async (event) => {
      const read = event.target.closest("[data-read]");
      if (read) {
        await API.post(`/messages/${read.dataset.read}/read`, {});
        await loadMessages();
        return;
      }
      const reply = event.target.closest("[data-reply]");
      if (reply) {
        $("#msgTo").value = reply.dataset.reply;
        $("#msgSubject").value = reply.dataset.subject.startsWith("Re:") ? reply.dataset.subject : `Re: ${reply.dataset.subject}`;
        $("#msgBody").focus();
      }
    });
  }

  function updateMessageBadge(count) {
    const badge = $("#messageBadge");
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? "grid" : "none";
  }

  function injectMessageStyles() {
    if ($("#messageStyles")) return;
    const style = document.createElement("style");
    style.id = "messageStyles";
    style.textContent = `
      .msg-back{position:fixed;inset:0;background:rgba(0,0,0,.48);opacity:0;pointer-events:none;transition:.18s;z-index:95}
      .msg-back.open{opacity:1;pointer-events:auto}
      .msg-drawer{position:fixed;right:0;top:0;height:100vh;width:min(460px,100vw);background:var(--bg);border-left:1px solid var(--line);box-shadow:var(--shadow);transform:translateX(105%);transition:.22s;z-index:96;display:flex;flex-direction:column}
      .msg-drawer.open{transform:translateX(0)}
      .msg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px;border-bottom:1px solid var(--line)}
      .msg-head h2{font-size:24px;font-weight:800;margin-top:6px}
      .msg-tabs{display:flex;gap:6px;padding:14px 18px;border-bottom:1px solid var(--line)}
      .msg-tabs button{flex:1;border:1px solid var(--line);background:var(--panel);color:var(--ink-2);height:38px;border-radius:10px;font-weight:700}
      .msg-tabs button.on{background:var(--red);border-color:var(--red);color:white}
      .msg-compose{padding:18px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(232,37,45,.05),transparent)}
      .msg-compose .field{margin-bottom:10px}
      .msg-list{padding:14px 18px 24px;overflow:auto}
      .msg-item{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
      .msg-item.unread{border-color:rgba(232,37,45,.45);background:linear-gradient(180deg,rgba(232,37,45,.10),rgba(255,255,255,.015))}
      .msg-row{display:flex;align-items:center;gap:8px;justify-content:space-between}
      .msg-row strong{font-size:14.5px}
      .msg-prio{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#fff;background:var(--red);border-radius:6px;padding:2px 7px}
      .msg-meta{font-size:12px;color:var(--ink-3);margin-top:5px}
      .msg-item p{font-size:13.5px;color:var(--ink-2);line-height:1.55;margin:10px 0 0}
      .msg-actions{display:flex;gap:8px;margin-top:12px}
      .msg-actions button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel-2);color:var(--ink);border-radius:9px;height:32px;padding:0 10px;font-weight:650;font-size:12px}
      .msg-actions button:hover{border-color:rgba(232,37,45,.45)}
    `;
    document.head.appendChild(style);
  }

  async function initJobs() {
    await ensureDemoData();
    const [jobs, sources] = await Promise.all([API.get("/scrape-jobs"), API.get("/sources")]);
    const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]));
    const body = $("#jobBody") || $("tbody");
    if (body) {
      body.innerHTML = jobs.slice().reverse().map((job) => {
        const source = sourceById[job.sourceId] || {};
        return `<tr data-id="${job.id}">
          <td><b>${escapeHtml(job.id)}</b><div class="muted" style="font-size:12px">${escapeHtml(source.name || job.sourceId)}</div></td>
          <td>${pill(statusText(job.status), colorForStatus(job.status))}</td>
          <td>${escapeHtml(job.collectorType || "Worker")}</td>
          <td>${job.discoveredCount ?? "-"}</td><td>${job.createdCount ?? "-"}</td>
          <td class="muted-2">${formatDate(job.startedAt || job.scheduledFor)}</td>
          <td><div class="row-act">
            ${job.status === "failed" ? `<button data-a="retry">${ic("refresh")}</button>` : ""}
            ${["running", "queued"].includes(job.status) ? `<button data-a="cancel">${ic("x")}</button>` : ""}
            <button data-a="view">${ic("eye")}</button>
          </div></td></tr>`;
      }).join("");
      body.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-a]");
        if (!button) return;
        const id = event.target.closest("tr").dataset.id;
        if (button.dataset.a === "retry") await API.post(`/scrape-jobs/${id}/retry`, {});
        if (button.dataset.a === "cancel") await API.post(`/scrape-jobs/${id}/cancel`, {});
        toast("Job updated", "ok");
        setTimeout(() => location.reload(), 400);
      });
    }
    $("#newJob")?.addEventListener("click", async (event) => {
      event.preventDefault();
      const source = sources[0];
      if (!source) return toast("Add a source first", "warn");
      await API.post("/workers/scrape", { sourceId: source.id, limit: 5 });
      toast("Scrape completed", "ok");
      setTimeout(() => location.reload(), 500);
    }, true);
  }

  async function initRawArticles() {
    await ensureDemoData();
    const [articles, sources] = await Promise.all([API.get("/raw-articles"), API.get("/sources")]);
    const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]));
    const requestedId = new URLSearchParams(location.search).get("rawArticleId") || localStorage.getItem("afribn_rawArticleId");
    let selected = articles.find((article) => article.id === requestedId) || articles.at(-1) || articles[0] || null;
    const list = $("#rawItems");
    const preview = $("#preview");
    if (!list || !preview) return;

    function drawList(rows = articles) {
      list.innerHTML = rows.map((article) => `<div class="raw-item ${selected?.id === article.id ? "active" : ""}" data-id="${article.id}">
        <div class="t">${escapeHtml(article.title)}</div>
        <div class="m">${escapeHtml(article.country || article.sourceCountry || sourceById[article.sourceId]?.country || "Pan-African")} <span class="sep"></span> ${escapeHtml(article.originalSourceName || article.sourceName)} <span class="sep"></span> ${formatDate(article.publishedAt)} ${article.duplicateOf ? '<span class="dup-tag">DUP</span>' : ""}</div>
      </div>`).join("") || `<div class="empty">${ic("inbox")}<div>No raw articles yet.</div></div>`;
      $$(".raw-item", list).forEach((item) => item.addEventListener("click", () => {
        selected = articles.find((article) => article.id === item.dataset.id);
        if (selected) remember("rawArticleId", selected.id);
        drawList(rows);
        drawPreview();
      }));
    }

    function drawPreview() {
      const article = selected;
      if (!article) {
        preview.innerHTML = `<div class="empty">${ic("inbox")}<div>Select an article.</div></div>`;
        return;
      }
      const source = sourceById[article.sourceId] || {};
      preview.innerHTML = `<div class="ph"><div>
        <div class="row gap-8" style="margin-bottom:12px;flex-wrap:wrap">
          <span class="pill">${escapeHtml(source.type || article.provider || "Source")}</span>
          <span class="rel-badge">${ic("target", 'width="12" height="12"')} ${escapeHtml(article.status || "collected")}</span>
        </div>
        <h2>${escapeHtml(article.title)}</h2></div>
        <a class="btn btn-ghost btn-sm" href="${escapeAttr(article.url)}" target="_blank">${ic("link", 'width="15" height="15"')} Open source</a></div>
        <p class="body-x">${escapeHtml(article.body || article.summary || "")}</p>
        <div class="meta-grid" style="margin-bottom:20px">
          <div class="kv"><span class="k">Source</span><span class="v">${escapeHtml(article.originalSourceName || article.sourceName)}</span></div>
          <div class="kv"><span class="k">Provider</span><span class="v">${escapeHtml(article.provider || "direct")}</span></div>
          <div class="kv"><span class="k">Published</span><span class="v">${formatDate(article.publishedAt)}</span></div>
          <div class="kv"><span class="k">Language</span><span class="v">${escapeHtml(article.language || "en")}</span></div>
          <div class="kv"><span class="k">Status</span><span class="v">${escapeHtml(article.status || "collected")}</span></div>
        </div>
        <div class="act-bar">
          <button class="btn btn-primary" id="apiToStory">${ic("edit", 'width="16" height="16"')} Convert to Story</button>
          <button class="btn btn-ghost" id="apiToEvent">${ic("calendar", 'width="16" height="16"')} Convert to Event</button>
          <button class="btn btn-ghost" id="apiToAI">${ic("flask", 'width="16" height="16"')} AI Extraction</button>
          <button class="btn btn-ghost btn-sm" id="apiReject" style="margin-left:auto;color:#ff7378">${ic("ban", 'width="15" height="15"')} Reject</button>
        </div>`;
      $("#apiToStory").onclick = async () => {
        const result = await API.post(`/raw-articles/${article.id}/distill`, {});
        remember("storyId", result.story.id);
        toast("Story draft created", "ok");
        location.href = `workspace.html?storyId=${encodeURIComponent(result.story.id)}`;
      };
      $("#apiToEvent").onclick = $("#apiToStory").onclick;
      $("#apiToAI").onclick = async () => {
        const result = await API.post(`/raw-articles/${article.id}/ai-distill`, {});
        remember("storyId", result.story.id);
        toast(result.ai?.status === "fallback" ? "AI unavailable; rules extraction created" : "AI extraction complete", "ok");
        location.href = `workspace.html?storyId=${encodeURIComponent(result.story.id)}`;
      };
      $("#apiReject").onclick = async () => {
        await API.post(`/raw-articles/${article.id}/reject`, {});
        toast("Article rejected", "warn");
        location.reload();
      };
    }

    $("#kw")?.addEventListener("input", () => {
      const value = $("#kw").value.toLowerCase();
      drawList(articles.filter((article) => `${article.title} ${article.body}`.toLowerCase().includes(value)));
    });
    drawList();
    drawPreview();
  }

  async function initReliability() {
    await ensureDemoData();
    const sources = await API.get("/sources");
    const sourceId = new URLSearchParams(location.search).get("sourceId") || sources[0]?.id;
    if (!sourceId) return;
    const source = sources.find((item) => item.id === sourceId) || sources[0];
    const [summary, explanation, priority, probation] = await Promise.all([
      API.get(`/source-reliability/${source.id}`),
      API.get(`/source-reliability/${source.id}/explanation`).catch(() => null),
      API.get("/source-reliability/top-priority-sources").catch(() => []),
      API.get("/source-reliability/probation-sources").catch(() => [])
    ]);
    const h1 = $(".page-head h1");
    if (h1) h1.textContent = source.name;
    const meta = $(".page-head .muted");
    if (meta) meta.textContent = `${source.url} · ${source.provider || source.type || "Source"} · ${source.country || "Pan-African"}`;
    const decision = decisionText(summary.collection?.decision || source.status || "normal");
    const decPill = $("#decPill");
    if (decPill) decPill.innerHTML = pill(decision, decisionColor(decision));
    const srs = Math.round(summary.reliability?.adjustedReliabilityScore || source.reliability || 0);
    const ics = Math.round(summary.credibility?.credibilityScore || srs);
    const cps = Math.round(summary.collection?.collectionPriorityScore || srs);
    const scoreCards = $("#scoreCards");
    if (scoreCards) {
      scoreCards.innerHTML = [
        ["Source Reliability Score", srs, "#3FB950", "Overall trust in this source"],
        ["Information Credibility Score", ics, "#3FB950", "Credibility of produced content"],
        ["Collection Priority Score", cps, "#E8252D", "Scrape scheduling priority"]
      ].map(([label, value, color, sub]) => `<div class="score-card">${AFRIBN.ring(value, { size: 78, stroke: 8, color })}<div class="meta"><div class="l">${label}</div><div class="x">${sub}</div></div></div>`).join("");
    }
    const indCards = $("#indCards");
    if (indCards) {
      indCards.innerHTML = `<div class="ind"><div class="v" style="color:#3FB950">${Math.round((summary.collection?.articleImportRate || 0.8) * 100)}%</div><div class="l">AIR · Article Import Rate</div></div>
      <div class="ind"><div class="v">${Number(summary.collection?.sourceCorroborationValue || 0.7).toFixed(2)}</div><div class="l">SCV · Source Corroboration Value</div></div>`;
    }
    const factors = $("#factors");
    if (factors) {
      const f = summary.reliability?.factors || {};
      const rows = [
        ["Trust Record", "Historical reliability over time", f.trustRecordScore ?? srs, 1],
        ["Correction Accuracy", "Speed & accuracy of corrections", f.correctionAccuracyScore ?? 70, 1],
        ["Authoritativeness", "Domain authority & standing", f.authoritativenessScore ?? 70, 1],
        ["Timeliness Window", "Speed of publication vs events", f.timelinessWindowScore ?? 70, 1],
        ["Bias Penalty", "Detected slant adjustment", f.biasPenalty ?? 0, -1],
        ["Conflict Penalty", "Conflict-of-interest adjustment", f.conflictPenalty ?? 0, -1]
      ];
      factors.innerHTML = rows.map(([name, desc, value, sign]) => {
        const width = Math.max(0, Math.min(100, Number(value) || 0));
        const color = sign < 0 ? "#FF6B35" : scoreColor(width);
        return `<div class="factor"><div class="fn">${name}<small>${desc}</small></div><div class="ftrack"><span style="width:${width}%;background:${color}"></span></div><div class="fv" style="color:${color}">${sign < 0 ? "-" : ""}${Math.round(width)}</div></div>`;
      }).join("");
    }
    const explanationPanel = [...document.querySelectorAll(".panel .eyebrow")].find((node) => node.textContent.includes("Explanation"))?.parentElement;
    if (explanationPanel && explanation?.explanation) {
      const p = explanationPanel.querySelector("p");
      if (p) p.textContent = explanation.explanation;
    }
    const decisionBox = $("#decisionBox");
    if (decisionBox) {
      decisionBox.innerHTML = `<div style="text-align:center;padding:8px 0 14px">${AFRIBN.ring(srs, { size: 120, stroke: 11, color: scoreColor(srs), label: "SRS" })}</div>
      <div style="text-align:center;margin-bottom:14px">${pill(decision, decisionColor(decision))}</div>
      <div class="kv"><span class="k">Import mode</span><span class="v">${escapeHtml(summary.collection?.scrapeDepth || "normal")}</span></div>
      <div class="kv"><span class="k">Frequency</span><span class="v">${escapeHtml(summary.collection?.scrapeFrequency || source.frequency || "-")}</span></div>`;
    }
    $("#priority") && ($("#priority").innerHTML = priority.map((item) => sourceRank(item, sources)).join("") || `<div class="muted">No priority records yet.</div>`);
    $("#probation") && ($("#probation").innerHTML = probation.map((item) => sourceRank(item, sources)).join("") || `<div class="muted">No probation records.</div>`);
    $("#white")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await API.post(`/source-reliability/${source.id}/whitelist`, { reason: "Manual UI action" });
      toast("Source whitelisted", "ok");
      location.reload();
    }, true);
    $("#black")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await API.post(`/source-reliability/${source.id}/blacklist`, { reason: "Manual UI action" });
      toast("Source blacklisted", "warn");
      location.reload();
    }, true);
    $("#override")?.addEventListener("click", async (event) => {
      event.preventDefault();
      await API.post(`/source-reliability/${source.id}/override`, { adjustedReliabilityScore: Math.max(srs, 85), reason: "Manual UI override" });
      toast("Score overridden", "ok");
      location.reload();
    }, true);
  }

  async function initWorkspace() {
    await ensureDemoData();
    const story = await currentStory();
    if (!story) return;
    $("#f_head") && ($("#f_head").value = story.title || "");
    $("#f_sum") && ($("#f_sum").value = story.summary || "");
    $("#f_what") && ($("#f_what").value = story.whatHappened || story.summary || "");
    $("#f_why") && ($("#f_why").value = story.whyItMatters || story.keyClaims?.join("\n") || "");
    $("#f_cons") && ($("#f_cons").value = story.potentialConsequences || story.opportunities?.join("\n") || "");
    $("#f_watch") && ($("#f_watch").value = story.watchNext || story.riskIndicators?.join("\n") || "");

    $("#saveDraft")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await API.patch(`/stories/${story.id}`, storyPayloadFromForm("draft"));
      toast("Draft saved", "ok");
    }, true);
    $("#toScore")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await API.patch(`/stories/${story.id}`, storyPayloadFromForm("ready_for_scoring"));
      const eventRecord = (await API.get(`/events?storyId=${encodeURIComponent(story.id)}`))[0] || (await API.get("/events")).find((item) => item.storyId === story.id);
      if (eventRecord) await API.post(`/events/${eventRecord.id}/score`, {});
      remember("storyId", story.id);
      toast("Submitted for scoring", "ok");
      location.href = `scoring.html?storyId=${encodeURIComponent(story.id)}`;
    }, true);
    $("#toVerify")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await API.patch(`/stories/${story.id}`, storyPayloadFromForm("ready_for_verification"));
      toast("Submitted for verification", "ok");
      location.href = "verification.html";
    }, true);
  }

  async function initScoring() {
    await ensureDemoData();
    const story = await currentStory();
    if (!story) return;
    const title = $(".page-head h1:not(.page-title)");
    if (title) title.textContent = story.title;
    const meta = $(".page-head .muted");
    const [events, scores] = await Promise.all([API.get("/events"), API.get("/scores")]);
    let eventRecord = events.find((item) => item.storyId === story.id);
    const scoreSet = latestScoreSet(scores, story.id, eventRecord?.id);
    if (meta) meta.textContent = `${story.id} · ${story.country || "Africa"} · ${story.sector || story.eventType || "General"} · ${eventRecord?.status || story.status || "draft"}`;
    renderLiveScoring(story, eventRecord, scoreSet);

    async function calculate() {
      if (!eventRecord) {
        const refreshedEvents = await API.get("/events");
        eventRecord = refreshedEvents.find((item) => item.storyId === story.id);
      }
      let result;
      if (eventRecord) {
        const score = await API.post(`/events/${eventRecord.id}/score`, {});
        result = { scores: { signal: score.signalScore, confidence: score.confidenceScore, risk: score.riskScore } };
        remember("scoreId", score.signalScore.id);
        renderLiveScoring(story, eventRecord, {
          signal: score.signalScore,
          confidence: score.confidenceScore,
          risk: score.riskScore
        });
      } else {
        result = await API.post("/scoring/calculate", {
          objectType: "story",
          objectId: story.id,
          userContext: { countries: [story.country], sectors: [story.sector], audience: "analyst" }
        });
      }
      toast("Scores calculated", "ok");
      return result;
    }
    $("#recalc")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      await calculate();
    }, true);
    $("#saveScore")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const result = await calculate();
      toast(`Score saved: ${result.scores?.signal?.score || "ok"}`, "ok");
    }, true);
  }

  function latestScoreSet(scores, storyId, eventId) {
    const matches = (items = []) => items.filter((item) => item.storyId === storyId || item.eventId === eventId);
    return {
      signal: matches(scores.signalScores).at(-1),
      confidence: matches(scores.confidenceScores).at(-1),
      risk: matches(scores.riskScores).at(-1)
    };
  }

  function renderLiveScoring(story, eventRecord, scoreSet = {}) {
    const signal = scoreSet.signal;
    const confidence = scoreSet.confidence;
    const risk = scoreSet.risk;
    const factors = signal?.factors || {};
    const impact = Math.round(Number(factors.impact ?? 0));
    const signalValue = Math.round(Number(signal?.score ?? 0));
    const confidenceValue = Math.round(Number(confidence?.score ?? 0));
    const riskValue = Math.round(Number(risk?.score ?? 0));
    const decision = Math.round(((Number(factors.countryImportance) || 50) + (Number(factors.sectorImportance) || 50)) / 2);
    const negotiation = Math.round(((Number(factors.crossBorderEffect) || 50) + impact) / 2);
    const scenario = Math.round(((Number(factors.urgency) || 50) + riskValue) / 2);
    const gap = confidenceValue ? Math.max(0, Math.round((100 - confidenceValue) * 0.18)) : 0;
    const aiv = Math.max(0, Math.round(impact * 0.30 + confidenceValue * 0.25 + signalValue * 0.20 + decision * 0.15 + negotiation * 0.10 - gap));
    const cardData = [
      ["target", "Impact Score", impact],
      ["shield", "Confidence Score", confidenceValue],
      ["feed", "Signal Score", signalValue],
      ["user", "Decision Relevance", decision],
      ["handshake", "Negotiation Leverage", negotiation],
      ["alertTri", "Scenario Risk", scenario],
      ["gauge", "Risk Score", riskValue],
      ["ban", "Gap Penalty", gap, true]
    ];
    const scoreCards = $("#scoreCards");
    if (scoreCards) {
      scoreCards.innerHTML = cardData.map(([icon, label, value, penalty]) => {
        const color = penalty ? "#FF6B35" : scoreColor(label === "Risk Score" ? 100 - value : value);
        return `<div class="sc-card"><div class="l">${ic(icon)} ${label}</div><div class="v" style="color:${color}">${penalty ? "-" : ""}${value || 0}</div><div class="bar"><span style="width:${Math.max(0, Math.min(100, value || 0))}%;background:${color}"></span></div></div>`;
      }).join("");
    }
    const ring = $("#aivRing");
    if (ring) ring.innerHTML = AFRIBN.ring(aiv, { size: 104, stroke: 10, color: "#E8252D", label: "AIV" });
    const sub = $(".hero-score .ht .v");
    if (sub) sub.textContent = signalValue >= 75 ? "High-value strategic intelligence" : signalValue >= 50 ? "Strategic monitoring signal" : "Low-confidence monitoring item";
    const desc = $(".hero-score .ht .d");
    if (desc) desc.textContent = `${story.country || eventRecord?.country || "Africa"} · ${story.sector || eventRecord?.sector || "General"} · ${signal?.modelVersion || "rules pending"}`;
    const factorEl = $("#factors");
    if (factorEl) {
      const rows = Object.entries({
        "Impact magnitude": factors.impact,
        "Time sensitivity": factors.urgency,
        "Novelty": factors.novelty,
        "Country importance": factors.countryImportance,
        "Sector importance": factors.sectorImportance,
        "Cross-border effect": factors.crossBorderEffect,
        "Source credibility": factors.sourceCredibility
      }).filter(([, value]) => value !== undefined);
      factorEl.innerHTML = rows.length ? rows.map(([name, value]) => {
        const numeric = Math.round(Number(value) || 0);
        return `<div class="factor-slider"><div class="top"><span>${escapeHtml(name)}</span><b style="color:${scoreColor(numeric)}">${numeric}</b></div><div class="bar"><span style="display:block;width:${numeric}%;height:6px;border-radius:6px;background:${scoreColor(numeric)}"></span></div></div>`;
      }).join("") : `<div class="muted">No score factors yet. Use Recalculate to generate scoring records.</div>`;
    }
    const history = $("#history");
    if (history) {
      const rows = [
        signal && [`Signal ${Math.round(signal.score || 0)}`, `${signal.modelVersion || "rules"} · ${formatDate(signal.createdAt)}`],
        confidence && [`Confidence ${Math.round(confidence.score || 0)}`, `${confidence.modelVersion || "rules"} · ${formatDate(confidence.createdAt)}`],
        risk && [`Risk ${Math.round(risk.score || 0)}`, `${eventRecord?.country || story.country || "Africa"} · ${formatDate(risk.createdAt)}`]
      ].filter(Boolean);
      history.innerHTML = rows.map(([title, meta], index) => `<div class="tl-item"><span class="tl-dot ${index ? "muted" : ""}"></span><div class="tl-t">${escapeHtml(title)}</div><div class="tl-m">${escapeHtml(meta)}</div></div>`).join("") || `<div class="muted">No score history yet.</div>`;
    }
  }

  async function initGaps() {
    await ensureDemoData();
    let gaps = await API.get("/gap-reports");
    if (!gaps.length) {
      const story = await currentStory();
      const score = (await API.get("/scores")).signalScores.find((item) => item.storyId === story?.id);
      if (score) gaps = [await API.post("/gap-reports", { scoreId: score.id })];
    }
    const stories = await API.get("/stories");
    const storyById = Object.fromEntries(stories.map((story) => [story.id, story]));
    const list = $("#gapList");
    if (!list) return;
    list.innerHTML = gaps.map((gap) => {
      const story = storyById[gap.storyId] || {};
      return `<div class="gap-card">
        <div class="gap-head"><div><div class="lk">${ic("link2")} Linked to ${escapeHtml(story.id || gap.storyId)}</div><h3>${escapeHtml(story.title || "Gap report")}</h3></div>${pill(gap.priority || "medium", gap.priority === "high" ? "#FF6B35" : "#E3B341")}</div>
        <div class="gap-items">${(gap.missingItems || []).map((item) => `<div class="gi"><span class="ic" style="background:#E3B34122;color:#E3B341">${ic("alertTri")}</span><div><div class="l">Missing information</div><div class="v">${escapeHtml(item)}</div></div></div>`).join("")}</div>
        <div class="followups">${(gap.recommendedTasks || []).map((task) => `<div class="fu"><span class="q"></span>${escapeHtml(task)}</div>`).join("")}</div>
        <div class="gap-foot"><span class="due">${ic("calendar")} Open</span><button class="btn btn-primary btn-sm" data-task="${gap.id}">${ic("pin", 'width="15" height="15"')} Create Field Task</button></div>
      </div>`;
    }).join("");
    list.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-task]");
      if (!button) return;
      const task = await API.post(`/gap-reports/${button.dataset.task}/tasks`, {});
      remember("taskId", task.id);
      toast("Field task created", "ok");
      location.href = "tasks.html";
    });
  }

  async function initTasks() {
    await ensureDemoData();
    const tasks = await API.get("/field-tasks");
    const board = $("#kanban");
    if (!board) return;
    const cols = ["assigned", "in_progress", "submitted", "accepted", "rejected"];
    board.innerHTML = cols.map((col) => `<div class="kcol"><div class="kcol-h">${titleCase(col)}<span class="cnt">${tasks.filter((task) => task.status === col).length}</span></div>
      ${tasks.filter((task) => task.status === col).map((task) => `<div class="kcard" data-id="${task.id}">
        <div class="kt">${escapeHtml(task.instructions)}</div><div class="km">${escapeHtml(task.country || "Pan-African")} <span class="sep"></span> ${escapeHtml(task.taskType)}</div>
        <div class="kf"><span class="prio" style="background:#E3B34122;color:#E3B341">${escapeHtml(task.id)}</span><span class="muted" style="font-size:11px">Due ${formatDate(task.dueAt)}</span></div></div>`).join("") || '<div class="muted" style="font-size:12.5px;padding:8px 2px">No tasks</div>'}</div>`).join("");
    board.addEventListener("click", async (event) => {
      const card = event.target.closest(".kcard");
      if (!card) return;
      const task = tasks.find((item) => item.id === card.dataset.id);
      const report = await API.post(`/field-tasks/${task.id}/submit`, {
        findings: `Submitted from AFRIBN UI for ${task.instructions}`,
        evidenceSummary: "Evidence submitted through field task workspace."
      });
      remember("agentReportId", report.id);
      toast("Agent report submitted", "ok");
      location.href = "agentreports.html";
    });
  }

  async function initAgentReports() {
    await ensureDemoData();
    const reports = await API.get("/agent/reports");
    const body = $("#body") || $("tbody");
    if (!body) return;
    body.innerHTML = reports.map((report) => `<tr data-id="${report.id}"><td><b>${escapeHtml(report.id)}</b><div class="muted">${escapeHtml(report.findings)}</div></td><td>${escapeHtml(report.submittedBy)}</td><td>${escapeHtml(report.status)}</td><td>${report.confidenceDelta}</td><td><button data-send="${report.id}" class="btn btn-ghost btn-sm">${ic("send")} Send</button></td></tr>`).join("");
    body.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-send]");
      if (!button) return;
      await API.post(`/agent/reports/${button.dataset.send}/send-to-verification`, {});
      remember("agentReportId", button.dataset.send);
      toast("Sent to verification", "ok");
      location.href = "verification.html";
    });
  }

  async function initVerification() {
    await ensureDemoData();
    const reports = await API.get("/agent/reports");
    const stories = await API.get("/stories");
    const queue = $("#queue");
    const review = $("#review");
    if (!queue || !review) return;
    let selected = reports.find((report) => report.status !== "reviewed") || reports[0];
    function draw() {
      queue.innerHTML = reports.map((report) => {
        const story = stories.find((item) => item.id === report.storyId) || {};
        return `<div class="q-item ${selected?.id === report.id ? "active" : ""}" data-id="${report.id}"><div class="t">${escapeHtml(story.title || report.findings)}</div><div class="m">${escapeHtml(story.country || "")} · ${escapeHtml(report.id)} · ${escapeHtml(report.status)}</div></div>`;
      }).join("");
      $$(".q-item", queue).forEach((item) => item.onclick = () => { selected = reports.find((report) => report.id === item.dataset.id); draw(); });
      drawReview();
    }
    function drawReview() {
      if (!selected) {
        review.innerHTML = `<div class="empty">No reports to verify.</div>`;
        return;
      }
      const story = stories.find((item) => item.id === selected.storyId) || {};
      review.innerHTML = `<div class="row gap-8" style="margin-bottom:12px">${pill("In Review", "#E3B341")}<span class="muted" style="font-size:13px;margin-left:auto">${escapeHtml(selected.id)}</span></div>
        <h2 style="font-size:24px;font-weight:800;line-height:1.15;margin-bottom:18px">${escapeHtml(story.title || selected.findings)}</h2>
        <div class="rev-sec"><div class="eyebrow">Agent Findings</div><p style="color:var(--ink-2);line-height:1.6">${escapeHtml(selected.findings)}</p></div>
        <div class="rev-sec"><div class="eyebrow">Evidence Summary</div><p style="color:var(--ink-2);line-height:1.6">${escapeHtml(selected.evidenceSummary)}</p></div>
        <div class="action-bar">
          <button class="btn btn-primary" id="apiPublish">${ic("send", 'width="16" height="16"')} Approve & Publish</button>
          <button class="btn btn-ghost" id="apiApprove">${ic("check", 'width="16" height="16"')} Approve</button>
          <button class="btn btn-ghost" id="apiClarify">${ic("message", 'width="16" height="16"')} Request Clarification</button>
          <button class="btn btn-ghost" id="apiReject" style="color:#ff7378;margin-left:auto">${ic("x", 'width="16" height="16"')} Reject</button>
        </div>`;
      $("#apiApprove").onclick = () => reviewReport("approved", false);
      $("#apiPublish").onclick = () => reviewReport("approved", true);
      $("#apiReject").onclick = () => reviewReport("rejected", false);
      $("#apiClarify").onclick = () => reviewReport("more_info", false);
    }
    async function reviewReport(decision, publish) {
      const reviewRecord = await API.post(`/verification/${selected.id}/review`, { decision, notes: "Reviewed in AFRIBN UI" });
      if (publish && decision === "approved") await API.post(`/verification/${reviewRecord.id}/publish`, {});
      toast(publish ? "Published intelligence" : "Review saved", publish || decision === "approved" ? "ok" : "warn");
      location.href = publish ? "published.html" : "verification.html";
    }
    draw();
  }

  async function initPublished() {
    await ensureDemoData();
    const items = await API.get("/published-intelligence");
    const grid = $("#grid");
    if (!grid) return;
    grid.innerHTML = items.map((item) => `<div class="pub-card" data-id="${item.id}">
      <div class="ph"><span class="pill">${escapeHtml(item.sector || item.eventType)}</span><div style="text-align:right"><div class="aiv" style="color:#E8252D">${item.signalScore || "-"}</div><div class="muted" style="font-size:10px">Signal</div></div></div>
      <h3>${escapeHtml(item.title)}</h3><div class="pm">${escapeHtml(item.country)} · ${formatDate(item.publishedAt)} · ${escapeHtml(item.status)}</div>
      <div class="aud-chips">${(item.audience || []).map((audience) => `<span class="aud-chip">${escapeHtml(audience)}</span>`).join("")}</div></div>`).join("");
    grid.addEventListener("click", async (event) => {
      const card = event.target.closest(".pub-card");
      if (!card) return;
      await API.post(`/published-intelligence/${card.dataset.id}/unpublish`, {});
      toast("Published item unpublished", "warn");
      location.reload();
    });
  }

  async function initFeed() {
    await ensureDemoData();
    const feed = await API.get("/feed");
    const list = $(".feed-list") || $("#feedList") || $(".panel");
    if (!list) return;
    if (!feed.length || !$("#feed")) return;
    list.innerHTML = feed.map((item) => feedItemMarkup(item)).join("");
  }

  function feedItemMarkup(item = {}) {
    const category = item.sector || item.eventType || "Intelligence";
    const meta = feedCategoryMeta(category);
    const highImpact = Number(item.signalScore || 0) >= 75 || String(item.impact || "").toLowerCase() === "high";
    return `<article class="feed-item">
      <span class="impact" style="background:${meta.color}"></span>
      <span class="ftile" style="background:${meta.color}22;color:${meta.color}">${ic(meta.icon)}</span>
      <div class="body">
        <div class="ttl">${escapeHtml(item.title)} ${highImpact ? '<span class="pill high-impact">High Impact</span>' : ""}</div>
        <div class="desc">${escapeHtml(item.summary || item.description || "")}</div>
        <div class="meta">${window.AFRIBN.flag(flagKey(item.country))} ${escapeHtml(item.country || "Pan-African")} <span class="sep"></span> ${escapeHtml(category)} <span class="sep"></span> ${escapeHtml(item.sourceName || item.originalSourceName || "AFRIBN")}</div>
      </div>
      <div class="right">
        <span class="tm">${formatDate(item.publishedAt || item.createdAt)}</span>
        <span class="pill ${meta.pill}">${escapeHtml(category)}</span>
        <span class="more">${ic("more", 'width="18" height="18"')}</span>
      </div>
    </article>`;
  }

  function feedCategoryMeta(category = "") {
    const lower = category.toLowerCase();
    if (lower.includes("politic") || lower.includes("policy")) return { icon: "file", color: "#E5484D", pill: "politics" };
    if (lower.includes("energy")) return { icon: "barChart", color: "#F0883E", pill: "energy" };
    if (lower.includes("security") || lower.includes("risk")) return { icon: "shield", color: "#A371F7", pill: "security" };
    if (lower.includes("trade") || lower.includes("deal")) return { icon: "handshake", color: "#4493F8", pill: "trade" };
    if (lower.includes("econom") || lower.includes("finance")) return { icon: "bank", color: "#3FB950", pill: "economy" };
    return { icon: "file", color: "#8B949E", pill: "industry" };
  }

  function flagKey(country = "") {
    const key = String(country).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
    return {
      "drc": "drc",
      "drcongo": "drc",
      "democraticrepublicofcongo": "drc",
      "southafrica": "southafrica",
      "panAfrican": "regional",
      "panafrican": "regional",
      "cotedivoire": "cotedivoire",
      "ivorycoast": "cotedivoire"
    }[key] || key || "regional";
  }

  async function initHome() {
    await ensureDemoData();
    const dashboard = await API.get("/dashboard");
    updateTextByLabel("Total Stories", dashboard.totalStories);
    updateTextByLabel("Policy Changes", dashboard.policyChanges);
    updateTextByLabel("Deals Tracked", dashboard.dealsTracked);
    updateTextByLabel("Events Tracked", dashboard.eventsTracked);
  }

  async function initDashboards() {
    await initHome();
  }

  async function initCountryBrief() {
    const role = localStorage.getItem("afribn_role") || "admin";
    const markets = await API.get("/strategic-markets").catch(() => []);
    const label = $("#countryProductLabel");
    if (label && role === "client") label.textContent = "Country Brief";
    if (document.title && role === "client") document.title = "AFRIBN - Country Brief";
    const dropdown = $("#cdrop");
    const countryName = $("#cname")?.textContent?.trim() || "Nigeria";
    let selected = markets.find((market) => market.name === countryName) || markets[0] || { name: countryName, flag: "nigeria" };

    if (dropdown && markets.length) {
      dropdown.innerHTML = markets.map((market) => `<div class="ci-opt" data-c="${escapeAttr(market.name)}">${window.AFRIBN.flag(market.flag)} ${escapeHtml(market.name)}</div>`).join("");
      $$(".ci-opt", dropdown).forEach((item) => item.addEventListener("click", async (event) => {
        event.stopPropagation();
        selected = markets.find((market) => market.name === item.dataset.c) || selected;
        dropdown.classList.remove("open");
        await renderBrief(selected);
      }));
    }

    async function renderBrief(market) {
      const brief = await API.get(`/country-briefs/${encodeURIComponent(market.name)}`);
      $("#cname") && ($("#cname").textContent = market.name);
      const flag = $("#flagLg");
      if (flag) {
        const tmp = document.createElement("div");
        tmp.innerHTML = window.AFRIBN.flag(market.flag || brief.strategicMarket?.flag || "regional");
        const svg = tmp.querySelector("svg");
        flag.src = svg ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" preserveAspectRatio="xMidYMid slice">${svg.innerHTML}</svg>`)}` : "";
      }
      const download = $("#downloadBrief");
      if (download) download.href = `/country-briefs/${encodeURIComponent(market.name)}/download`;
      renderBriefMetrics(brief);
      renderBriefStories(brief);
      renderBriefIndicators(brief);
      renderBriefProjects(brief);
    }

    await renderBrief(selected);
  }

  function renderBriefMetrics(brief) {
    const metrics = $("#metrics");
    if (!metrics) return;
    const risk = brief.summary?.riskLevel || "unknown";
    metrics.innerHTML = [
      ["Published Intelligence", brief.summary?.publishedCount || 0, "Verified items"],
      ["Policy Signals", brief.summary?.policyCount || 0, "Government developments"],
      ["Investment Activity", brief.summary?.dealCount || 0, "Tracked deals/projects"],
      ["Risk Rating", titleCase(risk), "Quarterly outlook"]
    ].map(([label, value, sub], index) => `<div class="metric">
      <span class="ml">${escapeHtml(label)}</span>
      <div class="mv ${index === 3 ? `risk-${String(risk).toLowerCase()}` : ""}">${escapeHtml(value)}</div>
      <div class="md muted" style="color:var(--ink-3)">${escapeHtml(sub)}</div>
      <div class="spk">${window.AFRIBN.spark([20 + index * 4, 28, 25 + index * 3, 34, 38, 42], { w: 150, h: 34, color: "#E8252D", sw: 1.6 })}</div>
    </div>`).join("");
  }

  function renderBriefStories(brief) {
    const list = $("#cistories");
    if (!list) return;
    const rows = brief.keyDevelopments?.length ? brief.keyDevelopments : [];
    list.innerHTML = rows.map((item) => `<a class="ci-story" href="story.html?storyId=${encodeURIComponent(item.storyId || item.id)}">
      <img class="img" src="${window.AFRIBN.scene(item.sector || "city", 150, 120)}" alt="">
      <div class="grow"><div class="cat" style="color:#E8252D">${escapeHtml(item.sector || item.eventType || "INTELLIGENCE")}</div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.summary || "")}</p></div>
      <div class="score"><div class="sl">Signal Score</div><div class="sv">${item.signalScore || "-"}</div><div class="st">${formatDate(item.publishedAt || item.createdAt)}</div></div>
    </a>`).join("") || `<div class="empty">${ic("globe")}<div>No published intelligence yet for ${escapeHtml(brief.country)}.</div></div>`;
  }

  function renderBriefIndicators(brief) {
    const indicators = $("#indicators");
    if (!indicators) return;
    const rows = [
      ["Risk Level", titleCase(brief.summary?.riskLevel || "unknown")],
      ["Published Items", brief.summary?.publishedCount || 0],
      ["Policy Developments", brief.summary?.policyCount || 0],
      ["Investment Activity", brief.summary?.dealCount || 0]
    ];
    indicators.innerHTML = rows.map(([label, value]) => `<div class="ind-row"><span class="muted-2 lbl0">${escapeHtml(label)}</span><span class="iv">${escapeHtml(value)}</span></div>`).join("");
  }

  function renderBriefProjects(brief) {
    const projects = $("#projects");
    if (!projects) return;
    const rows = brief.investments || [];
    projects.innerHTML = rows.slice(0, 4).map((item) => `<div class="proj-row"><span class="pi">${ic("deal")}</span><span class="pn">${escapeHtml(item.title)}</span><span class="pv">${escapeHtml(item.value || "")}</span></div>`).join("") || `<div class="muted" style="padding:12px 0">No major projects currently tracked.</div>`;
  }

  async function initEventTracker() {
    await ensureDemoData();
    const role = localStorage.getItem("afribn_role") || "admin";
    const isAdmin = role === "admin";
    if (role === "client") {
      const title = document.querySelector(".page-title");
      if (title) title.childNodes.forEach((node) => { if (node.nodeType === Node.TEXT_NODE) node.textContent = " Event Monitor"; });
      const sub = document.querySelector(".page-sub");
      if (sub) sub.textContent = "Strategic event monitoring across AFRIBN's priority markets.";
      document.title = "AFRIBN - Event Monitor";
    }
    const elements = {
      stats: $("#stats"),
      timeline: $("#timeline"),
      upcoming: $("#upcoming"),
      typeDonut: $("#typeDonut"),
      typeLegend: $("#typeLegend"),
      topCountries: $("#topCountries"),
      approvalPanel: $("#approvalPanel"),
      approvalList: $("#approvalList"),
      pendingCount: $("#pendingCount")
    };
    if (!elements.timeline) return;

    let events = await API.get("/events");
    let mode = "active";

    const modal = $("#eventModal");
    const modalBack = $("#eventModalBack");
    const openModal = () => {
      modalBack?.classList.add("open");
      modal?.classList.add("open");
    };
    const closeModal = () => {
      modalBack?.classList.remove("open");
      modal?.classList.remove("open");
      $("#eventForm")?.reset();
    };
    $("#addEventBtn")?.addEventListener("click", openModal);
    $("#eventModalClose")?.addEventListener("click", closeModal);
    $("#eventCancel")?.addEventListener("click", closeModal);
    modalBack?.addEventListener("click", closeModal);
    $("#pastBtn")?.addEventListener("click", () => {
      mode = mode === "past" ? "active" : "past";
      $("#pastBtn").innerHTML = `${ic(mode === "past" ? "calendar" : "history", 'width="16" height="16"')} ${mode === "past" ? "Show Active Events" : "Explore Past Events"}`;
      render();
    });

    $("#eventForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const record = await API.post("/events/manual", {
        title: $("#evTitle").value.trim(),
        description: $("#evDescription").value.trim(),
        country: $("#evCountry").value.trim(),
        sector: $("#evSector").value,
        eventType: $("#evType").value,
        format: $("#evFormat").value,
        accessType: $("#evFormat").value,
        startsAt: toIso($("#evStarts").value),
        endsAt: toIso($("#evEnds").value),
        organizer: $("#evOrganizer").value.trim(),
        venue: $("#evVenue").value.trim(),
        address: $("#evAddress").value.trim(),
        accessLink: $("#evLink").value.trim(),
        speakers: lines($("#evSpeakers").value),
        keyDocuments: lines($("#evDocs").value).map(parseDocumentLine),
        impact: "medium"
      });
      toast(record.approvalStatus === "approved" ? "Event added" : "Event submitted for admin approval", "ok");
      closeModal();
      events = await API.get("/events");
      render();
    }, true);

    ["#kw", "#fType", "#fCountry", "#fStatus"].forEach((selector) => {
      $(selector)?.addEventListener(selector === "#kw" ? "input" : "change", render);
    });

    elements.approvalList?.addEventListener("click", async (event) => {
      const approve = event.target.closest("[data-approve]");
      const reject = event.target.closest("[data-reject]");
      if (!approve && !reject) return;
      const id = approve?.dataset.approve || reject?.dataset.reject;
      if (approve) await API.post(`/events/${id}/approve`, {});
      if (reject) await API.post(`/events/${id}/reject`, { reason: "Rejected in Event Tracker" });
      toast(approve ? "Event approved" : "Event rejected", approve ? "ok" : "warn");
      events = await API.get("/events");
      render();
    });

    function render() {
      const now = Date.now();
      const kw = ($("#kw")?.value || "").toLowerCase();
      const type = $("#fType")?.value || "All Event Types";
      const country = $("#fCountry")?.value || "All Countries";
      const status = $("#fStatus")?.value || "All Statuses";
      const approved = events.filter((item) => eventApproval(item) === "approved" || isAdmin);
      const visible = approved.filter((item) => {
        const time = new Date(item.startsAt || item.occurredAt || item.createdAt).getTime();
        const isPast = Number.isFinite(time) && time < now;
        const eventStatus = eventStatusLabel(item);
        return (mode === "past" ? isPast : !isPast || eventStatus === "Live now")
          && (!kw || `${item.title} ${item.description} ${item.country} ${item.sector}`.toLowerCase().includes(kw))
          && (type === "All Event Types" || item.eventType === type || item.sector === type)
          && (country === "All Countries" || item.country === country)
          && (status === "All Statuses" || eventStatus === status);
      }).sort((a, b) => new Date(a.startsAt || a.occurredAt || a.createdAt) - new Date(b.startsAt || b.occurredAt || b.createdAt));

      renderStats(approved);
      renderTimeline(visible);
      renderSidebar(approved);
      renderApprovals();
    }

    function renderStats(rows) {
      const now = Date.now();
      const upcoming = rows.filter((item) => new Date(item.startsAt || item.occurredAt || item.createdAt).getTime() >= now).length;
      const high = rows.filter((item) => (item.impact || "").toLowerCase() === "high" || Number(item.signalScore || 0) >= 75).length;
      const countries = new Set(rows.map((item) => item.country).filter(Boolean)).size;
      elements.stats.innerHTML = [
        ["calendar", "#E8252D", rows.length, "Events Tracked", "+ live"],
        ["flame", "#FF6B35", high, "High Impact", "priority"],
        ["clock", "#E3B341", upcoming, "Upcoming", "scheduled"],
        ["globe", "#3FB950", countries, "Countries Active", "coverage"]
      ].map(([icon, color, value, label, delta]) => `<div class="stat"><div class="top"><div class="ic" style="background:${color}22;color:${color}">${ic(icon)}</div></div><div class="num">${value}</div><div class="lbl">${label}</div><div class="delta up" style="font-size:12.5px;white-space:nowrap">${escapeHtml(delta)}</div></div>`).join("");
    }

    function renderTimeline(rows) {
      const grouped = groupByDay(rows);
      elements.timeline.innerHTML = Object.entries(grouped).map(([day, items]) => `<div class="day-group">
        <div class="day-label"><span class="d">${escapeHtml(day)}</span><span class="line"></span><span class="c">${items.length} events</span></div>
        ${items.map(eventCard).join("")}
      </div>`).join("") || `<div class="empty">${ic("calendar")}<div>No events match your filters.</div></div>`;
      $$(".ev-card", elements.timeline).forEach((card) => card.addEventListener("click", () => {
        location.href = `event-detail.html?eventId=${encodeURIComponent(card.dataset.id)}`;
      }));
    }

    function renderSidebar(rows) {
      const now = Date.now();
      const upcoming = rows.filter((item) => new Date(item.startsAt || item.occurredAt || item.createdAt).getTime() >= now).sort((a, b) => new Date(a.startsAt || a.createdAt) - new Date(b.startsAt || b.createdAt)).slice(0, 5);
      elements.upcoming.innerHTML = upcoming.map((item) => {
        const date = new Date(item.startsAt || item.occurredAt || item.createdAt);
        return `<div class="upcoming-li" data-id="${item.id}"><div class="dd"><div class="day">${date.getDate()}</div><div class="mo">${date.toLocaleString([], { month: "short" })}</div></div><div><div class="t">${escapeHtml(item.title)}</div><div class="s">${escapeHtml(item.venue || item.country || "")}</div></div></div>`;
      }).join("") || `<div class="muted" style="font-size:13px;margin-top:10px">No upcoming approved events.</div>`;
      const byType = counts(rows, (item) => item.sector || item.eventType || "Other");
      const palette = ["#E8252D", "#3FB950", "#A371F7", "#FF8A3D", "#4493F8", "#8B949E"];
      const typeRows = Object.entries(byType).slice(0, 6).map(([label, value], index) => [label, palette[index % palette.length], value]);
      elements.typeDonut.innerHTML = window.AFRIBN.donut(typeRows.map((row) => ({ value: row[2], color: row[1] })), { size: 118, thick: 18 });
      elements.typeLegend.innerHTML = typeRows.map(([label, color, value]) => `<div class="legend-li" style="display:flex;align-items:center;gap:10px;padding:7px 0;font-size:13.5px"><span class="cdot" style="background:${color}"></span><span style="color:var(--ink-2)">${escapeHtml(label)}</span><span style="margin-left:auto;font-weight:600">${value}</span></div>`).join("");
      const byCountry = Object.entries(counts(rows, (item) => item.country || "Pan-African")).slice(0, 5);
      const max = Math.max(1, ...byCountry.map(([, value]) => value));
      elements.topCountries.innerHTML = byCountry.map(([label, value]) => `<div class="rank-li"><span class="nm">${escapeHtml(label)}</span><span class="bar"><span style="width:${value / max * 100}%;background:#E8252D"></span></span><span class="vl">${value}</span></div>`).join("");
    }

    function renderApprovals() {
      const pending = events.filter((item) => eventApproval(item) === "pending_review");
      elements.approvalPanel?.classList.toggle("show", isAdmin && pending.length > 0);
      if (!isAdmin || !elements.approvalList) return;
      elements.pendingCount.textContent = `${pending.length} pending`;
      elements.approvalList.innerHTML = pending.map((item) => `<article class="approval-item">
        <div><h4>${escapeHtml(item.title)}</h4><div class="m">${escapeHtml(item.country)} · ${escapeHtml(item.sector)} · Submitted by ${escapeHtml(item.submittedBy?.name || item.submittedBy?.email || "team user")} · ${formatDate(item.submittedAt || item.createdAt)}</div></div>
        <div class="approval-actions"><button class="btn btn-ghost btn-sm" data-reject="${item.id}">${ic("x", 'width="14" height="14"')} Reject</button><button class="btn btn-primary btn-sm" data-approve="${item.id}">${ic("check", 'width="14" height="14"')} Approve</button></div>
      </article>`).join("");
    }

    render();
  }

  async function initEventDetail() {
    await ensureDemoData();
    const id = new URLSearchParams(location.search).get("eventId");
    const event = id ? await API.get(`/events/${id}`) : (await API.get("/events"))[0];
    if (!event) return;
    const root = $("#eventDetail");
    if (!root) return;
    const status = eventStatusLabel(event);
    const approval = eventApproval(event);
    root.innerHTML = `<div class="story-top">
      <a class="back" href="event.html">${ic("arrowLeft")} Back to Event Tracker</a>
      <div class="act-row"><button class="icon-btn" title="Save">${ic("bookmark")}</button><button class="icon-btn" title="Share">${ic("share")}</button><button class="icon-btn" title="Copy link">${ic("link")}</button></div>
    </div>
    <div class="tag-row"><span class="pill">${escapeHtml(event.sector || event.eventType)}</span><span class="pill region">${escapeHtml(event.country || "Pan-African")}</span><span class="spill" style="background:${approval === "approved" ? "#3FB950" : "#E3B341"}22;color:${approval === "approved" ? "#3FB950" : "#E3B341"}"><span class="spill-dot" style="background:currentColor"></span>${escapeHtml(titleCase(approval))}</span><span class="when">${formatEventWindow(event)}</span></div>
    <h1 class="headline">${escapeHtml(event.title)}</h1>
    <div class="story-grid">
      <div>
        <div class="sect-label">What The Event Is About</div>
        <p class="lead-p">${escapeHtml(event.summary || event.description || "")}</p>
        <div class="card-red"><div class="sect-label">Speakers</div><div class="detail-list">${listItems(event.speakers, "user")}</div></div>
        <div class="card-red"><div class="sect-label">Key Documents</div><div class="detail-list">${documentItems(event.keyDocuments)}</div></div>
        <div class="card-red"><div class="sect-label">Access</div><div class="access-grid">
          <div class="kv"><span class="k">Format</span><span class="v">${escapeHtml(formatLabel(event.format || event.accessType))}</span></div>
          <div class="kv"><span class="k">Status</span><span class="v">${escapeHtml(status)}</span></div>
          <div class="kv"><span class="k">Organizer</span><span class="v">${escapeHtml(event.organizer || "-")}</span></div>
          <div class="kv"><span class="k">Venue</span><span class="v">${escapeHtml(event.venue || "-")}</span></div>
          <div class="kv full"><span class="k">Address</span><span class="v">${escapeHtml(event.address || "-")}</span></div>
          <div class="kv full"><span class="k">Access Link</span><span class="v">${event.accessLink ? `<a href="${escapeAttr(event.accessLink)}" target="_blank">${escapeHtml(event.accessLink)}</a>` : "-"}</span></div>
        </div></div>
        <div class="card-red"><div class="sect-label">Strategic Relevance</div><p class="lead-p" style="font-size:15.5px">${escapeHtml(strategicRelevance(event))}</p></div>
        <div class="card-red"><div class="sect-label">Supporting Intelligence</div><div class="detail-list">${documentItems(event.supportingIntelligence || event.keyDocuments)}</div></div>
      </div>
      <div class="stack gap-20">
        <div class="panel" style="border-color:rgba(232,37,45,0.22)"><div class="sect-label">Event Summary</div>
          <div class="impact-row"><span class="lbl">Country</span><b>${escapeHtml(event.country || "-")}</b></div>
          <div class="impact-row"><span class="lbl">Sector</span><b>${escapeHtml(event.sector || "-")}</b></div>
          <div class="impact-row"><span class="lbl">Type</span><b>${escapeHtml(event.eventType || "-")}</b></div>
          <div class="impact-row"><span class="lbl">Submitted by</span><b>${escapeHtml(event.submittedBy?.name || "AFRIBN")}</b></div>
        </div>
        <div class="panel" style="border-color:rgba(232,37,45,0.22)"><div class="sect-label">Intelligence Notes</div>
          <div class="leader-li"><span class="li-ic">${ic("calendar")}</span><span class="tx">${escapeHtml(formatEventWindow(event))}</span></div>
          <div class="leader-li"><span class="li-ic">${ic(event.format === "live" ? "feed" : "pin")}</span><span class="tx">${escapeHtml(event.format === "live" ? "Live access available via event link." : "In-person attendance requires address and venue confirmation.")}</span></div>
          <div class="leader-li"><span class="li-ic">${ic("file")}</span><span class="tx">${(event.keyDocuments || []).length} document(s) linked to this event.</span></div>
        </div>
      </div>
    </div>`;
  }

  async function initAlerts() {
    await ensureDemoData();
    const alerts = await API.get("/alerts");
    const body = $("#body") || $("tbody");
    if (body) body.innerHTML = alerts.map((alert) => `<tr><td><b>${escapeHtml(alert.title)}</b><div class="muted">${escapeHtml(alert.country || "")} · ${escapeHtml(alert.sector || "")}</div></td><td>${pill(alert.priority || "medium", alert.priority === "high" ? "#E8252D" : "#E3B341")}</td><td>${escapeHtml(alert.status)}</td><td>${formatDate(alert.triggeredAt)}</td><td><button class="btn btn-ghost btn-sm" data-ack="${alert.id}">Acknowledge</button></td></tr>`).join("");
    body?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-ack]");
      if (!button) return;
      await API.patch(`/alerts/${button.dataset.ack}/acknowledge`, {});
      toast("Alert acknowledged", "ok");
      location.reload();
    });
    const markets = await API.get("/strategic-markets").catch(() => []);
    const country = $("#alertCountry");
    if (country && markets.length) {
      country.innerHTML = `<option value="">Any Strategic Market</option>` + markets.map((market) => `<option>${escapeHtml(market.name)}</option>`).join("");
    }
    $("#mSave")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const channels = $$(".alert-channel:checked").map((item) => item.value);
      await API.post("/alerts/rules", {
        name: $("#alertName")?.value || "Strategic market alert",
        keyword: $("#alertKeyword")?.value || "",
        topic: $("#alertTopic")?.value || "",
        country: $("#alertCountry")?.value || "",
        category: $("#alertCategory")?.value || "",
        minimumConfidenceScore: Number($("#alertConfidence")?.value || 60),
        minimumSignalScore: Number($("#alertSignal")?.value || 70),
        riskChange: $("#alertRiskChange")?.value || "",
        frequency: $("#alertFrequency")?.value || "real_time",
        channels: channels.length ? channels : ["in_app"]
      });
      $("#modalBack")?.classList.remove("open");
      toast("Alert rule created", "ok");
    }, true);
  }

  async function initWatchlist() {
    await ensureDemoData();
    const watchlists = await API.get("/watchlists");
    const grid = $("#grid");
    if (!grid) return;
    const items = watchlists.flatMap((watchlist) => watchlist.items || []);
    grid.innerHTML = items.map((item) => `<div class="wl-card"><div class="wl-top"><h3>${escapeHtml(item.itemName)}</h3>${pill(item.riskLevel || "medium", item.riskLevel === "high" ? "#E8252D" : "#E3B341")}</div><div class="muted">${escapeHtml(item.itemType)} · ${escapeHtml(item.category)}</div></div>`).join("") || grid.innerHTML;
  }

  async function initReports() {
    await ensureDemoData();
    const reports = await API.get("/reports");
    const body = $("#reportBody") || $("tbody");
    if (body) body.innerHTML = reports.map((report) => `<tr><td>${escapeHtml(report.title)}</td><td>${escapeHtml(report.category || "Intelligence")}</td><td>${formatDate(report.createdAt)}</td><td><a class="btn btn-ghost btn-sm" href="/reports/${report.id}/download" target="_blank">${ic("download")} PDF</a></td></tr>`).join("") || body.innerHTML;
  }

  async function ensureDemoData() {
    const raw = await API.get("/raw-articles").catch(() => []);
    if (raw.length) return;
    const sources = await API.get("/sources").catch(() => []);
    if (!sources.length) return;
    await API.post("/pipeline/demo-run", {
      sourceId: sources[0].id,
      rawArticle: {
        title: "Kenya signs $2.1bn renewable energy agreement with UAE consortium",
        body: "Kenya signed a $2.1 billion renewable energy agreement. The project affects energy security, investment flows, and regional partnerships."
      }
    }).catch(() => null);
  }

  async function currentStory() {
    const id = new URLSearchParams(location.search).get("storyId") || localStorage.getItem("afribn_storyId");
    if (id) return API.get(`/stories/${id}`).catch(() => null);
    const stories = await API.get("/stories");
    const story = stories.at(-1);
    if (story) remember("storyId", story.id);
    return story;
  }

  function storyPayloadFromForm(status) {
    return {
      title: $("#f_head")?.value || "",
      summary: $("#f_sum")?.value || "",
      whatHappened: $("#f_what")?.value || "",
      whyItMatters: $("#f_why")?.value || "",
      potentialConsequences: $("#f_cons")?.value || "",
      watchNext: $("#f_watch")?.value || "",
      internalNotes: $("#f_notes")?.value || "",
      status
    };
  }

  function renderSourceStats(sources, summaries) {
    const active = sources.filter((source) => source.status !== "inactive").length;
    const blacklisted = sources.filter((source) => source.status === "blacklisted").length;
    const scores = Object.values(summaries).map((summary) => summary?.reliability?.adjustedReliabilityScore).filter(Number.isFinite);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const stats = $("#stats");
    if (!stats) return;
    stats.innerHTML = [
      ["database", "#E8252D", sources.length, "Total Sources"],
      ["checkCircle", "#3FB950", active, "Active"],
      ["target", "#E3B341", avg || "-", "Avg Reliability"],
      ["alertTri", "#FF6B35", Object.values(summaries).filter((s) => s?.collection?.decision?.includes("PROBATION")).length, "On Probation"],
      ["ban", "#A371F7", blacklisted, "Blacklisted"]
    ].map(([icon, color, value, label]) => `<div class="stat"><div class="top"><div class="ic" style="background:${color}22;color:${color}">${ic(icon)}</div></div><div class="num">${value}</div><div class="lbl">${label}</div></div>`).join("");
  }

  function renderSourceRows(sources, summaries) {
    const body = $("#srcBody");
    if (!body) return;
    body.innerHTML = sources.map((source) => {
      const summary = summaries[source.id] || {};
      const score = Math.round(summary.reliability?.adjustedReliabilityScore || source.reliability || 0);
      const decision = decisionText(summary.collection?.decision || source.status || "normal");
      return `<tr data-id="${source.id}">
        <td><div class="src-cell"><span class="si2">${ic(source.provider ? "server2" : "globe")}</span><div><div class="nm">${escapeHtml(source.name)}</div><div class="u">${escapeHtml(source.url)}</div></div></div></td>
        <td><span class="pill">${escapeHtml(source.provider || source.type || "Website")}</span></td>
        <td class="muted-2">${escapeHtml(source.country || "Pan-African")} · ${escapeHtml(source.topic || source.sector || "General")}</td>
        <td><span class="relscore" style="color:${scoreColor(score)}">${score || "-"}</span></td>
        <td>${pill(decision, decisionColor(decision))}</td>
        <td class="muted-2">${formatDate(source.lastScrapedAt)}</td>
        <td class="tabnum">-</td><td>${pill(source.status || "active", source.status === "inactive" ? "#8B949E" : "#3FB950")}</td>
        <td><div class="row-act"><button data-a="run">${ic("refresh")}</button><button data-a="rel">${ic("target")}</button><button data-a="black">${ic("ban")}</button></div></td></tr>`;
    }).join("");
    body.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-a]");
      if (!button) return;
      event.stopPropagation();
      const id = event.target.closest("tr").dataset.id;
      if (button.dataset.a === "run") {
        await API.post("/workers/scrape", { sourceId: id, limit: 5 });
        toast("Scrape completed", "ok");
      }
      if (button.dataset.a === "rel") location.href = `reliability.html?sourceId=${encodeURIComponent(id)}`;
      if (button.dataset.a === "black") {
        await API.post(`/source-reliability/${id}/blacklist`, { reason: "Manual UI action" });
        toast("Source blacklisted", "warn");
      }
    });
  }

  function sourceRank(record, sources) {
    const source = sources.find((item) => item.id === record.sourceId) || {};
    const score = Math.round(record.collectionPriorityScore || record.adjustedReliabilityScore || source.reliability || 0);
    return `<div class="mini-rank"><div class="nm">${escapeHtml(source.name || record.sourceId)}<small>${escapeHtml(source.country || record.decision || "")}</small></div><span class="sc" style="color:${scoreColor(score)}">${score || "-"}</span></div>`;
  }

  function addProviderFields() {
    if ($("#m_provider")) return;
    const typeField = $("#m_type")?.closest(".field");
    if (!typeField) return;
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.innerHTML = `<label>API Provider</label><select id="m_provider"><option value="">Direct/RSS/Website</option><option value="gdelt">GDELT</option><option value="newsapi">NewsAPI</option><option value="newsdata">NewsData.io</option><option value="worldnews">World News API</option></select>`;
    typeField.after(wrapper);
  }

  function updateTextByLabel(label, value) {
    [...document.querySelectorAll(".lbl")].forEach((node) => {
      if (node.textContent.trim() === label) {
        const num = node.parentElement?.querySelector(".num");
        if (num) num.textContent = value;
      }
    });
  }

  function remember(key, value) {
    localStorage.setItem(`afribn_${key}`, value);
  }

  function roleFromUser(user = {}) {
    const name = String(user.role?.name || "").toLowerCase();
    if (name.includes("admin")) return "admin";
    if (name.includes("agent")) return "agent";
    if (name.includes("verification")) return "verifier";
    if (name.includes("client")) return "client";
    return "analyst";
  }

  function landingForRole(role) {
    return role === "agent" ? "tasks.html" : role === "verifier" ? "verification.html" : role === "analyst" ? "raw.html" : "home.html";
  }

  function requiresAuth(page) {
    const publicPages = new Set([
      "index.html", "login.html", "signup.html", "request-access.html", "pricing.html", "about.html",
      "product.html", "solutions.html", "resources.html", "contact.html", "careers.html", "press.html",
      "privacy.html", "terms.html", "security.html", "help.html", "api.html", "methodology.html",
      "sample-reports.html", "checkout.html"
    ]);
    return !publicPages.has(page);
  }

  function normalizeLanguage(value = "English") {
    return { English: "en", French: "fr", Arabic: "ar", Portuguese: "pt", Swahili: "sw" }[value] || value || "en";
  }

  function decisionText(value = "") {
    return String(value).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function decisionColor(value = "") {
    const lower = value.toLowerCase();
    if (lower.includes("white") || lower.includes("full")) return "#3FB950";
    if (lower.includes("black") || lower.includes("suppress")) return "#E5252A";
    if (lower.includes("probation")) return "#FF6B35";
    if (lower.includes("partial")) return "#E3B341";
    return "#4493F8";
  }

  function colorForStatus(value = "") {
    const lower = value.toLowerCase();
    if (lower.includes("complete") || lower.includes("published") || lower.includes("active")) return "#3FB950";
    if (lower.includes("fail") || lower.includes("reject") || lower.includes("black")) return "#E5252A";
    if (lower.includes("run") || lower.includes("progress")) return "#E3B341";
    return "#8B949E";
  }

  function scoreColor(value) {
    return value >= 85 ? "#3FB950" : value >= 70 ? "#a3d44a" : value >= 55 ? "#E3B341" : value >= 40 ? "#FF6B35" : "#E5252A";
  }

  function statusText(value = "") {
    return titleCase(value || "unknown");
  }

  function eventApproval(item) {
    return item.approvalStatus || (item.status === "pending_review" ? "pending_review" : item.status === "rejected" ? "rejected" : "approved");
  }

  function eventStatusLabel(item) {
    const now = Date.now();
    const start = new Date(item.startsAt || item.occurredAt || item.createdAt).getTime();
    const end = item.endsAt ? new Date(item.endsAt).getTime() : start + 3 * 60 * 60 * 1000;
    if (eventApproval(item) === "pending_review") return "Pending Review";
    if (eventApproval(item) === "rejected") return "Rejected";
    if (Number.isFinite(start) && Number.isFinite(end) && start <= now && end >= now) return "Live now";
    if (Number.isFinite(start) && start > now) return "Upcoming";
    return "Completed";
  }

  function eventCard(item) {
    const status = eventStatusLabel(item);
    const date = new Date(item.startsAt || item.occurredAt || item.createdAt);
    const type = item.sector || item.eventType || "Event";
    const color = status === "Live now" ? "#E5252A" : status === "Upcoming" ? "#4493F8" : status === "Pending Review" ? "#E3B341" : "#3FB950";
    const score = item.signalScore || (item.impact === "high" ? 82 : item.impact === "medium" ? 65 : 50);
    return `<div class="ev-card" data-id="${escapeAttr(item.id)}">
      <div class="ev-time"><div class="t">${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div class="z">${escapeHtml(item.timezone || "UTC")}</div></div>
      <span class="ev-ic" style="background:${color}22;color:${color}">${ic(iconForEvent(type))}</span>
      <div class="ev-body"><div class="row gap-8" style="flex-wrap:wrap;margin-bottom:6px"><span class="pill">${escapeHtml(type)}</span>${window.AFRIBN.statusPill(status, color)}</div><h4>${escapeHtml(item.title)}</h4><div class="m">${escapeHtml(item.country || "Pan-African")} <span class="sep"></span> ${escapeHtml(item.organizer || item.venue || item.eventType || "AFRIBN Event")} <span class="sep"></span> ${escapeHtml(formatLabel(item.format || item.accessType || ""))}</div></div>
      <div class="ev-aiv"><div class="v" style="color:${score >= 80 ? "#E8252D" : score >= 70 ? "#FF8A3D" : "#E3B341"}">${score || "-"}</div><div class="l">AIV</div></div>
    </div>`;
  }

  function iconForEvent(type = "") {
    const lower = type.toLowerCase();
    if (lower.includes("energy")) return "zap";
    if (lower.includes("security")) return "shield";
    if (lower.includes("politic") || lower.includes("policy")) return "bank";
    if (lower.includes("deal")) return "deal";
    if (lower.includes("trade") || lower.includes("diplom")) return "globe";
    if (lower.includes("technology")) return "chip";
    return "calendar";
  }

  function groupByDay(rows) {
    return rows.reduce((acc, item) => {
      const date = new Date(item.startsAt || item.occurredAt || item.createdAt);
      const key = Number.isNaN(date.getTime()) ? "Unscheduled" : date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      acc[key] = acc[key] || [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  function counts(rows, getKey) {
    return rows.reduce((acc, item) => {
      const key = getKey(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function lines(value = "") {
    return String(value).split(/\n/).map((item) => item.trim()).filter(Boolean);
  }

  function parseDocumentLine(line) {
    const [title, url] = String(line).split("|").map((part) => part.trim());
    return { title: title || "Document", url: url || "", type: "document" };
  }

  function toIso(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }

  function formatLabel(value = "") {
    return titleCase(String(value).replace(/_/g, " "));
  }

  function formatEventWindow(item) {
    const start = new Date(item.startsAt || item.occurredAt || item.createdAt);
    const end = item.endsAt ? new Date(item.endsAt) : null;
    if (Number.isNaN(start.getTime())) return "Date to be confirmed";
    const startText = start.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
    if (!end || Number.isNaN(end.getTime())) return `${startText} ${item.timezone || ""}`.trim();
    return `${startText} - ${end.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ${item.timezone || ""}`.trim();
  }

  function listItems(items = [], iconName = "checkCircle") {
    const rows = Array.isArray(items) ? items : [];
    return rows.length ? rows.map((item) => `<div class="leader-li"><span class="li-ic">${ic(iconName)}</span><span class="tx">${escapeHtml(typeof item === "string" ? item : item.name || item.title || "")}</span></div>`).join("") : `<div class="muted">No speakers listed yet.</div>`;
  }

  function documentItems(items = []) {
    const rows = Array.isArray(items) ? items : [];
    return rows.length ? rows.map((item) => {
      const title = item.title || item.name || "Document";
      const url = item.url || item.href || "";
      return `<div class="leader-li"><span class="li-ic">${ic("file")}</span><span class="tx">${url ? `<a href="${escapeAttr(url)}" target="_blank">${escapeHtml(title)}</a>` : escapeHtml(title)}</span></div>`;
    }).join("") : `<div class="muted">No documents linked yet.</div>`;
  }

  function strategicRelevance(event = {}) {
    const country = event.country || "this market";
    const sector = event.sector || event.eventType || "strategic";
    const format = formatLabel(event.format || event.accessType || "event");
    return `${event.title} is relevant to AFRIBN users because it may affect ${sector.toLowerCase()} positioning, stakeholder engagement, risk monitoring, and opportunity discovery in ${country}. The ${format.toLowerCase()} format and linked supporting documents help analysts track participation, follow-up actions, and downstream intelligence signals.`;
  }

  function titleCase(value = "") {
    return String(value).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }
})();
