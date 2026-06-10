const intelligenceItems = [
  {
    title: "Nigeria approves N6.2tn supplementary budget",
    summary: "The budget focuses on infrastructure, defense, and social investment priorities.",
    country: "Nigeria",
    topic: "Politics",
    source: "The Guardian Nigeria",
    time: "2m ago",
    score: 78,
    impact: "High Impact"
  },
  {
    title: "Dangote Refinery begins diesel exports to West Africa",
    summary: "First cargoes shipped to Ghana and Togo as supply chain expands across the region.",
    country: "Nigeria",
    topic: "Energy",
    source: "Business Day",
    time: "5m ago",
    score: 82,
    impact: "High Impact"
  },
  {
    title: "Security alert: Attack on mining site in eastern DRC",
    summary: "Armed attack reported in Ituri province; several injuries confirmed.",
    country: "DR Congo",
    topic: "Security",
    source: "Reuters",
    time: "8m ago",
    score: 88,
    impact: "High Impact"
  },
  {
    title: "AfCFTA trade facilitation portal goes live",
    summary: "Digital platform aims to simplify cross-border trade documentation and payments.",
    country: "Pan-African",
    topic: "Trade",
    source: "AfCFTA Secretariat",
    time: "12m ago",
    score: 72,
    impact: "Medium High"
  },
  {
    title: "Kenya Central Bank cuts policy rate to 12.0%",
    summary: "Move aims to boost private sector lending and support economic growth.",
    country: "Kenya",
    topic: "Economy",
    source: "Central Bank of Kenya",
    time: "15m ago",
    score: 65,
    impact: "Medium"
  },
  {
    title: "Ethiopia launches national industrial parks development plan",
    summary: "Plan targets 10 new industrial parks over the next five years.",
    country: "Ethiopia",
    topic: "Industry",
    source: "ENA",
    time: "18m ago",
    score: 58,
    impact: "Medium"
  },
  {
    title: "S&P upgrades Ghana's credit rating outlook to positive",
    summary: "Upgrade reflects improved fiscal performance and debt sustainability.",
    country: "Ghana",
    topic: "Finance",
    source: "S&P Global",
    time: "21m ago",
    score: 68,
    impact: "Medium"
  }
];

const watchItems = [
  ["Nigeria", "Country", "Politics", "High", 6],
  ["Dangote Group", "Company", "Energy", "Medium", 3],
  ["Artificial Intelligence", "Topic", "Technology", "Medium", 2],
  ["Ethiopia", "Country", "Economy", "Medium", 4],
  ["MTN Group", "Company", "Telecoms", "Low", 1],
  ["Renewable Energy", "Topic", "Energy", "Low", 1],
  ["Kenya", "Country", "Politics", "Medium", 2],
  ["Akinwumi Adesina", "Person", "Finance", "Low", 0]
];

const alerts = [
  ["New energy policy amendment in Nigeria", "Policy Change", "Nigeria", "High", "New", "2h ago"],
  ["Ethiopia raises import tariff on steel", "Regulation", "Ethiopia", "Medium", "New", "4h ago"],
  ["Dangote Refinery expansion update", "Corporate Update", "Nigeria", "Medium", "Acknowledged", "6h ago"],
  ["DR Congo-Zambia infrastructure MoU signed", "Partnership", "DR Congo", "Low", "New", "8h ago"],
  ["Security alert: Political unrest in South Sudan", "Security", "South Sudan", "High", "In Progress", "10h ago"],
  ["IMF revises growth forecast for Africa", "Economic", "Pan-African", "Low", "Resolved", "1d ago"]
];

const queue = [
  "Kenya renewable energy agreement - reviewed",
  "Nigeria budget update - scored",
  "DR Congo mining alert - needs source check"
];

const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll(".nav-item");
const globalSearch = document.querySelector("#globalSearch");

function setView(viewId) {
  views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  window.location.hash = viewId;
}

function badgeClass(value) {
  const text = String(value).toLowerCase();
  if (text.includes("high") || text.includes("new")) return "tag";
  return "chip";
}

function renderFeed() {
  const search = document.querySelector("#feedSearch")?.value.toLowerCase() || "";
  const country = document.querySelector("#countryFilter")?.value || "all";
  const topic = document.querySelector("#topicFilter")?.value || "all";
  const list = document.querySelector("#feedList");
  if (!list) return;

  const filtered = intelligenceItems.filter((item) => {
    const haystack = `${item.title} ${item.summary} ${item.country} ${item.topic}`.toLowerCase();
    return haystack.includes(search) &&
      (country === "all" || item.country === country) &&
      (topic === "all" || item.topic === topic);
  });

  list.innerHTML = filtered.map((item) => `
    <article class="feed-item">
      <div class="category-dot">${item.topic[0]}</div>
      <div>
        <h4>${item.title}</h4>
        <p>${item.summary}</p>
        <div class="feed-meta">
          <span>${item.country}</span>
          <span>${item.topic}</span>
          <span>${item.source}</span>
          <span>${item.time}</span>
        </div>
      </div>
      <div class="score-badge"><strong>${item.score}</strong><span>${item.impact}</span></div>
    </article>
  `).join("");
}

