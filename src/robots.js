// robots.txt parsing with attribution.
// Companion to the live-test API: instead of impersonating a bot and
// looking at the HTTP response, this fetches /robots.txt and reports,
// for each known AI bot, which line in the file determines its verdict.
//
// The parser preserves:
//   - line numbers per directive
//   - group ordering (so first-match-wins semantics are visible)
//   - section markers inside comments (e.g. Cloudflare Managed Content)
//   - the Content-Signal directive
//
// Public API: parseRobots(text), checkRobots(url, opts).
// Both are pure JS, no dependencies beyond Node built-ins.

import http from 'node:http';
import https from 'node:https';
import { loadBots } from './index.js';

const TOP_AI_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'OAI-SearchBot',
  'Google-Extended',
];

// Section markers recognized inside robots.txt comments.
// Each entry: [startRegex, endRegex, label].
const SECTION_MARKERS = [
  [
    /begin\s+cloudflare\s+managed\s+content/i,
    /end\s+cloudflare\s+managed\s+content/i,
    'cloudflare_managed_content',
  ],
];

// Path prefixes (in the wildcard group) that we treat as deliberately gated
// private surfaces. Hitting one is a *positive* signal — the site owner
// blocked them on purpose, not because they don't want AI traffic.
const PRIVATE_SURFACE_PATTERNS = [
  ['/admin', 'admin'],
  ['/wp-admin', 'admin'],
  ['/auth', 'auth'],
  ['/login', 'auth'],
  ['/signup', 'auth'],
  ['/sign-up', 'auth'],
  ['/sign-in', 'auth'],
  ['/forgot-password', 'auth'],
  ['/reset-password', 'auth'],
  ['/verify-email', 'auth'],
  ['/account', 'account'],
  ['/dashboard', 'app'],
  ['/app', 'app'],
  ['/api', 'api'],
  ['/internal', 'api'],
  ['/cart', 'checkout'],
  ['/carts', 'checkout'],
  ['/checkout', 'checkout'],
  ['/checkouts', 'checkout'],
  ['/orders', 'checkout'],
];

/**
 * Parse a Content-Signal value: `search=yes,ai-train=no` →
 * `{ search: 'yes', 'ai-train': 'no' }`.
 *
 * @param {string} value
 * @returns {Record<string, string>}
 */
function parseContentSignal(value) {
  const out = {};
  for (const piece of value.split(',')) {
    const eq = piece.indexOf('=');
    if (eq === -1) continue;
    const key = piece.slice(0, eq).trim().toLowerCase();
    const val = piece.slice(eq + 1).trim().toLowerCase();
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Parse robots.txt into a list of groups with line-level provenance.
 *
 * @param {string} raw
 * @returns {Array<Group>}
 */
export function parseRobots(raw) {
  const groups = [];
  let current = null;
  let currentSection = null;
  let lastWasDirective = false;

  const lines = raw.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const lineNumber = idx + 1;
    const rawLine = lines[idx];
    const stripped = rawLine.trim();

    // Section markers ride inside comments. Track open/close.
    if (stripped.startsWith('#')) {
      const body = stripped.replace(/^#+/, '').trim();
      if (currentSection === null) {
        for (const [start, , label] of SECTION_MARKERS) {
          if (start.test(body)) {
            currentSection = label;
            break;
          }
        }
      } else {
        for (const [, end, label] of SECTION_MARKERS) {
          if (label === currentSection && end.test(body)) {
            currentSection = null;
            break;
          }
        }
      }
      continue;
    }

    const noComment = rawLine.split('#', 1)[0].trim();
    if (!noComment || !noComment.includes(':')) continue;

    const colon = noComment.indexOf(':');
    const key = noComment.slice(0, colon).trim().toLowerCase();
    const value = noComment.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (value === '') continue;
      if (!current || lastWasDirective) {
        current = {
          userAgents: [],
          userAgentLines: [],
          directives: [],
          contentSignal: null,
          contentSignalLine: null,
          sourceLabel: currentSection,
          startLine: lineNumber,
        };
        groups.push(current);
      }
      current.userAgents.push(value);
      current.userAgentLines.push(lineNumber);
      if (currentSection && !current.sourceLabel) {
        current.sourceLabel = currentSection;
      }
      lastWasDirective = false;
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) continue;
      current.directives.push({ directive: key, value, line: lineNumber });
      lastWasDirective = true;
    } else if (key === 'content-signal') {
      if (!current) continue;
      current.contentSignal = parseContentSignal(value);
      current.contentSignalLine = lineNumber;
    }
    // Other directives (Sitemap, Crawl-delay, Host, …) are ignored for
    // verdict purposes but should not split groups.
  }

  return groups;
}

