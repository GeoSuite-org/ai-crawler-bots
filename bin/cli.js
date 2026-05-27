#!/usr/bin/env node
// geosuite-bots — small CLI around @geosuite/ai-crawler-bots.
//   geosuite-bots list
//   geosuite-bots check <url>
//   geosuite-bots check <url> --bot=<id>

import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { loadBots, getBot, testBot, testAllBots, checkRobots, createLogAnalyzer, analyzeReferrers } from '../src/index.js';
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
      '  geosuite-bots watch  <url> [--interval=<s>] [--timeout=<ms>] [--json]',
      '  geosuite-bots logs  <file|.gz|-> [--since=<date>] [--until=<date>] [--json]',
      '  geosuite-bots referrers <file.csv|-> [--source-col=<h>] [--count-col=<h>] [--json]',
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
      '  geosuite-bots watch  https://example.com --interval=60',
      '  geosuite-bots logs  ./access.log',
      '  geosuite-bots logs  ./access.log --since=2026-05-01 --json',
      '  cat access.log | geosuite-bots logs -',
      '  geosuite-bots referrers ./ga4-traffic.csv',
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
 * Poll checkRobots on a fixed interval and print a diff whenever the score
 * or any bot's verdict changes. Runs until Ctrl-C.
 *
 * Output format:
 *   [ISO timestamp]  score: 80 → 60  (delta: -20)
 *   BLOCKED   GPTBot      (was allowed)
 *   ALLOWED   ClaudeBot   (was blocked)
 *
 * With --json each tick emits a JSON object: { ts, score, changed: [...] }.
 * An initial run is always printed in full.
 */
async function cmdWatch(positional, flags) {
  const url = positional[0];
  if (!url) {
    process.stderr.write('Usage: geosuite-bots watch <url> [--interval=<s>] [--timeout=<ms>] [--json]\n');
    process.exit(2);
  }

  const intervalMs = Math.max(5, Number(flags.interval ?? 60)) * 1000;
  const opts = { timeoutMs: flags.timeout ? Number(flags.timeout) : undefined };
  const jsonMode = !!flags.json;

  process.stderr.write(
    `Watching ${url} every ${Math.round(intervalMs / 1000)}s — press Ctrl-C to stop\n\n`,
  );

  let prev = null;

  async function tick() {
    const ts = new Date().toISOString();
    const result = await checkRobots(url, opts);

    if (result.error) {
      if (jsonMode) {
        process.stdout.write(JSON.stringify({ ts, error: result.error }) + '\n');
      } else {
        process.stderr.write(`[${ts}] error: ${result.error}\n`);
      }
      return;
    }

    if (!prev) {
      // First run — emit full picture.
      if (jsonMode) {
        const snap = botSnapshot(result);
        process.stdout.write(JSON.stringify({ ts, score: result.score, initial: true, bots: snap }) + '\n');
      } else {
        process.stdout.write(`[${ts}]  initial check — score: ${result.score}/100\n`);
        for (const e of result.blockedBots) {
          process.stdout.write(`  BLOCKED   ${pad(e.bot.name, 22)}\n`);
        }
        for (const e of result.allowedBots) {
          process.stdout.write(`  ALLOWED   ${pad(e.bot.name, 22)}\n`);
        }
        for (const e of result.notSpecifiedBots) {
          process.stdout.write(`  NOT SET   ${pad(e.bot.name, 22)}\n`);
        }
        process.stdout.write('\n');
      }
    } else {
      const changed = diffResults(prev, result);
      const scoreDelta = result.score - prev.score;

      if (changed.length === 0 && scoreDelta === 0) {
        if (!jsonMode) {
          process.stderr.write(`[${ts}]  no change  (score: ${result.score}/100)\n`);
        }
      } else {
        if (jsonMode) {
          process.stdout.write(
            JSON.stringify({ ts, score: result.score, scoreDelta, changed }) + '\n',
          );
        } else {
          const deltaStr = scoreDelta >= 0 ? `+${scoreDelta}` : String(scoreDelta);
          process.stdout.write(
            `[${ts}]  score: ${prev.score} → ${result.score}  (${deltaStr})\n`,
          );
          for (const c of changed) {
            process.stdout.write(
              `  ${pad(c.now.toUpperCase(), 10)}  ${pad(c.botName, 22)}  (was ${c.was})\n`,
            );
          }
          process.stdout.write('\n');
        }
      }
    }

    prev = result;
  }

  await tick();
  const timer = setInterval(tick, intervalMs);

  process.on('SIGINT', () => {
    clearInterval(timer);
    process.stderr.write('\nStopped.\n');
    process.exit(0);
  });
}

