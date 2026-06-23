// robots.txt fetching (Node layer).
//
// The pure parsing, per-bot verdicts, scoring, and CI gate live in
// ./analyze.js (no `node:*`, no I/O) so they run in any runtime. This file
// adds the Node-only piece — fetching /robots.txt over http/https — and
// re-exports the pure API so existing `from './robots.js'` imports keep working.
//
// Public API: parseRobots(text), checkRobots(url, opts), analyzeRobots(...),
// evaluateGate(...). See ./analyze.js for the runtime-agnostic core.

import http from 'node:http';
import https from 'node:https';
import { loadBots } from './index.js';
import {
  parseRobots,
  verdictForBot,
  intentionalGating,
  analyzeRobots,
  evaluateGate,
} from './analyze.js';

function fetchRobotsTxt(robotsUrl, timeoutMs) {
  let parsed;
  try {
    parsed = new URL(robotsUrl);
  } catch {
    return Promise.resolve({ status: 0, body: '', error: `Invalid URL: ${robotsUrl}` });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.resolve({ status: 0, body: '', error: `Unsupported protocol: ${parsed.protocol}` });
  }
  const lib = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(
      {
        method: 'GET',
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: '/robots.txt',
        headers: {
          'User-Agent': '@geosuite/ai-crawler-bots robots-check',
          Accept: 'text/plain, */*',
          'Accept-Encoding': 'identity',
        },
      },
      (res) => {
        // Follow one level of redirect manually so we don't need a deps.
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, robotsUrl).toString();
          fetchRobotsTxt(next, timeoutMs).then(resolve);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            error: null,
          }),
        );
        res.on('error', (err) => resolve({ status: 0, body: '', error: err.message }));
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)));
    req.on('error', (err) => resolve({ status: 0, body: '', error: err.message }));
    req.end();
  });
}

/**
 * Origin-only normalization: strip path/query, default to https://.
 */
function originOf(url) {
  const cleaned = String(url ?? '').trim();
  if (!cleaned || /\s/.test(cleaned)) throw new Error(`Invalid URL: ${url}`);
  const parsed = new URL(cleaned.includes('://') ? cleaned : `https://${cleaned}`);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
    throw new Error(`Invalid URL: ${url}`);
  }
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Fetch a site's /robots.txt, parse it with attribution, and return per-bot
 * verdicts plus contextual signals (intentional gating, managed-block
 * sections, Content-Signal directives).
 *
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<import('./analyze.js').RobotsCheckResult>}
 */
export async function checkRobots(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let origin;
  try {
    origin = originOf(url);
  } catch (err) {
    return {
      url,
      robotsUrl: '',
      fetchStatus: 0,
      rawRobotsTxt: '',
      bots: [],
      blockedBots: [],
      allowedBots: [],
      notSpecifiedBots: [],
      score: 0,
      intentionalGating: [],
      managedBlock: null,
      contentSignals: [],
      error: err.message,
    };
  }

  const robotsUrl = `${origin}/robots.txt`;
  const { status, body, error } = await fetchRobotsTxt(robotsUrl, timeoutMs);

  const bots = await loadBots();
  return analyzeRobots({ origin, robotsUrl, status, body, bots, error });
}

// Re-export the pure API so `from './robots.js'` keeps working for callers and
// tests that imported these before the analyze.js split.
export { parseRobots, verdictForBot, intentionalGating, analyzeRobots, evaluateGate };
