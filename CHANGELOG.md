# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-05-27

### Added

- `logs` command: read a server access log (file or stdin) and report which
  tracked AI bots actually crawled, with per-bot hit counts, HTTP status
  breakdown (2xx/3xx/4xx/5xx), and first/last-seen timestamps. Closes the loop
  with `robots`/`check`: a bot allowed in robots.txt but 4xx-ing in the logs is
  being blocked at the CDN/WAF.
  ```
  geosuite-bots logs ./access.log
  geosuite-bots logs ./access.log --since=2026-05-01 --until=2026-05-27 --json
  cat access.log | geosuite-bots logs -
  ```
  Auto-detects Combined Log Format and JSON-line logs (including Cloudflare
  Logpush field names — `ClientRequestUserAgent`, `EdgeResponseStatus`,
  `EdgeStartTimestamp`, incl. unix-nanosecond timestamps); streams line by line
  so multi-GB logs never sit in memory. A `.gz` file path is gunzipped
  transparently via Node's built-in `zlib` (still zero dependencies). New
  library exports `createLogAnalyzer`, `analyzeLogText`, `parseLogLine`,
  `matchBot`.
- `bots.json`: new `uaToken` field per bot — the distinctive substring used to
  match a real request's User-Agent. Policy-only directives (Google-Extended,
  Applebot-Extended) carry `uaToken: null` since they never appear as a real UA.

## [0.3.2] - 2026-05-23

### Changed

- README and `package.json` now credit **Matteo Perino** as creator and inventor (with GitHub + LinkedIn), maintained under GeoSuite. LICENSE copyright reads "Matteo Perino and GeoSuite".

## [0.3.0] - 2026-05-10

### Added

- `watch` command: polls a URL's `/robots.txt` on a fixed interval and prints
  a diff whenever the score or any bot's verdict changes.
  ```
  geosuite-bots watch https://example.com --interval=60
  geosuite-bots watch https://example.com --interval=300 --json
  ```
  Human-readable diffs go to stdout; "no change" ticks go to stderr so stdout
  stays pipeable. `--json` emits JSON lines suitable for log aggregators.

## [0.2.3] - 2026-05-10

### Added

- README: npm version + downloads + CI badges.
- `npm run coverage` script using Node 22's built-in
  `--experimental-test-coverage` (zero new dependencies).

### Changed

- CI workflow now triggers on the `production` branch (matching the
  actual default branch) instead of `main`. Also adds a coverage step
  on the Node 22 matrix entry.

## [0.2.2] - 2026-05-10

### Changed

- Republish; no source changes (resolved npm CDN propagation lag noted
  at 0.2.1).

## [0.2.1] - 2026-05-10

### Added

- `ai-crawler-bots` bin alias matching the npm package name so
  `npx @geosuite/ai-crawler-bots` works without `--package=`.

## [0.2.0] - 2026-05-10

### Added

- 5 new bot entries with operator-verified UA strings:
  `PetalBot` (Huawei), `YouBot` (You.com), `Timpibot` (Timpi),
  `GoogleOther` (Google catch-all for non-Search use), `Omgilibot`
  (Webz.io). Brings the curated list to 24 entries.
- `assets/logo.svg` — shared GeoSuite Open mark; rendered as the README
  hero. Monochrome on transparent, uses `currentColor`.
- `.github/workflows/publish.yml` — runs lint+tests, verifies that the
  pushed `v*` tag matches `package.json`'s `version`, then publishes to
  npm with provenance.
- `src/ai.js` — optional LLM helper. Auto-detects `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY` (first one wins). Uses native `fetch`, no third-party
  SDK. The deterministic core stays zero-runtime-dependency; the AI path
  only kicks in when explicitly opted into via `--ai`.
- `geosuite-bots robots <url> --ai` — after the verdict, prints a short
  plain-language summary written by the LLM. We send only the structured
  verdict (bucket counts, blocked-bot names, score, managed-block summary)
  to the provider — never the raw robots.txt body.

### Notes on privacy and cost

- AI mode is **opt-in**. Without `--ai`, the CLI behaves exactly as 0.1.0.
- A single `--ai` summary is well under a cent at typical input sizes
  (small models: `gpt-5-mini` / `claude-haiku-4-5`).
- Whatever you pass to a provider is subject to that provider's data
  policy. Don't enable `--ai` against URLs you couldn't paste into their
  UI.

## Unreleased

### Added

- `src/robots.js` — robots.txt parser with line-level provenance and per-bot
  verdict logic. Public API: `parseRobots(text)`, `verdictForBot(groups, name)`,
  `intentionalGating(groups)`, `checkRobots(url)`. First-match-group semantics;
  longest-match (Allow on tie) within a group.
- Cloudflare "Managed Content" section detection: when a CDN injects a block
  via `# BEGIN Cloudflare Managed content` / `# END Cloudflare Managed Content`
  markers, the report attributes the verdict to the section and tells the
  caller whether the user's own (non-managed) rules would have allowed it.
- `Content-Signal:` directive parsing (per group), surfaced in the report.
- Intentional-gating recognition: `Disallow:` paths in the wildcard group
  that match recognized private surfaces (`/admin`, `/auth`, `/cart`, `/api`,
  …) are reported as positive signals rather than penalties.
- `bin/cli.js robots <url> [--json]` — CLI command around `checkRobots`.
- `testBot` / `testAllBots`: results now carry a `blockedAt` field
  attributing 4xx blocks to a CDN/WAF when fingerprints are recognized
  (`cloudflare`, `cloudfront`, `vercel`, `akamai`, `fastly`, `netlify`)
  vs. `'origin'` when the response came back without those fingerprints.
- `test/test-robots.js` — unit tests for the parser, verdict logic,
  conflict reporting, section detection, content-signal parsing, and
  gating recognition. All pure-JS; no network.

## 0.1.0 — Initial release

### Added

- `bots.json` — canonical, sourced list of 19 AI crawler / training bots:
  GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, anthropic-ai (deprecated),
  Claude-Web (deprecated), PerplexityBot, Perplexity-User, Google-Extended,
  Applebot-Extended, Bytespider, CCBot, MistralAI-User, DuckAssistBot,
  Meta-ExternalAgent, FacebookBot, Amazonbot, cohere-training-data-crawler,
  and Diffbot.
- `src/index.js` — public API: `loadBots()`, `getBot(id)`, `testBot(url, botId)`,
  `testAllBots(url)`. No third-party runtime dependencies; uses only
  `node:fs`, `node:http`, `node:https`, `node:url`, `node:path`.
- `bin/cli.js` — `geosuite-bots` CLI with `list`, `show <id>`,
  `check <url>`, and `check <url> --bot=<id>` commands.
- `examples/robots.txt` — annotated, AI-search-friendly robots.txt template
  (allow on-demand fetchers and AI search indexers, disallow bulk training
  crawlers, lock down private surfaces for everyone else).
- `test/test-loader.js` — `node:test` smoke tests covering shape, uniqueness,
  and case-insensitive lookup.
- GitHub Actions CI on Node 20 and 22.
