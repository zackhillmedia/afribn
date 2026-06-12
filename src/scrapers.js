const crypto = require("node:crypto");
const { badRequest, notFound } = require("./http");
const { latestCollectionDecision } = require("./source-reliability-service");
const { getSourceAdapter } = require("./adapters");
const { checksumFor } = require("./adapters/provider-utils");

function hashContent(body) {
  return crypto.createHash("sha1").update(String(body || "")).digest("hex");
}

const MAX_BODY_CHARS = 12000;
const MIN_EXTRACTED_BODY_CHARS = 260;

async function runScrapeWorker(store, sourceId, options = {}) {
  const source = store.get("sources", sourceId);
  if (!source) throw notFound("Source not found");
  const decision = latestCollectionDecision(store, sourceId);
  const approved = source.status === "active" && source.approvalStatus === "approved";
  if (source.status === "blacklisted" || (!approved && decision?.decision === "SUPPRESS_OR_BLACKLIST")) {
    throw badRequest("Source is suppressed or blacklisted by the Source Reliability Engine");
  }

  const config = normalizeConfig(source, options, approved, decision);
  // Scheduler-driven runs send prior validators so an unchanged page returns 304
  // (or matches the stored content hash) and is skipped without re-processing.
  if (config.conditional) {
    config.etag = source.lastEtag || null;
    config.lastModified = source.lastModified || null;
  }
  const scrapeJob = store.insert("scrapeJobs", {
    stage: "ScrapeJob",
    sourceId,
    status: "running",
    scheduledFor: new Date().toISOString(),
    collectorType: config.collectorType || source.collectorType || "NewsScraperWorker",
    pipelineVersion: "collection-v2",
    outputType: "RawArticle",
    attempts: 1,
    startedAt: new Date().toISOString(),
    nextObject: null
  });

  try {
    const discovery = await discoverSourceItems(source, config);

    // Conditional short-circuit: nothing changed since the last scheduled run.
    if (config.conditional && (discovery.notModified || (discovery.contentHash && discovery.contentHash === source.contentHash))) {
      store.update("scrapeJobs", scrapeJob.id, {
        status: "unchanged",
        completedAt: new Date().toISOString(),
        discoveredCount: discovery.items.length,
        createdCount: 0,
        duplicateCount: 0,
        nextObject: null
      });
      store.update("sources", source.id, {
        lastScrapedAt: new Date().toISOString(),
        lastEtag: discovery.etag || source.lastEtag || null,
        lastModified: discovery.lastModified || source.lastModified || null,
        emptyStreak: Number(source.emptyStreak || 0) + 1
      });
      store.insert("sourceHealth", {
        sourceId: source.id,
        status: "unchanged",
        lastCheckedAt: new Date().toISOString(),
        uptimePct: 100,
        lastLatencyMs: discovery.diagnostics.latencyMs || null
      });
      return {
        scrapeJob: store.get("scrapeJobs", scrapeJob.id),
        rawArticles: [],
        unchanged: true,
        candidatesFound: discovery.items.length,
        discoveredItems: [],
        crawledPages: [],
        extractionResults: []
      };
    }

    const candidates = filterCandidates(discovery.items, config).slice(0, config.limit);
    const rawArticles = [];
    const crawledPages = [];
    const extractionResults = [];
    let duplicateCount = 0;

    for (const item of candidates) {
      const crawled = await crawlDiscoveredItem(item, source, config);
      crawledPages.push(crawled);
      const extracted = extractArticleFromCrawl(crawled, item, source, config);
      extractionResults.push(extracted);
      const rawCandidate = articleCandidate(source, extracted);
      const duplicate = findDuplicateRawArticle(store, rawCandidate);
      if (duplicate) {
        duplicateCount += 1;
        repairDuplicateMetadata(store, duplicate, rawCandidate, source);
        continue;
      }
      rawArticles.push(store.insert("rawArticles", buildRawArticle(scrapeJob, source, rawCandidate, item, crawled, extracted)));
    }

    store.update("scrapeJobs", scrapeJob.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      discoveredCount: discovery.items.length,
      acceptedCount: candidates.length,
      crawledCount: crawledPages.length,
      extractedCount: extractionResults.filter((item) => item.extractionStatus === "extracted").length,
      duplicateCount,
      createdCount: rawArticles.length,
      discoveryDiagnostics: discovery.diagnostics,
      extractionDiagnostics: summarizeExtraction(extractionResults),
      nextObject: rawArticles.length === 1
        ? { type: "RawArticle", id: rawArticles[0].id }
        : { type: "RawArticle[]", ids: rawArticles.map((article) => article.id) }
    });
    store.update("sources", source.id, {
      lastScrapedAt: new Date().toISOString(),
      lastEtag: discovery.etag || source.lastEtag || null,
      lastModified: discovery.lastModified || source.lastModified || null,
      contentHash: discovery.contentHash || source.contentHash || null,
      emptyStreak: rawArticles.length ? 0 : Number(source.emptyStreak || 0) + 1
    });
    store.insert("sourceHealth", {
      sourceId: source.id,
      status: "healthy",
      lastCheckedAt: new Date().toISOString(),
      uptimePct: 100,
      lastLatencyMs: discovery.diagnostics.latencyMs || null
    });

    return {
      scrapeJob: store.get("scrapeJobs", scrapeJob.id),
      rawArticles,
      candidatesFound: discovery.items.length,
      discoveredItems: candidates,
      crawledPages,
      extractionResults
    };
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

function normalizeConfig(source, options, approved, decision) {
  const config = {
    limit: 10,
    crawlArticles: true,
    crawler: "fetch",
    extractionMode: "readability-lite",
    ...(source.scrapingConfig || source.scraping_config || {}),
    ...options
  };
  config.limit = Math.max(1, Math.min(Number(config.limit || 10), Number(config.maxLimit || 25)));
  if (!approved && decision?.scrapeDepth === "sample") config.limit = Math.min(Number(config.limit || 3), 3);
  if (!approved && decision?.scrapeDepth === "metadata") config.limit = Math.min(Number(config.limit || 1), 1);
  if (!approved && decision?.scrapeDepth === "partial") config.limit = Math.min(Number(config.limit || 5), 5);
  return config;
}

async function discoverSourceItems(source, config = {}) {
  const adapter = getSourceAdapter(source, config);
  if (adapter) {
    const fetched = await adapter.collect(source, config);
    return {
      method: `adapter:${adapter.provider}`,
      items: fetched.articles.map((article) => discoveredItemFromProvider(source, article, fetched.url)),
      diagnostics: {
        method: `adapter:${adapter.provider}`,
        sourceUrl: fetched.url || source.url,
        contentType: "application/json",
        latencyMs: fetched.latencyMs || null,
        provider: adapter.provider
      }
    };
  }

  const fetched = await fetchSource(source.url, config);
  if (fetched.notModified) {
    return {
      method: "unchanged",
      items: [],
      notModified: true,
      etag: fetched.etag,
      lastModified: fetched.lastModified,
      contentHash: null,
      diagnostics: { method: "unchanged", sourceUrl: source.url, latencyMs: fetched.latencyMs || null, discoveredCount: 0 }
    };
  }
  const contentHash = hashContent(fetched.body);
  const items = discoverFromFetchedSource(fetched, source, config);
  return {
    method: items.method,
    items: items.items,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    contentHash,
    diagnostics: {
      method: items.method,
      sourceUrl: fetched.url || source.url,
      contentType: fetched.contentType,
      latencyMs: fetched.latencyMs || null,
      discoveredCount: items.items.length
    }
  };
}

async function fetchSource(url, options = {}) {
  if (!url) throw badRequest("source.url is required");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);
  const startedAt = Date.now();

  const headers = {
    "User-Agent": options.userAgent || "AFRIBNBot/0.2 (+https://afribn.com)",
    Accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
  };
  // Conditional request: only sent when prior validators are supplied (scheduler runs).
  if (options.etag) headers["If-None-Match"] = options.etag;
  if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

  try {
    const response = await fetch(url, { signal: controller.signal, headers });
    if (response.status === 304) {
      return {
        url: response.url || url,
        status: 304,
        notModified: true,
        contentType: "",
        body: "",
        etag: options.etag || null,
        lastModified: options.lastModified || null,
        latencyMs: Date.now() - startedAt
      };
    }
    const body = await response.text();
    if (!response.ok) throw badRequest(`Source fetch failed with HTTP ${response.status}`);
    return {
      url: response.url || url,
      contentType: response.headers.get("content-type") || "",
      status: response.status,
      body,
      etag: response.headers.get("etag") || null,
      lastModified: response.headers.get("last-modified") || null,
      latencyMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function discoverFromFetchedSource(fetched, source, options = {}) {
  const body = fetched.body || "";
  const contentType = fetched.contentType.toLowerCase();
  if (contentType.includes("rss") || contentType.includes("xml") || /<(rss|feed)\b/i.test(body)) {
    return { method: "rss", items: parseRssOrAtom(body, fetched.url, source) };
  }
  return { method: "html-index", items: parseHtmlIndex(body, fetched.url, source, options) };
}

function parseSourceContent(fetched, source, options = {}) {
  return discoverFromFetchedSource(fetched, source, options).items;
}

function parseRssOrAtom(xml, baseUrl, source) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((match) => match[0]);
  const candidates = blocks.map((block) => {
    const title = cleanXmlText(readTag(block, "title") || "Untitled");
    const link = decodeHtml(readTag(block, "link") || readAttr(block, "link", "href") || readTag(block, "guid") || baseUrl);
    const summary = cleanXmlText(readTag(block, "description") || readTag(block, "summary") || "");
    const body = cleanXmlText(readTag(block, "content:encoded") || readTag(block, "content") || summary || title);
    const publishedAt = readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated") || null;
    const author = cleanXmlText(readTag(block, "author") || readTag(block, "dc:creator") || "");
    return discoveredItem(baseUrl, link, title, summary, body, publishedAt, source, {
      discoveryMethod: "rss",
      author
    });
  });

  if (candidates.length) return candidates;

  const title = cleanXmlText(readTag(xml, "title") || source.name);
  const description = cleanXmlText(readTag(xml, "description") || title);
  return [discoveredItem(baseUrl, baseUrl, title, description, description, null, source, { discoveryMethod: "rss-feed-fallback" })];
}

function parseHtmlIndex(html, baseUrl, source, options = {}) {
  const pageTitle = decodeHtml(stripTags(readTag(html, "title") || source.name));
  const metaDescription = readMeta(html, "description") || readMeta(html, "og:description") || "";
  const scopedHtml = options.containerSelector ? extractBySelector(html, options.containerSelector) || html : html;
  const anchors = [...scopedHtml.matchAll(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: match[1] || match[2] || match[3],
      text: decodeHtml(stripTags(match[4]))
    }))
    .filter((link) => link.text.length >= 24 && !/^#|mailto:|tel:/i.test(link.href))
    .filter((link) => isLikelyArticleLink(link, baseUrl));

  const candidates = anchors
    .sort((a, b) => articleLinkScore(b, baseUrl) - articleLinkScore(a, baseUrl))
    .slice(0, options.discoveryLimit || options.limit || 10)
    .map((link) => discoveredItem(baseUrl, link.href, link.text, metaDescription || pageTitle, link.text, null, source, { discoveryMethod: "html-index" }));

  if (candidates.length) return dedupeDiscoveredItems(candidates);

  const mainText = extractReadableText(html).slice(0, MAX_BODY_CHARS);
  return [discoveredItem(baseUrl, baseUrl, pageTitle, metaDescription, mainText || metaDescription || pageTitle, null, source, { discoveryMethod: "html-page-fallback" })];
}

function discoveredItemFromProvider(source, article, providerUrl) {
  const normalizedTitle = compact(article.title || source.name);
  const normalizedBody = compact(article.body || article.summary || normalizedTitle).slice(0, MAX_BODY_CHARS);
  return {
    stage: "DiscoveredItem",
    sourceId: source.id,
    sourceName: article.sourceName || source.name,
    originalSourceName: article.sourceName || source.name,
    sourceCountry: article.sourceCountry || source.country,
    provider: article.provider || source.provider || source.apiProvider || null,
    providerArticleId: article.providerArticleId || null,
    providerPayload: article.providerPayload || article,
    discoveryMethod: `adapter:${article.provider || source.provider || "api"}`,
    discoveryUrl: providerUrl || source.url,
    url: article.url || source.url,
    canonicalUrl: article.url || source.url,
    title: normalizedTitle,
    summary: article.summary || "",
    bodyHint: normalizedBody,
    language: article.language || source.language || "en",
    author: article.author || null,
    publishedAt: normalizeDate(article.publishedAt),
    checksum: checksumFor(source.id, article)
  };
}

function discoveredItem(baseUrl, url, title, summary, bodyHint, publishedAt, source, extra = {}) {
  const resolvedUrl = resolveUrl(baseUrl, url);
  const normalizedTitle = compact(title || source.name);
  const normalizedBody = compact(bodyHint || summary || normalizedTitle).slice(0, MAX_BODY_CHARS);
  return {
    stage: "DiscoveredItem",
    sourceId: source.id,
    sourceName: source.name,
    originalSourceName: source.name,
    sourceCountry: source.country,
    provider: source.provider || source.apiProvider || null,
    providerArticleId: extra.providerArticleId || null,
    providerPayload: extra.providerPayload || null,
    discoveryMethod: extra.discoveryMethod || "unknown",
    discoveryUrl: baseUrl,
    url: resolvedUrl,
    canonicalUrl: resolvedUrl,
    title: normalizedTitle,
    summary: compact(summary || ""),
    bodyHint: normalizedBody,
    language: source.language || "en",
    author: extra.author || null,
    publishedAt: normalizeDate(publishedAt),
    checksum: Buffer.from(`${source.id}:${resolvedUrl}:${normalizedTitle}`).toString("base64url")
  };
}

async function crawlDiscoveredItem(item, source, config = {}) {
  const shouldCrawl = config.crawlArticles !== false && !String(item.url).startsWith("data:") && item.url;
  if (!shouldCrawl) return crawledPageFromItem(item, "skipped");

  try {
    if (config.crawler === "playwright") {
      return await crawlWithPlaywright(item, config);
    }
    return await crawlWithFetch(item, config);
  } catch (error) {
    return {
      stage: "CrawledPage",
      sourceId: source.id,
      url: item.url,
      finalUrl: item.url,
      status: "failed",
      crawler: config.crawler || "fetch",
      contentType: null,
      html: "",
      text: item.bodyHint || item.summary || item.title,
      latencyMs: null,
      error: error.message,
      fallbackUsed: true
    };
  }
}

function crawledPageFromItem(item, reason) {
  return {
    stage: "CrawledPage",
    sourceId: item.sourceId,
    url: item.url,
    finalUrl: item.url,
    status: reason,
    crawler: "metadata",
    contentType: "text/plain",
    html: "",
    text: item.bodyHint || item.summary || item.title,
    latencyMs: null,
    error: null,
    fallbackUsed: true
  };
}

async function crawlWithFetch(item, config = {}) {
  const fetched = await fetchSource(item.url, config);
  return {
    stage: "CrawledPage",
    sourceId: item.sourceId,
    url: item.url,
    finalUrl: fetched.url,
    status: "completed",
    crawler: "fetch",
    contentType: fetched.contentType,
    html: fetched.body,
    text: "",
    latencyMs: fetched.latencyMs,
    error: null,
    fallbackUsed: false
  };
}

async function crawlWithPlaywright(item, config = {}) {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    return crawlWithFetch(item, { ...config, crawler: "fetch" });
  }
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: config.userAgent || "AFRIBNBot/0.2 (+https://afribn.com)"
    });
    const response = await page.goto(item.url, {
      waitUntil: config.waitUntil || "domcontentloaded",
      timeout: Number(config.timeoutMs || 15000)
    });
    const html = await page.content();
    return {
      stage: "CrawledPage",
      sourceId: item.sourceId,
      url: item.url,
      finalUrl: page.url() || item.url,
      status: "completed",
      crawler: "playwright",
      contentType: response?.headers()?.["content-type"] || "text/html",
      httpStatus: response?.status() || null,
      html,
      text: "",
      latencyMs: Date.now() - startedAt,
      error: null,
      fallbackUsed: false
    };
  } finally {
    await browser.close();
  }
}

