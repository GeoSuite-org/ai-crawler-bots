// Tests for the robots.txt parser + verdict logic.
// No network calls — feeds raw robots.txt strings into the public API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, verdictForBot, intentionalGating } from '../src/robots.js';

test('parser tracks line numbers per directive', () => {
  const robots = [
    'User-agent: *',           // 1
    'Allow: /',                // 2
    '',                        // 3
    'User-agent: GPTBot',      // 4
    'Disallow: /',             // 5
  ].join('\n');
  const groups = parseRobots(robots);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].userAgents, ['*']);
  assert.equal(groups[0].directives[0].line, 2);
  assert.deepEqual(groups[1].userAgents, ['GPTBot']);
  assert.equal(groups[1].directives[0].line, 5);
});

test('first-match group wins; loser shows up as conflict', () => {
  const robots = [
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
  ].join('\n');
  const groups = parseRobots(robots);
  const v = verdictForBot(groups, 'GPTBot');
  assert.equal(v.verdict, 'blocked');
  assert.equal(v.winningRule.directive, 'disallow');
  assert.equal(v.conflictingRules.length, 1);
  assert.equal(v.conflictingRules[0].directive, 'allow');
});

test('Cloudflare Managed Content section labels its directives', () => {
  const robots = [
    '# BEGIN Cloudflare Managed content',
    'User-agent: GPTBot',
    'Disallow: /',
    '# END Cloudflare Managed Content',
    '',
    'User-agent: GPTBot',
    'Allow: /',
  ].join('\n');
  const groups = parseRobots(robots);
  assert.equal(groups[0].sourceLabel, 'cloudflare_managed_content');
  assert.equal(groups[1].sourceLabel, null);

  const v = verdictForBot(groups, 'GPTBot');
  assert.equal(v.verdict, 'blocked');
  assert.equal(v.winningRule.sourceLabel, 'cloudflare_managed_content');
});

test('Content-Signal directive is parsed and attached to its group', () => {
  const robots = [
    'User-agent: *',
    'Content-Signal: search=yes,ai-train=no',
    'Allow: /',
  ].join('\n');
  const groups = parseRobots(robots);
  assert.deepEqual(groups[0].contentSignal, { search: 'yes', 'ai-train': 'no' });
  assert.equal(groups[0].contentSignalLine, 2);
});

test('intentionalGating credits private-surface disallows in wildcard group', () => {
  const robots = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    'Disallow: /checkout',
    'Disallow: /random-marketing-page/',
  ].join('\n');
  const groups = parseRobots(robots);
  const gating = intentionalGating(groups);
  const categories = new Set(gating.map((g) => g.category));
  assert.ok(categories.has('admin'));
  assert.ok(categories.has('api'));
  assert.ok(categories.has('checkout'));
  // /random-marketing-page is not a recognized private surface.
  const values = new Set(gating.map((g) => g.value));
  assert.ok(!values.has('/random-marketing-page/'));
});

test('wildcard-only robots leaves specific bots in not_specified', () => {
  // `User-agent: *` alone is the spec default — it doesn't *explicitly*
  // grant access to any specific bot, so they remain in "not_specified"
  // (which is still an allow per spec, just not affirmative).
  const robots = 'User-agent: *\nAllow: /\n';
  const groups = parseRobots(robots);
  const v = verdictForBot(groups, 'GPTBot');
  assert.equal(v.verdict, 'not_specified');
});

test('specific group with Allow: / lands the bot in allowed', () => {
  const robots = 'User-agent: GPTBot\nAllow: /\n';
  const groups = parseRobots(robots);
  const v = verdictForBot(groups, 'GPTBot');
  assert.equal(v.verdict, 'allowed');
});
