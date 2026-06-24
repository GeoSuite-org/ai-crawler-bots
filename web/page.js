// The single-page UI served at `/`. Bilingual (en/it): the worker picks a locale
// and calls renderPage(lang); all copy lives in the S dictionary below. Tool and
// product names (AI Crawl Check, GPTBot, GeoSuite…) stay as-is — only prose is
// translated. The page has interactive client-side JS that builds result HTML,
// so its visitor-facing strings are injected per language as a JS I18N dictionary
// (var I18N) consumed by the inline <script>. All CSS/JS is inline — no external
// assets, CSP-friendly.

const BASE = 'https://ai-crawl-check.geosuite.workers.dev';

const S = {
  en: {
    title: 'AI Crawl Check — which AI bots can read your site?',
    desc: 'Paste a URL and see which AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) your robots.txt allows or blocks, with an AI-visibility score.',
    ogTitle: 'AI Crawl Check',
    ogDesc: 'Which AI crawlers can read your site? Paste a URL — we read its robots.txt and score it against every known AI bot.',
    h1Tag: 'AI Crawl Check',
    lead: `Which AI crawlers can read your site? Paste a URL — we read its <code>robots.txt</code> and score it against every known AI bot.`,
    promoTxt: `<strong>Built by GeoSuite</strong> — the AI-visibility platform that measures &amp; improves how ChatGPT, Gemini, Claude &amp; Perplexity describe your brand.`,
    promoCta: 'Explore GeoSuite →',
    star: '★ Star on GitHub',
    placeholder: 'https://example.com',
    check: 'Check',
    hint: `No login, no tracking. We fetch only <code>/robots.txt</code> — nothing else.`,
    footer: `Open source (MIT): <a href="https://github.com/TryGeoSuite/ai-crawler-bots">GitHub</a>
    · <a href="https://www.npmjs.com/package/@geosuite/ai-crawler-bots">npm</a>
    · <code>npx @geosuite/ai-crawler-bots robots &lt;url&gt;</code><br>
    Built by <a href="https://github.com/matte97p">Matteo Perino</a> · a <a href="https://trygeosuite.it">GeoSuite</a> open-source tool.`,
    copy: 'copy',
    copied: 'copied',
    // Strings consumed by the inline client-side script (result rendering).
    js: {
      checkFailed: 'Could not check that URL: ',
      reading: 'Reading ',
      robotsSuffix: '/robots.txt …',
      networkError: 'Network error — try again.',
      scoreHeading: 'AI-visibility score',
      managedPre: '⚠️ A managed section (<code>',
      managedMid: '</code>) overrides your file and blocks: ',
      managedPost: '.',
      colBlocked: 'Blocked',
      colAllowed: 'Allowed',
      colNotSet: 'Not set',
      none: 'none',
      automatePre: '⚙️ <strong>Automate it</strong> — drop the ',
      automateActionLink: 'GitHub Action',
      automateMid: ' into your CI so a bad robots.txt change fails the build, or run ',
      automateCmd: 'npx @geosuite/ai-crawler-bots robots &lt;url&gt;',
      automateHelpedPre: '. If it helped, ',
      automateStarLink: '★ star it on GitHub',
      automateHelpedPost: '.',
    },
  },
  it: {
    title: 'AI Crawl Check — quali bot AI possono leggere il tuo sito?',
    desc: 'Incolla un URL e scopri quali crawler AI (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) il tuo robots.txt permette o blocca, con un punteggio di visibilità AI.',
    ogTitle: 'AI Crawl Check',
    ogDesc: 'Quali crawler AI possono leggere il tuo sito? Incolla un URL — leggiamo il suo robots.txt e lo valutiamo contro ogni bot AI noto.',
    h1Tag: 'AI Crawl Check',
    lead: `Quali crawler AI possono leggere il tuo sito? Incolla un URL — leggiamo il suo <code>robots.txt</code> e lo valutiamo contro ogni bot AI noto.`,
    promoTxt: `<strong>Creato da GeoSuite</strong> — la piattaforma di visibilità AI che misura e migliora come ChatGPT, Gemini, Claude e Perplexity descrivono il tuo brand.`,
    promoCta: 'Scopri GeoSuite →',
    star: '★ Metti una stella su GitHub',
    placeholder: 'https://esempio.com',
    check: 'Controlla',
    hint: `Niente login, niente tracciamento. Leggiamo solo <code>/robots.txt</code> — nient'altro.`,
    footer: `Open source (MIT): <a href="https://github.com/TryGeoSuite/ai-crawler-bots">GitHub</a>
    · <a href="https://www.npmjs.com/package/@geosuite/ai-crawler-bots">npm</a>
    · <code>npx @geosuite/ai-crawler-bots robots &lt;url&gt;</code><br>
    Creato da <a href="https://github.com/matte97p">Matteo Perino</a> · uno strumento open-source di <a href="https://trygeosuite.it">GeoSuite</a>.`,
    copy: 'copia',
    copied: 'copiato',
    js: {
      checkFailed: 'Impossibile controllare questo URL: ',
      reading: 'Lettura di ',
      robotsSuffix: '/robots.txt …',
      networkError: 'Errore di rete — riprova.',
      scoreHeading: 'Punteggio di visibilità AI',
      managedPre: '⚠️ Una sezione gestita (<code>',
      managedMid: '</code>) sovrascrive il tuo file e blocca: ',
      managedPost: '.',
      colBlocked: 'Bloccati',
      colAllowed: 'Permessi',
      colNotSet: 'Non impostati',
      none: 'nessuno',
      automatePre: '⚙️ <strong>Automatizzalo</strong> — inserisci la ',
      automateActionLink: 'GitHub Action',
      automateMid: ' nella tua CI così una modifica sbagliata al robots.txt fa fallire la build, oppure esegui ',
      automateCmd: 'npx @geosuite/ai-crawler-bots robots &lt;url&gt;',
      automateHelpedPre: '. Se ti è stato utile, ',
      automateStarLink: '★ metti una stella su GitHub',
      automateHelpedPost: '.',
    },
  },
};

