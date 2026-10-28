// HTML templates. Plain template strings, no build step.

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');

const ADSENSE = process.env.ADSENSE_CLIENT;
const DEV = process.env.NODE_ENV !== 'production';

// One ad unit. Shows a dashed placeholder locally and nothing in production
// until AdSense is configured.
export function ad(slotEnv) {
  const slot = process.env[slotEnv];
  if (ADSENSE && slot) {
    return `<div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ADSENSE)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
  }
  return DEV ? `<div class="ad ad-placeholder">Ad slot · ${esc(slotEnv)}</div>` : '';
}

const CSS = `
/* Layout: one narrow centred column, card image is the hero on every page. */
@font-face { font-family: Bricolage; src: url(/fonts/bricolage/bricolage-grotesque-latin-400-normal.woff2) format('woff2'); font-weight: 400; font-display: swap; }
@font-face { font-family: Bricolage; src: url(/fonts/bricolage/bricolage-grotesque-latin-700-normal.woff2) format('woff2'); font-weight: 700; font-display: swap; }
@font-face { font-family: Bricolage; src: url(/fonts/bricolage/bricolage-grotesque-latin-800-normal.woff2) format('woff2'); font-weight: 800; font-display: swap; }
@font-face { font-family: Mono; src: url(/fonts/mono/jetbrains-mono-latin-400-normal.woff2) format('woff2'); font-weight: 400; font-display: swap; }
:root {
  --bg: #141612; --panel: #1c1f1a; --line: #2b3029; --text: #ecebe4; --muted: #8f958a;
  --add: #5fd38d; --add-ink: #0f2a1a; --del: #f07167;
  --display: Bricolage, 'Segoe UI', system-ui, sans-serif;
  --mono: Mono, ui-monospace, 'Cascadia Mono', Consolas, monospace;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root { --bg: #f5f6f1; --panel: #ffffff; --line: #dde0d6; --text: #171a15; --muted: #62695c; --add: #17924a; --add-ink: #ffffff; --del: #c8443a; color-scheme: light; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.55 var(--display); }
a { color: inherit; }
.wrap { max-width: 860px; margin: 0 auto; padding-block: 20px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: flex; flex-direction: column; gap: 36px; }
header.top { display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-size: 15px; }
header.top a { text-decoration: none; }
.mark b { color: var(--add); font-weight: 400; }
h1 { font-size: clamp(36px, 7vw, 64px); line-height: 1.02; letter-spacing: -0.03em; font-weight: 800; margin: 0; text-wrap: balance; }
h1 em { font-style: normal; color: var(--add); }
h2 { font-size: 24px; margin: 0; text-wrap: balance; }
p { margin: 0; max-width: 62ch; }
.lede { font-size: 20px; color: var(--muted); }
code, .mono { font-family: var(--mono); font-size: 0.88em; }
.hero { display: flex; flex-direction: column; gap: 20px; padding-top: 24px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.btn { display: inline-flex; align-items: center; gap: 10px; padding: 14px 20px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font: 600 16px var(--display); text-decoration: none; cursor: pointer; }
.btn:hover { border-color: var(--muted); }
.btn.primary { background: var(--add); border-color: var(--add); color: var(--add-ink); }
.btn.primary:hover { filter: brightness(1.08); }
.btn:focus-visible { outline: 2px solid var(--add); outline-offset: 3px; }
.btn svg { width: 18px; height: 18px; fill: currentColor; flex: none; }
.fine { font-size: 14px; color: var(--muted); }
.card-img { width: 100%; max-width: 100%; aspect-ratio: 1200 / 630; height: auto; border-radius: 14px; border: 1px solid var(--line); display: block; background: var(--panel); }
figure { margin: 0; display: flex; flex-direction: column; gap: 8px; }
figcaption { font-family: var(--mono); font-size: 13px; color: var(--muted); }
.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 0; margin: 0; list-style: none; counter-reset: s; }
.steps li { border-top: 1px solid var(--line); padding-top: 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.steps li::before { counter-increment: s; content: counter(s, decimal-leading-zero); font-family: var(--mono); font-size: 13px; color: var(--add); }
.steps b { font-size: 18px; }
.steps span { color: var(--muted); font-size: 15px; }
.totals { font-family: var(--mono); font-size: 15px; color: var(--muted); }
.totals b { color: var(--add); font-weight: 400; }
.share { display: flex; flex-wrap: wrap; gap: 10px; }
.notice { border: 1px solid var(--line); background: var(--panel); border-radius: 10px; padding: 14px 16px; font-size: 15px; }
.notice.err { border-color: var(--del); }
.progress { display: flex; flex-direction: column; gap: 14px; padding-top: 40px; }
.bar { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; }
.bar i { display: block; height: 100%; width: 8%; background: var(--add); transition: width .4s; }
.log { font-family: var(--mono); font-size: 15px; color: var(--muted); }
.ad { min-height: 90px; display: flex; justify-content: center; }
.ad-placeholder { align-items: center; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); font-family: var(--mono); font-size: 13px; }
footer { display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 16px; font-size: 14px; color: var(--muted); }
.prose { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 640px) { .steps { grid-template-columns: 1fr; } .btn { width: 100%; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .bar i { transition: none; } }
`;

const GH_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

export function layout({ title, description, image, url, baseUrl, body }) {
  const desc = description || 'Count the lines of code you shipped with Claude this year and share the card.';
  const img = image || `${baseUrl}/card/example.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Coauthored">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
${url ? `<meta property="og:url" content="${esc(url)}"><link rel="canonical" href="${esc(url)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23141612'/%3E%3Cpath d='M9 16h14M16 9v14' stroke='%235fd38d' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="preload" href="/fonts/bricolage/bricolage-grotesque-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
${ADSENSE ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ADSENSE)}" crossorigin="anonymous"></script>` : ''}
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top"><a class="mark" href="/"><b>+</b>coauthored</a><a href="/privacy">Privacy</a></header>
${body}
<footer><span>Not affiliated with Anthropic or GitHub.</span><a href="/privacy">How we handle your data</a></footer>
</div>
</body>
</html>`;
}

const ERRORS = {
  signin: 'GitHub sign-in did not finish. Try again, and approve access on the GitHub page.',
};

export function landingPage({ totals, year, error }) {
  return `
${error ? `<div class="notice err">${esc(ERRORS[error] || 'Something went wrong. Try again.')}</div>` : ''}
<section class="hero">
  <h1>How much code did you ship with <em>Claude</em> in ${year}?</h1>
  <p class="lede">Sign in with GitHub. We add up every commit that carries a <code>Co-Authored-By: Claude</code> line and turn it into a card you can post.</p>
  <div class="actions">
    <a class="btn primary" href="/login">${GH_ICON} Count my public repos</a>
    <a class="btn" href="/login?private=1">Include private repos</a>
  </div>
  <p class="fine">Private repo names never appear on your card. We drop GitHub access as soon as the count is done.</p>
  ${totals.users > 0 ? `<p class="totals"><b>${fmt(totals.users)}</b> developers have counted <b>+${fmt(totals.lines)}</b> lines so far</p>` : ''}
</section>
<figure>
  <img class="card-img" src="/card/example.png" alt="Example card showing +87,380 lines of code shipped with Claude, 299 commits across 3 repos" width="1200" height="630">
  <figcaption>Example card</figcaption>
</figure>
${ad('ADSENSE_SLOT_HOME')}
<ol class="steps">
  <li><b>Sign in</b><span>One click with GitHub. Public repos need no extra permission.</span></li>
  <li><b>We count</b><span>Commits you authored this year with Claude as co-author, merges left out.</span></li>
  <li><b>Share</b><span>Post your link on X, LinkedIn or WhatsApp. The card shows up as the preview.</span></li>
</ol>`;
}

export function countingPage({ id, login }) {
  return `
<section class="progress" aria-live="polite">
  <h2>Counting commits for @${esc(login)}</h2>
  <div class="bar"><i id="bar"></i></div>
  <p class="log" id="log">Searching your ${new Date().getUTCFullYear()} commits…</p>
  <p class="fine">Most accounts take under 30 seconds. Very active ones can take a couple of minutes because GitHub limits searches to 30 a minute.</p>
</section>
<script>
(function () {
  var bar = document.getElementById('bar'), log = document.getElementById('log');
  function tick() {
    fetch('/api/jobs/${esc(id)}').then(function (r) { return r.json(); }).then(function (j) {
      if (j.status === 'done') { location.href = '/u/' + encodeURIComponent(j.login) + '?new=1'; return; }
      if (j.status === 'error' || j.status === 'missing') { log.textContent = 'The count failed. Go back and sign in again.'; return; }
      var p = j.progress || {};
      if (p.phase === 'search') { log.textContent = 'Found ' + (p.found || 0) + ' Claude co-authored commits so far…'; bar.style.width = '30%'; }
      if (p.phase === 'stats') { log.textContent = 'Adding up lines: ' + p.done + ' of ' + p.total + ' commits'; bar.style.width = (30 + 70 * p.done / Math.max(p.total, 1)) + '%'; }
      setTimeout(tick, 1200);
    }).catch(function () { setTimeout(tick, 2500); });
  }
  tick();
})();
</script>`;
}

export function sharePage({ card, pageUrl, image, justCounted }) {
  const text = `I shipped +${fmt(card.additions)} lines of code with Claude in ${card.year}. How much did you?`;
  const enc = encodeURIComponent;
  const x = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(pageUrl)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(pageUrl)}`;
  const wa = `https://wa.me/?text=${enc(`${text} ${pageUrl}`)}`;
  const empty = card.commits === 0;
  return `
<section class="hero">
  ${justCounted ? '<p class="mono" style="color:var(--add)">Done. This is your card.</p>' : ''}
  <h1>${empty ? `No Claude commits found for @${esc(card.login)} yet` : `@${esc(card.login)} shipped <em>+${fmt(card.additions)}</em> lines with Claude`}</h1>
  <p class="lede">${empty
    ? `We looked for commits in ${card.year} that you authored with a <code>Co-Authored-By: Claude</code> line.${card.includesPrivate ? '' : ' Only public repos were counted.'}`
    : `${fmt(card.commits)} commits across ${fmt(card.repos)} ${card.repos === 1 ? 'repo' : 'repos'} in ${card.year}, ${fmt(card.deletions)} lines deleted along the way.${card.includesPrivate ? '' : ' Public repos only.'}`}</p>
</section>
<figure>
  <img class="card-img" src="${esc(image)}" alt="Card: +${fmt(card.additions)} lines of code shipped with Claude in ${card.year} by @${esc(card.login)}" width="1200" height="630">
</figure>
<div class="share">
  <a class="btn primary" href="${esc(x)}" target="_blank" rel="noopener">Post on X</a>
  <a class="btn" href="${esc(li)}" target="_blank" rel="noopener">Share on LinkedIn</a>
  <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Send on WhatsApp</a>
  <button class="btn" id="copy" type="button">Copy link</button>
  <a class="btn" href="${esc(image)}" download="coauthored-${esc(card.login)}-${card.year}.png">Download image</a>
  <button class="btn" id="native" type="button" hidden>Share…</button>
</div>
<p class="fine">On LinkedIn and WhatsApp the card appears as the link preview. Counted ${new Date(card.updatedAt).toUTCString().slice(5, 16)}. <a href="/login${card.includesPrivate ? '?private=1' : ''}">Count again</a></p>
${ad('ADSENSE_SLOT_SHARE')}
<section class="hero">
  <h2>Count yours</h2>
  <div class="actions"><a class="btn primary" href="/login">${GH_ICON} Count my commits</a></div>
</section>
<script>
(function () {
  var url = ${JSON.stringify(pageUrl)}, text = ${JSON.stringify(text)};
  var copy = document.getElementById('copy');
  copy.addEventListener('click', function () {
    navigator.clipboard.writeText(url).then(function () { copy.textContent = 'Link copied'; }, function () { prompt('Copy this link', url); });
  });
  var native = document.getElementById('native');
  if (navigator.share) {
    native.hidden = false;
    native.addEventListener('click', function () { navigator.share({ title: 'Coauthored', text: text, url: url }).catch(function () {}); });
  }
})();
</script>`;
}

export function missingPage(login) {
  return `
<section class="hero">
  <h1>@${esc(login)} hasn't counted yet</h1>
  <p class="lede">Cards appear here once someone signs in and counts their commits.</p>
  <div class="actions"><a class="btn primary" href="/login">${GH_ICON} Count my commits</a></div>
</section>`;
}

export function privacyPage(contact) {
  return `
<section class="prose">
  <h1>Privacy</h1>
  <p>When you sign in with GitHub, we use the access GitHub gives us to search for commits you authored this year that include a <code>Co-Authored-By: Claude</code> line, and to read how many lines each one added and deleted.</p>
  <p>We keep only the totals shown on your card: your GitHub username, display name, avatar link, commit count, lines added and deleted, number of repos and lines per month. We never store your code, commit messages or private repo names.</p>
  <p>We do not keep your GitHub access token. As soon as the count finishes we ask GitHub to revoke it, so the app no longer appears under your authorized apps.</p>
  <p>Your card page is public, so anyone with the link can see it. To have it removed${contact ? `, email <a href="mailto:${esc(contact)}">${esc(contact)}</a> and we will delete it` : ', contact us and we will delete it'}.</p>
  <p>This site shows ads served by Google. Google may use cookies to show ads based on your visits to this and other sites. You can manage this in <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ad Settings</a>.</p>
  <p>Coauthored is not affiliated with Anthropic or GitHub.</p>
</section>`;
}
