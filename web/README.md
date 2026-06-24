# AI Crawl Check — hosted checker

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that puts
[`ai-crawler-bots`](../) behind a paste-a-URL web page: it reads a site's
`robots.txt` and scores it against every known AI crawler. Same analysis as the
CLI (`analyzeRobots()` + the bundled `bots.json`) — just reachable from a browser.

- `GET /` — the page (`page.js`), bilingual **en/it** (auto-detected from `Accept-Language`; `/en` · `/it` force a locale)
- `GET /og.png` · `GET /favicon.svg` — Open Graph share image (1200×630) + favicon
- `GET /api/check?url=https://example.com` — JSON verdict
- `GET /bots` — the full curated bot list as JSON; `GET /bots/<id>` — a single bot (a free public API over `bots.json`)

No database, no secrets, no tracking. It fetches only the target's `/robots.txt`.

## Run locally

```bash
cd web
npx wrangler dev
# open http://localhost:8787
```

## Deploy

```bash
cd web
npx wrangler deploy
```

That publishes to `https://ai-crawl-check.<your-subdomain>.workers.dev`. To use a
custom domain instead, uncomment the `routes` block in [`wrangler.toml`](./wrangler.toml)
(the zone must be on your Cloudflare account) and redeploy.

## Auto-deploy (CI)

[`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml) redeploys
this Worker on every push to `production` that touches `web/`, `src/analyze.js`,
or `bots.json`. Add two repo secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — a token scoped **Edit Cloudflare Workers** from the
  Cloudflare account that owns the Worker.
- `CLOUDFLARE_ACCOUNT_ID` — that account's id.

## After deploying

Add a live-demo link to the top of the main [README](../README.md) — it's the
single biggest driver of stars for a tool like this:

```markdown
**▶ [Try it live](https://your-deployed-url)** — no install.
```

## Notes

- The Worker imports only `../src/analyze.js` (the pure, dependency-free core) —
  no `node:*` modules, so no `nodejs_compat` is needed. The robots.txt download
  uses the platform `fetch()`, and the bot list is bundled from `../bots.json`.
- Responses are cached at the edge for 5 minutes (`/api/check`) / 1 hour (`/`).
- This directory is **not** part of the npm package (it's excluded from
  `package.json` `files`), so it never ships to registry consumers.
