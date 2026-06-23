<p align="center"><img src="./assets/logo.svg" alt="ai-crawler-bots" width="72"></p>

# ai-crawler-bots

**See which AI crawlers can read your site — and fail your build when the wrong ones get in or out.**

One curated, operator-sourced list of AI crawler & training-bot user agents — GPTBot, ClaudeBot, PerplexityBot, Google-Extended and 20 more — plus a zero-dependency Node CLI (and a GitHub Action) to audit your `robots.txt`, test live reachability, read your access logs, and gate it all in CI.

[![CI](https://github.com/TryGeoSuite/ai-crawler-bots/actions/workflows/ci.yml/badge.svg)](https://github.com/TryGeoSuite/ai-crawler-bots/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@geosuite/ai-crawler-bots.svg)](https://www.npmjs.com/package/@geosuite/ai-crawler-bots)
[![npm downloads](https://img.shields.io/npm/dm/@geosuite/ai-crawler-bots.svg)](https://www.npmjs.com/package/@geosuite/ai-crawler-bots)
[![GitHub stars](https://img.shields.io/github/stars/TryGeoSuite/ai-crawler-bots?style=flat&logo=github)](https://github.com/TryGeoSuite/ai-crawler-bots/stargazers)
[![AI crawlers: audited](https://img.shields.io/badge/AI%20crawlers-audited-5b8def?logo=robotframework&logoColor=white)](#use-in-ci-github-action)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

### ▶ [Try it live](https://ai-crawl-check.geosuite.workers.dev) — paste any URL, no install

No login, no tracking: it fetches only the target's `robots.txt` and scores it against every known AI bot. Or run it yourself:

```bash
# No install required — audit any site against every known AI bot:
npx @geosuite/ai-crawler-bots robots https://example.com
```

```text
Fetched https://example.com/robots.txt  (HTTP 200)
AI visibility score: 40/100

BLOCKED (3)
  GPTBot            → disallow: / (line 30, cloudflare_managed_content)
  ClaudeBot         → disallow: / (line 33, cloudflare_managed_content)
  Google-Extended   → disallow: / (line 36, cloudflare_managed_content)
ALLOWED (5)
  OAI-SearchBot · PerplexityBot · Amazonbot · ChatGPT-User · Perplexity-User
```

**[Why this exists](#what-this-is-and-why-it-exists)** · **[CLI](#cli)** · **[Use in CI](#use-in-ci-github-action)** · **[Contributing](#contributing)**

<sub>Created and invented by **[Matteo Perino](https://github.com/matte97p)** ([LinkedIn](https://www.linkedin.com/in/matteo-perino-27642016b/)) · maintained under [GeoSuite](https://trygeosuite.it).</sub>

---

## What this is, and why it exists

Roughly two thirds of every brand site's "search" traffic is now mediated by an LLM at some point in the funnel — ChatGPT, Claude, Perplexity, Gemini, Copilot, Le Chat, DuckAssist. The bots that feed those systems are not Googlebot, they don't behave like Googlebot, and the rules you write for them belong in `robots.txt` next to (or instead of) the rules you wrote a decade ago for traditional search.

The problem: the operator landscape changes constantly. OpenAI rolled GPTBot from 1.0 to 1.1 and split off `OAI-SearchBot` and `ChatGPT-User`. Anthropic deprecated `anthropic-ai` and `Claude-Web` in favour of `ClaudeBot`. Google introduced `Google-Extended` as a policy-only token (no separate UA). Apple did the same with `Applebot-Extended`. Meta now operates at least three crawlers with overlapping names. Most of the lists you find on SEO blogs are copied from each other and roughly half of the User-Agent strings they quote are wrong.

This repo aims to be the boring-but-correct version: every entry has a documentation link to the operator that runs the bot, the UA strings are quoted from those docs, and the entries are kept up to date by people who actually run the CLI against their own sites.

---

## The bot taxonomy

| Name | Owner | Purpose | Recommended directive |
| --- | --- | --- | --- |
| GPTBot | OpenAI | Training | Disallow (unless you want your content in OpenAI training sets) |
| ChatGPT-User | OpenAI | User-agent (on-demand) | Allow (so ChatGPT can cite you) |
| OAI-SearchBot | OpenAI | Search index | Allow (so you appear in ChatGPT Search) |
| ClaudeBot | Anthropic | Training | Disallow (unless opting in) |
| anthropic-ai | Anthropic | Training (deprecated) | Disallow (legacy) |
| Claude-Web | Anthropic | Training (deprecated) | Disallow (legacy) |
| PerplexityBot | Perplexity | Search index | Allow |
| Perplexity-User | Perplexity | User-agent (on-demand) | Allow |
| Google-Extended | Google | Training (policy token) | Allow or Disallow — does not affect Search |
| Applebot-Extended | Apple | Training (policy token) | Allow or Disallow — does not affect Spotlight/Siri |
| Bytespider | ByteDance | Training | Disallow (often ignores robots.txt anyway) |
| CCBot | Common Crawl | Training (open dataset) | Disallow if you don't want transitive inclusion in third-party LLMs |
| MistralAI-User | Mistral AI | User-agent (on-demand) | Allow |
| DuckAssistBot | DuckDuckGo | User-agent (on-demand) | Allow |
| Meta-ExternalAgent | Meta | Training | Disallow (unless opting in) |
| FacebookBot | Meta | Training | Disallow (unless opting in) |
| Amazonbot | Amazon | Search / training | Allow (general-purpose; powers Alexa answers) |
| cohere-training-data-crawler | Cohere | Training | Disallow (unless opting in) |
| Diffbot | Diffbot | Training (resold) | Disallow (unless opting in) |

A few things to know when reading the table:

- **Training vs search vs user-agent.** A *training* crawler downloads your pages in bulk, sends them through an offline pipeline, and never drives a click back to you. A *search* crawler indexes your pages so they can be cited inside an LLM-mediated search product (ChatGPT Search, Perplexity, Amazon Alexa) — these do drive traffic. A *user-agent* fetcher is on-demand: a real user typed something, the LLM decided it needs your page right now to answer them, it makes a single request, and it usually surfaces a clickable citation.
- **Policy-only tokens.** `Google-Extended` and `Applebot-Extended` don't make their own HTTP requests. They're flags interpreted server-side: the operator already crawled you with `Googlebot` or `Applebot`, the policy token tells them whether they may also use that content for AI training. Blocking the policy token is harmless to search rankings.
- **The "Disallow training, Allow search/user" pattern.** For most brand sites that want AI visibility but don't want to gift their content to model training, the right pattern is: allow `OAI-SearchBot`, `PerplexityBot`, `Amazonbot`, the `*-User` fetchers, and `Google-Extended`/`Applebot-Extended`; disallow the bulk training crawlers. The `examples/robots.txt` in this repo is exactly that template, annotated.
- **Some bots ignore robots.txt.** Bytespider in particular has been documented to crawl despite `Disallow`. For those you need WAF / IP-level blocks too. This repo only documents the polite directive — it can't fix bots that lie.

The exact User-Agent string for each bot, plus a one-line note explaining what it does, lives in [`bots.json`](./bots.json). When in doubt, that file is the source of truth.

---

## Installation

The package is published to npm as `@geosuite/ai-crawler-bots`. Use it as a CLI, a library, or just clone the repo and read `bots.json`.

### Run the CLI without installing

```bash
npx @geosuite/ai-crawler-bots check https://www.example.com
```

### Install globally

```bash
npm install -g @geosuite/ai-crawler-bots
geosuite-bots list
```

### Use as a library

```js
import { loadBots, testBot, testAllBots } from '@geosuite/ai-crawler-bots';

const bots = await loadBots();
console.log(`${bots.length} bots tracked.`);

const result = await testBot('https://www.example.com', 'gptbot');
console.log(result.status, result.blocked);
```

Other exports: `checkRobots(url)` (fetch + audit a site's robots.txt), `analyzeRobots({ origin, status, body, bots })` (the same audit on an already-fetched body — pure, no I/O, so it runs in edge runtimes like Cloudflare Workers), and `evaluateGate(result, gate)` (the CI-gate logic behind `--fail-under` / `--assert-*`). Plus `parseRobots`, `verdictForBot`, `loadSources`, `analyzeReferrers`, and `createLogAnalyzer`.

The library has zero runtime dependencies — it uses only `node:fs`, `node:http`, `node:https`, `node:url`, and `node:path`. Node 20 or newer.

---

## CLI

```text
geosuite-bots list
geosuite-bots show <id>
geosuite-bots check <url> [--bot=<id>] [--timeout=<ms>] [--method=GET|HEAD]
geosuite-bots robots <url> [--timeout=<ms>] [--json]
geosuite-bots logs <file|-> [--since=<date>] [--until=<date>] [--json]
geosuite-bots referrers <file.csv|-> [--source-col=<h>] [--count-col=<h>] [--json]
```

### `list`

Print every tracked bot as a table.

```bash
$ geosuite-bots list
ID                              NAME                    OWNER           PURPOSE       DIRECTIVE
------------------------------  ----------------------  --------------  ------------  ----------
gptbot                          GPTBot                  OpenAI          training      Disallow
chatgpt-user                    ChatGPT-User            OpenAI          user-agent    Allow
oai-searchbot                   OAI-SearchBot           OpenAI          search        Allow
...
```

### `show <id>`

Print one bot's full record as JSON, including the docs URL.

```bash
$ geosuite-bots show gptbot
{
  "id": "gptbot",
  "name": "GPTBot",
  "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot",
  "owner": "OpenAI",
  "purpose": "training",
  "docsUrl": "https://platform.openai.com/docs/gptbot",
  "robotsDirective": "Disallow",
  "notes": "..."
}
```

### `check <url>`

Issue an HTTP request to `<url>` impersonating each bot's User-Agent in turn, and report the response status. Redirects are reported, not followed — that way you can spot sites that cloak AI bots to a different page.

```bash
$ geosuite-bots check https://www.example.com
Testing https://www.example.com

gptbot                          200    ok
chatgpt-user                    200    ok
oai-searchbot                   200    ok
claudebot                       403    BLOCKED
perplexitybot                   200    ok
google-extended                 301    redirect -> https://www.example.com/
...

18 reachable, 1 blocked or errored.
```

Pass `--bot=<id>` to test a single bot:

```bash
$ geosuite-bots check https://www.example.com --bot=claudebot
claudebot                       403    BLOCKED
```

When the response is blocked, the result also carries a `blockedAt` field that distinguishes between **edge** (your CDN / WAF returned the 4xx before reaching origin — fingerprints recognized: Cloudflare, CloudFront, Vercel, Akamai, Fastly, Netlify) and **origin** (the response came back without those fingerprints). Different remediation: edge means flip a toggle in your CDN dashboard; origin means update your application or web-server config.

### `robots <url>`

Fetch `<url>/robots.txt`, parse it with line-level provenance, and report per-bot verdicts:

```bash
$ geosuite-bots robots https://www.example.com
Fetched https://www.example.com/robots.txt  (HTTP 200)
AI visibility score: 40/100

Managed section: cloudflare_managed_content
  blocks: GPTBot, ClaudeBot, Google-Extended
  your file alone would allow: GPTBot, ClaudeBot, Google-Extended

BLOCKED (3)
  GPTBot                  → disallow: / (line 30, cloudflare_managed_content)
  ClaudeBot               → disallow: / (line 33, cloudflare_managed_content)
  Google-Extended         → disallow: / (line 36, cloudflare_managed_content)

Intentional gating (5)
  app         /app/         (line 53)
  admin       /admin/       (line 54)
  ...
```

The `robots` command surfaces what `check` cannot:

- **Per-bot attribution**: which line in the file blocks the bot, in which group.
- **Managed-section detection**: when a CDN injects a block (e.g. `# BEGIN Cloudflare Managed content` … `# END Cloudflare Managed Content`), the report tells you the section won over your own rules — typical Cloudflare AI Crawl Control footprint.
- **Intentional gating**: `Disallow:` rules pointing at recognized private surfaces (`/admin`, `/auth`, `/cart`, …) are surfaced as positive signals — they don't penalize the score.
- **Content-Signal**: parsed and reported per group, when present.

### `logs <file>`

`check` and `robots` answer *can a bot reach this site*. `logs` answers the other half — *did it actually crawl, and what did it get back* — by reading a server access log and matching every request's User-Agent against the tracked bots. No network, streams line by line (multi-GB logs are fine), reads from a file or stdin (`-`).

A sample log ships in the repo, so you can try it without your own:

```bash
$ geosuite-bots logs examples/access.log
```

```bash
$ geosuite-bots logs ./access.log
Parsed 48,210 of 48,235 lines  (25 unrecognized)
Bot activity from 2026-05-01 00:03:11 UTC to 2026-05-27 14:02:50 UTC

BOT                     HITS      LAST SEEN               2xx/3xx/4xx/5xx
-------------------------------------------------------------------------
GPTBot                  1,204     2026-05-26 14:02:00 UTC  1180/0/24/0  ⚠ some blocked/4xx
ClaudeBot               312       2026-05-25 09:11:00 UTC  312/0/0/0
PerplexityBot           88        2026-05-27 02:40:00 UTC  80/0/8/0  ⚠ some blocked/4xx

3 of 22 trackable bots seen. Not seen: ChatGPT-User, OAI-SearchBot, ...
Tip: cross-check with `geosuite-bots robots <site>` — a bot allowed in robots.txt but 4xx-ing here is being blocked at the CDN/WAF.
```

Details:

- **Formats**: Combined Log Format (Apache/nginx default) and JSON lines (nginx `escape=json`, Vector, Cloudflare Logpush, …) are auto-detected per line. Cloudflare Logpush field names (`ClientRequestUserAgent`, `EdgeResponseStatus`, `EdgeStartTimestamp`) are recognized too, so a Logpush export drops straight in. Common Log Format has no User-Agent field, so it can't match a bot — use Combined. A `.gz` file path is gunzipped transparently (rotated logs ship compressed).
- **Status breakdown** tells you reach, not just presence: a bot with 4xx hits is being served errors. Cross-referenced with `robots`, that pinpoints a CDN/WAF block that robots.txt alone wouldn't reveal.
- **`--since` / `--until`** accept `YYYY-MM-DD` or an ISO datetime to window the report.
- **Policy-only tokens** (Google-Extended, Applebot-Extended) are robots.txt directives with no real User-Agent, so they never appear here and aren't counted as "trackable".
- **`--json`** emits the full structured report (per-bot hits, status buckets, first/last seen, sample paths, unseen bots) for piping into other tooling.

> A User-Agent is self-reported — anyone can claim to be GPTBot. For authoritative attribution, reverse-DNS the source IP against the operator's published ranges. `logs` reports what the UA *claims*; treat aggressive unknown traffic with suspicion.

#### Cloudflare (no server access? use Logpush exports)

If Cloudflare sits in front of your site you don't have a classic `access.log`, but you can export the equivalent and feed it straight in — `logs` already understands Cloudflare's field names:

1. **Logpush job** → Cloudflare dashboard → your domain → *Analytics & Logs → Logpush*.
2. **Destination**: an object store you control (R2, S3, GCS) or any HTTP endpoint. Logpush writes gzipped newline-delimited JSON batches.
3. **Fields**: include at least `ClientRequestUserAgent`, `EdgeResponseStatus`, `EdgeStartTimestamp` (and `ClientRequestPath` if you want sample paths).
4. **Analyze** the downloaded batch — `.gz` is gunzipped transparently:

```bash
$ geosuite-bots logs cloudflare-logpush-batch.log.gz
```

No remapping needed: `ClientRequestUserAgent` → UA, `EdgeResponseStatus` → status, `EdgeStartTimestamp` (RFC3339 *or* unix-nanosecond) → timestamp are recognized automatically. This is a one-shot CLI over a file you already have — the CLI never receives a live stream or stores anything.

### `referrers <file.csv>`

`logs` sees which AI **bots crawled** you (server-side). `referrers` sees the next funnel stage — which AI answers **sent you a human** — by reading an analytics CSV export (GA4, Plausible, Matomo) and classifying the traffic source against a curated list of AI assistants / answer engines (`llm_sources.json`). Offline, no API, no OAuth: you export the CSV, it does the rest.

```bash
$ geosuite-bots referrers ./ga4-traffic.csv
Source column: "Session source"   Count column: "Sessions"
Parsed 312 rows

AI SOURCE               SESSIONS      SHARE OF AI
-------------------------------------------------
ChatGPT                 1,204         74.2%
Perplexity              312           19.2%
Gemini                  107           6.6%

1,623 AI-referred sessions of 50,516 total (3.21%).
```

Details:

- **Why it's separate from `logs`**: bots don't run JavaScript, so they never appear in GA4; humans arriving from an AI answer do. Crawl reachability and click-through are different questions — this answers the second.
- **Input**: any CSV with a source/referrer column. GA4's `#`-commented export preamble is skipped automatically; the source column (`Session source`, `Source / medium`, `Referrer`, …) and a count column (`Sessions`, `Users`, …) are auto-detected. Override with `--source-col` / `--count-col`. With no count column it counts rows.
- **Matching**: apex host and any subdomain (`www.perplexity.ai` → Perplexity). `google.com` is deliberately *not* Gemini, and `bing.com` is *not* Copilot — organic search is excluded so the number means "AI answer engines", not "anything Google/Microsoft".
- **`--json`** emits the full structured result (per-source sessions, matched hosts, totals, top unmatched sources).

> Referral attribution under-counts. Many assistants strip the `Referer`, and a citation read without a click leaves no session at all. Read this as a floor on AI-driven traffic, not a census — and pair it with `logs` for the crawl side.

### What `check` measures (and what it doesn't)

`check` makes a single HTTP request with the bot's UA and reports the status code. That tells you whether your **edge / WAF / origin** is treating that UA differently — which is the most common way bots get blocked in practice (Cloudflare's "Block AI Bots" toggle, custom Nginx rules, Akamai bot manager, etc.).

For the parallel question — *what does my robots.txt actually say to each bot* — use `robots` instead. It complements `check`: a bot may be `200`-reachable on the live wire and still be `Disallow`'d in robots.txt (or vice versa).

It also doesn't verify the request actually came from the operator — anyone can set any User-Agent. If you need to know whether a request in your logs is *really* GPTBot, do a reverse DNS lookup against the operator's published IP ranges (every major operator publishes them).

---

## Use in CI (GitHub Action)

`robots` exits non-zero when a gate fails, so it doubles as a CI check — catch the day someone flips Cloudflare's "Block AI bots" toggle, or a `robots.txt` edit accidentally locks ChatGPT Search out of your site, *before* it ships.

### GitHub Action

```yaml
# .github/workflows/ai-crawl-check.yml
name: AI Crawl Check
on:
  pull_request:
    paths: ['**/robots.txt']
  schedule:
    - cron: '0 6 * * 1'   # re-check prod weekly — CDN policies drift under you
jobs:
  ai-crawl-check:
    runs-on: ubuntu-latest
    steps:
      - uses: TryGeoSuite/ai-crawler-bots@v1
        with:
          url: https://example.com
          assert-allowed: oai-searchbot,perplexitybot,chatgpt-user  # citation/traffic bots MUST stay reachable
          assert-blocked: gptbot,claudebot                          # bulk-training crawlers MUST stay blocked
          fail-under: 50                                            # optional floor on the AI-visibility score
```

The Action writes a per-bot verdict table to the job summary, exposes `score` / `blocked` / `allowed` as step outputs, and annotates the PR inline when a gate fails. A copy-paste workflow lives in [`examples/ci-ai-crawl-check.yml`](./examples/ci-ai-crawl-check.yml).

| Input | Description |
| --- | --- |
| `url` *(required)* | Site whose `/robots.txt` is audited. |
| `assert-allowed` | Comma-separated bot ids that must be reachable — fail if any is blocked. |
| `assert-blocked` | Comma-separated bot ids that must be blocked — fail if any is reachable. |
| `fail-under` | Fail if the AI-visibility score (0-100) is below this. |
| `timeout` | Per-request timeout in ms. |

Bot ids are the `id` field in [`bots.json`](./bots.json) (`gptbot`, `claudebot`, `oai-searchbot`, `perplexitybot`, …); run `geosuite-bots list` to see them all.

### Any other CI (GitLab, CircleCI, pre-commit, …)

The same gate flags live on the CLI, so any runner with Node 20+ works:

```bash
npx @geosuite/ai-crawler-bots robots https://example.com \
  --assert-allowed=oai-searchbot,perplexitybot \
  --assert-blocked=gptbot,claudebot \
  --fail-under=50
```

Exit code is `0` when every condition holds, `1` when any fails (the failing conditions print to stderr), `2` on a bad flag. Add `--json` to also capture the full machine-readable verdict.

### Add the badge

Show visitors you keep AI-crawler access under control:

```markdown
[![AI crawlers: audited](https://img.shields.io/badge/AI%20crawlers-audited-5b8def?logo=robotframework&logoColor=white)](https://github.com/TryGeoSuite/ai-crawler-bots)
```

---

## Example robots.txt

See [`examples/robots.txt`](./examples/robots.txt) for an annotated template tuned for a typical brand site that wants AI search visibility without donating content to bulk training. Copy, adjust the `Disallow:` paths and the `Sitemap:` URL, drop it at the root of your site.

---

## Contributing

PRs welcome — especially:

- **New bots**, with a link to the operator's own documentation page in the PR description. We don't accept entries sourced only from third-party tracker blogs; the User-Agent has to come from the operator itself.
- **Updated UA strings** when an operator bumps a version (these change a couple of times a year per operator).
- **Notes corrections** when a bot's behaviour changes — for example, when a previously well-behaved crawler starts ignoring `robots.txt`, or when a "training" bot starts being used to power on-demand answers.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the exact field requirements and the test command.

We do not accept PRs that add bots without a UA string we can verify in operator docs. It's tempting to ship a "complete" list; this list is deliberately conservative.

---

## AI mode (opt-in, 0.2+)

The deterministic core ships with zero third-party runtime dependencies.
You can also turn on a small LLM-powered summary that translates the
robots verdict into a plain-language paragraph for non-technical
operators:

```bash
export OPENAI_API_KEY=sk-…           # or ANTHROPIC_API_KEY=sk-ant-…
geosuite-bots robots https://example.com --ai
```

Only the **structured verdict** (bucket counts, blocked-bot names,
score, managed-block summary) is sent to the provider — never the raw
`robots.txt` body. The CLIs default to small models (`gpt-5-mini`,
`claude-haiku-4-5`) so a single run stays well under a cent.

Privacy: enabling `--ai` sends content to the corresponding API. Don't
turn it on against URLs you wouldn't paste into their UI.

---

## Related: GeoSuite open-source tools

`ai-crawler-bots` is part of a small family of zero-dependency CLIs we maintain to make Generative Engine Optimization (GEO) measurable from the terminal:

- [`@geosuite/schema-templates`](https://github.com/TryGeoSuite/schema-templates) — copy-paste-ready schema.org JSON-LD templates with a local validator. Use it to ship `Organization`, `Product`, `FAQPage`, `BreadcrumbList`, etc. without hand-rolling structured data.
- [`@geosuite/llms-txt-generator`](https://github.com/TryGeoSuite/llms-txt-generator) — turn a `sitemap.xml` into the `llms.txt` standard from [llmstxt.org](https://llmstxt.org/), so LLMs can index your most useful pages.
- [`@geosuite/sitemap-builder`](https://github.com/TryGeoSuite/sitemap-builder) — crawl a site and emit a valid `sitemap.xml`, for sites that ship without one.

The same checks (managed by humans, not vibes) are also surfaced as a hosted product at [trygeosuite.it](https://trygeosuite.it) for teams who want history, alerts, and CTAs wired into their content pipeline.

---

## Creator

**Created and invented by [Matteo Perino](https://github.com/matte97p)** — [LinkedIn](https://www.linkedin.com/in/matteo-perino-27642016b/) · [matte97.p@gmail.com](mailto:matte97.p@gmail.com).

Ideated, designed and validated by Matteo Perino. Implementation written with AI assistance, maintained under GeoSuite.

---

## License

[MIT](./LICENSE) — copyright 2026 Matteo Perino and GeoSuite. Use it however you want.

## Related tools — the GeoSuite GEO toolkit

- [ai-crawler-bots](https://github.com/TryGeoSuite/ai-crawler-bots) — which AI crawlers can read your site (robots.txt audit + CI gate)
- [llms-txt-generator](https://github.com/TryGeoSuite/llms-txt-generator) — sitemap.xml → llms.txt (the llmstxt.org standard)
- [schema-templates](https://github.com/TryGeoSuite/schema-templates) — validated, copy-paste schema.org JSON-LD
- [sitemap-builder](https://github.com/TryGeoSuite/sitemap-builder) — crawl a site, emit a valid sitemap.xml

Also from the same author: [rlsgrid](https://github.com/matte97p/rlsgrid) · [pentest-framework](https://github.com/matte97p/pentest-framework) · [demowright](https://github.com/matte97p/demowright)

---

⭐ If `ai-crawler-bots` is useful, [give it a star](https://github.com/TryGeoSuite/ai-crawler-bots) — it helps other people find the toolkit.
