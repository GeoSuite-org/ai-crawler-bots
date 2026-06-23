#!/usr/bin/env node
// Entry point for the "AI Crawl Check" GitHub Action (see ../action.yml).
//
// Reuses the exact same library the CLI uses — checkRobots() to audit the
// site's robots.txt and evaluateGate() to decide pass/fail — so the Action and
// the CLI can never disagree on a verdict. Writes a rich job summary, exposes
// score/blocked/allowed as step outputs, and emits ::error:: annotations so a
// failed gate shows up inline in the PR checks UI.

import { appendFileSync } from 'node:fs';
import { checkRobots, evaluateGate } from '../src/index.js';

const input = (key) => {
  const v = process.env[`INPUT_${key}`];
  return v === undefined || v === '' ? undefined : v;
};

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}<<__GHADELIM__\n${value}\n__GHADELIM__\n`);
}

function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, markdown + '\n');
  else process.stdout.write(markdown + '\n');
}

const url = input('URL');
if (!url) {
  console.log('::error::ai-crawler-bots: the `url` input is required.');
  process.exit(1);
}

const result = await checkRobots(url, {
  timeoutMs: input('TIMEOUT') ? Number(input('TIMEOUT')) : undefined,
});

if (result.error) {
  console.log(`::error::ai-crawler-bots: could not fetch ${url}/robots.txt — ${result.error}`);
  appendSummary(`## 🤖 AI Crawl Check\n\n❌ Could not fetch \`${url}/robots.txt\` — ${result.error}`);
  process.exit(1);
}

const idsOf = (list) => list.map((e) => e.bot.id ?? e.bot.name);
setOutput('score', String(result.score));
setOutput('blocked', idsOf(result.blockedBots).join(','));
setOutput('allowed', idsOf(result.allowedBots).join(','));

const rows = [];
const addRows = (label, emoji, list) => {
  for (const e of list) {
    const rule = e.winningRule
      ? `\`${e.winningRule.directive}: ${e.winningRule.value}\``
      : '—';
    rows.push(`| ${emoji} ${label} | ${e.bot.name} | ${e.bot.owner} | ${e.bot.purpose} | ${rule} |`);
  }
};
addRows('Blocked', '🔴', result.blockedBots);
addRows('Allowed', '🟢', result.allowedBots);
addRows('Not set', '⚪', result.notSpecifiedBots);

let md = '## 🤖 AI Crawl Check\n\n';
md += `**[${url}](${url})** — AI-visibility score **${result.score}/100**\n\n`;
if (result.managedBlock) {
  md += `> ⚠️ A managed section (\`${result.managedBlock.section}\`) overrides your file and blocks: ${result.managedBlock.blockedBotNames.join(', ')}.\n\n`;
}
md += '| Verdict | Bot | Owner | Purpose | Rule |\n|---|---|---|---|---|\n';
md += rows.join('\n') + '\n';

const gate = evaluateGate(result, {
  failUnder: input('FAIL_UNDER'),
  assertAllowed: input('ASSERT_ALLOWED'),
  assertBlocked: input('ASSERT_BLOCKED'),
});

const gateRequested =
  input('FAIL_UNDER') !== undefined ||
  input('ASSERT_ALLOWED') !== undefined ||
  input('ASSERT_BLOCKED') !== undefined;

if (!gate.passed) {
  md += '\n### ❌ Gate failed\n' + gate.failures.map((f) => `- ${f}`).join('\n') + '\n';
  appendSummary(md);
  for (const f of gate.failures) console.log(`::error::ai-crawler-bots: ${f}`);
  process.exit(1);
}

if (gateRequested) md += '\n### ✅ Gate passed\n';
appendSummary(md);
