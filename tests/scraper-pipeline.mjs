import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { discoverSourceItems, extractArticleFromCrawl, parseSourceContent, runScrapeWorker } = require("../src/scrapers");

const source = {
  id: "sources_test",
  name: "AFRIBN Scraper Test",
  country: "Rwanda",
  type: "News",
  url: "https://publisher.test/rss.xml",
  status: "active",
  approvalStatus: "approved",
  reliability: 88
};

{
  const rss = `<?xml version="1.0"?>
    <rss><channel><title>Publisher Feed</title>
      <item>
        <title><![CDATA[Rwanda central bank announces new policy measures]]></title>
        <link>https://publisher.test/news/rwanda-central-bank-policy</link>
        <description><![CDATA[The central bank announced policy measures.]]></description>
        <content:encoded><![CDATA[The National Bank of Rwanda announced new policy measures affecting credit, inflation, and market liquidity.]]></content:encoded>
        <pubDate>Thu, 11 Jun 2026 08:00:00 GMT</pubDate>
        <dc:creator>News Desk</dc:creator>
      </item>
    </channel></rss>`;
  const items = parseSourceContent({ url: source.url, contentType: "application/rss+xml", body: rss }, source);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Rwanda central bank announces new policy measures");
  assert.equal(items[0].author, "News Desk");
  assert.ok(items[0].bodyHint.includes("market liquidity"));
}

{
  const html = `<html><head>
      <title>Generic Site Title</title>
      <meta property="og:title" content="Rwanda approves new investment code">
      <meta name="description" content="New rules aim to improve investor confidence.">
      <meta property="article:published_time" content="2026-06-11T08:30:00Z">
      <meta name="author" content="Policy Desk">
      <link rel="canonical" href="/business/rwanda-investment-code">
    </head><body>
      <nav>Navigation should be removed</nav>
      <article>
        <h1>Rwanda approves new investment code</h1>
        <p>Rwanda approved a new investment code designed to improve investor confidence and streamline licensing.</p>
        <p>The measure sets new incentives for strategic sectors and clarifies reporting obligations for companies.</p>
        <p>Officials said implementation guidance will follow after consultations with private-sector groups.</p>
      </article>
      <footer>Footer should be removed</footer>
    </body></html>`;
  const item = {
    sourceId: source.id,
    url: "https://publisher.test/business/rwanda-investment-code",
    canonicalUrl: "https://publisher.test/business/rwanda-investment-code",
    title: "Fallback title",
    summary: "",
    bodyHint: "",
    language: "en",
    discoveryMethod: "rss"
  };
  const extracted = extractArticleFromCrawl({
    sourceId: source.id,
    url: item.url,
    finalUrl: item.url,
    status: "completed",
    crawler: "fetch",
    contentType: "text/html",
    html
  }, item, source);
  assert.equal(extracted.title, "Rwanda approves new investment code");
  assert.equal(extracted.author, "Policy Desk");
  assert.equal(extracted.publishedAt, "2026-06-11T08:30:00.000Z");
  assert.equal(extracted.canonicalUrl, "https://publisher.test/business/rwanda-investment-code");
  assert.ok(extracted.body.includes("streamline licensing"));
  assert.ok(!extracted.body.includes("Navigation should be removed"));
}

{
  const store = createStore({ persist: false });
  store.insert("sources", source);
  const articleHtml = `<html><head>
      <meta property="og:title" content="Rwanda cabinet backs mining transparency bill">
      <meta name="description" content="Cabinet backed a bill on mineral supply-chain transparency.">
    </head><body><article>
      <p>Rwanda's cabinet backed a mining transparency bill intended to strengthen reporting across mineral supply chains.</p>
      <p>The bill is expected to affect licensing, compliance reviews, and cross-border minerals trade.</p>
      <p>Parliamentary review is expected to determine the final implementation timeline and enforcement rules.</p>
    </article></body></html>`;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    headers: { get: () => String(url).endsWith(".xml") ? "application/rss+xml" : "text/html" },
    url: String(url),
    text: async () => String(url).endsWith(".xml")
      ? `<rss><channel><item><title>Rwanda cabinet backs mining transparency bill</title><link>https://publisher.test/news/mining-bill</link><description>Cabinet backed a bill.</description><pubDate>Thu, 11 Jun 2026 09:00:00 GMT</pubDate></item></channel></rss>`
      : articleHtml
  });
  const result = await runScrapeWorker(store, source.id, { limit: 1 });
  assert.equal(result.scrapeJob.status, "completed");
  assert.equal(result.scrapeJob.discoveredCount, 1);
  assert.equal(result.scrapeJob.crawledCount, 1);
  assert.equal(result.rawArticles.length, 1);
  assert.equal(result.rawArticles[0].title, "Rwanda cabinet backs mining transparency bill");
  assert.ok(result.rawArticles[0].body.includes("cross-border minerals trade"));
  assert.equal(result.rawArticles[0].crawler, "fetch");
  assert.equal(result.rawArticles[0].extractionMethod, "readability-lite");
}

console.log("AFRIBN scraper pipeline tests passed");
