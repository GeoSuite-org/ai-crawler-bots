// Tests for access-log analysis. No I/O — feeds raw log strings into the
// public API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLogLine, matchBot, analyzeLogText } from '../src/logs.js';
import { loadBots } from '../src/index.js';

const GPTBOT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot';

test('parseLogLine reads Combined Log Format', () => {
  const line =
    `66.249.66.1 - - [21/May/2026:10:00:00 +0000] "GET /pricing HTTP/1.1" 200 5120 "-" "${GPTBOT_UA}"`;
  const rec = parseLogLine(line);
  assert.equal(rec.method, 'GET');
  assert.equal(rec.path, '/pricing');
  assert.equal(rec.status, 200);
  assert.equal(rec.userAgent, GPTBOT_UA);
  assert.equal(rec.time.toISOString(), '2026-05-21T10:00:00.000Z');
});

test('parseLogLine returns empty UA for Common Log Format (no UA field)', () => {
  const line = '127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /a.gif HTTP/1.0" 200 2326';
  const rec = parseLogLine(line);
  assert.equal(rec.status, 200);
  assert.equal(rec.userAgent, '');
});

test('parseLogLine reads nginx JSON lines', () => {
  const line = JSON.stringify({
    time_iso8601: '2026-05-21T11:30:00+00:00',
    request: 'GET /blog/post HTTP/2.0',
    status: '403',
    http_user_agent: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  });
  const rec = parseLogLine(line);
  assert.equal(rec.method, 'GET');
  assert.equal(rec.path, '/blog/post');
  assert.equal(rec.status, 403);
  assert.ok(rec.userAgent.includes('ClaudeBot'));
  assert.equal(rec.time.toISOString(), '2026-05-21T11:30:00.000Z');
});

test('parseLogLine reads Cloudflare Logpush fields (RFC3339 + ns)', () => {
  const rfc = parseLogLine(JSON.stringify({
    ClientRequestUserAgent: GPTBOT_UA,
    EdgeResponseStatus: 200,
    EdgeStartTimestamp: '2026-05-21T10:00:00Z',
    ClientRequestPath: '/pricing',
  }));
  assert.equal(rfc.path, '/pricing');
  assert.equal(rfc.status, 200);
  assert.equal(rfc.userAgent, GPTBOT_UA);
  assert.equal(rfc.time.toISOString(), '2026-05-21T10:00:00.000Z');

  // Logpush default emits the timestamp as unix nanoseconds.
  const ns = Date.UTC(2026, 4, 21, 10, 0, 0) * 1e6;
  const intTs = parseLogLine(JSON.stringify({
    ClientRequestUserAgent: GPTBOT_UA,
    EdgeResponseStatus: 403,
    EdgeStartTimestamp: ns,
  }));
  assert.equal(intTs.status, 403);
  assert.equal(intTs.time.toISOString(), '2026-05-21T10:00:00.000Z');
});

test('parseLogLine returns null for blank/garbage lines', () => {
  assert.equal(parseLogLine(''), null);
  assert.equal(parseLogLine('   '), null);
  assert.equal(parseLogLine('not a log line at all'), null);
});

test('matchBot picks the bot whose token is in the UA, longest token wins', async () => {
  const bots = await loadBots();
  assert.equal(matchBot(GPTBOT_UA, bots).id, 'gptbot');
  assert.equal(matchBot('curl/8.0', bots), null);
  // Policy-only tokens (null uaToken) never match a real UA.
  assert.equal(matchBot('Google-Extended', bots)?.id, undefined);
});

test('analyzeLogText aggregates hits, status buckets, and unseen bots', async () => {
  const log = [
    `1.1.1.1 - - [21/May/2026:10:00:00 +0000] "GET /a HTTP/1.1" 200 10 "-" "${GPTBOT_UA}"`,
    `1.1.1.1 - - [21/May/2026:10:05:00 +0000] "GET /b HTTP/1.1" 403 10 "-" "${GPTBOT_UA}"`,
    `2.2.2.2 - - [21/May/2026:11:00:00 +0000] "GET /c HTTP/1.1" 200 10 "-" "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"`,
    `3.3.3.3 - - [21/May/2026:12:00:00 +0000] "GET /d HTTP/1.1" 200 10 "-" "Mozilla/5.0 (regular human browser)"`,
  ].join('\n');

  const r = await analyzeLogText(log);
  assert.equal(r.totalLines, 4);
  assert.equal(r.matchedHits, 3);

  const gpt = r.bots.find((s) => s.bot.id === 'gptbot');
  assert.equal(gpt.hits, 2);
  assert.equal(gpt.status['2xx'], 1);
  assert.equal(gpt.status['4xx'], 1);
  assert.equal(gpt.lastSeen.toISOString(), '2026-05-21T10:05:00.000Z');

  // GPTBot has more hits than PerplexityBot → sorted first.
  assert.equal(r.bots[0].bot.id, 'gptbot');
  // ClaudeBot never appeared → in unseen list.
  assert.ok(r.unseenBots.some((b) => b.id === 'claudebot'));
});

test('analyzeLogText respects --since / --until range', async () => {
  const log = [
    `1.1.1.1 - - [01/May/2026:10:00:00 +0000] "GET /a HTTP/1.1" 200 10 "-" "${GPTBOT_UA}"`,
    `1.1.1.1 - - [21/May/2026:10:00:00 +0000] "GET /b HTTP/1.1" 200 10 "-" "${GPTBOT_UA}"`,
  ].join('\n');

  const r = await analyzeLogText(log, {
    since: new Date('2026-05-10T00:00:00Z'),
    until: new Date('2026-05-31T23:59:59Z'),
  });
  assert.equal(r.matchedHits, 1);
  assert.equal(r.outOfRange, 1);
  assert.equal(r.bots[0].hits, 1);
});
