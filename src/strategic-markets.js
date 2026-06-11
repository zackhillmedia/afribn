const STRATEGIC_MARKETS = [
  { name: "Nigeria", slug: "nigeria", flag: "nigeria", region: "West Africa" },
  { name: "South Africa", slug: "south-africa", flag: "southafrica", region: "Southern Africa" },
  { name: "Kenya", slug: "kenya", flag: "kenya", region: "East Africa" },
  { name: "Egypt", slug: "egypt", flag: "egypt", region: "North Africa" },
  { name: "Morocco", slug: "morocco", flag: "morocco", region: "North Africa" },
  { name: "Ghana", slug: "ghana", flag: "ghana", region: "West Africa" },
  { name: "Rwanda", slug: "rwanda", flag: "rwanda", region: "East Africa" },
  { name: "Côte d'Ivoire", slug: "cote-divoire", flag: "cotedivoire", region: "West Africa", aliases: ["Cote d'Ivoire", "Ivory Coast"] },
  { name: "Tanzania", slug: "tanzania", flag: "tanzania", region: "East Africa" },
  { name: "Uganda", slug: "uganda", flag: "uganda", region: "East Africa" }
];

const STRATEGIC_MARKET_NAMES = STRATEGIC_MARKETS.flatMap((market) => [market.name, ...(market.aliases || [])]);

function isStrategicMarket(country = "") {
  const normalized = normalizeCountry(country);
  return STRATEGIC_MARKET_NAMES.some((name) => normalizeCountry(name) === normalized);
}

function normalizeCountry(country = "") {
  return String(country).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveStrategicMarket(country = "") {
  const normalized = normalizeCountry(country);
  return STRATEGIC_MARKETS.find((market) => [market.name, ...(market.aliases || [])].some((name) => normalizeCountry(name) === normalized));
}

module.exports = { STRATEGIC_MARKETS, STRATEGIC_MARKET_NAMES, isStrategicMarket, resolveStrategicMarket };