function fillSelects() {
  const countries = [...new Set(intelligenceItems.map((item) => item.country))];
  const topics = [...new Set(intelligenceItems.map((item) => item.topic))];
  const countryFilter = document.querySelector("#countryFilter");
  const topicFilter = document.querySelector("#topicFilter");
  if (countryFilter) countryFilter.innerHTML += countries.map((country) => `<option>${country}</option>`).join("");
  if (topicFilter) topicFilter.innerHTML += topics.map((topic) => `<option>${topic}</option>`).join("");
}

function renderBars(selector, data) {
  const target = document.querySelector(selector);
  if (!target) return;
  const max = Math.max(...data.map((item) => item[1]));
  target.innerHTML = data.map(([label, value]) => `
    <div class="bar-row">
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(value / max) * 100}%"></div></div>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderTables() {
  const watchTable = document.querySelector("#watchTable");
  if (watchTable) {
    watchTable.innerHTML = watchItems.map((item) => `
      <tr>
        <td><strong>${item[0]}</strong></td>
        <td><span class="tag">${item[1]}</span></td>
        <td>${item[2]}</td>
        <td>${item[3]}</td>
        <td>${item[4]}</td>
      </tr>
    `).join("");
  }

  const alertTable = document.querySelector("#alertTable");
  if (alertTable) {
    alertTable.innerHTML = alerts.map((alert) => `
      <tr>
        <td><strong>${alert[0]}</strong></td>
        <td>${alert[1]}</td>
        <td>${alert[2]}</td>
        <td><span class="${badgeClass(alert[3])}">${alert[3]}</span></td>
        <td>${alert[4]}</td>
        <td>${alert[5]}</td>
      </tr>
    `).join("");
  }
}

function renderLists() {
  const countryStories = document.querySelector("#countryStories");
  if (countryStories) {
    countryStories.innerHTML = intelligenceItems.slice(0, 3).map((item) => `
      <article class="feed-item">
        <div><h4>${item.title}</h4><p>${item.summary}</p><div class="feed-meta"><span>${item.topic}</span><span>${item.time}</span></div></div>
        <div class="score-badge"><strong>${item.score}</strong></div>
      </article>
    `).join("");
  }

  const briefList = document.querySelector("#briefList");
  if (briefList) {
    briefList.innerHTML = intelligenceItems.slice(0, 5).map((item, index) => `
      <article class="ranked-item">
        <div class="rank">${index + 1}</div>
        <div><span class="${badgeClass(item.impact)}">${item.impact}</span><h4>${item.title}</h4><p>${item.summary}</p></div>
        <div class="score-badge"><strong>${item.score}</strong><span>Signal</span></div>
      </article>
    `).join("");
  }

  const watchAlerts = document.querySelector("#watchAlerts");
  if (watchAlerts) {
    watchAlerts.innerHTML = alerts.slice(0, 3).map((alert) => `<p><strong>${alert[2]}</strong><br>${alert[0]}</p>`).join("");
  }

  const adminQueue = document.querySelector("#adminQueue");
  if (adminQueue) {
    adminQueue.innerHTML = queue.map((item) => `<p>${item}</p>`).join("");
  }
}

function wireEvents() {
  navItems.forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
  document.querySelectorAll("[data-view-link]").forEach((item) => {
    item.addEventListener("click", () => setView(item.dataset.viewLink));
  });
  ["feedSearch", "countryFilter", "topicFilter"].forEach((id) => {
    const element = document.querySelector(`#${id}`);
    if (element) element.addEventListener("input", renderFeed);
  });
  document.querySelector("#resetFilters")?.addEventListener("click", () => {
    document.querySelector("#feedSearch").value = "";
    document.querySelector("#countryFilter").value = "all";
    document.querySelector("#topicFilter").value = "all";
    renderFeed();
  });
  globalSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      setView("feed");
      document.querySelector("#feedSearch").value = globalSearch.value;
      renderFeed();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement.tagName !== "INPUT") {
      event.preventDefault();
      globalSearch?.focus();
    }
  });
  document.querySelector("#addWatchItem")?.addEventListener("click", () => {
    watchItems.unshift(["Ghana", "Country", "Finance", "Medium", 1]);
    renderTables();
  });
  document.querySelector("#publishMock")?.addEventListener("click", () => {
    const title = document.querySelector("#adminTitle").value;
    queue.unshift(`${title} - published`);
    renderLists();
  });
}

fillSelects();
renderFeed();
renderBars("#countryBars", [["Nigeria", 42], ["DR Congo", 18], ["Kenya", 14], ["Ethiopia", 12], ["Ghana", 10]]);
renderBars("#topicBars", [["Politics", 28], ["Energy", 26], ["Economy", 20], ["Security", 18], ["Trade", 16]]);
renderBars("#alertBars", [["Policy", 5], ["Regulation", 4], ["Corporate", 3], ["Security", 3], ["Economic", 2]]);
renderTables();
renderLists();
wireEvents();

const initialView = window.location.hash.replace("#", "");
if (initialView && document.getElementById(initialView)) setView(initialView);

window.addEventListener("hashchange", () => {
  const nextView = window.location.hash.replace("#", "");
  if (nextView && document.getElementById(nextView)) setView(nextView);
});
