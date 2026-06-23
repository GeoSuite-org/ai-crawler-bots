// Tests for the CI gate logic (evaluateGate).
// No network calls — feeds synthetic checkRobots() result objects into the
// public API, the same way test-robots.js feeds raw robots.txt strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate } from '../src/robots.js';

const entry = (id, name = id) => ({ bot: { id, name } });

const mkResult = (over = {}) => ({
  error: null,
  score: 80,
  blockedBots: [],
  allowedBots: [],
  notSpecifiedBots: [],
  ...over,
});

test('no gate flags → passes with no failures', () => {
  const g = evaluateGate(mkResult());
  assert.equal(g.passed, true);
  assert.deepEqual(g.failures, []);
});

test('fail-under fails below threshold, passes at or above', () => {
  assert.equal(evaluateGate(mkResult({ score: 40 }), { failUnder: 60 }).passed, false);
  assert.equal(evaluateGate(mkResult({ score: 60 }), { failUnder: 60 }).passed, true);
  assert.equal(evaluateGate(mkResult({ score: 90 }), { failUnder: 60 }).passed, true);
});

test('empty / undefined fail-under is ignored', () => {
  assert.equal(evaluateGate(mkResult({ score: 0 }), { failUnder: '' }).passed, true);
  assert.equal(evaluateGate(mkResult({ score: 0 }), { failUnder: undefined }).passed, true);
});

test('assert-allowed fails when a listed bot is blocked', () => {
  const r = mkResult({ blockedBots: [entry('gptbot'), entry('claudebot')] });
  const g = evaluateGate(r, { assertAllowed: 'gptbot,perplexitybot' });
  assert.equal(g.passed, false);
  assert.equal(g.failures.length, 1);
  assert.match(g.failures[0], /gptbot/);
});

test('assert-allowed passes when listed bots are not blocked', () => {
  const r = mkResult({ blockedBots: [entry('gptbot')] });
  assert.equal(evaluateGate(r, { assertAllowed: 'perplexitybot,oai-searchbot' }).passed, true);
});

test('assert-blocked fails when a listed bot is not blocked', () => {
  const r = mkResult({ blockedBots: [entry('gptbot')] });
  const g = evaluateGate(r, { assertBlocked: 'gptbot,claudebot' });
  assert.equal(g.passed, false);
  assert.match(g.failures[0], /claudebot/);
});

test('assert-blocked passes when all listed bots are blocked', () => {
  const r = mkResult({ blockedBots: [entry('gptbot'), entry('claudebot')] });
  assert.equal(evaluateGate(r, { assertBlocked: 'gptbot,claudebot' }).passed, true);
});

test('accepts an array as well as a comma string, and trims spaces', () => {
  const r = mkResult({ blockedBots: [entry('gptbot')] });
  assert.equal(evaluateGate(r, { assertBlocked: ['gptbot'] }).passed, true);
  assert.equal(evaluateGate(r, { assertBlocked: ' gptbot , claudebot ' }).passed, false);
});

test('a fetch error always fails the gate', () => {
  const r = mkResult({ error: 'ENOTFOUND', blockedBots: [entry('gptbot')] });
  const g = evaluateGate(r, { assertBlocked: 'gptbot' });
  assert.equal(g.passed, false);
  assert.match(g.failures[0], /could not fetch/);
});

test('multiple violations are all reported', () => {
  const r = mkResult({ score: 10, blockedBots: [entry('perplexitybot')] });
  const g = evaluateGate(r, {
    failUnder: 50,
    assertAllowed: 'perplexitybot',
    assertBlocked: 'gptbot',
  });
  assert.equal(g.passed, false);
  assert.equal(g.failures.length, 3);
});
