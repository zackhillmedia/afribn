import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const require = createRequire(import.meta.url);
const { createStore } = require("../src/store");
const { seedStore } = require("../src/seed");
const billing = require("../src/billing");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- plan catalog ---
const plans = billing.listPlans();
assert(plans.length === 3, "three plans expected");
assert(plans.every((p) => p.stripePriceId === undefined), "stripePriceId must not leak to the catalog");
assert(billing.planById("professional").priceUsd === 1900, "professional price should match the UI");

// --- entitlements ---
assert(billing.entitlements({ plan: "none", status: "none" }).marketLimit === 0, "no subscription => no markets");
assert(billing.entitlements({ plan: "analyst", status: "trialing" }).marketLimit === 3, "analyst => 3 markets");
assert(billing.entitlements({ plan: "professional", status: "active" }).apiAccess === "limited", "professional => limited API");

// --- subscription lifecycle ---
const store = createStore({ dbPath: join(mkdtempSync(join(tmpdir(), "afribn-bill-")), "afribn.sqlite") });
seedStore(store);
const org = store.list("organizations")[0];

const trial = billing.startTrial(store, org.id, "professional", { seats: 8 });
assert(trial.status === "trialing" && trial.seats === 8 && trial.trialEndsAt, "trial should start in trialing state");
assert(billing.getSubscription(store, org.id).status === "trialing", "current subscription should be the trial");

let threw = false;
try { billing.startTrial(store, org.id, "enterprise"); } catch { threw = true; }
assert(threw, "enterprise trial should be rejected (sales-assisted)");

const canceled = billing.cancelSubscription(store, org.id);
assert(canceled.status === "canceled" && canceled.cancelAtPeriodEnd, "cancel should set canceled + cancelAtPeriodEnd");

// --- Stripe webhook verification + application ---
const payload = JSON.stringify({
  type: "checkout.session.completed",
  data: { object: { client_reference_id: org.id, customer: "cus_1", subscription: "sub_1", metadata: { planId: "professional", organizationId: org.id } } }
});
const t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
const event = billing.verifyWebhook(payload, `t=${t},v1=${sig}`);
billing.applyWebhookEvent(store, event);
const active = billing.getSubscription(store, org.id);
assert(active.status === "active" && active.provider === "stripe" && active.stripeSubscriptionId === "sub_1", "webhook should activate the subscription");

let badThrew = false;
try { billing.verifyWebhook(payload, `t=${t},v1=deadbeef`); } catch { badThrew = true; }
assert(badThrew, "an invalid webhook signature must be rejected");

store.close?.();
console.log("AFRIBN billing test passed");
