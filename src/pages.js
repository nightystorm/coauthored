// HTML templates. Plain template strings, no build step.
import { TOOLS, cardTools, headlineTool, splitText } from './tools.js';
import { statColumns } from './card.js';
import { BULK_LINES } from './counter.js';

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Number(n).toLocaleString('en-US');

const ADSENSE = process.env.ADSENSE_CLIENT;
const DEV = process.env.NODE_ENV !== 'production';
const REPO_URL = process.env.REPO_URL;

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
footer .links { display: flex; gap: 20px; }
table.tools { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: 16px; }
table.tools th { text-align: left; font: 400 13px var(--mono); color: var(--muted); padding: 0 12px 8px 0; border-bottom: 1px solid var(--line); }
table.tools td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--line); }
table.tools th:not(:first-child), table.tools td:not(:first-child) { text-align: right; font-family: var(--mono); font-size: 15px; }
table.tools td i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 10px; vertical-align: 0; }
dl.stats { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px 24px; }
dl.stats div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
dl.stats dt { font-size: 30px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
dl.stats dd { margin: 0; font: 400 14px var(--mono); color: var(--muted); }
dl.stats .rank { grid-column: 1 / -1; }
dl.stats .rank dt { color: var(--add); font-size: 40px; }
.supported { display: flex; flex-direction: column; gap: 12px; }
.supported ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.supported li { font: 400 14px var(--mono); border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; display: flex; align-items: center; gap: 8px; }
.supported li i { width: 9px; height: 9px; border-radius: 50%; }
.supported li i, table.tools td i { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent); }
.perm { border: 1px solid var(--line); background: var(--panel); border-radius: 14px; padding: 22px; display: flex; flex-direction: column; gap: 18px; }
.perm h3 { margin: 0; font-size: 15px; font-family: var(--mono); font-weight: 400; color: var(--muted); }
.perm ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
.perm li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; }
.perm li i { font-style: normal; font-family: var(--mono); width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; background: var(--bg); border: 1px solid var(--line); color: var(--add); }
.perm li i.no { color: var(--del); }
.perm li b { display: block; }
.perm li span { color: var(--muted); font-size: 15px; }
footer { display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; border-top: 1px solid var(--line); padding-top: 16px; font-size: 14px; color: var(--muted); }
.prose { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 640px) { .steps { grid-template-columns: 1fr; } .btn { width: 100%; justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .bar i { transition: none; } }
`;

const GH_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

export function layout({ title, description, image, url, baseUrl, body }) {
  const desc = description || 'Count the lines of code you shipped with Claude, Cursor, Codex and other AI tools this year, and share the card.';
  const img = image || `${baseUrl}/card/example.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Code Wrapped">
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
<header class="top"><a class="mark" href="/"><b>+</b>codewrapped</a><a href="/privacy">Privacy</a></header>
${body}
<footer><span>Not affiliated with Anthropic or GitHub.</span><span class="links">${REPO_URL ? `<a href="${esc(REPO_URL)}" target="_blank" rel="noopener">Read the code</a>` : ''}<a href="/privacy">How we handle your data</a></span></footer>
</div>
</body>
</html>`;
}

const ERRORS = {
  signin: 'GitHub sign-in did not finish. Try again, and approve access on the GitHub page.',
};

export function landingPage({ totals, year, error, detail }) {
  return `
${error ? `<div class="notice err">${esc(ERRORS[error] || 'Something went wrong. Try again.')}${detail ? `<br><span class="mono">GitHub said: ${esc(detail)}</span>` : ''}</div>` : ''}
<section class="hero">
  <h1>How much code did you ship with <em>AI</em> in ${year}?</h1>
  <p class="lede">Sign in with GitHub. We add up every commit an AI tool co-authored, split it by tool, and turn it into a card you can post.</p>
  <div class="actions">
    <a class="btn primary" href="/login">${GH_ICON} Count my public repos</a>
    <a class="btn" href="/private">Include private repos</a>
  </div>
  <p class="fine">Public repos need no access at all. For private repos you get read-only access you can limit to chosen repos, and we remove it the moment your card is ready.</p>
  ${totals.users > 0 ? `<p class="totals"><b>${fmt(totals.users)}</b> developers have counted <b>+${fmt(totals.lines)}</b> lines so far</p>` : ''}
</section>
<figure>
  <img class="card-img" src="/card/example.png" alt="Example card showing +118,240 lines of code shipped with AI, split between Claude, Cursor, OpenAI Codex and Kimi" width="1200" height="630">
  <figcaption>Example card</figcaption>
</figure>
${ad('ADSENSE_SLOT_HOME')}
<ol class="steps">
  <li><b>Sign in</b><span>One click with GitHub. Public repos need no repo access at all.</span></li>
  <li><b>We count</b><span>Commits you authored this year with an AI tool as co-author, merges left out.</span></li>
  <li><b>Share</b><span>Post your link on X, LinkedIn or WhatsApp. The card shows up as the preview.</span></li>
</ol>
<section class="supported">
  <h2>Tools we recognise</h2>
  <ul>${TOOLS.map((t) => `<li><i style="background:${esc(t.color)}"></i>${esc(t.name)}</li>`).join('')}</ul>
  <p class="fine">We count a tool when its name appears in a commit's <code>Co-authored-by</code> line. Agents like Claude Code, Cursor's agent and Aider add that line for you. Inline autocomplete leaves no trace in the commit, so it can't be counted.</p>
</section>`;
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
      if (j.status === 'done') { location.href = '/u/' + encodeURIComponent(j.login) + '?new=1' + (j.removed ? '&removed=1' : ''); return; }
      if (j.status === 'error' || j.status === 'missing') { log.textContent = 'The count failed' + (j.error ? ': ' + j.error : '.') + ' Go back and sign in again.'; return; }
      var p = j.progress || {};
      if (p.phase === 'search') { log.textContent = 'Found ' + (p.found || 0) + ' AI co-authored commits so far…'; bar.style.width = '30%'; }
      if (p.phase === 'cleanup') { log.textContent = 'Removing our access from your GitHub…'; bar.style.width = '100%'; }
      if (p.phase === 'stats') { log.textContent = 'Adding up lines: ' + p.done + ' of ' + p.total + ' commits'; bar.style.width = (30 + 70 * p.done / Math.max(p.total, 1)) + '%'; }
      setTimeout(tick, 1200);
    }).catch(function () { setTimeout(tick, 2500); });
  }
  tick();
})();
</script>`;
}