/**
 * Robots.txt path matching with `*` (any) and `$` (end-of-line) wildcards.
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
function pathMatches(pattern, path) {
  if (pattern === '') return false;
  const decodedPattern = decodeURIComponent(pattern);
  const decodedPath = decodeURIComponent(path);
  const endAnchored = decodedPattern.endsWith('$');
  const body = endAnchored ? decodedPattern.slice(0, -1) : decodedPattern;
  const escaped = body
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp('^' + escaped + (endAnchored ? '$' : ''));
  return re.test(decodedPath);
}

/**
 * Within-group rule precedence: longest match wins, Allow on tie.
 *
 * @param {Group} group
 * @param {string} path
 * @returns {{ verdict: 'allow' | 'disallow', directive: Directive } | null}
 */
function verdictWithinGroup(group, path) {
  let best = null;
  for (const d of group.directives) {
    if (!pathMatches(d.value, path)) continue;
    const score = d.value.length;
    const priority = d.directive === 'allow' ? 1 : 0;
    const candidate = { score, priority, directive: d };
    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.priority > best.priority)
    ) {
      best = candidate;
    }
  }
  if (!best) return null;
  return { verdict: best.directive.directive, directive: best.directive };
}

/**
 * Find groups that match a bot token (specific) and groups using `*` (wildcard).
 *
 * @param {Array<Group>} groups
 * @param {string} botToken
 * @returns {{ specific: Array<Group>, wildcard: Array<Group> }}
 */
function matchingGroups(groups, botToken) {
  const tokenLc = botToken.toLowerCase();
  const specific = [];
  const wildcard = [];
  for (const g of groups) {
    const lc = g.userAgents.map((ua) => ua.toLowerCase());
    if (lc.includes(tokenLc)) specific.push(g);
    else if (lc.includes('*')) wildcard.push(g);
  }
  return { specific, wildcard };
}

function rulePayload(group, directive, botToken) {
  return {
    directive: directive.directive,
    value: directive.value,
    line: directive.line,
    userAgent: botToken,
    groupUserAgents: [...group.userAgents],
    sourceLabel: group.sourceLabel,
  };
}

/**
 * Compute the verdict for one bot, with full attribution.
 *
 * First-match semantics on group ordering: when the same UA appears in
 * multiple groups (e.g. Cloudflare's managed block + the user's own
 * block), the first group that yields a verdict wins. Mirrors what
 * strict bots and `urllib.robotparser` actually do.
 *
 * @param {Array<Group>} groups
 * @param {string} botToken
 * @returns {{
 *   verdict: 'blocked' | 'allowed' | 'not_specified',
 *   winningRule: Rule | null,
 *   conflictingRules: Array<Rule>,
 *   contentSignal: Record<string, string> | null
 * }}
 */
export function verdictForBot(groups, botToken) {
  const { specific, wildcard } = matchingGroups(groups, botToken);
  const pool = specific.length ? specific : wildcard;

  if (!pool.length) {
    return { verdict: 'not_specified', winningRule: null, conflictingRules: [], contentSignal: null };
  }

  let winningVerdict = null;
  let winningRule = null;
  let winningSignal = null;
  const conflicting = [];

  for (const g of pool) {
    const result = verdictWithinGroup(g, '/');
    if (result === null) {
      if (winningVerdict === null) {
        winningVerdict = 'allow';
        winningRule = null;
        winningSignal = g.contentSignal ? { ...g.contentSignal } : null;
      }
      continue;
    }
    if (winningVerdict === null) {
      winningVerdict = result.verdict;
      winningRule = rulePayload(g, result.directive, botToken);
      winningSignal = g.contentSignal ? { ...g.contentSignal } : null;
    } else if (result.verdict !== winningVerdict) {
      conflicting.push(rulePayload(g, result.directive, botToken));
    }
  }

  if (winningVerdict === 'disallow') {
    return { verdict: 'blocked', winningRule, conflictingRules: conflicting, contentSignal: winningSignal };
  }
  if (specific.length) {
    return { verdict: 'allowed', winningRule, conflictingRules: conflicting, contentSignal: winningSignal };
  }
  return { verdict: 'not_specified', winningRule, conflictingRules: conflicting, contentSignal: winningSignal };
}

/**
 * Disallow rules in the wildcard group that gate recognized private surfaces.
 *
 * @param {Array<Group>} groups
 * @returns {Array<{ category: string, value: string, line: number }>}
 */
