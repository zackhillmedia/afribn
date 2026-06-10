const { buildUrl, countryToIso2, fetchJson, normalizeArticle } = require("./provider-utils");

const PROVIDER = "gdelt";
const DEFAULT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

async function collect(source, config = {}) {
  const query = buildQuery(source, config);
  const url = buildUrl(config.endpoint || source.url || DEFAULT_ENDPOINT, {
    query,
    mode: config.mode || "ArtList",
    format: "json",
    maxrecords: config.limit || config.maxrecords || 50,
    sort: config.sort || "HybridRel",
    timespan: config.timespan || undefined,
    startdatetime: config.startDateTime || undefined,
    enddatetime: config.endDateTime || undefined
  });
  const fetched = await fetchJson(url, config);
  const items = Array.isArray(fetched.data.articles) ? fetched.data.articles : [];
  return {
    provider: PROVIDER,
    url,
    latencyMs: fetched.latencyMs,
    articles: items.map((item) => normalizeArticle({
      title: item.title,
      summary: item.seendate ? `Seen by GDELT on ${item.seendate}` : "",
      body: item.title,
      url: item.url,
      sourceName: item.domain,
      sourceCountry: item.sourcecountry || source.country,
      language: item.language,
      publishedAt: item.seendate,
      imageUrl: item.socialimage,
      providerArticleId: item.url,
      providerPayload: item
    }, defaults(source)))
  };
}

function buildQuery(source, config = {}) {
  const terms = [];
  if (config.query) terms.push(config.query);
  if (Array.isArray(config.keywords) && config.keywords.length) terms.push(`(${config.keywords.join(" OR ")})`);
  if (source.country && source.country !== "Pan-African") terms.push(`"${source.country}"`);
  if (source.topic) terms.push(source.topic);
  if (source.sector) terms.push(source.sector);
  const countryCode = countryToIso2(config.sourceCountry || source.sourceCountryCode);
  if (countryCode) terms.push(`sourcecountry:${countryCode}`);
  return terms.filter(Boolean).join(" ") || "Africa";
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
