const { buildUrl, countryToIso2, fetchJson, normalizeArticle, requireApiKey } = require("./provider-utils");

const PROVIDER = "worldnews";
const DEFAULT_ENDPOINT = "https://api.worldnewsapi.com/search-news";

async function collect(source, config = {}) {
  const apiKey = requireApiKey("World News API", config, "WORLDNEWS_API_KEY");
  const country = countryToIso2(config.sourceCountry || config.countryCode || source.countryCode || source.country);
  const url = buildUrl(config.endpoint || source.url || DEFAULT_ENDPOINT, {
    "api-key": apiKey,
    text: config.query || source.query || buildQuery(source, config),
    "source-country": country || undefined,
    language: config.language || source.language || undefined,
    categories: config.categories || config.category || source.category || undefined,
    "earliest-publish-date": config.from,
    "latest-publish-date": config.to,
    "sort": config.sort || "publish-time",
    "sort-direction": config.sortDirection || "DESC",
    number: config.limit || config.number || 50,
    offset: config.offset || 0
  });
  const fetched = await fetchJson(url, config);
  const items = Array.isArray(fetched.data.news) ? fetched.data.news : [];
  return {
    provider: PROVIDER,
    url,
    latencyMs: fetched.latencyMs,
    articles: items.map((item) => normalizeArticle({
      title: item.title,
      summary: item.summary,
      body: item.text || item.summary,
      url: item.url,
      sourceName: item.source,
      sourceCountry: item.source_country || source.country,
      language: item.language,
      publishedAt: item.publish_date,
      author: item.authors,
      imageUrl: item.image,
      providerArticleId: item.id || item.url,
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
