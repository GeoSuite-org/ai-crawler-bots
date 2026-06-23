// The single-page UI served at `/`. Kept as a plain template string (no
// `${}` interpolation, no backticks inside) so it drops straight into the
// Worker response. All CSS/JS is inline — no external assets, CSP-friendly.

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Crawl Check — which AI bots can read your site?</title>
<meta name="description" content="Paste a URL and see which AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) your robots.txt allows or blocks, with an AI-visibility score.">
<style>
  :root {
    --bg: #0b0f17; --panel: #131a26; --line: #243042; --text: #e7edf5;
    --muted: #8b9bb4; --accent: #5b8def; --green: #3fb96b; --red: #e5544b; --grey: #5a6678;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; }
  header h1 { font-size: 1.7rem; margin: 0 0 6px; letter-spacing: -0.02em; }
  header p { color: var(--muted); margin: 0 0 28px; }
  .promo-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .gh { font-size: .95rem; font-weight: 600; padding: 9px 16px; border: 1px solid var(--accent); border-radius: 9px; color: var(--accent); text-decoration: none; white-space: nowrap; }
  .gh:hover { background: var(--accent); color: #fff; }
  .promo { margin: 0 0 26px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); display: flex; align-items: center; gap: 18px; justify-content: space-between; flex-wrap: wrap; }
  .promo .txt { font-size: .98rem; color: var(--text); flex: 1; min-width: 220px; }
  .promo .txt strong { color: var(--accent); }
  .promo-cta { background: var(--accent); color: #fff; font-weight: 600; font-size: .95rem; padding: 11px 18px; border-radius: 10px; text-decoration: none; white-space: nowrap; }
  .promo-cta:hover { opacity: .9; }
  form { display: flex; gap: 10px; margin-bottom: 8px; }
  input[type=url] {
    flex: 1; padding: 13px 15px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--panel); color: var(--text); font-size: 1rem; min-width: 0;
  }
  input[type=url]:focus { outline: none; border-color: var(--accent); }
  button {
    padding: 13px 20px; border-radius: 10px; border: 0; background: var(--accent);
    color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; white-space: nowrap;
  }
  button:disabled { opacity: .55; cursor: default; }
  .hint { color: var(--muted); font-size: .85rem; margin: 0 0 30px; }
  #out { margin-top: 14px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 22px; }
  .scorerow { display: flex; align-items: center; gap: 22px; margin-bottom: 6px; }
  .ring {
    width: 96px; height: 96px; border-radius: 50%; flex: none; display: grid; place-items: center;
    background: conic-gradient(var(--ring-color) calc(var(--score) * 1%), var(--line) 0);
  }
  .ring > div {
    width: 76px; height: 76px; border-radius: 50%; background: var(--panel);
    display: grid; place-items: center; font-size: 1.5rem; font-weight: 700;
  }
  .scoremeta h2 { margin: 0 0 4px; font-size: 1.1rem; }
  .scoremeta a { color: var(--accent); text-decoration: none; word-break: break-all; }
  .scoremeta .sub { color: var(--muted); font-size: .9rem; }
  .warn {
    margin: 16px 0 0; padding: 11px 14px; border-radius: 10px; font-size: .9rem;
    background: rgba(229,84,75,.12); border: 1px solid rgba(229,84,75,.35); color: #f2b6b1;
  }
  .cols { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 22px; }
  @media (max-width: 620px) { .cols { grid-template-columns: 1fr; } form { flex-direction: column; } }
  .col h3 { font-size: .78rem; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 10px; color: var(--muted); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; vertical-align: 1px; }
  .d-red { background: var(--red); } .d-green { background: var(--green); } .d-grey { background: var(--grey); }
  .bot { display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: .92rem; }
  .bot:last-child { border-bottom: 0; }
  .bot small { color: var(--muted); margin-left: auto; padding-left: 8px; }
  .err { color: #f2b6b1; }
  footer { margin-top: 34px; color: var(--muted); font-size: .85rem; text-align: center; }
  footer a { color: var(--accent); text-decoration: none; }
  .spin { color: var(--muted); }
  .next { margin-top: 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); font-size: .9rem; color: var(--muted); }
  .next a { color: var(--accent); text-decoration: none; }
  .next strong { color: var(--text); }
  .next code { background: rgba(255,255,255,.06); padding: 1px 5px; border-radius: 5px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>🤖 AI Crawl Check</h1>
    <p>Which AI crawlers can read your site? Paste a URL — we read its <code>robots.txt</code> and score it against every known AI bot.</p>
  </header>

  <div class="promo">
    <div class="txt"><strong>Built by GeoSuite</strong> — the AI-visibility platform that measures &amp; improves how ChatGPT, Gemini, Claude &amp; Perplexity describe your brand.</div>
    <div class="promo-actions">
      <a class="promo-cta" href="https://trygeosuite.it" target="_blank" rel="noopener">Explore GeoSuite →</a>
      <a class="gh" href="https://github.com/TryGeoSuite/ai-crawler-bots" target="_blank" rel="noopener">★ Star on GitHub</a>
    </div>
  </div>

  <form id="f">
    <input id="u" type="url" inputmode="url" placeholder="https://example.com" autocomplete="off" autofocus>
    <button id="go" type="submit">Check</button>
  </form>
  <p class="hint">No login, no tracking. We fetch only <code>/robots.txt</code> — nothing else.</p>

  <div id="out"></div>

  <footer>
    Open source (MIT): <a href="https://github.com/TryGeoSuite/ai-crawler-bots">GitHub</a>
    · <a href="https://www.npmjs.com/package/@geosuite/ai-crawler-bots">npm</a>
    · <code>npx @geosuite/ai-crawler-bots robots &lt;url&gt;</code><br>
    Built by <a href="https://github.com/matte97p">Matteo Perino</a> · a <a href="https://trygeosuite.it">GeoSuite</a> open-source tool.
  </footer>
</div>

<script>
  var out = document.getElementById('out');
  var input = document.getElementById('u');
  var btn = document.getElementById('go');

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function ringColor(score){ return score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--accent)' : 'var(--red)'; }

  function botRow(b, dotClass){
    return '<div class="bot"><span class="dot ' + dotClass + '"></span>' + esc(b.name) +
      '<small>' + esc(b.owner) + ' · ' + esc(b.purpose) + '</small></div>';
  }

  function column(title, list, dotClass){
    var rows = list.length ? list.map(function(b){ return botRow(b, dotClass); }).join('')
      : '<div class="bot" style="color:var(--muted)">none</div>';
    return '<div class="col"><h3>' + title + ' (' + list.length + ')</h3>' + rows + '</div>';
  }

  function render(r){
    if (r.error && !r.score && r.score !== 0){
      out.innerHTML = '<div class="card err">Could not check that URL: ' + esc(r.error) + '</div>';
      return;
    }
    var warn = r.managedBlock ? '<div class="warn">⚠️ A managed section (<code>' +
      esc(r.managedBlock.section) + '</code>) overrides your file and blocks: ' +
      esc(r.managedBlock.blockedBotNames.join(', ')) + '.</div>' : '';
    out.innerHTML =
      '<div class="card">' +
        '<div class="scorerow">' +
          '<div class="ring" style="--score:' + r.score + ';--ring-color:' + ringColor(r.score) + '"><div>' + r.score + '</div></div>' +
          '<div class="scoremeta">' +
            '<h2>AI-visibility score</h2>' +
            '<div class="sub"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url) + '</a></div>' +
          '</div>' +
        '</div>' +
        warn +
        '<div class="cols">' +
          column('Blocked', r.blocked, 'd-red') +
          column('Allowed', r.allowed, 'd-green') +
          column('Not set', r.notSpecified, 'd-grey') +
        '</div>' +
      '</div>' +
      '<div class="next">⚙️ <strong>Automate it</strong> — drop the ' +
        '<a href="https://github.com/TryGeoSuite/ai-crawler-bots#use-in-ci-github-action" target="_blank" rel="noopener">GitHub Action</a> ' +
        'into your CI so a bad robots.txt change fails the build, or run ' +
        '<code>npx @geosuite/ai-crawler-bots robots &lt;url&gt;</code>. ' +
        'If it helped, <a href="https://github.com/TryGeoSuite/ai-crawler-bots" target="_blank" rel="noopener">★ star it on GitHub</a>.' +
      '</div>';
  }

  function run(url){
    if (!url) return;
    btn.disabled = true;
    out.innerHTML = '<div class="card spin">Reading ' + esc(url) + '/robots.txt …</div>';
    fetch('/api/check?url=' + encodeURIComponent(url))
      .then(function(res){ return res.json(); })
      .then(function(r){ render(r); })
      .catch(function(){ out.innerHTML = '<div class="card err">Network error — try again.</div>'; })
      .finally(function(){ btn.disabled = false; });
  }

  document.getElementById('f').addEventListener('submit', function(e){
    e.preventDefault();
    var url = input.value.trim();
    if (url){ history.replaceState(null, '', '?url=' + encodeURIComponent(url)); run(url); }
  });

  // Auto-run from a shared ?url= link.
  var shared = new URLSearchParams(location.search).get('url');
  if (shared){ input.value = shared; run(shared); }
</script>
</body>
</html>`;
