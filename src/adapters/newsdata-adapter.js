const { buildUrl, countryToIso2, fetchJson, normalizeArticle, requireApiKey } = require("./provider-utils");

const PROVIDER = "newsdata";
const DEFAULT_ENDPOINT = "https://newsdata.io/api/1/latest";

async function collect(source, config = {}) {
  const apiKey = requireApiKey("NewsData.io", config, "NEWSDATA_API_KEY");
  const country = countryToIso2(config.countryCode || source.countryCode || source.country);
  const url = buildUrl(config.endpoint || source.url || DEFAULT_ENDPOINT, {
    apikey: apiKey,
    q: config.query || source.query || buildQuery(source, config),
    country: config.country || country || undefined,
    language: config.language || source.language || undefined,
    category: config.category || source.category || undefined,
    domain: config.domain,
    excludedomain: config.excludeDomain,
    timeframe: config.timeframe,
    page: config.page
  });
  const fetched = await fetchJson(url, config);
  const items = Array.isArray(fetched.data.results) ? fetched.data.results : [];
  return {
    provider: PROVIDER,
    url,
    latencyMs: fetched.latencyMs,
    articles: items.slice(0, config.limit || items.length).map((item) => normalizeArticle({
      title: item.title,
      summary: item.description,
      body: item.content || item.description,
      url: item.link,
      sourceName: item.source_name || item.source_id,
      sourceCountry: Array.isArray(item.country) ? item.country[0] : item.country || source.country,
      language: item.language,
      publishedAt: item.pubDate,
      author: item.creator,
      imageUrl: item.image_url,
      providerArticleId: item.article_id || item.link,
      providerPayload: item
    }, defaults(source)))
  };
}

function buildQuery(source, config = {}) {
  const parts = [];
  if (Array.isArray(config.keywords) && config.keywords.length) parts.push(config.keywords.join(" OR "));
  if (source.country && source.country !== "Pan-African") parts.push(source.country);
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
