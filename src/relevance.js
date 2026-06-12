// Phase 2 relevance/triage: cheap, no-LLM scoring of an item against a source's
// mandate so we ingest strategically valuable, Africa-focused intelligence
// rather than everything a source carries. See ADR-001.

const AFRICAN_COUNTRIES = [
  "algeria", "angola", "benin", "botswana", "burkina faso", "burundi", "cameroon", "cape verde",
  "central african republic", "chad", "comoros", "congo", "dr congo", "democratic republic of congo",
  "cote d'ivoire", "ivory coast", "djibouti", "egypt", "equatorial guinea", "eritrea", "eswatini",
  "ethiopia", "gabon", "gambia", "ghana", "guinea", "guinea-bissau", "kenya", "lesotho", "liberia",
  "libya", "madagascar", "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique",
  "namibia", "niger", "nigeria", "rwanda", "sao tome", "senegal", "seychelles", "sierra leone",
  "somalia", "south africa", "south sudan", "sudan", "tanzania", "togo", "tunisia", "uganda",
  "zambia", "zimbabwe"
];

// Launch coverage — the 10 priority markets get the highest geo weight.
const LAUNCH_MARKETS = [
  "nigeria", "south africa", "kenya", "egypt", "morocco", "ghana", "rwanda",
  "cote d'ivoire", "cote divoire", "ivory coast", "tanzania", "uganda"
];

// Tier 1 — moves capital and operations directly (highest weight).
const TIER1_TERMS = [
  // political stability & transitions
  "coup", "military takeover", "junta", "putsch", "state of emergency", "disputed election",
  "impeachment", "succession", "transition of power",
  // security & conflict
  "insurgency", "insurgent", "jihadist", "militant", "terrorism", "terror attack", "armed group",
  "offensive", "ceasefire", "civil war", "conflict", "clashes", "abduction", "piracy",
  // macro & sovereign risk
  "default", "debt distress", "debt restructuring", "devaluation", "currency crisis", "forex",
  "fx shortage", "capital controls", "eurobond", "imf", "bailout", "sovereign downgrade",
  // resource & energy
  "oil", "gas", "lng", "cobalt", "lithium", "copper", "gold", "critical minerals", "mining",
  "licensing round", "load-shedding", "load shedding", "blackout", "power crisis", "pipeline",
  // expropriation / sanctions
  "expropriation", "nationalization", "nationalisation", "resource nationalism", "sanctions", "seizure"
];

// Tier 2 — reshapes the operating environment (medium weight).
const TIER2_TERMS = [
  // policy & regulation
  "policy", "regulation", "regulatory", "local content", "mining code", "tax", "levy", "tariff",
  "licensing", "indigenization", "afcfta", "trade agreement", "data protection",
  // geopolitics & external influence
  "china", "russia", "wagner", "africa corps", "belt and road", "gulf", "uae", "saudi", "qatar",
  "turkey", "european union", "world bank", "afdb",
  // infrastructure & megaprojects
  "port", "railway", "rail", "gerd", "dam", "special economic zone", "infrastructure", "concession",
  "ppp", "fibre", "fiber", "data centre", "data center",
  // trade, investment & deals
  "investment", "fdi", "acquisition", "merger", "private equity", "venture", "deal", "agreement",
  "fintech", "ipo", "stake",
  // macro & governance signals
  "central bank", "interest rate", "inflation", "budget", "gdp", "subsidy", "fuel subsidy",
  "government", "minister", "ministry", "parliament", "cabinet", "reshuffle", "president", "election",
  "ecowas", "african union", "sadc", "protest", "strike", "corruption"
];

function lc(value) {
  return String(value || "").toLowerCase();
}

function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[,\n;]/).map((v) => v.trim()).filter(Boolean);
}