function extractArticleFromCrawl(crawled, item, source, config = {}) {
  if (!crawled.html) {
    return extractionFromFallback(crawled, item, source, "metadata-fallback");
  }

  const html = crawled.html;
  const canonicalUrl = resolveUrl(crawled.finalUrl || item.url, readCanonical(html) || crawled.finalUrl || item.canonicalUrl || item.url);
  const title = bestTitle(html, item.title, source);
  const summary = readMeta(html, "description") || readMeta(html, "og:description") || item.summary || "";
  const author = readMeta(html, "author") || readMeta(html, "article:author") || item.author || "";
  const publishedAt = readMeta(html, "article:published_time") ||
    readMeta(html, "pubdate") ||
    readTimeAttr(html, "datetime") ||
    item.publishedAt ||
    null;
  const contentHtml = selectArticleHtml(html, config);
  const extractedBody = cleanArticleBody(contentHtml || html);
  const body = chooseBody(extractedBody, item.bodyHint, summary, title);
  const extractionStatus = body.length >= MIN_EXTRACTED_BODY_CHARS || item.bodyHint.length >= MIN_EXTRACTED_BODY_CHARS ? "extracted" : "partial";

  return {
    stage: "ExtractionResult",
    extractionStatus,
    extractionMethod: contentHtml ? "readability-lite" : "html-text-fallback",
    sourceId: source.id,
    url: item.url,
    canonicalUrl,
    title,
    summary,
    body,
    bodyCharCount: body.length,
    language: item.language || source.language || "en",
    author: compact(author) || null,
    publishedAt: normalizeDate(publishedAt),
    sourceName: item.sourceName || source.name,
    sourceCountry: item.sourceCountry || source.country,
    provider: item.provider || null,
    providerArticleId: item.providerArticleId || null,
    providerPayload: item.providerPayload || null,
    discoveryMethod: item.discoveryMethod,
    crawler: crawled.crawler,
    crawlStatus: crawled.status,
    crawlError: crawled.error || null,
    checksum: Buffer.from(`${source.id}:${canonicalUrl}:${title}`).toString("base64url")
  };
}

