# AFRIBN Deployment Guide

This repo is ready for a first Docker deployment.

## Recommended First Deployment

Use a Docker web service with a persistent disk mounted at `/app`.

The app currently persists runtime data to SQLite:

- Database: `/app/data/afribn.sqlite`
- Uploads: `/app/uploads`

For the first deployment, keep SQLite with a persistent disk. Move to Postgres later when the product has stable traffic, multi-instance needs, or higher write volume.

## Build And Run Locally

```bash
docker build -t afribn .
docker run --env-file .env -p 3000:3000 -v afribn-data:/app/data -v afribn-uploads:/app/uploads afribn
```

Then open:

```text
http://127.0.0.1:3000/design/index.html
http://127.0.0.1:3000/ready
```

## Health Checks

Use:

```text
GET /ready
```

Expected response:

```json
{
  "status": "ready"
}
```

Warnings for SendGrid or Twilio are acceptable until email/SMS alerts are configured.

## Required Production Environment Variables

Set these in the hosting platform secret/environment panel. Do not commit them.

```env
NODE_ENV=production
PORT=3000
AFRIBN_DB_PATH=/app/data/afribn.sqlite
AFRIBN_UPLOAD_DIR=/app/uploads
AFRIBN_JWT_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
NEWSAPI_API_KEY=
NEWSDATA_API_KEY=
WORLDNEWS_API_KEY=
```

Optional but needed for real alerts:

```env
SENDGRID_API_KEY=
ALERT_EMAIL_FROM=alerts@afribn.com
ALERT_EMAIL_TO=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
ALERT_SMS_TO=
```

## Deployment Checklist

1. Revoke any API keys ever pasted into chat or committed by mistake.
2. Generate a fresh production `AFRIBN_JWT_SECRET`.
3. Add all production secrets in the deployment platform.
4. Configure a persistent disk/volume for `/app/data` and `/app/uploads`.
5. Deploy using the Dockerfile.
6. Verify `/ready` after deployment.
7. Verify the landing page at `/design/index.html`.
8. Verify login with the seeded admin account, then change seed/demo credentials before inviting real users.

## Current Known Gaps Before Public Launch

- Email alerts are inactive until SendGrid variables are set.
- SMS alerts are inactive until Twilio variables are set.
- Runtime persistence is SQLite. This is acceptable for the first single-instance deployment, but Postgres should be the next step before multi-instance scaling.
- Secrets must be rotated if they were pasted into chat during setup.

## Useful Commands

Run tests:

```bash
npm test
```

Start locally:

```bash
PORT=3002 node server.js
```

Read readiness:

```bash
node -e "fetch('http://127.0.0.1:3002/ready').then(r=>r.json()).then(console.log)"
```
