const { buildUrl, countryToIso2, fetchJson, normalizeArticle, requireApiKey } = require("./provider-utils");

const PROVIDER = "newsapi";
const EVERYTHING_ENDPOINT = "https://newsapi.org/v2/everything";
const TOP_HEADLINES_ENDPOINT = "https://newsapi.org/v2/top-headlines";

async function collect(source, config = {}) {
  const apiKey = requireApiKey("NewsAPI", config, "NEWSAPI_API_KEY");
  const endpointType = config.endpointType || config.mode || "everything";
  const isTopHeadlines = endpointType === "top-headlines" || endpointType === "headlines";
  const country = countryToIso2(config.countryCode || source.countryCode || source.country);
  const url = buildUrl(config.endpoint || source.url || (isTopHeadlines ? TOP_HEADLINES_ENDPOINT : EVERYTHING_ENDPOINT), {
    apiKey,
    q: config.query || source.query || buildQuery(source, config),
    searchIn: config.searchIn,
    sources: config.sources,
    domains: config.domains,
    excludeDomains: config.excludeDomains,
    from: config.from,
    to: config.to,
    language: config.language || source.language,
    sortBy: config.sortBy || "publishedAt",
    country: isTopHeadlines ? country : undefined,
    category: isTopHeadlines ? config.category || source.category : undefined,
    pageSize: config.limit || config.pageSize || 50,
    page: config.page || 1
  });
  const fetched = await fetchJson(url, config);
  const items = Array.isArray(fetched.data.articles) ? fetched.data.articles : [];
  return {
    provider: PROVIDER,
    url,
    latencyMs: fetched.latencyMs,
    articles: items.map((item) => normalizeArticle({
      title: item.title,
      summary: item.description,
      body: item.content || item.description,
      url: item.url,
      sourceName: item.source?.name,
      sourceCountry: source.country,
      language: config.language || source.language || "en",
      publishedAt: item.publishedAt,
      author: item.author,
      imageUrl: item.urlToImage,
      providerArticleId: item.url,
      providerPayload: item
    }, defaults(source)))
  };
}

function buildQuery(source, config = {}) {
  const parts = [];
  if (Array.isArray(config.keywords) && config.keywords.length) parts.push(`(${config.keywords.join(" OR ")})`);
  if (source.country && source.country !== "Pan-African") parts.push(`"${source.country}"`);
  if (source.topic) parts.push(source.topic);
  if (source.sector) parts.push(source.sector);
  return parts.filter(Boolean).join(" ") || "Africa";
}

function defaults(source) {
  return {
    provider: PROVIDER,
    sourceName: source.name,
    sourceCountry: source.country,
    language: source.language || "en",
    url: source.url
  };
}

module.exports = { collect, provider: PROVIDER };