export function sharePage({ card, pageUrl, image, justCounted, removed }) {
  const tools = cardTools(card);
  const split = splitText(card);
  const aiShare = card.totalCommits ? Math.max(1, Math.round((card.commits / card.totalCommits) * 100)) : null;
  const text = `I shipped +${fmt(card.additions)} lines of code with ${headlineTool(card)} in ${card.year}${split ? ` (${split})` : ''}.${aiShare ? ` AI co-wrote ${aiShare}% of my commits.` : ''}${card.rank ? ` Top ${card.rank}% on Code Wrapped.` : ''} How much did you?`;
  const stats = statColumns(card);
  const enc = encodeURIComponent;
  const x = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(pageUrl)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(pageUrl)}`;
  const wa = `https://wa.me/?text=${enc(`${text} ${pageUrl}`)}`;
  const empty = card.commits === 0;
  return `
<section class="hero">
  ${justCounted ? `<p class="mono" style="color:var(--add)">Done. This is your card.${removed ? ' Code Wrapped has been removed from your GitHub account.' : ''}</p>` : ''}
  <h1>${empty ? `No AI co-authored commits found for @${esc(card.login)} yet` : `@${esc(card.login)} shipped <em>+${fmt(card.additions)}</em> lines with ${esc(headlineTool(card))}`}</h1>
  <p class="lede">${empty
    ? `We looked for commits in ${card.year} that you authored with an AI tool in a <code>Co-authored-by</code> line.${card.includesPrivate ? '' : ' Only public repos were counted.'}`
    : `${fmt(card.commits)} commits across ${fmt(card.repos)} ${card.repos === 1 ? 'repo' : 'repos'} in ${card.year}, ${fmt(card.deletions)} lines deleted along the way.${card.includesPrivate ? '' : ' Public repos only.'}`}</p>
</section>
<figure>
  <img class="card-img" src="${esc(image)}" alt="Card: +${fmt(card.additions)} lines of code shipped with ${esc(headlineTool(card))} in ${card.year} by @${esc(card.login)}" width="1200" height="630">
</figure>
${empty || !(stats.length || card.rank) ? '' : `<dl class="stats">
  ${card.rank ? `<div class="rank"><dt>Top ${card.rank}%</dt><dd>more lines than ${100 - card.rank}% of developers on Code Wrapped</dd></div>` : ''}
  ${stats.map(([v, l]) => `<div><dt>${esc(v)}</dt><dd>${esc(l)}</dd></div>`).join('')}