// lang: 'en' | 'it'.
export function renderPage(lang) {
  const t = S[lang] || S.en;
  const ogLocale = lang === 'it' ? 'it_IT' : 'en_US';

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<meta name="description" content="${t.desc}">
<link rel="canonical" href="${BASE}/${lang}">
<link rel="alternate" hreflang="en" href="${BASE}/en">
<link rel="alternate" hreflang="it" href="${BASE}/it">
<link rel="alternate" hreflang="x-default" href="${BASE}/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GeoSuite Open">
<meta property="og:title" content="${t.ogTitle}">
<meta property="og:description" content="${t.ogDesc}">
<meta property="og:url" content="${BASE}/${lang}">
<meta property="og:image" content="${BASE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t.ogTitle}">
<meta name="twitter:description" content="${t.ogDesc}">
<meta name="twitter:image" content="${BASE}/og.png">
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
  .wrap { position: relative; max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; }
  .lang { position: absolute; top: 18px; right: 20px; display: flex; gap: 6px; font-size: .8rem; }
  .lang a { color: var(--muted); text-decoration: none; padding: 4px 9px; border-radius: 7px; border: 1px solid transparent; }
  .lang a.on { color: var(--text); border-color: var(--line); background: var(--panel); }
  .lang a:hover { color: var(--text); }
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
  <nav class="lang" aria-label="Language">
    <a href="/en"${lang === 'en' ? ' class="on"' : ''}>EN</a>
    <a href="/it"${lang === 'it' ? ' class="on"' : ''}>IT</a>
  </nav>
  <header>
    <h1>🤖 ${t.h1Tag}</h1>
    <p>${t.lead}</p>
  </header>

  <div class="promo">
    <div class="txt">${t.promoTxt}</div>
    <div class="promo-actions">
      <a class="promo-cta" href="https://trygeosuite.it" target="_blank" rel="noopener">${t.promoCta}</a>
      <a class="gh" href="https://github.com/TryGeoSuite/ai-crawler-bots" target="_blank" rel="noopener">${t.star}</a>
    </div>
  </div>

  <form id="f">
    <input id="u" type="url" inputmode="url" placeholder="${t.placeholder}" autocomplete="off" autofocus>
    <button id="go" type="submit">${t.check}</button>
  </form>
  <p class="hint">${t.hint}</p>

  <div id="out"></div>

  <footer>
    ${t.footer}
  </footer>
</div>

<script>var I18N = ${JSON.stringify(t.js)};</script>
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
      : '<div class="bot" style="color:var(--muted)">' + I18N.none + '</div>';
    return '<div class="col"><h3>' + title + ' (' + list.length + ')</h3>' + rows + '</div>';
  }

  function render(r){
    if (r.error && !r.score && r.score !== 0){
      out.innerHTML = '<div class="card err">' + I18N.checkFailed + esc(r.error) + '</div>';
      return;
    }
    var warn = r.managedBlock ? '<div class="warn">' + I18N.managedPre +
      esc(r.managedBlock.section) + I18N.managedMid +
      esc(r.managedBlock.blockedBotNames.join(', ')) + I18N.managedPost + '</div>' : '';
    out.innerHTML =
      '<div class="card">' +
        '<div class="scorerow">' +
          '<div class="ring" style="--score:' + r.score + ';--ring-color:' + ringColor(r.score) + '"><div>' + r.score + '</div></div>' +
          '<div class="scoremeta">' +
            '<h2>' + I18N.scoreHeading + '</h2>' +
            '<div class="sub"><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.url) + '</a></div>' +
          '</div>' +
        '</div>' +
        warn +
        '<div class="cols">' +
          column(I18N.colBlocked, r.blocked, 'd-red') +
          column(I18N.colAllowed, r.allowed, 'd-green') +
          column(I18N.colNotSet, r.notSpecified, 'd-grey') +
        '</div>' +
      '</div>' +
      '<div class="next">' + I18N.automatePre +
        '<a href="https://github.com/TryGeoSuite/ai-crawler-bots#use-in-ci-github-action" target="_blank" rel="noopener">' + I18N.automateActionLink + '</a>' +
        I18N.automateMid +
        '<code>' + I18N.automateCmd + '</code>' +
        I18N.automateHelpedPre +
        '<a href="https://github.com/TryGeoSuite/ai-crawler-bots" target="_blank" rel="noopener">' + I18N.automateStarLink + '</a>' +
        I18N.automateHelpedPost +
      '</div>';
  }

  function run(url){
    if (!url) return;
    btn.disabled = true;
    out.innerHTML = '<div class="card spin">' + I18N.reading + esc(url) + I18N.robotsSuffix + '</div>';
    fetch('/api/check?url=' + encodeURIComponent(url))
      .then(function(res){ return res.json(); })
      .then(function(r){ render(r); })
      .catch(function(){ out.innerHTML = '<div class="card err">' + I18N.networkError + '</div>'; })
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
}