function botSnapshot(result) {
  const out = {};
  for (const e of result.blockedBots) out[e.bot.id ?? e.bot.name] = 'blocked';
  for (const e of result.allowedBots) out[e.bot.id ?? e.bot.name] = 'allowed';
  for (const e of result.notSpecifiedBots) out[e.bot.id ?? e.bot.name] = 'not_specified';
  return out;
}

function diffResults(prev, next) {
  const prevSnap = botSnapshot(prev);
  const nextSnap = botSnapshot(next);
  const changes = [];
  for (const [id, nextVerdict] of Object.entries(nextSnap)) {
    const prevVerdict = prevSnap[id] ?? 'not_specified';
    if (prevVerdict !== nextVerdict) {
      changes.push({ botName: id, was: prevVerdict, now: nextVerdict });
    }
  }
  return changes;
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

/**
 * Parse a --since / --until flag. Accepts an ISO datetime or a bare date
 * (YYYY-MM-DD). For a bare --until date we snap to end-of-day so the whole
 * day is included.
 *
 * @param {string} raw
 * @param {'start' | 'end'} edge
 * @returns {Date}
 */
function parseDateFlag(raw, edge) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const iso = dateOnly ? `${raw}T${edge === 'end' ? '23:59:59.999' : '00:00:00.000'}` : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    process.stderr.write(`Invalid date: ${raw} (expected YYYY-MM-DD or ISO datetime)\n`);
    process.exit(2);
  }
  return d;
}

function fmtTime(d) {
  if (!d) return '—';
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace('Z', ' UTC');
}

/**
 * Read an access log (file path, or `-` for stdin), match every request's
 * User-Agent against the tracked bots, and report per-bot hit counts with
 * status breakdown and last-seen. Streams line by line so multi-GB logs are
 * fine. Pair with `robots` to spot policy/reality mismatches: a bot allowed
 * in robots.txt but 4xx-ing here is being blocked at the edge.
 */
