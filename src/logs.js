// Access-log analysis: count real AI-bot hits in a server access log.
//
// Companion to robots.js. Where `robots` reports whether a bot *may* crawl,
// this reports whether it *did* — by matching the User-Agent of each request
// against the tracked bot list. Pairing the two closes the loop: a bot that
// robots.txt allows but that 403s in the logs is blocked somewhere else
// (CDN/WAF), and a bot that never shows up at all simply isn't crawling you.
//
// Pure JS, no dependencies beyond Node built-ins. Designed to stream: feed
// one line at a time into an accumulator so multi-GB logs never sit in memory.
//
// Supported formats (auto-detected per line):
//   - Common Log Format          (no User-Agent → never matches a bot)
//   - Combined Log Format        (Apache/nginx default; UA is the last field)
//   - JSON lines                 (nginx `escape=json`, Vector, etc.)
//
// Public API: createLogAnalyzer(opts), analyzeLogText(text, opts),
//             parseLogLine(line), matchBot(userAgent, bots).

import { loadBots } from './index.js';

// Combined Log Format:
//   IP - user [10/Oct/2000:13:55:36 -0700] "GET /p HTTP/1.1" 200 2326 "ref" "UA"
// Common Log Format is the same up to the byte count, with no referer/UA pair.
const CLF_RE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}|-) (\S+)(?: "([^"]*)" "((?:[^"\\]|\\.)*)")?/;

// Month abbreviations used by the CLF timestamp (`10/Oct/2000:...`).
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Field names that hold the value in common JSON log schemas. Each list also
// carries the Cloudflare Logpush field names (`ClientRequestUserAgent`, …) so
// a Logpush export drops straight into `logs` without remapping.
const JSON_UA_FIELDS = ['http_user_agent', 'user_agent', 'agent', 'ua', 'useragent', 'ClientRequestUserAgent'];
const JSON_TIME_FIELDS = ['time_iso8601', 'time_local', 'timestamp', 'time', '@timestamp', 'EdgeStartTimestamp', 'EdgeEndTimestamp'];
const JSON_STATUS_FIELDS = ['status', 'response_code', 'http_status', 'EdgeResponseStatus', 'OriginResponseStatus'];
const JSON_PATH_FIELDS = ['request', 'request_uri', 'path', 'uri', 'ClientRequestPath', 'ClientRequestURI'];

/**
 * Parse a CLF timestamp like `10/Oct/2000:13:55:36 -0700` into a Date.
 * Returns null when the shape isn't recognized.
 *
 * @param {string} stamp
 * @returns {Date | null}
 */
function parseClfTime(stamp) {
  const m = /^(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/.exec(stamp);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  const [, day, , year, hh, mm, ss, tz] = m;
  const offset = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : 'Z';
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${day}T${hh}:${mm}:${ss}${offset}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Best-effort timestamp parse for JSON logs — tries ISO first, then CLF.
 *
 * @param {string} raw
 * @returns {Date | null}
 */
function parseAnyTime(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  // Cloudflare Logpush can emit timestamps as unix nanoseconds (or seconds).
  if (typeof raw === 'number') {
    const ms = raw > 1e15 ? raw / 1e6 : raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;
  return parseClfTime(raw);
}

/**
 * Parse a single access-log line into a normalized record.
 * Auto-detects JSON vs CLF/Combined. Returns null for lines we can't parse
 * (blank lines, truncated rows, unsupported custom formats).
 *
 * @param {string} line
 * @returns {{ ip: string|null, time: Date|null, method: string|null, path: string|null, status: number|null, userAgent: string } | null}
 */
export function parseLogLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed[0] === '{') {
    try {
      const obj = JSON.parse(trimmed);
      const pick = (keys) => {
        for (const k of keys) {
          if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
        }
        return null;
      };
      const ua = pick(JSON_UA_FIELDS);
      if (ua === null) return null;
      const request = pick(JSON_PATH_FIELDS);
      let method = null;
      let path = request != null ? String(request) : null;
      if (path && / /.test(path) && /^[A-Z]+\s/.test(path)) {
        const parts = path.split(/\s+/);
        method = parts[0];
        path = parts[1] ?? null;
      } else if (obj.method || obj.request_method) {
        method = String(obj.method ?? obj.request_method);
      }
      const statusRaw = pick(JSON_STATUS_FIELDS);
      return {
        ip: obj.remote_addr ?? obj.ip ?? obj.client_ip ?? null,
        time: parseAnyTime(pick(JSON_TIME_FIELDS)),
        method,
        path,
        status: statusRaw != null ? Number(statusRaw) || null : null,
        userAgent: String(ua),
      };
    } catch {
      return null;
    }
  }

  const m = CLF_RE.exec(trimmed);
  if (!m) return null;
  const [, ip, time, request, statusStr, , , uaRaw] = m;
  const ua = uaRaw != null ? uaRaw.replace(/\\"/g, '"') : '';
  let method = null;
  let path = null;
  if (request) {
    const parts = request.split(/\s+/);
    method = parts[0] ?? null;
    path = parts[1] ?? null;
  }
  return {
    ip,
    time: parseClfTime(time),
    method,
    path,
    status: statusStr === '-' ? null : Number(statusStr),
    userAgent: ua,
  };
}

/**
 * Match a User-Agent string against the tracked bot list. A bot matches when
 * its `uaToken` appears (case-insensitive) in the UA. When several tokens
 * match (rare), the longest token wins so a generic prefix never beats a
 * specific name. Bots with a null `uaToken` are policy-only directives
 * (Google-Extended, Applebot-Extended) and never match a real UA.
 *
 * @param {string} userAgent
 * @param {Array<object>} bots
 * @returns {object | null}
 */
export function matchBot(userAgent, bots) {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  let best = null;
  for (const bot of bots) {
    if (!bot.uaToken) continue;
    const token = bot.uaToken.toLowerCase();
    if (ua.includes(token)) {
      if (!best || token.length > best.token.length) best = { bot, token };
    }
  }
  return best ? best.bot : null;
}

function emptyStatusBuckets() {
  return { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 };
}

function bucketFor(status) {
  if (status == null) return 'other';
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500 && status < 600) return '5xx';
  return 'other';
}

/**
 * Create a streaming accumulator. Feed lines with `feed(line)`, then call
 * `result()` to get the aggregated report. Lets the CLI process arbitrarily
 * large logs without buffering them.
 *
 * @param {{ bots: Array<object>, since?: Date|null, until?: Date|null }} opts
 */
export function createLogAnalyzer({ bots, since = null, until = null } = {}) {
  if (!Array.isArray(bots)) throw new Error('createLogAnalyzer requires { bots }');

  const stats = new Map(); // bot.id -> { bot, hits, firstSeen, lastSeen, status, samplePaths }
  let totalLines = 0;
  let parsedLines = 0;
  let matchedHits = 0;
  let outOfRange = 0;
  let overallFirst = null;
  let overallLast = null;

  function inRange(time) {
    if (!time) return true; // keep undated rows; range filter only excludes dated ones
    if (since && time < since) return false;
    if (until && time > until) return false;
    return true;
  }

  function feed(line) {
    totalLines++;
    const rec = parseLogLine(line);
    if (!rec) return;
    parsedLines++;
    const bot = matchBot(rec.userAgent, bots);
    if (!bot) return;
    if (!inRange(rec.time)) {
      outOfRange++;
      return;
    }
    matchedHits++;

    let s = stats.get(bot.id);
    if (!s) {
      s = { bot, hits: 0, firstSeen: null, lastSeen: null, status: emptyStatusBuckets(), samplePaths: [] };
      stats.set(bot.id, s);
    }
    s.hits++;
    s.status[bucketFor(rec.status)]++;
    if (rec.time) {
      if (!s.firstSeen || rec.time < s.firstSeen) s.firstSeen = rec.time;
      if (!s.lastSeen || rec.time > s.lastSeen) s.lastSeen = rec.time;
      if (!overallFirst || rec.time < overallFirst) overallFirst = rec.time;
      if (!overallLast || rec.time > overallLast) overallLast = rec.time;
    }
    if (rec.path && s.samplePaths.length < 5 && !s.samplePaths.includes(rec.path)) {
      s.samplePaths.push(rec.path);
    }
  }

  function result() {
    const seen = [...stats.values()].sort((a, b) => b.hits - a.hits);
    const seenIds = new Set(seen.map((s) => s.bot.id));
    const unseen = bots.filter((b) => b.uaToken && !seenIds.has(b.id));
    const policyOnly = bots.filter((b) => !b.uaToken);
    return {
      totalLines,
      parsedLines,
      unparsedLines: totalLines - parsedLines,
      matchedHits,
      outOfRange,
      range: { firstSeen: overallFirst, lastSeen: overallLast },
      bots: seen,
      unseenBots: unseen,
      policyOnlyBots: policyOnly,
    };
  }

  return { feed, result };
}

/**
 * Convenience wrapper: analyze an in-memory log string. Loads the bot list
 * unless one is supplied. Splits on newlines — for big files prefer
 * createLogAnalyzer fed from a streaming reader.
 *
 * @param {string} text
 * @param {{ bots?: Array<object>, since?: Date|null, until?: Date|null }} [opts]
 * @returns {Promise<object>}
 */
export async function analyzeLogText(text, opts = {}) {
  const bots = opts.bots ?? (await loadBots());
  const analyzer = createLogAnalyzer({ bots, since: opts.since ?? null, until: opts.until ?? null });
  for (const line of String(text).split(/\r?\n/)) analyzer.feed(line);
  return analyzer.result();
}
