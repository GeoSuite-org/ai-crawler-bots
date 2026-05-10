// Pure-function test for src/ai.js — the deterministic side of the
// helper. Provider auto-detection is a function of `process.env`; we
// don't actually hit any LLM in CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectProvider, chat, _internals } from '../src/ai.js';

test('detectProvider returns null when no env keys are set', () => {
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(detectProvider(), null);
  } finally {
    if (oldOpenAI !== undefined) process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test('detectProvider prefers OPENAI when both keys are present', () => {
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  try {
    const p = detectProvider();
    assert.ok(p);
    assert.equal(p.name, 'openai');
  } finally {
    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test('chat throws a clear error when no API key is configured', async () => {
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(
      () => chat([{ role: 'user', content: 'hi' }]),
      /No LLM API key configured/,
    );
  } finally {
    if (oldOpenAI !== undefined) process.env.OPENAI_API_KEY = oldOpenAI;
    if (oldAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = oldAnthropic;
  }
});

test('PROVIDERS registry exposes both providers', () => {
  const names = Object.keys(_internals.PROVIDERS);
  assert.ok(names.includes('openai'));
  assert.ok(names.includes('anthropic'));
});
