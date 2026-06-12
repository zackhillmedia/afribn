function validateConfig() {
  const warnings = [];
  if (!process.env.AFRIBN_JWT_SECRET || process.env.AFRIBN_JWT_SECRET.includes("replace")) {
    warnings.push("AFRIBN_JWT_SECRET is not set to a production secret");
  }
  const qwenConfigured = Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY);
  if (!process.env.OPENAI_API_KEY && !qwenConfigured) warnings.push("No AI provider is configured; AI distillation will use fallback rules");
  if (!process.env.SENDGRID_API_KEY) warnings.push("SENDGRID_API_KEY is not configured; email alerts will be held");
  if (!process.env.TWILIO_ACCOUNT_SID) warnings.push("TWILIO_ACCOUNT_SID is not configured; SMS alerts will be held");
  if (!process.env.NEWSAPI_API_KEY) warnings.push("NEWSAPI_API_KEY is not configured; NewsAPI sources will not run");
  if (!process.env.NEWSDATA_API_KEY) warnings.push("NEWSDATA_API_KEY is not configured; NewsData.io sources will not run");
  if (!process.env.WORLDNEWS_API_KEY) warnings.push("WORLDNEWS_API_KEY is not configured; World News API sources will not run");
  return warnings;
}

function publicConfig() {
  return {
    environment: process.env.NODE_ENV || "development",
    persistence: process.env.AFRIBN_DB_PATH || "./data/afribn.sqlite",
    uploadDir: process.env.AFRIBN_UPLOAD_DIR || "./uploads",
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    qwenConfigured: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
    aiPrimaryProvider: process.env.AI_PRIMARY_PROVIDER || (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY ? "qwen" : "openai"),
    sourceAdapters: {
      gdeltConfigured: true,
      newsApiConfigured: Boolean(process.env.NEWSAPI_API_KEY),
      newsDataConfigured: Boolean(process.env.NEWSDATA_API_KEY),
      worldNewsConfigured: Boolean(process.env.WORLDNEWS_API_KEY)
    },
    emailConfigured: Boolean(process.env.SENDGRID_API_KEY),
    smsConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  };
}

module.exports = { validateConfig, publicConfig };
