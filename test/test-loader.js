// Smoke test for bots.json shape and the public loader.
// Uses Node's built-in test runner — no devDependencies required.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBots, getBot } from '../src/index.js';

const REQUIRED_FIELDS = [
  'id',
  'name',
  'ua',
  'owner',
  'purpose',
  'docsUrl',
  'robotsDirective',
  'notes',
];

const VALID_PURPOSES = new Set(['training', 'search', 'user-agent']);
const VALID_DIRECTIVES = new Set(['Allow', 'Disallow']);

test('bots.json parses and is non-empty', async () => {
  const bots = await loadBots({ fresh: true });
  assert.ok(Array.isArray(bots), 'bots must be an array');
  assert.ok(bots.length > 0, 'bots list must not be empty');
});

test('every bot has all required fields with non-empty string values', async () => {
  const bots = await loadBots();
  for (const bot of bots) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(bot, field),
        `bot ${JSON.stringify(bot)} is missing field "${field}"`,
      );
      assert.equal(
        typeof bot[field],
        'string',
        `bot ${bot.id ?? '?'} field "${field}" must be a string`,
      );
      assert.ok(
        bot[field].length > 0,
        `bot ${bot.id ?? '?'} field "${field}" must not be empty`,
      );
    }
  }
});

test('purpose and robotsDirective use only allowed values', async () => {
  const bots = await loadBots();
  for (const bot of bots) {
    assert.ok(
      VALID_PURPOSES.has(bot.purpose),
      `bot ${bot.id} has invalid purpose "${bot.purpose}"`,
    );
    assert.ok(
      VALID_DIRECTIVES.has(bot.robotsDirective),
      `bot ${bot.id} has invalid robotsDirective "${bot.robotsDirective}"`,
    );
  }
});

test('docsUrl values are well-formed http(s) URLs', async () => {
  const bots = await loadBots();
  for (const bot of bots) {
    let parsed;
    try {
      parsed = new URL(bot.docsUrl);
    } catch {
      assert.fail(`bot ${bot.id} has invalid docsUrl: ${bot.docsUrl}`);
    }
    assert.ok(
      parsed.protocol === 'http:' || parsed.protocol === 'https:',
      `bot ${bot.id} docsUrl must be http(s): ${bot.docsUrl}`,
    );
  }
});

test('bot ids are unique', async () => {
  const bots = await loadBots();
  const ids = bots.map((b) => b.id);
  const seen = new Set();
  for (const id of ids) {
    assert.ok(!seen.has(id), `duplicate bot id: ${id}`);
    seen.add(id);
  }
});

test('bot UA strings are unique', async () => {
  const bots = await loadBots();
  const seen = new Map();
  for (const bot of bots) {
    if (seen.has(bot.ua)) {
      assert.fail(
        `duplicate UA between "${seen.get(bot.ua)}" and "${bot.id}": ${bot.ua}`,
      );
    }
    seen.set(bot.ua, bot.id);
  }
});

test('bot ids are lowercase and slug-safe', async () => {
  const bots = await loadBots();
  const slug = /^[a-z0-9][a-z0-9-]*$/;
  for (const bot of bots) {
    assert.ok(
      slug.test(bot.id),
      `bot id "${bot.id}" must be lowercase and contain only [a-z0-9-]`,
    );
  }
});

test('getBot() resolves known ids case-insensitively', async () => {
  const a = await getBot('gptbot');
  const b = await getBot('GPTBOT');
  assert.ok(a, 'gptbot should be found');
  assert.equal(a.id, 'gptbot');
  assert.deepEqual(a, b);
});

test('getBot() returns undefined for unknown ids', async () => {
  const r = await getBot('definitely-not-a-real-bot-xyz');
  assert.equal(r, undefined);
});
