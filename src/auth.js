const crypto = require("node:crypto");
const { unauthorized, badRequest } = require("./http");

const DEFAULT_SECRET = "dev-only-change-AFRIBN_JWT_SECRET";

function hashPassword(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [scheme, salt, expected] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, "base64url");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function signJwt(payload, options = {}) {
  const secret = options.secret || process.env.AFRIBN_JWT_SECRET || DEFAULT_SECRET;
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: "afribn",
    aud: "afribn-api",
    iat: now,
    exp: now + Number(options.expiresInSeconds || 60 * 60 * 8),
    ...payload
  };
  const encodedHeader = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = base64url(JSON.stringify(body));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJwt(token, options = {}) {
  const secret = options.secret || process.env.AFRIBN_JWT_SECRET || DEFAULT_SECRET;
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw unauthorized("Invalid token");
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw unauthorized("Invalid token signature");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) throw unauthorized("Token expired");
  return decoded;
}

function userFromRequest(store, req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const claims = verifyJwt(match[1]);
  const user = store.get("users", claims.sub);
  if (!user) throw unauthorized("Token user no longer exists");
  const role = store.get("roles", user.roleId);
  const organization = store.get("organizations", user.organizationId);
  return { ...user, role, organization };
}

function requireUser(store, req) {
  const user = userFromRequest(store, req);
  if (!user) throw unauthorized("Authentication required");
  return user;
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!body[field]) throw badRequest(`${field} is required`);
  }
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

module.exports = { hashPassword, verifyPassword, signJwt, verifyJwt, userFromRequest, requireUser, requireFields };
