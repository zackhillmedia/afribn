const { badRequest } = require("../http");

const MAX_BODY_CHARS = 12000;

function requireApiKey(name, config = {}, envName) {
  const key = config.apiKey || process.env[envName];
  if (!key) throw badRequest(`${name} API key is required; set ${envName} or source.scrapingConfig.apiKey`);
  return key;
}

function buildUrl(baseUrl, params = {}) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) url.searchParams.set(key, value.join(","));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent || "AFRIBNBot/0.1 (+https://afribn.local)",
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw badRequest("Provider returned invalid JSON");
    }
    if (!response.ok) {
      const message = data.message || data.error || data.results?.message || `Provider request failed with HTTP ${response.status}`;
      throw badRequest(message);
    }
    return { data, latencyMs: Date.now() - startedAt, url };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeArticle(input = {}, defaults = {}) {
  const title = compact(input.title || input.headline || "Untitled intelligence item");
  const summary = compact(input.summary || input.description || input.excerpt || "");
  const body = compact(input.body || input.text || input.content || summary || title).slice(0, MAX_BODY_CHARS);
  const url = input.url || input.link || defaults.url;
  return {
    title,
    summary,
    body,
    url,
    sourceName: input.sourceName || input.source?.name || input.source || defaults.sourceName,
    sourceCountry: input.sourceCountry || input.country || defaults.sourceCountry,
    language: input.language || defaults.language || "en",
    publishedAt: normalizeDate(input.publishedAt || input.publishDate || input.published_at || input.date),
    author: input.author || input.authors || null,
    imageUrl: input.imageUrl || input.image || input.urlToImage || null,
    provider: defaults.provider,
    providerArticleId: input.providerArticleId || input.id || null,
    providerPayload: input.providerPayload || input
  };
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  if (!value) return null;
  if (/^\d{14}$/.test(String(value))) {
    const raw = String(value);
    return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}Z`).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function checksumFor(sourceId, article) {
  return Buffer.from(`${sourceId}:${article.provider || ""}:${article.url || ""}:${article.title || ""}`).toString("base64url");
}

function countryToIso2(countryOrCode) {
  const value = String(countryOrCode || "").trim();
  if (/^[a-z]{2}$/i.test(value)) return value.toLowerCase();
  const map = {
    angola: "ao",
    botswana: "bw",
    cameroon: "cm",
    "dr congo": "cd",
    "democratic republic of congo": "cd",
    egypt: "eg",
    ethiopia: "et",
    ghana: "gh",
    kenya: "ke",
    morocco: "ma",
    mozambique: "mz",
    nigeria: "ng",
    rwanda: "rw",
    senegal: "sn",
    somalia: "so",
    "south africa": "za",
    "south sudan": "ss",
    sudan: "sd",
    tanzania: "tz",
    uganda: "ug",
    zambia: "zm",
    zimbabwe: "zw"
  };
  return map[value.toLowerCase()] || "";
}

module.exports = {
  buildUrl,
  checksumFor,
  countryToIso2,
  fetchJson,
  normalizeArticle,
  requireApiKey
};
