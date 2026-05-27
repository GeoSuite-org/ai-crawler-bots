// Tests for referral analysis. No I/O — feeds CSV strings into the public API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReferrers,
  parseCsvLine,
  parseCsvTable,
  classifyReferrer,
  normalizeHost,
  loadSources,
} from '../src/referrers.js';

test('parseCsvLine handles quoted fields with commas and "" escapes', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(parseCsvLine('"x, y",z'), ['x, y', 'z']);
  assert.deepEqual(parseCsvLine('"she said ""hi""",2'), ['she said "hi"', '2']);
});

test('normalizeHost strips scheme, www, and source/medium suffix', () => {
  assert.equal(normalizeHost('https://www.perplexity.ai/foo'), 'perplexity.ai');
  assert.equal(normalizeHost('chatgpt.com / referral'), 'chatgpt.com');
  assert.equal(normalizeHost('GEMINI.GOOGLE.COM'), 'gemini.google.com');
});

test('classifyReferrer matches apex and subdomains, ignores unknowns', async () => {
  const srcs = await loadSources();
  assert.equal(classifyReferrer('chatgpt.com', srcs).id, 'chatgpt');
  assert.equal(classifyReferrer('www.perplexity.ai', srcs).id, 'perplexity');
  assert.equal(classifyReferrer('chat.openai.com', srcs).id, 'chatgpt');
  assert.equal(classifyReferrer('google.com', srcs), null); // organic search, not Gemini
  assert.equal(classifyReferrer('example.com', srcs), null);
});

test('parseCsvTable skips GA4 # preamble and finds the header row', () => {
  const csv = [
    '# ----------------------------------------',
    '# Traffic acquisition',
    '# ----------------------------------------',
    '',
    'Session source,Sessions',
    'chatgpt.com,120',
    'google,4000',
  ].join('\n');
  const { header, rows } = parseCsvTable(csv);
  assert.deepEqual(header, ['Session source', 'Sessions']);
  assert.equal(rows.length, 2);
});

test('analyzeReferrers aggregates AI sessions and computes shares', async () => {
  const csv = [
    'Session source,Sessions',
    'chatgpt.com,120',
    'perplexity.ai,30',
    'www.perplexity.ai,10',
    'google,4000',
    '(direct),900',
  ].join('\n');

  const r = await analyzeReferrers(csv);
  assert.equal(r.columns.source, 'Session source');
  assert.equal(r.columns.count, 'Sessions');
  assert.equal(r.totalSessions, 5060);
  assert.equal(r.llmSessions, 160); // 120 + 30 + 10

  // Perplexity rows collapse into one source (apex + www).
  const perp = r.sources.find((s) => s.id === 'perplexity');
  assert.equal(perp.sessions, 40);
  // ChatGPT has more sessions → ranked first.
  assert.equal(r.sources[0].id, 'chatgpt');
  // Non-AI sources surface in the unmatched sample for the "missed one?" hint.
  assert.ok(r.unmatchedSample.some((u) => u.host === 'google'));
});

test('analyzeReferrers counts rows when no count column is present', async () => {
  const csv = ['Source\nchatgpt.com\nchatgpt.com\nbing.com'].join('\n');
  const r = await analyzeReferrers(csv);
  assert.equal(r.columns.count, null);
  assert.equal(r.sources[0].id, 'chatgpt');
  assert.equal(r.sources[0].sessions, 2); // two rows
});

test('source/medium combined column is split to the host', async () => {
  const csv = [
    'Session source / medium,Sessions',
    'chatgpt.com / referral,55',
    'newsletter / email,200',
  ].join('\n');
  const r = await analyzeReferrers(csv);
  assert.equal(r.llmSessions, 55);
  assert.equal(r.sources[0].id, 'chatgpt');
});
