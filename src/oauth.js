// Server-side OAuth 2.0 Authorization Code flow for Google and Microsoft.
// Credentials are read from the environment so nothing secret ships to the
// client. When a provider's client id/secret are absent it reports as
// "not configured" and the UI disables its button instead of failing mid-flow.
const { signJwt, verifyJwt } = require("./auth");
const { badRequest } = require("./http");

const PROVIDERS = {
  google: {
    label: "Google",
    scope: "openid email profile",
    authorizeUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    userInfoUrl: () => "https://openidconnect.googleapis.com/v1/userinfo",
    clientId: () => process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret: () => process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    profile: (info) => ({
      email: info.email,
      name: info.name || info.given_name || info.email,
      verified: info.email_verified !== false
    })
  }
};

function getProvider(id) {
  const provider = PROVIDERS[id];
  if (!provider) throw badRequest(`Unknown OAuth provider: ${id}`);
  return provider;
}

function isConfigured(id) {
  const provider = PROVIDERS[id];
  return Boolean(provider && provider.clientId() && provider.clientSecret());
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([id, provider]) => ({
    id,
    label: provider.label,
    configured: isConfigured(id)
  }));
}

// Stateless CSRF state: a short-lived signed token carrying provider + return path.
function createState(providerId, next) {
  return signJwt({ kind: "oauth_state", provider: providerId, next: next || "" }, { expiresInSeconds: 600 });
}

function verifyState(token, providerId) {
  let claims;
  try {
    claims = verifyJwt(token);
  } catch {
    throw badRequest("OAuth state is invalid or has expired");
  }
  if (claims.kind !== "oauth_state" || claims.provider !== providerId) {
    throw badRequest("OAuth state mismatch");
  }
  return claims;
}

function authorizeUrl({ providerId, redirectUri, state }) {
  const provider = getProvider(providerId);
  if (!isConfigured(providerId)) throw badRequest(`${provider.label} sign-in is not configured`);
  const params = new URLSearchParams({
    client_id: provider.clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scope,
    state,
    access_type: "offline",
    prompt: "select_account"
  });
  return `${provider.authorizeUrl()}?${params.toString()}`;
}

async function exchangeCodeForProfile({ providerId, code, redirectUri }) {
  const provider = getProvider(providerId);
  const tokenBody = new URLSearchParams({
    client_id: provider.clientId(),
    client_secret: provider.clientSecret(),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const tokenResponse = await fetch(provider.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: tokenBody
  });
  if (!tokenResponse.ok) throw badRequest(`${provider.label} token exchange failed (${tokenResponse.status})`);
  const tokens = await tokenResponse.json();
  if (!tokens.access_token) throw badRequest(`${provider.label} did not return an access token`);

  const infoResponse = await fetch(provider.userInfoUrl(), {
    headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" }
  });
  if (!infoResponse.ok) throw badRequest(`${provider.label} profile lookup failed (${infoResponse.status})`);
  const profile = provider.profile(await infoResponse.json());
  if (!profile.email) throw badRequest(`${provider.label} account did not expose an email address`);
  return { ...profile, provider: providerId };
}

module.exports = {
  listProviders,
  isConfigured,
  createState,
  verifyState,
  authorizeUrl,
  exchangeCodeForProfile
};
