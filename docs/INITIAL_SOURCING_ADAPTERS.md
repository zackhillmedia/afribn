# AFRIBN Initial Sourcing Adapters

AFRIBN supports four API-backed source adapters in addition to RSS/basic HTML scraping:

- `gdelt`
- `newsapi`
- `newsdata`
- `worldnews`

These adapters all normalize provider responses into the same backend object:

```text
Source
→ ScrapeJob
→ RawArticle
```

The rest of the AFRIBN pipeline then continues unchanged:

```text
RawArticle
→ Story/Event
→ Score
→ GapReport
→ FieldTask
→ AgentReport
→ VerificationReview
→ PublishedIntelligence
```

## Environment Variables

GDELT does not require a key.

The other providers require:

```bash
NEWSAPI_API_KEY=
NEWSDATA_API_KEY=
WORLDNEWS_API_KEY=
```

Keys can also be passed per source in `scrapingConfig.apiKey`, but environment variables are preferred.

## Source Examples

### GDELT

```json
{
  "name": "GDELT Africa Energy Monitor",
  "country": "Pan-African",
  "type": "api",
  "url": "https://api.gdeltproject.org/api/v2/doc/doc",
  "provider": "gdelt",
  "scrapingConfig": {
    "query": "Africa energy investment OR renewable",
    "limit": 50,
    "timespan": "1d"
  }
}
```

Use GDELT as the broad discovery layer.

### NewsAPI

```json
{
  "name": "NewsAPI Nigeria Energy",
  "country": "Nigeria",
  "type": "api",
  "url": "https://newsapi.org/v2/everything",
  "provider": "newsapi",
  "scrapingConfig": {
    "query": "Nigeria energy policy investment",
    "language": "en",
    "sortBy": "publishedAt",
    "limit": 50
  }
}
```

Use NewsAPI mainly for development/prototyping or paid production plans.

### NewsData.io

```json
{
  "name": "NewsData Nigeria Policy",
  "country": "Nigeria",
  "type": "api",
  "url": "https://newsdata.io/api/1/latest",
  "provider": "newsdata",
  "scrapingConfig": {
    "query": "Nigeria policy regulation",
    "country": "ng",
    "language": "en",
    "limit": 25
  }
}
```

Use NewsData.io for region/country-specific discovery.

### World News API

```json
{
  "name": "World News Kenya Investment",
  "country": "Kenya",
  "type": "api",
  "url": "https://api.worldnewsapi.com/search-news",
  "provider": "worldnews",
  "scrapingConfig": {
    "query": "Kenya investment infrastructure energy",
    "sourceCountry": "ke",
    "language": "en",
    "limit": 10
  }
}
```

Use World News API sparingly for high-value enrichment because its free tier is small.

## Normalized RawArticle Fields

Adapter-created raw articles include:

- `title`
- `summary`
- `body`
- `url`
- `sourceName`
- `originalSourceName`
- `sourceCountry`
- `provider`
- `providerArticleId`
- `providerPayload`
- `language`
- `author`
- `imageUrl`
- `publishedAt`
- `checksum`

`sourceName` is the AFRIBN source record name. `originalSourceName` is the publisher returned by the API provider when available.

## Operational Recommendation

For the initial AFRIBN sourcing stack:

1. Use `gdelt` every 15-30 minutes for broad Africa discovery.
2. Use `newsdata` every 1-3 hours for country/topic coverage.
3. Use `worldnews` for high-value enrichment and verification checks.
4. Use `newsapi` as a development fallback or paid-plan source.

