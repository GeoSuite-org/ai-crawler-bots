// Referral analysis: classify how much traffic an analytics export attributes
// to AI assistants / answer engines.
//
// Companion to `logs`. Where `logs` reads server access logs to see which AI
// *bots crawled* you (server-side, JS-blind), `referrers` reads an analytics
// CSV export (GA4, Plausible, Matomo, …) to see which *humans clicked through*
// from an AI answer (client-side). The two are different funnel stages:
// crawl reachability vs. citation click-through.
//
// Caveat baked into the model: referral attribution under-counts. Many
// assistants strip the `Referer`, and a citation read without a click leaves
// no session at all. Treat this as a floor, not a census.
//
// Pure JS, no dependencies beyond Node built-ins.
//
// Public API: loadSources(), parseCsvTable(text), classifyReferrer(host, srcs),
//             analyzeReferrers(text, opts).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_PATH = join(__dirname, '..', 'llm_sources.json');

// Header names (lower-cased) that hold the traffic source / referrer host
// across the common analytics exports.
const SOURCE_HEADERS = [
  'session source', 'session source / medium', 'source', 'source / medium',
  'referrer', 'referer', 'host', 'hostname', 'source url',
];
// Count columns, in preference order: sessions first, then user counts.
const COUNT_HEADERS = [
  'sessions', 'session', 'visits', 'active users', 'total users', 'users',
  'engaged sessions', 'visitors', 'pageviews',
];

let _cache = null;

/**
 * Load the curated LLM referrer source list from llm_sources.json.
 *
 * @param {{ fresh?: boolean }} [opts]
 * @returns {Promise<Array<Source>>}
 */
export async function loadSources(opts = {}) {
  if (_cache && !opts.fresh) return _cache;
  const parsed = JSON.parse(await readFile(SOURCES_PATH, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('llm_sources.json must be a JSON array');
  _cache = parsed;
  return _cache;
}

/**
 * Split one CSV line into fields, honoring double-quoted values with embedded
 * commas and "" escapes (RFC 4180). Good enough for analytics exports; not a
 * general-purpose CSV parser.
 *
 * @param {string} line
 * @returns {Array<string>}
 */
export function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/**
 * Find the data table inside an analytics CSV. GA4 UI exports prepend a
 * `#`-commented metadata preamble and separate sections with blank lines, so
 * we skip comment/blank lines, take the first row that looks like a header
 * (contains a recognized source column), and read until a blank line.
 *
 * @param {string} text
 * @returns {{ header: Array<string>, rows: Array<Array<string>> }}
 */
export function parseCsvTable(text) {
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  // Skip preamble: comments + blanks, until a plausible header row.
  let header = null;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const cells = parseCsvLine(raw).map((c) => c.toLowerCase());
    if (cells.some((c) => SOURCE_HEADERS.includes(c))) {
      header = parseCsvLine(raw);
      i++;
      break;
    }
    // First non-comment row that isn't a recognized header — treat it as the
    // header anyway (custom export), so we don't silently skip data.
    header = parseCsvLine(raw);
    i++;
    break;
  }
  if (!header) return { header: [], rows: [] };

  const rows = [];
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) break; // blank line ends the table section
    if (raw.trim().startsWith('#')) continue;
    rows.push(parseCsvLine(raw));
  }
  return { header, rows };
}