function extractionFromFallback(crawled, item, source, method) {
  const body = chooseBody(crawled.text, item.bodyHint, item.summary, item.title);
  return {
    stage: "ExtractionResult",
    extractionStatus: body.length >= MIN_EXTRACTED_BODY_CHARS ? "extracted" : "partial",
    extractionMethod: method,
    sourceId: source.id,
    url: item.url,
    canonicalUrl: item.canonicalUrl || item.url,
    title: item.title || source.name,
    summary: item.summary || "",
    body,
    bodyCharCount: body.length,
    language: item.language || source.language || "en",
    author: item.author || null,
    publishedAt: item.publishedAt || null,
    sourceName: item.sourceName || source.name,
    sourceCountry: item.sourceCountry || source.country,
    provider: item.provider || null,
    providerArticleId: item.providerArticleId || null,
    providerPayload: item.providerPayload || null,
    discoveryMethod: item.discoveryMethod,
    crawler: crawled.crawler,
    crawlStatus: crawled.status,
    crawlError: crawled.error || null,
    checksum: item.checksum || Buffer.from(`${source.id}:${item.url}:${item.title}`).toString("base64url")
  };
}

function selectArticleHtml(html, config = {}) {
  const selectors = [
    config.articleSelector,
    "article",
    "main",
    ".article-body",
    ".story-body",
    ".entry-content",
    ".post-content",
    ".content"
  ].filter(Boolean);
  for (const selector of selectors) {
    const extracted = extractBySimpleSelector(html, selector);
    if (extracted && extractReadableText(extracted).length >= MIN_EXTRACTED_BODY_CHARS) return extracted;
  }
  return "";
}

