// One-off: rewrite internal links and asset refs across AFRIBN_design/*.html
// to clean, root-absolute URLs (/pricing, /assets/...). Idempotent.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "AFRIBN_design");
const SITE = "https://www.afribn.com";

function cleanName(name) {
  return name === "index" ? "/" : `/${name}`;
}

let changed = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".html"))) {
  const path = join(DIR, file);
  let html = readFileSync(path, "utf8");
  const before = html;

  // href/src to a sibling page: "pricing.html", "index.html#x", "story.html?id=1"
  html = html.replace(/(href|src)="([a-z0-9-]+)\.html(#[^"]*|\?[^"]*)?"/gi, (m, attr, name, suffix = "") => {
    const base = cleanName(name);
    // index.html#features -> /#features ; index.html -> /
    if (name === "index" && suffix) return `${attr}="/${suffix}"`;
    return `${attr}="${base}${suffix}"`;
  });

  // Asset references -> root-absolute so they resolve from any clean URL.
  html = html.replace(/(href|src)="assets\//gi, '$1="/assets/');
  html = html.replace(/url\((['"]?)assets\//gi, "url($1/assets/");

  // Canonical / OG / Twitter absolute URLs that still carry /design/.
  html = html.replace(new RegExp(`${SITE}/design/assets/`, "g"), `${SITE}/assets/`);
  html = html.replace(new RegExp(`${SITE}/design/([a-z0-9-]+)\\.html`, "g"), (m, name) =>
    name === "index" ? `${SITE}/` : `${SITE}/${name}`
  );

  if (html !== before) {
    writeFileSync(path, html, "utf8");
    changed++;
  }
}
console.log(`Clean-URL rewrite complete: ${changed} pages updated.`);
