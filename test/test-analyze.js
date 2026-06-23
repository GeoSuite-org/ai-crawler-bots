// Tests for analyzeRobots — the pure, network-free analysis half of
// checkRobots. Feeds synthetic robots.txt bodies + a minimal bot list, so it
// exercises the scoring/bucketing/managed-block logic without any I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRobots } from '../src/robots.js';

// A tiny stand-in for bots.json — only the fields analyzeRobots reads (id, name).
const BOTS = [
  { id: 'gptbot', name: 'GPTBot' },
  { id: 'claudebot', name: 'ClaudeBot' },
  { id: 'perplexitybot', name: 'PerplexityBot' },
  { id: 'oai-searchbot', name: 'OAI-SearchBot' },
  { id: 'google-extended', name: 'Google-Extended' },
];

const analyze = (body, status = 200) =>
  analyzeRobots({ origin: 'https://x.test', robotsUrl: 'https://x.test/robots.txt', status, body, bots: BOTS });

test('a blocked top bot lowers the score and lands in blockedBots', () => {
  const r = analyze('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /');
  assert.equal(r.score, 80); // 4 of 5 top bots still reachable
  assert.ok(r.blockedBots.some((e) => e.bot.id === 'gptbot'));
  assert.equal(r.error, null);
});

test('an empty / missing robots.txt leaves every bot not_specified at full score', () => {
  const r = analyze('', 404);
  assert.equal(r.score, 100);
  assert.equal(r.blockedBots.length, 0);
  assert.equal(r.notSpecifiedBots.length, BOTS.length);
});

test('a Cloudflare managed section is surfaced as managedBlock', () => {
  const body = [
    '# BEGIN Cloudflare Managed content',
    'User-agent: GPTBot',
    'Disallow: /',
    '# END Cloudflare Managed Content',
  ].join('\n');
  const r = analyze(body);
  assert.ok(r.managedBlock);
  assert.equal(r.managedBlock.section, 'cloudflare_managed_content');
  assert.ok(r.managedBlock.blockedBotNames.includes('GPTBot'));
});
