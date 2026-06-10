const { badRequest } = require("./http");

async function deliverQueuedAlerts(store, options = {}) {
  const deliveries = store.list("alertDeliveries", (delivery) => delivery.status === "queued");
  const results = [];

  for (const delivery of deliveries) {
    const alert = store.get("alerts", delivery.alertId);
    if (!alert) {
      results.push(store.update("alertDeliveries", delivery.id, { status: "failed", error: "Alert missing" }));
      continue;
    }

    try {
      const result = delivery.channel === "sms"
        ? await sendSms(alert, options)
        : await sendEmail(alert, options);
      results.push(store.update("alertDeliveries", delivery.id, {
        status: result.sent ? "sent" : "held",
        provider: result.provider,
        providerMessageId: result.messageId || null,
        sentAt: result.sent ? new Date().toISOString() : null,
        note: result.note || null
      }));
    } catch (error) {
      results.push(store.update("alertDeliveries", delivery.id, {
        status: "failed",
        failedAt: new Date().toISOString(),
        error: error.message
      }));
    }
  }

  return results;
}

async function sendEmail(alert, options = {}) {
  const apiKey = options.sendgridApiKey || process.env.SENDGRID_API_KEY;
  const to = options.to || process.env.ALERT_EMAIL_TO;
  const from = options.from || process.env.ALERT_EMAIL_FROM || "alerts@afribn.local";
  if (!apiKey || !to) return { sent: false, provider: "sendgrid", note: "SENDGRID_API_KEY or ALERT_EMAIL_TO not configured" };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject: `AFRIBN ${alert.priority} alert: ${alert.title}`,
      content: [{ type: "text/plain", value: `${alert.title}\n\nCountry: ${alert.country}\nSector: ${alert.sector}` }]
    })
  });

  if (!response.ok) throw badRequest(`SendGrid delivery failed with HTTP ${response.status}`);
  return { sent: true, provider: "sendgrid", messageId: response.headers.get("x-message-id") };
}

async function sendSms(alert, options = {}) {
  const sid = options.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const token = options.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
  const from = options.from || process.env.TWILIO_FROM;
  const to = options.to || process.env.ALERT_SMS_TO;
  if (!sid || !token || !from || !to) return { sent: false, provider: "twilio", note: "Twilio SMS env vars not configured" };

  const body = new URLSearchParams({
    From: from,
    To: to,
    Body: `AFRIBN ${alert.priority}: ${alert.title} (${alert.country})`
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw badRequest(payload.message || `Twilio delivery failed with HTTP ${response.status}`);
  return { sent: true, provider: "twilio", messageId: payload.sid };
}

module.exports = { deliverQueuedAlerts, sendEmail, sendSms };
