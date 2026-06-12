const { badRequest } = require("./http");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const DEFAULT_QWEN_MODEL = process.env.QWEN_MODEL || "qwen-plus";
const DEFAULT_QWEN_BASE_URL = process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

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
    keyFacts: { type: "array", items: { type: "string" } },
    whyItMatters: { type: "array", items: { type: "string" } },
    potentialConsequences: { type: "array", items: { type: "string" } },
    whatToWatchNext: { type: "array", items: { type: "string" } },
    supportingContext: { type: "array", items: { type: "string" } },
    missingFacts: { type: "array", items: { type: "string" } },
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
    "keyFacts",
    "whyItMatters",
    "potentialConsequences",
    "whatToWatchNext",
    "supportingContext",
    "missingFacts",
    "value",
    "confidenceHint"
  ]
};

async function distillArticleWithOpenAI(rawArticle, source = {}, options = {}) {
  const provider = selectProvider(options);
  if (provider === "qwen") {
    return distillArticleWithQwen(rawArticle, source, options);
  }

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      provider: "fallback",
      model: "rules-v1",
      data: fallbackDistillation(rawArticle, source)
    };
  }

  const model = options.model || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || process.env.AFRIBN_AI_TIMEOUT_MS || 20000));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: controller.signal,
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
          content: systemPrompt()
        },
        {
          role: "user",
          content: articlePrompt(rawArticle, source)
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
  }).finally(() => clearTimeout(timeout));

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `OpenAI request failed with ${response.status}`;
    throw badRequest(message);
  }

  return {
    provider: "openai",
    model,
    responseId: payload.id,
    data: normalizeDistillation(parseStructuredOutput(payload), rawArticle, source)
  };
}

async function distillArticleWithQwen(rawArticle, source = {}, options = {}) {
  const apiKey = options.qwenApiKey || options.apiKey || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return {
      provider: "fallback",
      model: "rules-v1",
      data: fallbackDistillation(rawArticle, source)
    };
  }

  const baseUrl = (options.qwenBaseUrl || process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL).replace(/\/$/, "");
  const model = options.qwenModel || options.model || DEFAULT_QWEN_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || process.env.AFRIBN_AI_TIMEOUT_MS || 20000));
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature ?? 0.2,
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: articlePrompt(rawArticle, source) }
      ]
    })
  }).finally(() => clearTimeout(timeout));

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || `Qwen request failed with ${response.status}`;
    throw badRequest(message);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw badRequest("Qwen response did not contain message content");
  return {
    provider: "qwen",
    model,
    responseId: payload.id || null,
    usage: {
      inputTokens: payload.usage?.prompt_tokens || null,
      outputTokens: payload.usage?.completion_tokens || null
    },
    data: normalizeDistillation(parseJsonText(content), rawArticle, source)
  };
}

function selectProvider(options = {}) {
  const requested = String(options.provider || process.env.AI_PRIMARY_PROVIDER || "").toLowerCase();
  if (requested === "qwen") return "qwen";
  if (requested === "openai") return "openai";
  if (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY) return "qwen";
  return "openai";
}

function systemPrompt() {
  return [
    "You are AFRIBN's launch-version intelligence item generator.",
    "Convert raw African news, policy, corporate, market, or public-interest text into an editable intelligence item.",
    "Return JSON only. Be conservative. Do not invent facts. If something is unknown, say what is missing.",
    "The title must be agency style and 50 to 65 characters when possible.",
    "The summary must be about 200 words, factual, and explain what happened.",
    "Provide keyFacts, exactly four whyItMatters items, potentialConsequences, and whatToWatchNext."
  ].join(" ");
}

function articlePrompt(rawArticle, source = {}) {
  return JSON.stringify({
    instructions: {
      title: "From the raw article, generate a 50 to 65 character title that summarizes what happened in agency style.",
      summary: "From the raw article, create a 200 word summary narrating what happened.",
      keyFacts: "List the strongest factual claims that can be supported by the raw article.",
      whyItMatters: "Give four concise reasons this matters for decision makers.",
      potentialConsequences: "List plausible consequences while separating them from confirmed facts.",
      whatToWatchNext: "List next indicators, dates, documents, decisions, or stakeholders to monitor."
    },
    source: {
      name: source.name,
      country: source.country,
      type: source.type,
      reliability: source.reliability
    },
    article: {
      title: rawArticle.title,
      url: rawArticle.url,
      body: rawArticle.body || rawArticle.summary,
      publishedAt: rawArticle.publishedAt
    },
    outputShape: Object.keys(intelligenceSchema.properties)
  });
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

function parseJsonText(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || trimmed.match(/(\{[\s\S]*\})/);
    if (!match) throw error;
    return JSON.parse(match[1]);
  }
}

