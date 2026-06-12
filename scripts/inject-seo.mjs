// One-off: inject SEO/social meta + favicon into every page in AFRIBN_design/.
// Idempotent — pages already carrying the marker are skipped.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "AFRIBN_design");
const SITE = "https://www.afribn.com";
const MARKER = "<!-- afribn:seo -->";
const DEFAULT_DESC =
  "AFRIBN delivers real-time strategic intelligence on Africa's top markets — political, security, economic and policy signals for investors, institutions and decision-makers.";

// Per-page descriptions where a tailored line beats the default.
const DESCRIPTIONS = {
  "index.html":
    "Real-time intelligence on Africa's top 10 strategic markets. AFRIBN tracks political, security, economic and policy signals so you stay ahead of risk and opportunity.",
  "pricing.html": "AFRIBN pricing and plans for real-time African strategic intelligence. Compare tiers and request access.",
  "product.html": "Explore the AFRIBN intelligence platform: live feeds, country briefs, risk dashboards, event monitoring and analyst-verified reports.",
  "feed.html": "The AFRIBN live intelligence feed — verified, real-time updates across Africa's strategic markets.",
  "login.html": "Sign in to AFRIBN — Africa's strategic news intelligence network.",
  "signup.html": "Request access to AFRIBN — real-time strategic intelligence on Africa's top markets.",
  "country.html": "Country intelligence briefs covering political, security and economic developments across Africa's strategic markets.",
  "solutions.html": "AFRIBN intelligence solutions for investors, institutions, governments and risk teams operating in Africa.",
  "reports.html": "Analyst-verified intelligence reports on Africa's strategic markets, sectors and events."
};

let changed = 0;
let skipped = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".html"))) {
  const path = join(DIR, file);
  let html = readFileSync(path, "utf8");

  if (html.includes(MARKER)) {
    skipped++;
    continue;
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) {
    skipped++;
    continue;
  }
  const title = titleMatch[1].trim();
  const desc = DESCRIPTIONS[file] || DEFAULT_DESC;
  const slug = file.replace(/\.html$/, "");
  const canonical = slug === "index" ? `${SITE}/` : `${SITE}/${slug}`;

  const block = `${MARKER}
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="AFRIBN">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/assets/favicon-512.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="theme-color" content="#0a0809">`;

  // Insert immediately after the closing </title> tag.
  html = html.replace(/<\/title>/i, `</title>\n${block}`);
  writeFileSync(path, html, "utf8");
  changed++;
}

console.log(`SEO injection complete: ${changed} pages updated, ${skipped} skipped.`);
