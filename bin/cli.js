#!/usr/bin/env node
// geosuite-bots — small CLI around @geosuite/ai-crawler-bots.
//   geosuite-bots list
//   geosuite-bots check <url>
//   geosuite-bots check <url> --bot=<id>

import { loadBots, getBot, testBot, testAllBots, checkRobots } from '../src/index.js';
import { chat, detectProvider } from '../src/ai.js';

const [, , command, ...rest] = process.argv;

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (const a of args) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) {
        flags[a.slice(2)] = true;
      } else {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printHelp() {
  process.stdout.write(
    [
      'geosuite-bots — test AI crawler reachability for a URL',
      '',
      'Usage:',
      '  geosuite-bots list',
      '  geosuite-bots check <url> [--bot=<id>] [--timeout=<ms>] [--method=GET|HEAD]',
      '  geosuite-bots robots <url> [--timeout=<ms>] [--json] [--ai]',
      '  geosuite-bots show <id>',
      '',
      'AI mode (opt-in):',
      '  Set OPENAI_API_KEY or ANTHROPIC_API_KEY and pass --ai to a',
      '  command that supports it. We send only the structured verdict',
      '  (no raw robots.txt body) to the provider.',
      '',
      'Examples:',
      '  geosuite-bots list',
      '  geosuite-bots check https://example.com',
      '  geosuite-bots check https://example.com --bot=gptbot',
      '  geosuite-bots robots https://example.com',
      '',
    ].join('\n'),
  );
}

async function cmdList() {
  const bots = await loadBots();
  const cols = [
    ['ID', 30],
    ['NAME', 22],
    ['OWNER', 14],
    ['PURPOSE', 12],
    ['DIRECTIVE', 10],
  ];
  process.stdout.write(cols.map(([h, w]) => pad(h, w)).join('  ') + '\n');
  process.stdout.write(cols.map(([, w]) => '-'.repeat(w)).join('  ') + '\n');
  for (const b of bots) {
    process.stdout.write(
      [
        pad(b.id, 30),
        pad(b.name, 22),
        pad(b.owner, 14),
        pad(b.purpose, 12),
        pad(b.robotsDirective, 10),
      ].join('  ') + '\n',
    );
  }
  process.stdout.write(`\n${bots.length} bots tracked.\n`);
}

async function cmdShow(id) {
  if (!id) {
    process.stderr.write('Usage: geosuite-bots show <id>\n');
    process.exit(2);
  }
  const bot = await getBot(id);
  if (!bot) {
    process.stderr.write(`Unknown bot id: ${id}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(bot, null, 2) + '\n');
}

function formatResult(r) {
  const status = r.status === null ? 'ERR' : String(r.status);
  const verdict = r.error
    ? `error: ${r.error}`
    : r.blocked
      ? r.blockedAt && r.blockedAt !== 'origin'
        ? `BLOCKED at ${r.blockedAt}`
        : 'BLOCKED'
      : r.status >= 300 && r.status < 400
        ? `redirect -> ${r.location ?? '?'}`
        : 'ok';
  return `${pad(r.botId, 30)}  ${pad(status, 5)}  ${verdict}`;
}

async function cmdCheck(positional, flags) {
  const url = positional[0];
  if (!url) {
    process.stderr.write('Usage: geosuite-bots check <url> [--bot=<id>]\n');
    process.exit(2);
  }
  const opts = {
    timeoutMs: flags.timeout ? Number(flags.timeout) : undefined,
    method: flags.method ?? 'GET',
  };
  if (opts.method !== 'GET' && opts.method !== 'HEAD') {
    process.stderr.write(`Invalid --method: ${opts.method} (expected GET or HEAD)\n`);
    process.exit(2);
  }

  if (flags.bot) {
    const r = await testBot(url, String(flags.bot), opts);
    process.stdout.write(formatResult(r) + '\n');
    return;
  }

  const results = await testAllBots(url, opts);
  process.stdout.write(`Testing ${url}\n\n`);
  for (const r of results) {
    process.stdout.write(formatResult(r) + '\n');
  }
  const blocked = results.filter((r) => r.blocked || r.error).length;
  const ok = results.length - blocked;
  process.stdout.write(`\n${ok} reachable, ${blocked} blocked or errored.\n`);
}

async function cmdRobots(positional, flags) {
  const url = positional[0];
  if (!url) {
    process.stderr.write('Usage: geosuite-bots robots <url> [--timeout=<ms>] [--json]\n');
    process.exit(2);
  }
  const result = await checkRobots(url, {
    timeoutMs: flags.timeout ? Number(flags.timeout) : undefined,
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (result.error) {
    process.stderr.write(`error: ${result.error}\n`);
    process.exit(1);
  }

  process.stdout.write(`Fetched ${result.robotsUrl}  (HTTP ${result.fetchStatus})\n`);
  process.stdout.write(`AI visibility score: ${result.score}/100\n\n`);

  if (result.managedBlock) {
    process.stdout.write(`Managed section: ${result.managedBlock.section}\n`);
    process.stdout.write(`  blocks: ${result.managedBlock.blockedBotNames.join(', ')}\n`);
    if (result.managedBlock.userWouldAllow.length) {
      process.stdout.write(
        `  your file alone would allow: ${result.managedBlock.userWouldAllow.join(', ')}\n`,
      );
    }
    process.stdout.write('\n');
  }

  for (const bucket of [
    ['BLOCKED', result.blockedBots],
    ['ALLOWED', result.allowedBots],
    ['NOT SPECIFIED', result.notSpecifiedBots],
  ]) {
    const [label, list] = bucket;
    if (!list.length) continue;
    process.stdout.write(`${label} (${list.length})\n`);
    for (const e of list) {
      const rule = e.winningRule
        ? `  → ${e.winningRule.directive}: ${e.winningRule.value} (line ${e.winningRule.line}${e.winningRule.sourceLabel ? ', ' + e.winningRule.sourceLabel : ''})`
        : '';
      process.stdout.write(`  ${pad(e.bot.name, 22)}${rule}\n`);
    }
    process.stdout.write('\n');
  }

  if (result.intentionalGating.length) {
    process.stdout.write(`Intentional gating (${result.intentionalGating.length})\n`);
    for (const g of result.intentionalGating) {
      process.stdout.write(`  ${pad(g.category, 10)}  ${g.value}  (line ${g.line})\n`);
    }
    process.stdout.write('\n');
  }

  if (result.contentSignals.length) {
    process.stdout.write('Content-Signal\n');
    for (const sig of result.contentSignals) {
      const pairs = Object.entries(sig.signals).map(([k, v]) => `${k}=${v}`).join(',');
      process.stdout.write(`  ${pad(sig.userAgents.join(','), 16)}  ${pairs}\n`);
    }
    process.stdout.write('\n');
  }

  if (flags.ai) {
    if (!detectProvider()) {
      process.stderr.write(
        '--ai requested but no LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.\n',
      );
      return;
    }
    process.stdout.write('AI summary\n');
    try {
      const summary = await aiSummariseRobots(result);
      process.stdout.write(summary + '\n');
    } catch (err) {
      process.stderr.write(`AI summary skipped: ${err.message}\n`);
    }
  }
}

/**
 * Ask the LLM to translate the structured robots verdict into a short
 * plain-language paragraph for non-technical operators.
 *
 * Privacy: we send the bucket counts, blocked-bot names, score, and the
 * managed-block summary. We do NOT send the raw robots.txt body (it can
 * contain customer-specific paths).
 */
async function aiSummariseRobots(result) {
  const compact = {
    score: result.score,
    blocked: result.blockedBots.map((e) => e.bot.name),
    allowed: result.allowedBots.map((e) => e.bot.name),
    not_specified: result.notSpecifiedBots.map((e) => e.bot.name),
    managed_block: result.managedBlock
      ? {
          section: result.managedBlock.section,
          blocks: result.managedBlock.blockedBotNames,
          user_would_allow: result.managedBlock.userWouldAllow,
        }
      : null,
    advisory: result.advisory ? result.advisory.key : null,
  };
  return chat(
    [
      {
        role: 'system',
        content:
          'You translate robots.txt verdicts for AI crawlers into a short plain-language summary for site owners. Keep it under 120 words, use plain language, no jargon, no markdown. Lead with whether the major AI bots (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended) can read the site or not. Mention any managed-section override. End with the single most important next step.',
      },
      {
        role: 'user',
        content: `Robots verdict:\n${JSON.stringify(compact, null, 2)}`,
      },
    ],
    { maxTokens: 400, temperature: 0.2 },
  );
}

async function main() {
  const { flags, positional } = parseFlags(rest);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  switch (command) {
    case 'list':
      await cmdList();
      return;
    case 'show':
      await cmdShow(positional[0]);
      return;
    case 'check':
      await cmdCheck(positional, flags);
      return;
    case 'robots':
      await cmdRobots(positional, flags);
      return;
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});
