// @geosuite/ai-crawler-bots
// Public API: loadBots() and testBot(url, botId).
// No third-party runtime deps — only Node native modules.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOTS_PATH = join(__dirname, '..', 'bots.json');

let _cache = null;

/**
 * Load the canonical bot list from bots.json.
 * Cached after first read; pass { fresh: true } to force a re-read.
 *
 * @param {{ fresh?: boolean }} [opts]
 * @returns {Promise<Array<Bot>>}
 */
export async function loadBots(opts = {}) {
  if (_cache && !opts.fresh) return _cache;
  const raw = await readFile(BOTS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('bots.json must be a JSON array');
  }
  _cache = parsed;
  return _cache;
}

/**
 * Look up a single bot by its id (case-insensitive).
 *
 * @param {string} id
 * @returns {Promise<Bot | undefined>}
 */
export async function getBot(id) {
  const bots = await loadBots();
  const needle = String(id).toLowerCase();
  return bots.find((b) => b.id.toLowerCase() === needle);
}

/**
 * Issue a single GET request to `url` impersonating the bot with `botId`,
 * and report whether the bot would be served the page.
 *
 * The function does NOT follow redirects automatically — instead, redirect
 * status codes are reported as-is so you can see when a site cloaks AI bots
 * to a different destination.
 *
 * @param {string} url
 * @param {string} botId
 * @param {{ timeoutMs?: number, method?: 'GET' | 'HEAD' }} [opts]
 * @returns {Promise<TestResult>}
 */
export async function testBot(url, botId, opts = {}) {
  const bot = await getBot(botId);
  if (!bot) {
    throw new Error(`Unknown bot id: ${botId}`);
  }
  return requestAs(url, bot, opts);
}

/**
 * Run testBot against every bot in bots.json. Returns results in input order.
 * Requests are issued with a small concurrency cap to be polite.
 *
 * @param {string} url
 * @param {{ timeoutMs?: number, method?: 'GET' | 'HEAD', concurrency?: number }} [opts]
 * @returns {Promise<Array<TestResult>>}
 */
export async function testAllBots(url, opts = {}) {
  const bots = await loadBots();
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 16));
  const results = new Array(bots.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= bots.length) return;
      try {
        results[i] = await requestAs(url, bots[i], opts);
      } catch (err) {
        results[i] = {
          botId: bots[i].id,
          botName: bots[i].name,
          url,
          status: null,
          blocked: true,
          location: null,
          headers: {},
          blockedAt: 'transport',
          error: err && err.message ? err.message : String(err),
        };
      }
    }
  }

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

/**
 * Internal: perform one request as the given bot.
 *
 * @param {string} url
 * @param {Bot} bot
 * @param {{ timeoutMs?: number, method?: 'GET' | 'HEAD' }} opts
 * @returns {Promise<TestResult>}
 */
function requestAs(url, bot, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const method = opts.method ?? 'GET';

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`Invalid URL: ${url}`));
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
  }

  const lib = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method,
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname || '/'}${parsed.search || ''}`,
        headers: {
          'User-Agent': bot.ua,
          Accept: '*/*',
          'Accept-Encoding': 'identity',
        },
      },
      (res) => {
        // Drain the body without buffering the whole page — we only need
        // status + headers, and we don't want to keep the connection open
        // longer than necessary.
        res.resume();
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          const blocked = status === 0 || status === 403 || status === 401 || status === 451;
          resolve({
            botId: bot.id,
            botName: bot.name,
            url,
            status,
            blocked,
            location: res.headers.location ?? null,
            headers: res.headers,
            // When a request is blocked, attribute it to the edge (CDN /
            // WAF) when its fingerprints are visible in the response, or
            // to the origin otherwise. Lets a caller distinguish between
            // "your own server returned 403" and "Cloudflare returned 403
            // before we even reached your origin" — the remediation is
            // very different.
            blockedAt: blocked ? detectEdgeProvider(res.headers) || 'origin' : null,
            error: null,
          });
        });
        res.on('error', (err) => reject(err));
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * Inspect response headers for CDN / WAF fingerprints. Returns a short
 * provider label or null when nothing is recognized.
 *
 * @param {Record<string, string | string[] | undefined>} headers
 * @returns {string | null}
 */
function detectEdgeProvider(headers) {
  const get = (k) => {
    const v = headers[k.toLowerCase()];
    if (Array.isArray(v)) return v.join(' ').toLowerCase();
    return typeof v === 'string' ? v.toLowerCase() : '';
  };
  const server = get('server');
  if (get('cf-ray') || server.includes('cloudflare')) return 'cloudflare';
  if (get('x-amz-cf-id') || server.includes('cloudfront')) return 'cloudfront';
  if (get('x-vercel-id')) return 'vercel';
  if (server.includes('akamai') || get('x-akamai-request-id')) return 'akamai';
  if (server.includes('fastly') || get('x-fastly-request-id')) return 'fastly';
  if (server.includes('netlify')) return 'netlify';
  return null;
}

export { checkRobots, parseRobots, verdictForBot, intentionalGating } from './robots.js';
export { createLogAnalyzer, analyzeLogText, parseLogLine, matchBot } from './logs.js';

/**
 * @typedef {Object} Bot
 * @property {string} id
 * @property {string} name
 * @property {string} ua
 * @property {string} owner
 * @property {'training' | 'search' | 'user-agent'} purpose
 * @property {string} docsUrl
 * @property {'Allow' | 'Disallow'} robotsDirective
 * @property {string} notes
 */

/**
 * @typedef {Object} TestResult
 * @property {string} botId
 * @property {string} botName
 * @property {string} url
 * @property {number | null} status
 * @property {boolean} blocked
 * @property {string | null} location
 * @property {Record<string, string | string[] | undefined>} headers
 * @property {'edge' | 'origin' | 'transport' | string | null} blockedAt — `null` when not blocked. Otherwise a CDN/WAF label (e.g. `'cloudflare'`), `'origin'` when the response came from the origin server, or `'transport'` when no response arrived.
 * @property {string | null} error
 */