function normalizeDistillation(input = {}, rawArticle = {}, source = {}) {
  const fallback = fallbackDistillation(rawArticle, source);
  const data = { ...fallback, ...input };
  data.title = fitTitle(data.title || fallback.title);
  data.summary = data.summary || fallback.summary;
  data.country = data.country || fallback.country;
  data.region = data.region || fallback.region;
  data.sector = data.sector || fallback.sector;
  data.eventType = normalizeEnum(data.eventType, intelligenceSchema.properties.eventType.enum, fallback.eventType);
  data.impact = normalizeEnum(String(data.impact || "").toLowerCase(), intelligenceSchema.properties.impact.enum, fallback.impact);
  for (const field of ["organizations", "people", "projects", "riskIndicators", "opportunities", "keyClaims", "keyFacts", "whyItMatters", "potentialConsequences", "whatToWatchNext", "supportingContext", "missingFacts"]) {
    data[field] = normalizeArray(data[field] ?? fallback[field]);
  }
  data.whyItMatters = ensureLength(data.whyItMatters, fallback.whyItMatters, 4);
  data.value = data.value ?? fallback.value ?? null;
  data.confidenceHint = Math.max(0, Math.min(100, Number(data.confidenceHint ?? fallback.confidenceHint ?? 55)));
  return data;
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
    title: fitTitle(rawArticle.title || "Untitled intelligence item"),
    summary: longSummary(rawArticle.body || rawArticle.summary || rawArticle.title || ""),
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
    keyFacts: [
      summarize(rawArticle.body || rawArticle.summary || rawArticle.title || ""),
      rawArticle.publishedAt ? `Reported on ${new Date(rawArticle.publishedAt).toISOString().slice(0, 10)}` : "",
      source.name ? `Collected from ${source.name}` : ""
    ].filter(Boolean),
    whyItMatters: [
      `It affects how decision makers read developments in ${source.country || "Africa"}.`,
      "It may influence policy, market, or operating-risk assumptions.",
      "It creates a monitoring signal for related institutions and sectors.",
      "It should be tracked for confirmation, implementation, or response."
    ],
    potentialConsequences: [
      eventType === "Risk" ? "Security or operational exposure may rise if the situation escalates." : "Stakeholders may adjust plans as more details emerge.",
      "Public agencies, companies, or partners may issue follow-up statements."
    ],
    whatToWatchNext: [
      "Official confirmation or supporting documents.",
      "Implementation timeline and responsible institutions.",
      "Reactions from affected stakeholders."
    ],
    supportingContext: [source.name ? `Source: ${source.name}` : ""].filter(Boolean),
    missingFacts: ["Independent corroboration", "Precise implementation timeline"].filter(Boolean),
    value: extractValue(text),
    confidenceHint: 58
  };
}

function fitTitle(title) {
  const clean = String(title || "Untitled intelligence item").replace(/\s+/g, " ").trim();
  if (clean.length <= 65) return clean;
  return `${clean.slice(0, 62).replace(/\s+\S*$/, "")}...`;
}

function summarize(text) {
  return String(text).split(".").map((part) => part.trim()).filter(Boolean).slice(0, 2).join(". ");
}

function longSummary(text) {
  const parts = String(text).split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const picked = parts.slice(0, 6).join(" ");
  return picked || summarize(text);
}

function inferCountry(text, fallback) {
  const countries = ["Nigeria", "Kenya", "Ghana", "Ethiopia", "DR Congo", "South Sudan", "Morocco", "South Africa", "Rwanda", "Tanzania"];
  return countries.find((country) => text.toLowerCase().includes(country.toLowerCase())) || fallback;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function ensureLength(items, fallbackItems, min) {
  const out = [...new Set([...(items || []), ...(fallbackItems || [])])].filter(Boolean);
  return out.slice(0, Math.max(min, out.length));
}

function extractCapitalizedPhrases(text) {
  const matches = String(text).match(/\b[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,3}\b/g) || [];
  return [...new Set(matches)].filter((item) => item.length > 2);
}

function extractValue(text) {
  const match = String(text).match(/\$?\d+(?:\.\d+)?\s?(?:bn|billion|m|million|tn|trillion)/i);
  return match ? match[0] : null;
}

module.exports = { distillArticleWithOpenAI, distillArticleWithQwen, fallbackDistillation, intelligenceSchema };