function extractBySimpleSelector(html, selector) {
  if (!selector) return "";
  if (/^[a-z][a-z0-9-]*$/i.test(selector)) {
    const match = html.match(new RegExp(`<${selector}\\b[^>]*>([\\s\\S]*?)<\\/${selector}>`, "i"));
    return match ? match[1] : "";
  }
  if (selector.startsWith(".")) return extractBySelector(html, selector);
  return "";
}

function cleanArticleBody(html) {
  const stripped = String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ")
    .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, " ");
  return extractReadableText(stripped)
    .replace(/\b(Share this|Advertisement|Related stories|Read also|Subscribe)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BODY_CHARS);
}

function chooseBody(extractedBody, bodyHint, summary, title) {
  const choices = [extractedBody, bodyHint, summary, title].map((item) => compact(item));
  return choices.sort((a, b) => b.length - a.length)[0].slice(0, MAX_BODY_CHARS);
}

function bestTitle(html, fallback, source) {
  const candidates = [
    readMeta(html, "og:title"),
    readMeta(html, "twitter:title"),
    cleanXmlText(readTag(html, "h1")),
    decodeHtml(stripTags(readTag(html, "title"))),
    fallback,
    source.name
  ].map((item) => compact(item)).filter(Boolean);
  return cleanTitle(candidates[0], source);
}

