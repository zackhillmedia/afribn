function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

function notFound(message = "Not found") {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

function badRequest(message = "Bad request") {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "BAD_REQUEST";
  return error;
}

function unauthorized(message = "Unauthorized") {
  const error = new Error(message);
  error.statusCode = 401;
  error.code = "UNAUTHORIZED";
  return error;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

function parsePath(pathname) {
  return pathname.split("/").filter(Boolean);
}

module.exports = { sendJson, notFound, badRequest, unauthorized, readBody, parsePath };
