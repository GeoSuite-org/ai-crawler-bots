// "AI Crawl Check" — hosted free checker (Cloudflare Worker).
//
// Reuses the exact same analysis the CLI and the GitHub Action use:
// analyzeRobots() from the package, fed a robots.txt fetched with the platform
// `fetch()` and the bundled bots.json. No reimplementation, no drift.
//
// Page routes (bilingual):
//   GET /     → locale picked from Accept-Language (it → Italian, else English)
//   GET /en   → English   |   GET /it → Italian
// API routes:
//   GET /api/check?url → { url, score, blocked[], allowed[], notSpecified[], … }
//   GET /bots, /api/bots, /bots/:id → the curated bot list
// Asset routes:
//   GET /og.png  /favicon.svg
//
// We import from ../src/analyze.js (the pure, dependency-free core) — NOT the
// package index — so the bundle never pulls in any `node:*` module or
// top-level `import.meta`/filesystem code. The robots.txt download uses the
// global `fetch`; the bot list is bundled from ../bots.json at build time.

import { analyzeRobots } from '../src/analyze.js';
import bots from '../bots.json';
import { renderPage } from './page.js';
import OG_PNG from './og.png'; // bundled as ArrayBuffer via the wrangler "Data" rule

// A geo "location pin" mark in the GeoSuite accent — inline SVG, no binary.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0f17"/><path d="M32 13c-8.3 0-15 6.4-15 14.6C17 38 32 51 32 51s15-13 15-23.4C47 19.4 40.3 13 32 13z" fill="#5b8def"/><circle cx="32" cy="27.5" r="5.6" fill="#0b0f17"/></svg>`;

// '/it' → 'it', '/en' → 'en', '/' → first Accept-Language tag (it → 'it', else 'en').
function pickLang(request, path) {
  if (path === '/it') return 'it';
  if (path === '/en') return 'en';
  const first = (request.headers.get('accept-language') || '').split(',')[0].trim().toLowerCase();
  return first.startsWith('it') ? 'it' : 'en';
}

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

    // --- Static assets ---
    if (url.pathname === '/og.png') {
      return new Response(OG_PNG, {
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
      });
    }
    if (url.pathname === '/favicon.svg') {
      return new Response(FAVICON, {
        headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' },
      });
    }

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

    // Public read-only API over the curated bot list (the bundled bots.json).
    if (url.pathname === '/bots' || url.pathname === '/api/bots') {
      return new Response(JSON.stringify(bots), { headers: JSON_HEADERS });
    }
    const botMatch = url.pathname.match(/^\/(?:api\/)?bots\/([^/]+)$/);
    if (botMatch) {
      const id = decodeURIComponent(botMatch[1]).toLowerCase();
      const bot = bots.find((b) => (b.id || '').toLowerCase() === id);
      return new Response(JSON.stringify(bot || { error: `unknown bot id: ${id}` }), {
        status: bot ? 200 : 404,
        headers: JSON_HEADERS,
      });
    }

    if (url.pathname === '/' || url.pathname === '/en' || url.pathname === '/it') {
      const lang = pickLang(request, url.pathname);
      // '/' is content-negotiated, so it must not be cached language-agnostically.
      const headers = {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      };
      if (url.pathname === '/') headers.vary = 'Accept-Language';
      return new Response(renderPage(lang), { headers });
    }

    return new Response('Not found', { status: 404 });
  },
};