async function cmdLogs(positional, flags) {
  const source = positional[0];
  if (!source) {
    process.stderr.write('Usage: geosuite-bots logs <file|-> [--since=<date>] [--until=<date>] [--json]\n');
    process.exit(2);
  }

  const bots = await loadBots();
  const analyzer = createLogAnalyzer({
    bots,
    since: flags.since ? parseDateFlag(String(flags.since), 'start') : null,
    until: flags.until ? parseDateFlag(String(flags.until), 'end') : null,
  });

  // Gunzip `.gz` logs transparently (rotated logs ship compressed). zlib is
  // a Node built-in, so this stays dependency-free.
  let input;
  if (source === '-') {
    input = process.stdin;
  } else {
    const fileStream = createReadStream(source);
    input = source.endsWith('.gz') ? fileStream.pipe(createGunzip()) : fileStream;
  }
  await new Promise((resolve, reject) => {
    input.on('error', reject);
    const rl = createInterface({ input, crlfDelay: Infinity });
    rl.on('line', (line) => analyzer.feed(line));
    rl.on('close', resolve);
  }).catch((err) => {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  });

  const r = analyzer.result();

  if (flags.json) {
    const out = {
      totalLines: r.totalLines,
      parsedLines: r.parsedLines,
      unparsedLines: r.unparsedLines,
      matchedHits: r.matchedHits,
      range: {
        firstSeen: r.range.firstSeen ? r.range.firstSeen.toISOString() : null,
        lastSeen: r.range.lastSeen ? r.range.lastSeen.toISOString() : null,
      },
      bots: r.bots.map((s) => ({
        id: s.bot.id,
        name: s.bot.name,
        owner: s.bot.owner,
        purpose: s.bot.purpose,
        hits: s.hits,
        firstSeen: s.firstSeen ? s.firstSeen.toISOString() : null,
        lastSeen: s.lastSeen ? s.lastSeen.toISOString() : null,
        status: s.status,
        samplePaths: s.samplePaths,
      })),
      unseenBots: r.unseenBots.map((b) => b.id),
      policyOnlyBots: r.policyOnlyBots.map((b) => b.id),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  process.stdout.write(
    `Parsed ${r.parsedLines.toLocaleString()} of ${r.totalLines.toLocaleString()} lines` +
      (r.unparsedLines ? `  (${r.unparsedLines.toLocaleString()} unrecognized)` : '') +
      '\n',
  );
  if (r.range.firstSeen) {
    process.stdout.write(`Bot activity from ${fmtTime(r.range.firstSeen)} to ${fmtTime(r.range.lastSeen)}\n`);
  }
  process.stdout.write('\n');

  if (!r.bots.length) {
    process.stdout.write('No tracked AI bots found in this log.\n');
    process.stdout.write(
      'If you expected some, check the log is in Combined or JSON format (Common Log Format has no User-Agent).\n',
    );
    return;
  }

  const header =
    pad('BOT', 22) + '  ' + pad('HITS', 8) + '  ' + pad('LAST SEEN', 22) + '  ' + '2xx/3xx/4xx/5xx';
  process.stdout.write(header + '\n');
  process.stdout.write('-'.repeat(header.length) + '\n');
  for (const s of r.bots) {
    const st = s.status;
    const breakdown = `${st['2xx']}/${st['3xx']}/${st['4xx']}/${st['5xx']}`;
    const warn = st['4xx'] > 0 ? '  ⚠ some blocked/4xx' : '';
    process.stdout.write(
      pad(s.bot.name, 22) + '  ' + pad(s.hits.toLocaleString(), 8) + '  ' + pad(fmtTime(s.lastSeen), 22) + '  ' + breakdown + warn + '\n',
    );
  }

  const seenCount = r.bots.length;
  const trackable = bots.filter((b) => b.uaToken).length;
  process.stdout.write(`\n${seenCount} of ${trackable} trackable bots seen.`);
  if (r.unseenBots.length) {
    process.stdout.write(` Not seen: ${r.unseenBots.map((b) => b.name).join(', ')}.`);
  }
  process.stdout.write('\n');
  process.stdout.write(
    'Tip: cross-check with `geosuite-bots robots <site>` — a bot allowed in robots.txt but 4xx-ing here is being blocked at the CDN/WAF.\n',
  );
}

/**
 * Read an analytics CSV export (GA4 / Plausible / Matomo, file or stdin) and
 * report how many human sessions each AI assistant / answer engine referred.
 * The observed-click counterpart to `logs` (observed crawl): a citation that
 * gets read but not clicked leaves no row here, so treat counts as a floor.
 */
async function cmdReferrers(positional, flags) {
  const source = positional[0];
  if (!source) {
    process.stderr.write('Usage: geosuite-bots referrers <file.csv|-> [--source-col=<h>] [--count-col=<h>] [--json]\n');
    process.exit(2);
  }

  let text = '';
  if (source === '-') {
    for await (const chunk of process.stdin) text += chunk;
  } else {
    const { readFile } = await import('node:fs/promises');
    text = await readFile(source, 'utf8');
  }

  const r = await analyzeReferrers(text, {
    sourceColumn: flags['source-col'] ? String(flags['source-col']) : undefined,
    countColumn: flags['count-col'] ? String(flags['count-col']) : undefined,
  });

  if (flags.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    return;
  }

  if (!r.columns.source) {
    process.stderr.write(
      'Could not find a source/referrer column. Pass --source-col=<header> (and --count-col=<header>).\n',
    );
    process.exit(1);
  }

  process.stdout.write(
    `Source column: "${r.columns.source}"` +
      (r.columns.count ? `   Count column: "${r.columns.count}"` : '   (no count column — counting rows)') +
      '\n',
  );
  process.stdout.write(`Parsed ${r.totalRows.toLocaleString()} rows\n\n`);

  if (!r.sources.length) {
    process.stdout.write('No AI-assistant referral traffic found in this export.\n');
    if (r.unmatchedSample.length) {
      process.stdout.write(
        'Top non-AI sources: ' +
          r.unmatchedSample.map((u) => `${u.host} (${u.sessions.toLocaleString()})`).join(', ') +
          '\n',
      );
    }
    return;
  }

  const header = pad('AI SOURCE', 22) + '  ' + pad('SESSIONS', 12) + '  ' + 'SHARE OF AI';
  process.stdout.write(header + '\n');
  process.stdout.write('-'.repeat(header.length) + '\n');
  for (const s of r.sources) {
    const share = r.llmSessions ? ((s.sessions / r.llmSessions) * 100).toFixed(1) : '0.0';
    process.stdout.write(
      pad(s.name, 22) + '  ' + pad(s.sessions.toLocaleString(), 12) + '  ' + `${share}%` + '\n',
    );
  }

  const overall = r.totalSessions ? ((r.llmSessions / r.totalSessions) * 100).toFixed(2) : '0.00';
  process.stdout.write(
    `\n${r.llmSessions.toLocaleString()} AI-referred sessions ` +
      `of ${r.totalSessions.toLocaleString()} total (${overall}%).\n`,
  );
  process.stdout.write(
    'Note: referral attribution under-counts — many assistants strip the Referer, and a cited answer read without a click leaves no session. Treat this as a floor.\n',
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
    case 'watch':
      await cmdWatch(positional, flags);
      return;
    case 'logs':
      await cmdLogs(positional, flags);
      return;
    case 'referrers':
      await cmdReferrers(positional, flags);
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
