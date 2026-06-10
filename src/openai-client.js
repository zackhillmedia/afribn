const { badRequest } = require("./http");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

const intelligenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    country: { type: "string" },
    region: { type: "string" },
    sector: { type: "string" },
    eventType: { type: "string", enum: ["Story", "Event", "Policy", "Deal", "Risk", "Alert"] },
    impact: { type: "string", enum: ["low", "medium", "high", "critical"] },
    organizations: { type: "array", items: { type: "string" } },
    people: { type: "array", items: { type: "string" } },
    projects: { type: "array", items: { type: "string" } },
    riskIndicators: { type: "array", items: { type: "string" } },
    opportunities: { type: "array", items: { type: "string" } },
    keyClaims: { type: "array", items: { type: "string" } },
    value: { type: ["string", "null"] },
    confidenceHint: { type: "number" }
  },
  required: [
    "title",
    "summary",
    "country",
    "region",
    "sector",
    "eventType",
    "impact",
    "organizations",
    "people",
    "projects",
    "riskIndicators",
    "opportunities",
    "keyClaims",
    "value",
    "confidenceHint"
  ]
};

async function distillArticleWithOpenAI(rawArticle, source = {}, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      provider: "fallback",
      model: "rules-v1",
      data: fallbackDistillation(rawArticle, source)
    };
  }

  const model = options.model || DEFAULT_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: options.reasoningEffort || "low" },
      input: [
        {
          role: "developer",
          content: [
            "You are AFRIBN's intelligence distillation engine.",
            "Extract structured intelligence from raw African news, policy, government, corporate, or field-source text.",
            "Return conservative facts only. Do not invent missing values. Use null for unknown financial value."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            source: {
              name: source.name,
              country: source.country,
              type: source.type,
              reliability: source.reliability
            },
            article: {
              title: rawArticle.title,
              url: rawArticle.url,
              body: rawArticle.body,
              publishedAt: rawArticle.publishedAt
            }
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "afribn_intelligence_distillation",
          strict: true,
          schema: intelligenceSchema
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI request failed with ${response.status}`;
    throw badRequest(message);
  }

  return {
    provider: "openai",
    model,
    responseId: payload.id,
    data: parseStructuredOutput(payload)
  };
}

function parseStructuredOutput(payload) {
  if (payload.output_parsed) return payload.output_parsed;
  if (payload.output_text) return JSON.parse(payload.output_text);

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.parsed) return content.parsed;
      if (content.text) return JSON.parse(content.text);
    }
  }

  throw badRequest("OpenAI response did not contain structured JSON output");
}

function fallbackDistillation(rawArticle, source = {}) {
  const text = `${rawArticle.title || ""} ${rawArticle.body || ""}`;
  const lower = text.toLowerCase();
  const eventType = lower.includes("deal") || lower.includes("agreement") || lower.includes("$")
    ? "Deal"
    : lower.includes("policy") || lower.includes("regulation") || lower.includes("tariff")
      ? "Policy"
      : lower.includes("attack") || lower.includes("risk") || lower.includes("unrest")
        ? "Risk"
        : "Story";

  const sector = lower.includes("energy") || lower.includes("renewable") || lower.includes("oil") || lower.includes("gas")
    ? "Energy"
    : lower.includes("security") || lower.includes("attack")
      ? "Security"
      : lower.includes("trade") || lower.includes("afcfta")
        ? "Trade"
        : lower.includes("budget") || lower.includes("bank") || lower.includes("inflation")
          ? "Economy"
          : "General";

  return {
    title: rawArticle.title || "Untitled intelligence item",
    summary: summarize(rawArticle.body || rawArticle.title || ""),
    country: inferCountry(text, source.country || "Pan-African"),
    region: "Africa",
    sector,
    eventType,
    impact: eventType === "Deal" || eventType === "Risk" ? "high" : "medium",
    organizations: extractCapitalizedPhrases(text).slice(0, 6),
    people: [],
    projects: [],
    riskIndicators: eventType === "Risk" ? [rawArticle.title] : [],
    opportunities: eventType === "Deal" ? ["Investment and partnership opportunity"] : [],
    keyClaims: [summarize(rawArticle.body || rawArticle.title || "")].filter(Boolean),
    value: extractValue(text),
    confidenceHint: 58
  };
}

function summarize(text) {
  return String(text).split(".").map((part) => part.trim()).filter(Boolean).slice(0, 2).join(". ");
}

function inferCountry(text, fallback) {
  const countries = ["Nigeria", "Kenya", "Ghana", "Ethiopia", "DR Congo", "South Sudan", "Morocco", "South Africa", "Rwanda"];
  return countries.find((country) => text.toLowerCase().includes(country.toLowerCase())) || fallback;
}

function extractCapitalizedPhrases(text) {
  const matches = String(text).match(/\b[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3}\b/g) || [];
  return [...new Set(matches)].filter((item) => item.length > 2);
}

function extractValue(text) {
  const match = String(text).match(/\$?\d+(?:\.\d+)?\s?(?:bn|billion|m|million|tn|trillion)/i);
  return match ? match[0] : null;
}

module.exports = { distillArticleWithOpenAI, fallbackDistillation, intelligenceSchema };
