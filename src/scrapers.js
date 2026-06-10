const { badRequest, notFound } = require("./http");
const { latestCollectionDecision } = require("./source-reliability-service");
const { getSourceAdapter } = require("./adapters");
const { checksumFor } = require("./adapters/provider-utils");

const MAX_BODY_CHARS = 12000;

async function runScrapeWorker(store, sourceId, options = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  const decision = latestCollectionDecision(store, sourceId);
  if (source.status === "blacklisted" || decision?.decision === "SUPPRESS_OR_BLACKLIST") {
    throw badRequest("Source is suppressed or blacklisted by the Source Reliability Engine");
  }
  const config = { ...(source.scrapingConfig || source.scraping_config || {}), ...options };
  if (decision?.scrapeDepth === "sample") config.limit = Math.min(Number(config.limit || 3), 3);
  if (decision?.scrapeDepth === "metadata") config.limit = Math.min(Number(config.limit || 1), 1);
  if (decision?.scrapeDepth === "partial") config.limit = Math.min(Number(config.limit || 5), 5);

  const scrapeJob = store.insert("scrapeJobs", {
    stage: "ScrapeJob",
    sourceId,
    status: "running",
    scheduledFor: new Date().toISOString(),
    collectorType: config.collectorType || source.collectorType || "NewsScraperWorker",
    outputType: "RawArticle",
    attempts: 1,
    startedAt: new Date().toISOString(),
    nextObject: null
  });

  try {
    const adapter = getSourceAdapter(source, config);
    const fetched = adapter ? await adapter.collect(source, config) : await fetchSource(source.url, config);
    const candidates = adapter ? fetched.articles.map((article) => articleCandidate(source, article)) : parseSourceContent(fetched, source, config);
    const rawArticles = [];

    const filtered = filterCandidates(candidates, config);
    for (const candidate of filtered.slice(0, config.limit || 10)) {
      const duplicate = store.list("rawArticles", (article) => article.url === candidate.url || article.checksum === candidate.checksum)[0];
      if (duplicate) continue;
      rawArticles.push(store.insert("rawArticles", {
        stage: "RawArticle",
        scrapeJobId: scrapeJob.id,
        sourceId: source.id,
        sourceName: source.name,
        originalSourceName: candidate.sourceName || source.name,
        sourceCountry: candidate.sourceCountry || source.country,
        provider: candidate.provider || null,
        providerArticleId: candidate.providerArticleId || null,
        providerPayload: candidate.providerPayload || null,
        url: candidate.url,
        title: candidate.title,
        summary: candidate.summary || null,
        body: candidate.body,
        language: candidate.language || "en",
        author: candidate.author || null,
        imageUrl: candidate.imageUrl || null,
        publishedAt: candidate.publishedAt || new Date().toISOString(),
        checksum: candidate.checksum,
        duplicateOf: null,
        status: "collected",
        nextObject: null
      }));
    }

    store.update("scrapeJobs", scrapeJob.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      discoveredCount: candidates.length,
      acceptedCount: filtered.length,
      createdCount: rawArticles.length,
      nextObject: rawArticles.length === 1
        ? { type: "RawArticle", id: rawArticles[0].id }
        : { type: "RawArticle[]", ids: rawArticles.map((article) => article.id) }
    });
    store.update("sources", source.id, { lastScrapedAt: new Date().toISOString() });
    store.insert("sourceHealth", {
      sourceId: source.id,
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
      uptimePct: 100,
      lastLatencyMs: fetched.latencyMs || null
    });

    return { scrapeJob: store.get("scrapeJobs", scrapeJob.id), rawArticles, candidatesFound: candidates.length };
  } catch (error) {
    store.update("scrapeJobs", scrapeJob.id, {
      status: "failed",
      failedAt: new Date().toISOString(),
      error: error.message
    });
    store.insert("sourceHealth", {
      sourceId: source.id,
      status: "failed",
      lastCheckedAt: new Date().toISOString(),
      uptimePct: null,
      lastLatencyMs: null,
      error: error.message
    });
    throw error;
  }
}

