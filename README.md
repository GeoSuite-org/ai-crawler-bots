<p align="center"><img src="./assets/logo.svg" alt="GeoSuite Open" width="72"></p>

# ai-crawler-bots

A curated, sourced, maintained list of AI crawler and training-bot user agents — plus a small zero-dependency Node CLI to test whether a URL is reachable to each one.

Maintained by [GeoSuite](https://trygeosuite.it).

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

The library has zero runtime dependencies — it uses only `node:fs`, `node:http`, `node:https`, `node:url`, and `node:path`. Node 20 or newer.

---

## CLI

```text
geosuite-bots list
geosuite-bots show <id>
geosuite-bots check <url> [--bot=<id>] [--timeout=<ms>] [--method=GET|HEAD]
geosuite-bots robots <url> [--timeout=<ms>] [--json]
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

### What `check` measures (and what it doesn't)

`check` makes a single HTTP request with the bot's UA and reports the status code. That tells you whether your **edge / WAF / origin** is treating that UA differently — which is the most common way bots get blocked in practice (Cloudflare's "Block AI Bots" toggle, custom Nginx rules, Akamai bot manager, etc.).

For the parallel question — *what does my robots.txt actually say to each bot* — use `robots` instead. It complements `check`: a bot may be `200`-reachable on the live wire and still be `Disallow`'d in robots.txt (or vice versa).

It also doesn't verify the request actually came from the operator — anyone can set any User-Agent. If you need to know whether a request in your logs is *really* GPTBot, do a reverse DNS lookup against the operator's published IP ranges (every major operator publishes them).

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

- [`@geosuite/schema-templates`](https://github.com/geosuite/schema-templates) — copy-paste-ready schema.org JSON-LD templates with a local validator. Use it to ship `Organization`, `Product`, `FAQPage`, `BreadcrumbList`, etc. without hand-rolling structured data.
- [`@geosuite/llms-txt-generator`](https://github.com/geosuite/llms-txt-generator) — turn a `sitemap.xml` into the `llms.txt` standard from [llmstxt.org](https://llmstxt.org/), so LLMs can index your most useful pages.
- [`@geosuite/sitemap-builder`](https://github.com/geosuite/sitemap-builder) — crawl a site and emit a valid `sitemap.xml`, for sites that ship without one.

The same checks (managed by humans, not vibes) are also surfaced as a hosted product at [trygeosuite.it](https://trygeosuite.it) for teams who want history, alerts, and CTAs wired into their content pipeline.

---

## Author

Ideated, designed and validated by [Matteo Perino](https://github.com/matte97p) — [matte97.p@gmail.com](mailto:matte97.p@gmail.com).
Implementation written with AI assistance, maintained under GeoSuite.

---

## License

[MIT](./LICENSE) — copyright 2026 GeoSuite. Use it however you want.
