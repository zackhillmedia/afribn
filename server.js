const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { loadEnv } = require("./src/env");
const { createStore } = require("./src/store");
const { createRouter } = require("./src/router");
const { seedStore } = require("./src/seed");
const { validateConfig, publicConfig } = require("./src/config");
const { createRateLimiter } = require("./src/rate-limit");

loadEnv();

const port = Number(process.env.PORT || 3000);

// CORS allowlist. Configure extra origins via ALLOWED_ORIGINS (comma-separated).
// Defaults cover the production site and local development.
const ALLOWED_ORIGINS = new Set(
  [
    "https://www.afribn.com",
    "https://afribn.com",
    `http://localhost:${process.env.PORT || 3000}`,
    `http://127.0.0.1:${process.env.PORT || 3000}`,
    ...String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  ]
);

const store = createStore();
seedStore(store);

const router = createRouter(store);
const rateLimit = createRateLimiter();
const configWarnings = validateConfig();

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const requestId = `req_${startedAt}_${Math.random().toString(16).slice(2, 8)}`;

  res.setHeader("X-Request-Id", requestId);
  // CORS: only reflect origins on the allowlist instead of a blanket "*".
  // The frontend is served same-origin, so cross-origin access is opt-in via
  // ALLOWED_ORIGINS (comma-separated). Falls back to the site's own origins.
  const requestOrigin = req.headers.origin;
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Force HTTPS for a year (incl. subdomains) and constrain resource origins.
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Inline <style>/<script> blocks are used throughout the static pages.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ")
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const limits = rateLimit(req);
    res.setHeader("X-RateLimit-Limit", String(limits.limit));
    res.setHeader("X-RateLimit-Remaining", String(limits.remaining));
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/ready") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ready", config: publicConfig(), warnings: configWarnings }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/robots.txt") {
      if (serveFile(res, path.join(process.cwd(), "robots.txt"))) return;
    }
    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      if (serveFile(res, path.join(process.cwd(), "sitemap.xml"))) return;
    }
    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      res.writeHead(302, { Location: "/assets/favicon-32.png" });
      res.end();
      return;
    }

    // The JSON API lives under /api/* so the root namespace belongs to pages.
    // /health is also accepted at the root for platform health probes.
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (isApi || url.pathname === "/health") {
      const apiUrl = new URL(req.url, `http://${req.headers.host}`);
      apiUrl.pathname = isApi ? url.pathname.slice("/api".length) || "/" : "/health";
      await router.handle(req, res, apiUrl, { requestId, startedAt });
      return;
    }

    // 301 legacy paths (/design/*, *.html) to their canonical clean URL.
    if (req.method === "GET") {
      const target = legacyRedirect(url.pathname);
      if (target) {
        res.writeHead(301, { Location: target + (url.search || "") });
        res.end();
        return;
      }
      if (serveStatic(req, res, url)) return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    const status = error.statusCode || 500;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: {
        message: status === 500 ? "Internal server error" : error.message,
        code: error.code || "SERVER_ERROR",
        requestId
      }
    }));
  }
});

// Maps a legacy path to its canonical clean URL, or null when none applies.
// Old links (/design/pricing.html, /pricing.html) keep working via 301.
function legacyRedirect(pathname) {
  if (pathname === "/design" || pathname === "/design/" || pathname === "/design/index.html") return "/";
  if (pathname.startsWith("/design/assets/")) return "/assets/" + pathname.slice("/design/assets/".length);
  if (pathname.startsWith("/design/")) {
    const name = pathname.slice("/design/".length).replace(/\.html$/, "");
    return name === "index" ? "/" : "/" + name;
  }
  if (pathname === "/index.html") return "/";
  if (/^\/[a-z0-9-]+\.html$/i.test(pathname)) return pathname.replace(/\.html$/, "");
  return null;
}

function serveStatic(req, res, url) {
  const cwd = process.cwd();
  const design = path.join(cwd, "AFRIBN_design");

  // Clean asset route: /assets/* -> AFRIBN_design/assets/*
  if (url.pathname.startsWith("/assets/")) {
    return serveFile(res, path.join(design, "assets", decodeURIComponent(url.pathname.slice("/assets/".length))));
  }

  // Marketing/app homepage.
  if (url.pathname === "/") return serveFile(res, path.join(design, "index.html"));

  // Repo-root MVP console and its assets (kept for the /app prototype).
  const rootRoutes = { "/app": "index.html", "/app/": "index.html", "/styles.css": "styles.css", "/app.js": "app.js", "/frontend-api.js": "frontend-api.js" };
  if (rootRoutes[url.pathname]) return serveFile(res, path.join(cwd, rootRoutes[url.pathname]));

  // Clean page route: /<name> -> AFRIBN_design/<name>.html
  const match = url.pathname.match(/^\/([a-z0-9][a-z0-9-]*)$/i);
  if (match) return serveFile(res, path.join(design, `${match[1]}.html`));

  return false;
}

function serveFile(res, requestedPath) {
  const root = process.cwd();
  const resolved = path.resolve(requestedPath);
  if (!resolved.startsWith(root) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return false;
  const filePath = resolved;
  if (!fs.existsSync(filePath)) return false;
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8"
  };
  res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

if (require.main === module) {
  server.listen(port, () => {
    console.log(`AFRIBN backend listening on http://127.0.0.1:${port}`);
    for (const warning of configWarnings) console.warn(`CONFIG WARNING: ${warning}`);
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    store.close?.();
    server.close(() => process.exit(0));
  });
}

module.exports = { server, store };
