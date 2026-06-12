// Billing workflow: plan catalog, per-organization subscription lifecycle,
// plan entitlements, and Stripe integration (Checkout Sessions + webhooks)
// via Stripe's REST API — no SDK, so the codebase stays dependency-free.
const crypto = require("node:crypto");
const { badRequest, notFound, unauthorized } = require("./http");

const TRIAL_DAYS = Number(process.env.BILLING_TRIAL_DAYS || 14);

// Prices match the marketing UI (per seat / month; annual = 20% off).
const PLANS = {
  analyst: {
    id: "analyst",
    name: "Analyst",
    audience: "Individuals",
    priceUsd: 490,
    interval: "month",
    seats: 1,
    salesAssisted: false,
    entitlements: { marketLimit: 3, apiAccess: false, alerts: false, watchlists: true, reports: false },
    features: ["Live feed", "3 country briefs", "Daily digest"],
    stripePriceId: () => process.env.STRIPE_PRICE_ANALYST || ""
  },
  professional: {
    id: "professional",
    name: "Professional",
    audience: "Teams",
    priceUsd: 1900,
    interval: "month",
    seats: 5,
    salesAssisted: false,
    entitlements: { marketLimit: 10, apiAccess: "limited", alerts: true, watchlists: true, reports: true },
    features: ["All 10 markets", "Alerts & watchlists", "Reports", "Limited API"],
    stripePriceId: () => process.env.STRIPE_PRICE_PROFESSIONAL || ""
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    audience: "Institutions",
    priceUsd: null,
    interval: "custom",
    seats: null,
    salesAssisted: true,
    entitlements: { marketLimit: 10, apiAccess: "full", alerts: true, watchlists: true, reports: true, sso: true, customBriefs: true },
    features: ["Everything in Professional", "Full API", "SSO", "Custom briefs", "Dedicated support"],
    stripePriceId: () => process.env.STRIPE_PRICE_ENTERPRISE || ""
  }
};

function listPlans() {
  return Object.values(PLANS).map(({ stripePriceId, ...plan }) => ({ ...plan }));
}

function planById(id) {
  const plan = PLANS[String(id || "").toLowerCase()];
  if (!plan) throw badRequest(`Unknown plan: ${id}`);
  return plan;
}

function getSubscription(store, organizationId) {
  return store.list("subscriptions", (s) => s.organizationId === organizationId).at(-1)
    || { organizationId, plan: "none", status: "none", seats: 0 };
}

function entitlements(subscription) {
  const active = ["trialing", "active"].includes(subscription.status);
  if (!active || !PLANS[subscription.plan]) {
    return { marketLimit: 0, apiAccess: false, alerts: false, watchlists: false, reports: false };
  }
  return { ...PLANS[subscription.plan].entitlements, seats: subscription.seats };
}

function upsertSubscription(store, organizationId, patch) {
  const existing = store.list("subscriptions", (s) => s.organizationId === organizationId).at(-1);
  if (existing) return store.update("subscriptions", existing.id, patch);
  return store.insert("subscriptions", { organizationId, ...patch });
}

function startTrial(store, organizationId, planId, { seats } = {}) {
  const plan = planById(planId);
  if (plan.salesAssisted) throw badRequest("Enterprise is sales-assisted; use request access");
  const now = Date.now();
  return upsertSubscription(store, organizationId, {
    plan: plan.id,
    status: "trialing",
    seats: Number(seats || plan.seats || 1),
    trialEndsAt: new Date(now + TRIAL_DAYS * 86400000).toISOString(),
    currentPeriodEnd: new Date(now + TRIAL_DAYS * 86400000).toISOString(),
    provider: "trial",
    startedAt: new Date(now).toISOString()
  });
}

function cancelSubscription(store, organizationId) {
  const sub = store.list("subscriptions", (s) => s.organizationId === organizationId).at(-1);
  if (!sub) throw notFound("No subscription to cancel");
  return store.update("subscriptions", sub.id, { status: "canceled", cancelAtPeriodEnd: true, canceledAt: new Date().toISOString() });
}

// --- Stripe (REST) ---
function stripeConfigured(plan) {
  return Boolean(process.env.STRIPE_SECRET_KEY && plan.stripePriceId());
}

async function createCheckoutSession({ plan, organizationId, email, seats, baseUrl }) {
  if (plan.salesAssisted) return { configured: false, salesAssisted: true };
  if (!stripeConfigured(plan)) return { configured: false };
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", plan.stripePriceId());
  form.set("line_items[0][quantity]", String(seats || plan.seats || 1));
  form.set("success_url", `${baseUrl}/checkout?status=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${baseUrl}/checkout?status=cancel`);
  form.set("client_reference_id", organizationId);
  form.set("subscription_data[trial_period_days]", String(TRIAL_DAYS));
  form.set("metadata[planId]", plan.id);
  form.set("metadata[organizationId]", organizationId);
  if (email) form.set("customer_email", email);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw badRequest(data.error?.message || `Stripe checkout failed (${response.status})`);
  return { configured: true, url: data.url, sessionId: data.id };
}

function verifyWebhook(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) throw badRequest("Stripe webhook secret is not configured");
  const parts = Object.fromEntries(String(signatureHeader || "").split(",").map((kv) => kv.split("=")));
  if (!parts.t || !parts.v1) throw badRequest("Invalid Stripe-Signature header");
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw unauthorized("Invalid webhook signature");
  return JSON.parse(rawBody);
}

function applyWebhookEvent(store, event) {
  const object = event?.data?.object || {};
  const organizationId = object.client_reference_id || object.metadata?.organizationId;
  const planId = object.metadata?.planId;
  if (!organizationId) return { ignored: event.type };

  if (event.type === "checkout.session.completed") {
    upsertSubscription(store, organizationId, {
      plan: planId || getSubscription(store, organizationId).plan,
      status: "active",
      provider: "stripe",
      stripeCustomerId: object.customer || null,
      stripeSubscriptionId: object.subscription || null,
      activatedAt: new Date().toISOString()
    });
  } else if (event.type === "customer.subscription.updated") {
    const statusMap = { trialing: "trialing", active: "active", past_due: "past_due", canceled: "canceled", unpaid: "past_due", paused: "paused" };
    upsertSubscription(store, organizationId, {
      status: statusMap[object.status] || "active",
      currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: Boolean(object.cancel_at_period_end)
    });
  } else if (event.type === "customer.subscription.deleted") {
    upsertSubscription(store, organizationId, { status: "canceled", canceledAt: new Date().toISOString() });
  }
  return { handled: event.type };
}

module.exports = {
  PLANS, listPlans, planById, getSubscription, entitlements, startTrial,
  cancelSubscription, createCheckoutSession, verifyWebhook, applyWebhookEvent, stripeConfigured
};
