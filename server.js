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
const store = createStore();
seedStore(store);

const router = createRouter(store);
const rateLimit = createRateLimiter();
const configWarnings = validateConfig();

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const requestId = `req_${startedAt}_${Math.random().toString(16).slice(2, 8)}`;

  res.setHeader("X-Request-Id", requestId);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

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
    if (req.method === "GET" && serveStatic(req, res, url)) return;
    await router.handle(req, res, url, { requestId, startedAt });
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

function serveStatic(req, res, url) {
  if (url.pathname === "/design") {
    res.writeHead(302, { Location: "/design/index.html" });
    res.end();
    return true;
  }
  if (url.pathname.startsWith("/design/")) {
    return serveFile(res, path.join(process.cwd(), "AFRIBN_design", decodeURIComponent(url.pathname.slice("/design/".length))));
  }
  const routes = {
    "/app": "index.html",
    "/app/": "index.html",
    "/index.html": "index.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
    "/frontend-api.js": "frontend-api.js"
  };
  const file = routes[url.pathname];
  if (!file) return false;
  return serveFile(res, path.join(process.cwd(), file));
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
    ".md": "text/markdown; charset=utf-8"
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