function pickColumn(header, candidates, override) {
  const lower = header.map((h) => h.toLowerCase());
  if (override) {
    const idx = lower.indexOf(override.toLowerCase());
    return idx === -1 ? -1 : idx;
  }
  for (const cand of candidates) {
    const idx = lower.indexOf(cand);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Normalize a source cell to a bare host. Handles `host / medium`
 * (GA4 source/medium), full URLs, and `www.` prefixes.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeHost(value) {
  let v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  // GA4 "source / medium" → take the source half.
  if (v.includes(' / ')) v = v.split(' / ')[0].trim();
  // Strip scheme + path if a full URL slipped in.
  v = v.replace(/^[a-z]+:\/\//, '').split('/')[0];
  return v.replace(/^www\./, '');
}

/**
 * Classify a host against the LLM source list. Matches the apex host or any
 * subdomain of a configured host. Returns the source or null.
 *
 * @param {string} host
 * @param {Array<Source>} sources
 * @returns {Source | null}
 */
export function classifyReferrer(host, sources) {
  const h = normalizeHost(host);
  if (!h) return null;
  for (const src of sources) {
    for (const candidate of src.hosts) {
      const c = candidate.toLowerCase();
      if (h === c || h.endsWith('.' + c)) return src;
    }
  }
  return null;
}

/**
 * Parse an analytics CSV export and aggregate sessions attributed to each
 * tracked AI source.
 *
 * @param {string} text
 * @param {{ sources?: Array<Source>, sourceColumn?: string, countColumn?: string }} [opts]
 * @returns {Promise<ReferrerResult>}
 */
export async function analyzeReferrers(text, opts = {}) {
  const sources = opts.sources ?? (await loadSources());
  const { header, rows } = parseCsvTable(text);
  if (!header.length) {
    return { totalRows: 0, matchedRows: 0, totalSessions: 0, llmSessions: 0, sources: [], unmatchedSample: [], columns: { source: null, count: null } };
  }

  const srcIdx = pickColumn(header, SOURCE_HEADERS, opts.sourceColumn);
  const cntIdx = pickColumn(header, COUNT_HEADERS, opts.countColumn);

  const stats = new Map(); // src.id -> { source, sessions, hosts:Set }
  let totalRows = 0;
  let matchedRows = 0;
  let totalSessions = 0;
  let llmSessions = 0;
  const unmatched = new Map(); // host -> sessions (for the "did you miss one?" hint)

  for (const row of rows) {
    if (srcIdx === -1 || srcIdx >= row.length) continue;
    totalRows++;
    const rawHost = row[srcIdx];
    const count = cntIdx === -1 ? 1 : Number(String(row[cntIdx] ?? '').replace(/[, ]/g, '')) || 0;
    totalSessions += count;

    const src = classifyReferrer(rawHost, sources);
    if (!src) {
      const h = normalizeHost(rawHost);
      if (h) unmatched.set(h, (unmatched.get(h) || 0) + count);
      continue;
    }
    matchedRows++;
    llmSessions += count;
    let s = stats.get(src.id);
    if (!s) {
      s = { source: src, sessions: 0, hosts: new Set() };
      stats.set(src.id, s);
    }
    s.sessions += count;
    s.hosts.add(normalizeHost(rawHost));
  }

  const ranked = [...stats.values()]
    .map((s) => ({
      id: s.source.id,
      name: s.source.name,
      owner: s.source.owner,
      kind: s.source.kind,
      sessions: s.sessions,
      hosts: [...s.hosts],
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const unmatchedSample = [...unmatched.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([host, sessions]) => ({ host, sessions }));

  return {
    totalRows,
    matchedRows,
    totalSessions,
    llmSessions,
    sources: ranked,
    unmatchedSample,
    columns: {
      source: srcIdx === -1 ? null : header[srcIdx],
      count: cntIdx === -1 ? null : header[cntIdx],
    },
  };
}

/**
 * @typedef {Object} Source
 * @property {string} id
 * @property {string} name
 * @property {string} owner
 * @property {Array<string>} hosts
 * @property {'assistant' | 'search'} kind
 * @property {string} notes
 */

/**
 * @typedef {Object} ReferrerResult
 * @property {number} totalRows
 * @property {number} matchedRows
 * @property {number} totalSessions
 * @property {number} llmSessions
 * @property {Array<{ id: string, name: string, owner: string, kind: string, sessions: number, hosts: Array<string> }>} sources
 * @property {Array<{ host: string, sessions: number }>} unmatchedSample
 * @property {{ source: string | null, count: string | null }} columns
 */