</dl>`}
${card.bulkCommits ? `<p class="fine">${fmt(card.bulkCommits)} very large ${card.bulkCommits === 1 ? 'commit' : 'commits'} (over ${fmt(BULK_LINES)} lines added, usually lock files or generated code) ${card.bulkCommits === 1 ? 'is' : 'are'} counted as ${card.bulkCommits === 1 ? 'a commit' : 'commits'} but ${card.bulkCommits === 1 ? 'its' : 'their'} lines are left out.</p>` : ''}
${empty ? '' : `<table class="tools">
  <thead><tr><th>Tool</th><th>Commits</th><th>Lines added</th><th>Share</th></tr></thead>
  <tbody>${tools.map((t) => `<tr><td><i style="background:${esc(t.color)}"></i>${esc(t.name)}</td><td>${fmt(t.commits)}</td><td>+${fmt(t.additions)}</td><td>${Math.max(1, Math.round(t.share * 100))}%</td></tr>`).join('')}</tbody>
</table>`}
<div class="share">
  <a class="btn primary" href="${esc(x)}" target="_blank" rel="noopener">Post on X</a>
  <a class="btn" href="${esc(li)}" target="_blank" rel="noopener">Share on LinkedIn</a>
  <a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">Send on WhatsApp</a>
  <button class="btn" id="copy" type="button">Copy link</button>
  <a class="btn" href="${esc(image)}" download="codewrapped-${esc(card.login)}-${card.year}.png">Download image</a>
  <button class="btn" id="native" type="button" hidden>Share…</button>
</div>
<p class="fine">On LinkedIn and WhatsApp the card appears as the link preview. Counted ${new Date(card.updatedAt).toUTCString().slice(5, 16)}. <a href="${card.includesPrivate ? '/private' : '/login'}">Count again</a></p>
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
    native.addEventListener('click', function () { navigator.share({ title: 'Code Wrapped', text: text, url: url }).catch(function () {}); });
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
  <p>When you sign in with GitHub, we use the access GitHub gives us to search for commits you authored this year whose <code>Co-authored-by</code> lines name an AI tool, and to read how many lines each one added and deleted.</p>
  <p>We keep only the totals shown on your card: your GitHub username, display name, avatar link, commit count, lines added and deleted, number of repos and lines per month. We never store your code, commit messages or private repo names.</p>
  <p>For public repos, signing in only tells us who you are. GitHub gives us no access to your repositories.</p>
  <p>For private repos, you install our GitHub App with read-only access to the repositories you choose. It cannot change anything. As soon as the count finishes we uninstall the app from your account and revoke the sign-in, so nothing stays connected. We never keep your access token.</p>
  <p>Your card page is public, so anyone with the link can see it. To have it removed${contact ? `, email <a href="mailto:${esc(contact)}">${esc(contact)}</a> and we will delete it` : ', contact us and we will delete it'}.</p>
  <p>This site shows ads served by Google. Google may use cookies to show ads based on your visits to this and other sites. You can manage this in <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ad Settings</a>.</p>
  <p>Code Wrapped is not affiliated with Anthropic or GitHub.</p>
</section>`;
}

export function privatePage({ repoUrl }) {
  return `
<section class="hero">
  <h1>Include private repos</h1>
  <p class="lede">GitHub will ask you to install Code Wrapped. Here is exactly what that screen means before you see it.</p>
</section>
<section class="perm">
  <h3>What GitHub will ask for</h3>
  <ul>
    <li><i>✓</i><div><b>Read-only access to code and metadata</b><span>GitHub has no narrower permission for reading commits. We only read each commit's message and its line count.</span></div></li>
    <li><i>✓</i><div><b>All repositories, or only the ones you pick</b><span>Choose "Only select repositories" if you want to count some and leave others out.</span></div></li>
    <li><i class="no">×</i><div><b>No write access</b><span>The app cannot push, edit, delete or open anything in your repos.</span></div></li>
  </ul>
  <h3>What happens after</h3>
  <ul>
    <li><i>−</i><div><b>We remove ourselves</b><span>The moment your card is ready, we uninstall the app from your account and drop the sign-in. You can check under GitHub Settings, Applications.</span></div></li>
    <li><i>−</i><div><b>Only totals are kept</b><span>Commit count, lines added and deleted, lines per month. No code, no commit messages, no private repo names.</span></div></li>
  </ul>
</section>
<div class="actions">
  <a class="btn primary" href="/login/private">${GH_ICON} Continue to GitHub</a>
  <a class="btn" href="/login">Public repos only</a>
  ${repoUrl ? `<a class="btn" href="${esc(repoUrl)}" target="_blank" rel="noopener">Read the code</a>` : ''}
</div>`;
}