export function intentionalGating(groups) {
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    if (!g.userAgents.map((ua) => ua.toLowerCase()).includes('*')) continue;
    for (const d of g.directives) {
      if (d.directive !== 'disallow' || !d.value) continue;
      const normalized = d.value.replace(/\/+$/, '').toLowerCase();
      for (const [prefix, category] of PRIVATE_SURFACE_PATTERNS) {
        if (
          normalized === prefix ||
          normalized.startsWith(prefix + '/') ||
          normalized.startsWith(prefix + '*')
        ) {
          const key = `${category} ${d.value}`;
          if (seen.has(key)) break;
          seen.add(key);
          out.push({ category, value: d.value, line: d.line });
          break;
        }
      }
    }
  }
  return out;
}

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
 * @returns {Promise<RobotsCheckResult>}
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
  const groups = body && status && status < 400 ? parseRobots(body) : [];

  const blocked = [];
  const allowed = [];
  const notSpecified = [];

  if (status === 0 || status >= 400 || !body.trim()) {
    for (const bot of bots) {
      notSpecified.push({ bot, verdict: 'not_specified', winningRule: null, conflictingRules: [], contentSignal: null });
    }
  } else {
    for (const bot of bots) {
      const v = verdictForBot(groups, bot.name);
      const entry = { bot, ...v };
      if (v.verdict === 'blocked') blocked.push(entry);
      else if (v.verdict === 'allowed') allowed.push(entry);
      else notSpecified.push(entry);
    }
  }

  const blockedTopNames = new Set(blocked.map((e) => e.bot.name));
  const notBlockedTop = TOP_AI_BOTS.filter((n) => !blockedTopNames.has(n)).length;
  const score = Math.round((notBlockedTop / TOP_AI_BOTS.length) * 100);

  const gating = intentionalGating(groups);

  // Managed-block summary: bots whose verdict came from a labeled section,
  // and (for each) whether the user's own non-managed groups would have allowed.
  const bySection = {};
  for (const e of blocked) {
    const label = e.winningRule?.sourceLabel;
    if (!label) continue;
    (bySection[label] ||= []).push(e);
  }
  let managedBlock = null;
  const sectionNames = Object.keys(bySection);
  if (sectionNames.length) {
    sectionNames.sort((a, b) => bySection[b].length - bySection[a].length);
    const section = sectionNames[0];
    const blockedInSection = bySection[section];
    const userWouldAllow = [];
    for (const e of blockedInSection) {
      const nonManaged = groups.filter((g) => g.sourceLabel !== section);
      const v = verdictForBot(nonManaged, e.bot.name);
      if (v.verdict === 'allowed' || v.verdict === 'not_specified') {
        userWouldAllow.push(e.bot.name);
      }
    }
    managedBlock = {
      section,
      blockedBotNames: blockedInSection.map((e) => e.bot.name),
      userWouldAllow,
    };
  }

  const contentSignals = groups
    .filter((g) => g.contentSignal)
    .map((g) => ({
      userAgents: [...g.userAgents],
      signals: { ...g.contentSignal },
      line: g.contentSignalLine,
      sourceLabel: g.sourceLabel,
    }));

  return {
    url: origin,
    robotsUrl,
    fetchStatus: status,
    rawRobotsTxt: body,
    blockedBots: blocked,
    allowedBots: allowed,
    notSpecifiedBots: notSpecified,
    score,
    intentionalGating: gating,
    managedBlock,
    contentSignals,
    error,
  };
}

/**
 * @typedef {Object} Directive
 * @property {'allow' | 'disallow'} directive
 * @property {string} value
 * @property {number} line
 */

/**
 * @typedef {Object} Group
 * @property {Array<string>} userAgents
 * @property {Array<number>} userAgentLines
 * @property {Array<Directive>} directives
 * @property {Record<string, string> | null} contentSignal
 * @property {number | null} contentSignalLine
 * @property {string | null} sourceLabel
 * @property {number} startLine
 */

/**
 * @typedef {Object} Rule
 * @property {'allow' | 'disallow'} directive
 * @property {string} value
 * @property {number} line
 * @property {string} userAgent
 * @property {Array<string>} groupUserAgents
 * @property {string | null} sourceLabel
 */

/**
 * @typedef {Object} BotVerdict
 * @property {Object} bot
 * @property {'blocked' | 'allowed' | 'not_specified'} verdict
 * @property {Rule | null} winningRule
 * @property {Array<Rule>} conflictingRules
 * @property {Record<string, string> | null} contentSignal
 */

/**
 * @typedef {Object} RobotsCheckResult
 * @property {string} url
 * @property {string} robotsUrl
 * @property {number} fetchStatus
 * @property {string} rawRobotsTxt
 * @property {Array<BotVerdict>} blockedBots
 * @property {Array<BotVerdict>} allowedBots
 * @property {Array<BotVerdict>} notSpecifiedBots
 * @property {number} score
 * @property {Array<{ category: string, value: string, line: number }>} intentionalGating
 * @property {{ section: string, blockedBotNames: Array<string>, userWouldAllow: Array<string> } | null} managedBlock
 * @property {Array<{ userAgents: Array<string>, signals: Record<string, string>, line: number | null, sourceLabel: string | null }>} contentSignals
 * @property {string | null} error
 */
