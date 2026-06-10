const gdelt = require("./gdelt-adapter");
const newsapi = require("./newsapi-adapter");
const newsdata = require("./newsdata-adapter");
const worldnews = require("./worldnews-adapter");

const adapters = new Map([
  [gdelt.provider, gdelt],
  [newsapi.provider, newsapi],
  [newsdata.provider, newsdata],
  ["newsdata.io", newsdata],
  [worldnews.provider, worldnews],
  ["world-news-api", worldnews],
  ["worldnewsapi", worldnews]
]);

function getSourceAdapter(source = {}, config = {}) {
  const provider = String(
    config.provider ||
    config.apiProvider ||
    source.provider ||
    source.apiProvider ||
    source.scrapingConfig?.provider ||
    source.scraping_config?.provider ||
    ""
  ).toLowerCase();
  return adapters.get(provider) || null;
}

function listSourceAdapters() {
  return [...new Set([...adapters.keys()])].sort();
}

module.exports = { getSourceAdapter, listSourceAdapters };