function cleanTitle(title, source) {
  const sourceName = String(source.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return compact(String(title || source.name)
    .replace(/\s+[-|]\s+AFRIBN$/i, "")
    .replace(sourceName ? new RegExp(`\\s+[-|]\\s+${sourceName}$`, "i") : /$a/, ""));
}

function readCanonical(html) {
  return readLinkHref(html, "canonical") || readMeta(html, "og:url");
}

function readLinkHref(html, rel) {
  const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<link\\b[^>]*rel=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function readTimeAttr(html, attr) {
  const match = html.match(new RegExp(`<time\\b[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function articleCandidate(source, article) {
  const normalizedTitle = compact(article.title || source.name);
  const normalizedBody = compact(article.body || article.summary || normalizedTitle).slice(0, MAX_BODY_CHARS);
  return {
    sourceId: source.id,
    url: article.canonicalUrl || article.url || source.url,
    canonicalUrl: article.canonicalUrl || article.url || source.url,
    title: normalizedTitle,
    summary: article.summary || null,
    body: normalizedBody,
    publishedAt: normalizeDate(article.publishedAt),
    language: article.language || source.language || "en",
    author: article.author || null,
    sourceName: article.sourceName || source.name,
    sourceCountry: article.sourceCountry || source.country,
    provider: article.provider || source.provider || source.apiProvider || null,
    providerArticleId: article.providerArticleId || null,
    providerPayload: article.providerPayload || null,
    extractionStatus: article.extractionStatus || null,
    extractionMethod: article.extractionMethod || null,
    crawlStatus: article.crawlStatus || null,
    crawlError: article.crawlError || null,
    discoveryMethod: article.discoveryMethod || null,
    bodyCharCount: article.bodyCharCount || normalizedBody.length,
    checksum: article.checksum || checksumFor(source.id, article)
  };
}

function buildRawArticle(scrapeJob, source, candidate, item, crawled, extracted) {
  return {
    stage: "RawArticle",
    scrapeJobId: scrapeJob.id,
    sourceId: source.id,
    sourceName: source.name,
    originalSourceName: candidate.sourceName || source.name,
    sourceCountry: candidate.sourceCountry || source.country,
    provider: candidate.provider || null,
    providerArticleId: candidate.providerArticleId || null,
    providerPayload: candidate.providerPayload || null,
    discoveryMethod: item.discoveryMethod,
    crawler: crawled.crawler,
    crawlStatus: crawled.status,
    crawlError: crawled.error || null,
    extractionStatus: extracted.extractionStatus,
    extractionMethod: extracted.extractionMethod,
    bodyCharCount: candidate.bodyCharCount || candidate.body.length,
    url: item.url,
    canonicalUrl: candidate.canonicalUrl || candidate.url,
    title: candidate.title,
    summary: candidate.summary || null,
    body: candidate.body,
    language: candidate.language || "en",
    author: candidate.author || null,
    imageUrl: null,
    publishedAt: candidate.publishedAt || new Date().toISOString(),
    checksum: candidate.checksum,
    duplicateOf: null,
    status: "collected",
    nextObject: null,
    diagnostics: {
      discoveryMethod: item.discoveryMethod,
      crawler: crawled.crawler,
      crawlStatus: crawled.status,
      extractionStatus: extracted.extractionStatus,
      extractionMethod: extracted.extractionMethod,
      bodyCharCount: candidate.bodyCharCount || candidate.body.length
    }
  };
}

function findDuplicateRawArticle(store, candidate) {
  const normalizedTitle = normalizeForDedupe(candidate.title);
  const canonicalUrl = normalizeUrl(candidate.canonicalUrl || candidate.url);
  return store.list("rawArticles", (article) => {
    if (normalizeUrl(article.canonicalUrl || article.url) === canonicalUrl) return true;
    if (article.checksum === candidate.checksum) return true;
    return normalizeForDedupe(article.title) === normalizedTitle && String(article.sourceId) === String(candidate.sourceId);
  })[0];
}

function filterCandidates(candidates, options = {}) {
  return dedupeDiscoveredItems(candidates).filter((item) => {
    if (options.includeUrlPattern && !new RegExp(options.includeUrlPattern, "i").test(item.url)) return false;
    if (options.excludeUrlPattern && new RegExp(options.excludeUrlPattern, "i").test(item.url)) return false;
    if (options.minimumTitleLength && item.title.length < Number(options.minimumTitleLength)) return false;
    if (isBlockedContentUrl(item.url) || isBlockedContentTitle(item.title)) return false;
    return true;
  });
}

function dedupeDiscoveredItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${normalizeUrl(item.canonicalUrl || item.url)}:${normalizeForDedupe(item.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyArticleLink(link, baseUrl) {
  const url = resolveUrl(baseUrl, link.href);
  if (isBlockedContentUrl(url) || isBlockedContentTitle(link.text)) return false;
  if (!sameHost(baseUrl, url)) return false;
  const score = articleLinkScore(link, baseUrl);
  return score >= 1;
}

function articleLinkScore(link, baseUrl) {
  const url = resolveUrl(baseUrl, link.href);
  const path = safePath(url).toLowerCase();
  const text = String(link.text || "");
  let score = 0;
  if (text.length >= 40) score += 1;
  if (text.length >= 70) score += 1;
  if (/\/(article|news|story|business|politics|economy|sports|opinion|rwanda|africa)\b/i.test(path)) score += 1;
  if (/\/\d{4}\/\d{1,2}\//.test(path) || /\/\d{4}-\d{2}-\d{2}\//.test(path)) score += 2;
  if (path.split("/").filter(Boolean).length >= 2) score += 1;
  if (/\b(says|govt|government|minister|deal|policy|rwanda|kigali|bank|budget|investment|security|trade|tariff|central bank|budget)\b/i.test(text)) score += 1;
  if (isBlockedContentUrl(url) || isBlockedContentTitle(text)) score -= 5;
  return score;
}

function isBlockedContentUrl(url) {
  const path = safePath(url).toLowerCase();
  return /(?:^|\/)(add-story-idea|submit|contact|about|advertise|advertising|login|register|signup|sign-up|subscribe|newsletter|privacy|terms|cookies|careers|jobs|tag|tags|category|author|search)(?:\/|$|-)/i.test(path);
}

function isBlockedContentTitle(title) {
  return /\b(submit|send us|contact us|advertise|newsletter|sign in|login|subscribe|privacy policy|terms|cookies|careers|idea for .* cover)\b/i.test(String(title || ""));
}

function sameHost(baseUrl, value) {
  if (String(baseUrl).startsWith("data:")) return true;
  try {
    return new URL(baseUrl).hostname.replace(/^www\./, "") === new URL(value, baseUrl).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function safePath(value) {
  try {
    return new URL(value).pathname || "/";
  } catch {
    return "/";
  }
}

function resolveUrl(baseUrl, value) {
  if (String(baseUrl).startsWith("data:") && value && value !== baseUrl) {
    try {
      return new URL(value).toString();
    } catch {
      // Relative links inside inline test fixtures are anchored to the data URL.
    }
    return `${baseUrl}#${encodeURIComponent(value)}`;
  }
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function normalizeUrl(value) {
  if (String(value || "").startsWith("data:")) return String(value || "").replace(/\/$/, "");
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function normalizeForDedupe(value) {
  return compact(value).toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function extractBySelector(html, selector) {
  if (!selector || !selector.startsWith(".")) return "";
  const className = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<([a-z0-9]+)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i"));
  return match ? match[2] : "";
}

function readTag(text, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? match[1].trim() : "";
}

function readAttr(text, tag, attr) {
  const match = String(text || "").match(new RegExp(`<${tag}\\b[^>]*${attr}=["']([^"']+)["'][^>]*\\/?>`, "i"));
  return match ? match[1].trim() : "";
}

function readMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match) return decodeHtml(match[1]);
  }
  return "";
}

function extractReadableText(html) {
  return decodeHtml(stripTags(String(html || "")))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(text) {
  return String(text || "").replace(/<[^>]+>/g, " ");
}

function cleanXmlText(text) {
  return decodeHtml(stripTags(String(text || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")))
    .replace(/\]\]>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function summarizeExtraction(results) {
  return {
    extracted: results.filter((item) => item.extractionStatus === "extracted").length,
    partial: results.filter((item) => item.extractionStatus === "partial").length,
    averageBodyChars: results.length ? Math.round(results.reduce((sum, item) => sum + Number(item.bodyCharCount || 0), 0) / results.length) : 0,
    methods: [...new Set(results.map((item) => item.extractionMethod).filter(Boolean))]
  };
}

function repairDuplicateMetadata(store, duplicate, candidate, source) {
  const genericTitles = new Set([
    source.name,
    duplicate.sourceName,
    `${source.country} strategic development from ${source.name}`,
    "Untitled",
    "Untitled intelligence item"
  ].filter(Boolean));
  const patch = {};
  if (candidate.title && (!duplicate.title || genericTitles.has(duplicate.title))) {
    patch.title = candidate.title;
  }
  if (candidate.body && (!duplicate.body || duplicate.body.length < candidate.body.length)) patch.body = candidate.body;
  if (candidate.summary && !duplicate.summary) patch.summary = candidate.summary;
  if (candidate.publishedAt && !duplicate.publishedAt) patch.publishedAt = candidate.publishedAt;
  if (candidate.canonicalUrl && !duplicate.canonicalUrl) patch.canonicalUrl = candidate.canonicalUrl;
  if (candidate.author && !duplicate.author) patch.author = candidate.author;
  if (candidate.bodyCharCount && !duplicate.bodyCharCount) patch.bodyCharCount = candidate.bodyCharCount;
  if (Object.keys(patch).length) store.update("rawArticles", duplicate.id, patch);
  if (candidate.title) repairLinkedTitles(store, duplicate, candidate.title, genericTitles);
}

function repairLinkedTitles(store, rawArticle, title, genericTitles) {
  const storyId = rawArticle.nextObject?.storyId;
  const eventId = rawArticle.nextObject?.eventId;
  if (storyId) {
    const story = store.get("stories", storyId);
    if (story && genericTitles.has(story.title)) store.update("stories", storyId, { title });
    store.list("publishedIntelligence", (item) => item.storyId === storyId && genericTitles.has(item.title)).forEach((item) => {
      store.update("publishedIntelligence", item.id, { title });
    });
    store.list("feedItems", (item) => item.storyId === storyId && genericTitles.has(item.title)).forEach((item) => {
      store.update("feedItems", item.id, { title });
    });
  }
  if (eventId) {
    const event = store.get("events", eventId);
    if (event && genericTitles.has(event.title)) store.update("events", eventId, { title });
  }
}

module.exports = {
  runScrapeWorker,
  fetchSource,
  parseSourceContent,
  discoverSourceItems,
  crawlDiscoveredItem,
  extractArticleFromCrawl
};