// Derives a source's collection mandate from its fields + optional overrides
// stored on source.mandate or source.scrapingConfig.mandate.
function sourceMandate(source = {}) {
  const override = source.mandate || source.scrapingConfig?.mandate || {};
  const country = source.country && source.country !== "Pan-African" ? [source.country] : [];
  return {
    countries: toList(override.countries).length ? toList(override.countries) : country,
    sectors: toList(override.sectors).length ? toList(override.sectors) : toList(source.sector),
    includeKeywords: toList(override.includeKeywords),
    excludeKeywords: toList(override.excludeKeywords),
    region: override.region || "Africa",
    minRelevance: override.minRelevance != null ? Number(override.minRelevance) : null
  };
}

// 0-100 relevance score + boolean + human-readable reasons.
function scoreRelevance(text, mandate = {}) {
  const t = lc(text);
  const reasons = [];
  let score = 0;

  // Geo weighting: source mandate country > any launch market > other African
  // country > generic Africa mention. Keeps the feed continent-focused and
  // tilts toward the 10 launch markets.
  const countryHit = (mandate.countries || []).find((c) => c && t.includes(lc(c)));
  const launchHit = LAUNCH_MARKETS.find((c) => t.includes(c));
  const africanHit = AFRICAN_COUNTRIES.find((c) => t.includes(c));
  if (countryHit) {
    score += 50;
    reasons.push(`mandate country: ${countryHit}`);
  } else if (launchHit) {
    score += 42;
    reasons.push(`launch market: ${launchHit}`);
  } else if (africanHit) {
    score += 26;
    reasons.push(`african context: ${africanHit}`);
  } else if (mandate.region === "Africa" && t.includes("africa")) {
    score += 14;
    reasons.push("africa mention");
  }

  const sectorHit = (mandate.sectors || []).find((s) => s && t.includes(lc(s)));
  if (sectorHit) {
    score += 15;
    reasons.push(`sector: ${sectorHit}`);
  }

  // Tier 1 signals are worth far more than Tier 2 — a coup or default outranks a routine policy note.
  const tier1 = TIER1_TERMS.filter((w) => t.includes(w));
  if (tier1.length) {
    score += Math.min(30, tier1.length * 15);
    reasons.push(`tier-1: ${tier1.slice(0, 3).join(", ")}`);
  }
  const tier2 = TIER2_TERMS.filter((w) => t.includes(w));
  if (tier2.length) {
    score += Math.min(20, tier2.length * 8);
    reasons.push(`tier-2: ${tier2.slice(0, 3).join(", ")}`);
  }

  const includeHit = (mandate.includeKeywords || []).find((k) => k && t.includes(lc(k)));
  if (includeHit) {
    score += 20;
    reasons.push(`keyword: ${includeHit}`);
  }

  const excludeHit = (mandate.excludeKeywords || []).find((k) => k && t.includes(lc(k)));
  if (excludeHit) {
    score -= 60;
    reasons.push(`excluded: ${excludeHit}`);
  }

  score = Math.max(0, Math.min(100, score));
  const min = Number(mandate.minRelevance != null ? mandate.minRelevance : process.env.RELEVANCE_MIN || 40);
  return { score, relevant: score >= min && !excludeHit, reasons, threshold: min };
}

// Hard pre-fetch gate (cheap): drop only on explicit exclude hits or when
// required include keywords are configured and absent. Geo/sector are scored,
// not hard-filtered, so a default mandate never drops items at discovery.
function passesMandate(item, mandate = {}) {
  const text = lc(`${item.title || ""} ${item.summary || ""} ${item.bodyHint || ""}`);
  if ((mandate.excludeKeywords || []).some((k) => k && text.includes(lc(k)))) return false;
  const include = mandate.includeKeywords || [];
  if (include.length && !include.some((k) => k && text.includes(lc(k)))) return false;
  return true;
}

module.exports = { sourceMandate, scoreRelevance, passesMandate, AFRICAN_COUNTRIES, LAUNCH_MARKETS, TIER1_TERMS, TIER2_TERMS };
