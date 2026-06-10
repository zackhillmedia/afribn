import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const gdelt = require("../src/adapters/gdelt-adapter");
const newsapi = require("../src/adapters/newsapi-adapter");
const newsdata = require("../src/adapters/newsdata-adapter");
const worldnews = require("../src/adapters/worldnews-adapter");
const { getSourceAdapter } = require("../src/adapters");

const source = {
  id: "source_0001",
  name: "AFRIBN API Test Source",
  country: "Nigeria",
  sector: "Energy",
  language: "en",
  url: "https://example.test/api"
};

function mockFetch(payload, seen = []) {
  return async (url) => {
    seen.push(url);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload)
    };
  };
}

{
  const seen = [];
  const result = await gdelt.collect(source, {
    endpoint: "https://api.gdeltproject.org/api/v2/doc/doc",
    query: "Nigeria energy",
    limit: 1,
    fetchImpl: mockFetch({
      articles: [{
        title: "Nigeria approves new energy policy",
        url: "https://publisher.test/nigeria-energy",
        domain: "publisher.test",
        sourcecountry: "NG",
        language: "English",
        seendate: "20260610120000"
      }]
    }, seen)
  });
  assert.equal(result.provider, "gdelt");
  assert.equal(result.articles.length, 1);
  assert.equal(result.articles[0].title, "Nigeria approves new energy policy");
  assert.equal(result.articles[0].sourceName, "publisher.test");
  assert.ok(seen[0].includes("mode=ArtList"));
}

{
  const result = await newsapi.collect(source, {
    endpoint: "https://newsapi.org/v2/everything",
    apiKey: "test-key",
    query: "Nigeria energy",
    fetchImpl: mockFetch({
      status: "ok",
      articles: [{
        title: "Dangote refinery expands exports",
        description: "Exports expand across West Africa.",
        content: "Exports expand across West Africa. [+120 chars]",
        url: "https://publisher.test/dangote",
        source: { name: "Publisher" },
        publishedAt: "2026-06-10T12:00:00Z"
      }]
    })
  });
  assert.equal(result.provider, "newsapi");
  assert.equal(result.articles[0].sourceName, "Publisher");
  assert.equal(result.articles[0].body, "Exports expand across West Africa. [+120 chars]");
}

{
  const result = await newsdata.collect(source, {
    endpoint: "https://newsdata.io/api/1/latest",
    apiKey: "test-key",
    fetchImpl: mockFetch({
      status: "success",
      results: [{
        article_id: "abc",
        title: "Nigeria launches renewable incentives",
        description: "New incentives target solar and storage.",
        link: "https://publisher.test/incentives",
        source_name: "Regional Desk",
        country: ["nigeria"],
        language: "english",
        pubDate: "2026-06-10 12:00:00"
      }]
    })
  });
  assert.equal(result.provider, "newsdata");
  assert.equal(result.articles[0].providerArticleId, "abc");
  assert.equal(result.articles[0].sourceCountry, "nigeria");
}

{
  const result = await worldnews.collect(source, {
    endpoint: "https://api.worldnewsapi.com/search-news",
    apiKey: "test-key",
    fetchImpl: mockFetch({
      news: [{
        id: 123,
        title: "Nigeria signs gas infrastructure agreement",
        summary: "The agreement affects regional energy supply.",
        text: "The agreement affects regional energy supply and investment flows.",
        url: "https://publisher.test/gas",
        source: "Publisher",
        source_country: "ng",
        language: "en",
        publish_date: "2026-06-10 12:00:00"
      }]
    })
  });
  assert.equal(result.provider, "worldnews");
  assert.equal(result.articles[0].providerArticleId, 123);
  assert.equal(result.articles[0].body, "The agreement affects regional energy supply and investment flows.");
}

assert.equal(getSourceAdapter({ provider: "gdelt" }).provider, "gdelt");
assert.equal(getSourceAdapter({ scrapingConfig: { provider: "newsdata.io" } }).provider, "newsdata");
assert.equal(getSourceAdapter({ provider: "world-news-api" }).provider, "worldnews");
assert.equal(getSourceAdapter({ provider: "unknown" }), null);

console.log("AFRIBN API adapter tests passed");
