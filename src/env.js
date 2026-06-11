const fs = require("node:fs");
const path = require("node:path");

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnv(filePath = path.join(process.cwd(), ".env")) {
  if (process.env.AFRIBN_ENV_FILE === "0") return { loaded: false, disabled: true, path: filePath, keys: [] };
  if (!fs.existsSync(filePath)) return { loaded: false, path: filePath, keys: [] };
  const keys = [];
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = unquote(line.slice(eq + 1));
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
    keys.push(key);
  }
  return { loaded: true, path: filePath, keys };
}

module.exports = { loadEnv };
