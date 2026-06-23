// "AI Crawl Check" — hosted free checker (Cloudflare Worker).
//
// Reuses the exact same analysis the CLI and the GitHub Action use:
// analyzeRobots() from the package, fed a robots.txt fetched with the platform
// `fetch()` and the bundled bots.json. No reimplementation, no drift.
//
// Two routes:
//   GET /              → the single-page UI (web/page.js)
//   GET /api/check?url → { url, score, blocked[], allowed[], notSpecified[], … }
//
// We import from ../src/analyze.js (the pure, dependency-free core) — NOT the
// package index — so the bundle never pulls in any `node:*` module or
// top-level `import.meta`/filesystem code. The robots.txt download uses the
// global `fetch`; the bot list is bundled from ../bots.json at build time.

import { analyzeRobots } from '../src/analyze.js';
import bots from '../bots.json';
import { PAGE } from './page.js';

const MAX_ROBOTS_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8000;

function originOf(input) {
  let u = String(input || '').trim();
  if (!u) throw new Error('empty url');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return new URL(u).origin;
}

const compactBot = (e) => ({
  id: e.bot.id,
  name: e.bot.name,
  owner: e.bot.owner,
  purpose: e.bot.purpose,
});

async function check(rawUrl) {
  let origin;
  try {
    origin = originOf(rawUrl);
  } catch {
    return { error: 'Please enter a valid URL.' };
  }

  const robotsUrl = origin + '/robots.txt';
  let status = 0;
  let body = '';
  let error = null;
  try {
    const res = await fetch(robotsUrl, {
      headers: {
        'user-agent': 'ai-crawler-bots-web/1.0 (+https://github.com/TryGeoSuite/ai-crawler-bots)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    status = res.status;
    if (status < 400) {
      const text = await res.text();
      body = text.length > MAX_ROBOTS_BYTES ? text.slice(0, MAX_ROBOTS_BYTES) : text;
    }
  } catch (e) {
    error = e && e.name === 'TimeoutError' ? 'The site took too long to respond.' : 'Could not fetch robots.txt.';
  }

  const r = analyzeRobots({ origin, robotsUrl, status, body, bots, error });
  return {
    url: r.url,
    fetchStatus: r.fetchStatus,
    score: r.score,
    blocked: r.blockedBots.map(compactBot),
    allowed: r.allowedBots.map(compactBot),
    notSpecified: r.notSpecifiedBots.map(compactBot),
    managedBlock: r.managedBlock,
    error: r.error,
  };
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/check') {
      const target = url.searchParams.get('url');
      if (!target) {
        return new Response(JSON.stringify({ error: 'Missing ?url= parameter.' }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }
      const result = await check(target);
      // Server-side usage counting only: target domain + score, no visitor data.
      if (env && env.AE && !result.error) {
        try {
          env.AE.writeDataPoint({
            indexes: [(result.url || '').replace(/^https?:\/\//, '').slice(0, 32)],
            blobs: [result.url || ''],
            doubles: [result.score ?? -1, (result.blocked || []).length],
          });
        } catch {
          // Never let analytics break a check.
        }
      }
      return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
    }

    if (url.pathname === '/') {
      return new Response(PAGE, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