async function fetchSource(url, options = {}) {
  if (!url) throw badRequest("source.url is required");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": options.userAgent || "AFRIBNBot/0.1 (+https://afribn.local)",
        Accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
      }
    });
    const startedAt = Date.now();
    const body = await response.text();
    if (!response.ok) throw badRequest(`Source fetch failed with HTTP ${response.status}`);
    return {
      url: response.url || url,
      contentType: response.headers.get("content-type") || "",
      body,
      latencyMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseSourceContent(fetched, source, options = {}) {
  const body = fetched.body || "";
  const contentType = fetched.contentType.toLowerCase();
  if (contentType.includes("rss") || contentType.includes("xml") || /<(rss|feed)\b/i.test(body)) {
    return parseRssOrAtom(body, fetched.url, source);
  }
  return parseHtml(body, fetched.url, source, options);
}

function parseRssOrAtom(xml, baseUrl, source) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  const candidates = blocks.map((block) => {
    const title = decodeHtml(stripTags(readTag(block, "title") || "Untitled"));
    const link = decodeHtml(readTag(block, "link") || readAttr(block, "link", "href") || baseUrl);
    const description = decodeHtml(stripTags(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content") || ""));
    const publishedAt = readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated") || null;
    return candidate(baseUrl, link, title, description || title, publishedAt, source);
  });

  if (candidates.length) return candidates;

  const title = decodeHtml(stripTags(readTag(xml, "title") || source.name));
  const description = decodeHtml(stripTags(readTag(xml, "description") || title));
  return [candidate(baseUrl, baseUrl, title, description, null, source)];
}

function parseHtml(html, baseUrl, source, options = {}) {
  const pageTitle = decodeHtml(stripTags(readTag(html, "title") || source.name));
  const metaDescription = readMeta(html, "description") || readMeta(html, "og:description") || "";
  const scopedHtml = options.containerSelector ? extractBySelector(html, options.containerSelector) || html : html;
  const anchors = [...scopedHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: match[1],
      text: decodeHtml(stripTags(match[2]))
    }))
    .filter((link) => link.text.length >= 24 && !/^#|mailto:|tel:/i.test(link.href));

  const candidates = anchors.slice(0, options.limit || 10).map((link) => {
    const url = resolveUrl(baseUrl, link.href);
    return candidate(baseUrl, url, link.text, `${link.text}. ${metaDescription || pageTitle}`, null, source);
  });

  if (candidates.length) return candidates;

  const mainText = extractReadableText(html).slice(0, MAX_BODY_CHARS);
  return [candidate(baseUrl, baseUrl, pageTitle, mainText || metaDescription || pageTitle, null, source)];
}

function filterCandidates(candidates, options = {}) {
  return candidates.filter((item) => {
    if (options.includeUrlPattern && !new RegExp(options.includeUrlPattern, "i").test(item.url)) return false;
    if (options.excludeUrlPattern && new RegExp(options.excludeUrlPattern, "i").test(item.url)) return false;
    if (options.minimumTitleLength && item.title.length < Number(options.minimumTitleLength)) return false;
    return true;
  });
}

function extractBySelector(html, selector) {
  if (!selector || !selector.startsWith(".")) return "";
  const className = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<([a-z0-9]+)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i"));
  return match ? match[2] : "";
}

function candidate(baseUrl, url, title, body, publishedAt, source) {
  const resolvedUrl = resolveUrl(baseUrl, url);
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const normalizedBody = String(body || normalizedTitle).trim().replace(/\s+/g, " ").slice(0, MAX_BODY_CHARS);
  return {
    url: resolvedUrl,
    title: normalizedTitle || source.name,
    body: normalizedBody,
    publishedAt: normalizeDate(publishedAt),
    language: "en",
    checksum: Buffer.from(`${source.id}:${resolvedUrl}:${normalizedTitle}`).toString("base64url")
  };
}

function articleCandidate(source, article) {
  const normalizedTitle = String(article.title || source.name).trim().replace(/\s+/g, " ");
  const normalizedBody = String(article.body || article.summary || normalizedTitle).trim().replace(/\s+/g, " ").slice(0, MAX_BODY_CHARS);
  return {
    url: article.url || source.url,
    title: normalizedTitle,
    summary: article.summary || null,
    body: normalizedBody,
    publishedAt: normalizeDate(article.publishedAt),
    language: article.language || source.language || "en",
    author: article.author || null,
    imageUrl: article.imageUrl || null,
    sourceName: article.sourceName || source.name,
    sourceCountry: article.sourceCountry || source.country,
    provider: article.provider || source.provider || source.apiProvider || null,
    providerArticleId: article.providerArticleId || null,
    providerPayload: article.providerPayload || null,
    checksum: checksumFor(source.id, article)
  };
}

function resolveUrl(baseUrl, value) {
  if (String(baseUrl).startsWith("data:") && value && value !== baseUrl) {
    return `${baseUrl}#${encodeURIComponent(value)}`;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readTag(text, tag) {
  const match = text.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function readAttr(text, tag, attr) {
  const match = text.match(new RegExp(`<${tag}\\b[^>]*${attr}=["']([^"']+)["'][^>]*\\/?>`, "i"));
  return match ? match[1].trim() : "";
}

function readMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return "";
}

function extractReadableText(html) {
  return decodeHtml(stripTags(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(text) {
  return String(text || "").replace(/<[^>]+>/g, " ");
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

module.exports = { runScrapeWorker, fetchSource, parseSourceContent };
