import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import { countGitHub, getUser } from './counter.js';
import { aggregate } from './aggregate.js';
import { cleanRows } from './paste.js';
import { GITLAB, countGitLab, getGitLabUser, revokeGitLab } from './gitlab.js';
import { TOOLS } from './tools.js';
import { renderCard } from './card.js';
import { store, topPercent } from './store.js';
import { rateLimit } from './ratelimit.js';
import { headlineTool, splitText } from './tools.js';
import { layout, landingPage, countingPage, sharePage, missingPage, privacyPage, privatePage, pastePage, deletePage } from './pages.js';

const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const HOST = new URL(BASE_URL).host;
// Settings pasted into a dashboard often pick up spaces, line breaks or quotes.
const setting = (name) => (process.env[name] || '').trim().replace(/^["']|["']$/g, '').trim();
const CLIENT_ID = setting('GITHUB_CLIENT_ID');
const CLIENT_SECRET = setting('GITHUB_CLIENT_SECRET');
const thisYear = () => new Date().getUTCFullYear();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Per visitor: 300 requests a minute overall, 20 a minute for sign-in.
// Link-preview crawlers are exempt (see ratelimit.js).
app.use(rateLimit({ limit: 300, name: 'all' }));
app.use(['/login', '/auth'], rateLimit({ limit: 20, name: 'sign-in' }));

// Fonts for the web pages, straight from the npm packages. Font files never
// change under the same name, so browsers may keep them for a year.
const fontOpts = { maxAge: '365d', immutable: true };
app.use('/fonts/bricolage', express.static(path.dirname(require.resolve('@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff2')), fontOpts));
app.use('/fonts/mono', express.static(path.dirname(require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2')), fontOpts));

const cookie = (req, name) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

// ---------- pages ----------
app.get('/', async (req, res) => {
  const totals = await store.stats().catch(() => ({ users: 0, lines: 0 }));
  res.send(layout({ title: 'Code Wrapped', baseUrl: BASE_URL, body: landingPage({ totals, year: thisYear(), error: req.query.error, detail: req.query.detail, deleted: req.query.deleted === '1' }) }));
});

// The two files the "Add a repo" page runs in the browser to read a git log.
const srcDir = path.dirname(fileURLToPath(import.meta.url));
for (const file of ['tools.js', 'paste.js']) {
  app.get(`/js/${file}`, (req, res) => res.type('application/javascript').set('Cache-Control', 'no-cache').sendFile(path.join(srcDir, file)));
}

app.get('/privacy', (req, res) => {
  res.send(layout({ title: 'Privacy · Code Wrapped', baseUrl: BASE_URL, body: privacyPage(process.env.CONTACT_EMAIL) }));
});

app.get('/u/:login', async (req, res) => {
  const year = Number(req.query.year) || thisYear();
  const saved = await store.get(req.params.login, year);
  if (!saved) {
    return res.status(404).send(layout({ title: 'Code Wrapped', baseUrl: BASE_URL, body: missingPage(req.params.login) }));
  }
  const card = { ...saved, rank: await topPercent(saved).catch(() => null) };
  // WhatsApp, LinkedIn and X cache a link's preview for days. A version tag
  // that changes on every recount makes the shared link fetch a fresh one.
  const params = new URLSearchParams();
  if (year !== thisYear()) params.set('year', year);
  params.set('v', Date.parse(card.updatedAt).toString(36));
  const pageUrl = `${BASE_URL}/u/${card.login}?${params}`;
  // Rank in the image URL so previews refresh when the rank changes.
  const image = `${BASE_URL}/card/${card.login}/${year}.png?v=${Date.parse(card.updatedAt)}-${card.rank || 0}`;
  const split = splitText(card);
  const share = card.totalCommits ? ` AI co-wrote ${Math.max(1, Math.round((card.commits / card.totalCommits) * 100))}% of commits.` : '';
  const desc = `${card.commits.toLocaleString('en-US')} commits co-authored with ${headlineTool(card)} in ${year}${split ? `: ${split}` : ''}.${share}${card.rank ? ` Top ${card.rank}% on Code Wrapped.` : ''}`;
  res.send(
    layout({
      title: `@${card.handle || card.login} shipped +${card.additions.toLocaleString('en-US')} lines with ${headlineTool(card)}`,
      description: desc,
      image,
      url: pageUrl,
      baseUrl: BASE_URL,
      body: sharePage({
        card, pageUrl, image,
        justCounted: req.query.new === '1',
        removed: req.query.removed === '1',
        added: req.query.added === '1',
        owner: Boolean(await ownedCard(req, year, card.login)),
      }),
    }),
  );
});

// ---------- card images ----------
const EXAMPLE = {
  login: 'octocat', name: 'Your name here', avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
  year: thisYear(), commits: 412, additions: 118240, deletions: 16012, repos: 5,
  tools: [
    { id: 'claude', name: 'Claude', commits: 299, additions: 87380 },
    { id: 'cursor', name: 'Cursor', commits: 70, additions: 19800 },
    { id: 'codex', name: 'OpenAI Codex', commits: 30, additions: 8200 },
    { id: 'kimi', name: 'Kimi', commits: 13, additions: 2860 },
  ],
  months: [1900, 3400, 2600, 5600, 7800, 6400, 9100, 12300, 10200, 28080, 0, 0],
  totalCommits: 640, activeDays: 143, longestStreak: 21, busiestDay: { date: `${thisYear()}-03-14`, additions: 6200 },
  rank: 6,
};
let examplePng;
app.get('/card/example.png', async (req, res, next) => {
  try {
    examplePng ||= await renderCard(EXAMPLE, HOST);
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(examplePng);
  } catch (e) { next(e); }
});

// Card images: memory first, then the database, and only drawn when neither
// has this version. Many requests for the same new card share one drawing.
const pngCache = new Map();
const drawing = new Map();
async function cardPng(saved) {
  const card = { ...saved, rank: await topPercent(saved).catch(() => null) };
  const key = `${card.login.toLowerCase()}:${card.year}:${card.updatedAt}:${card.rank || 0}`;
  const cached = pngCache.get(key);
  if (cached) return cached;
  if (!drawing.has(key)) {
    drawing.set(key, (async () => {
      let png = await store.getImage(key);
      if (!png) {
        png = await renderCard(card, HOST);
        await store.putImage(key, card.login, card.year, png);
      }
      if (pngCache.size > 300) pngCache.delete(pngCache.keys().next().value);
      pngCache.set(key, png);
      return png;
    })().finally(() => drawing.delete(key)));
  }
  return drawing.get(key);
}

app.get('/card/:login/:year.png', async (req, res, next) => {
  try {
    const saved = await store.get(req.params.login, Number(req.params.year));
    if (!saved) return res.sendStatus(404);
    const png = await cardPng(saved);
    // Page links carry ?v=<version>, so that exact URL never changes content.
    res.type('png').set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=3600').send(png);
  } catch (e) { next(e); }
});

// ---------- GitHub sign-in ----------
// One GitHub App does both flows:
// - Public: plain sign-in. GitHub only confirms who the user is; no repo access.
// - Private: the user installs the app with read-only Contents access on the
//   repos they pick. After counting we delete the installation and the sign-in.
const APP_ID = setting('GITHUB_APP_ID');
const APP_SLUG = setting('GITHUB_APP_SLUG');
const PRIVATE_KEY = setting('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n');
const secure = BASE_URL.startsWith('https') ? '; Secure' : '';

// The state carries the user's choice (".p" = include private repos), so it
// survives even when the phone finishes sign-in without our cookie.
function startAuth(res, wantsPrivate = false) {
  const state = crypto.randomBytes(16).toString('hex') + (wantsPrivate ? '.p' : '');
  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secure}`);
  return state;
}

function signInUrl(state) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: `${BASE_URL}/auth/callback`, state, allow_signup: 'true' });
  return `https://github.com/login/oauth/authorize?${params}`;
}

// Every "Count" button starts on the explanation page, where private repos
// are the default and public-only is offered as a link.
app.get('/login', (req, res) => res.redirect('/private'));

app.get('/login/public', (req, res) => {
  if (!CLIENT_ID) return res.status(500).send('GITHUB_CLIENT_ID is not set.');
  res.redirect(signInUrl(startAuth(res)));
});

// Explains exactly what GitHub will ask before sending the user there.
app.get('/private', (req, res) => {
  res.send(layout({ title: 'Count your commits · Code Wrapped', baseUrl: BASE_URL, body: privatePage({ repoUrl: process.env.REPO_URL }) }));
});

// Private flow signs in first. The callback then reuses an existing install
// of the app, or sends the user to install it if there is none.
app.get('/login/private', (req, res) => {
  if (!CLIENT_ID || !APP_SLUG) return res.status(500).send('GitHub App settings are missing.');
  res.redirect(signInUrl(startAuth(res, true)));
});

async function findInstallation(token, login) {
  try {
    const r = await fetch('https://api.github.com/user/installations', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'codewrapped-app' },
    });
    if (!r.ok) return null;
    const { installations = [] } = await r.json();
    const mine = installations.find((i) => i.account?.login?.toLowerCase() === login.toLowerCase()) || installations[0];
    return mine?.id || null;
  } catch {
    return null;
  }
}

const jobs = new Map();

// AI-looking co-author tags we don't recognise yet, with how many people's
// counts included them. Shown on /healthz/github to grow the tool list.
const unknownTagCounts = new Map();

// Last few failures, shown on /healthz/github. No usernames or tokens: only
// the kind of failure, GitHub's message and which flow it was.
const failures = [];
function noteFailure(what, detail, ctx = {}) {
  failures.unshift({ at: new Date().toISOString().slice(0, 19).replace('T', ' '), what, detail: String(detail || '').replace(/gh[opsu]_[A-Za-z0-9]+/g, '[token]').slice(0, 200), ctx });
  failures.length = Math.min(failures.length, 15);
}

app.get('/auth/callback', async (req, res) => {
  const state = cookie(req, 'oauth_state');
  let installationId = req.query.installation_id ? Number(req.query.installation_id) : null;
  const fail = (why, detail = '') => {
    console.error('sign-in failed', why, detail);
    noteFailure(`sign-in: ${why}`, detail, { private: String(req.query.state || '').endsWith('.p'), install: Boolean(req.query.installation_id), setup: req.query.setup_action || '' });
    res.redirect(`/?error=signin&why=${encodeURIComponent(why)}${detail ? `&detail=${encodeURIComponent(detail.slice(0, 160))}` : ''}`);
  };
  if (req.query.error) return fail('denied', req.query.error_description || req.query.error);
  if (!req.query.code) return fail('nocode');
  // Phones often finish GitHub sign-in in another browser or the GitHub app,
  // where our cookie is missing. Only a cookie that disagrees is rejected.
  if (state && req.query.state && req.query.state !== state) return fail('state');
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: req.query.code, redirect_uri: `${BASE_URL}/auth/callback` }),
    });
    const tokenJson = await tokenRes.json();
    const token = tokenJson.access_token;
    if (!token) return fail('token', tokenJson.error_description || tokenJson.error || `HTTP ${tokenRes.status}`);

    const user = await getUser(token);

    // If the app is installed on this account, the sign-in can already read
    // those private repos, so count them and remove the install afterwards.
    if (!installationId) installationId = await findInstallation(token, user.login);
    const wantsPrivate = String(req.query.state || '').endsWith('.p');
    if (wantsPrivate && !installationId) {
      await revokeSignIn(token);
      const next = startAuth(res, true);
      return res.redirect(`https://github.com/apps/${APP_SLUG}/installations/new?state=${next}`);
    }

    const id = crypto.randomBytes(12).toString('hex');
    // Signing in proves this is the card's owner, so this browser gets an
    // edit key to add more sources to the card later.
    const editKey = crypto.randomBytes(24).toString('base64url');
    const job = { status: 'running', login: user.login, progress: { phase: 'search', found: 0 }, startedAt: Date.now(), editKeyHash: hashKey(editKey) };
    jobs.set(id, job);
    runJob(job, token, user, installationId);
    res.setHeader('Set-Cookie', ['oauth_state=; Path=/; Max-Age=0', editCookie(req, user.login, editKey)]);
    res.redirect(`/counting/${id}`);
  } catch (e) {
    fail('exception', e.message);
  }
});

async function runJob(job, token, user, installationId) {
  try {
    const year = thisYear();
    const { source, unknownTags } = await countGitHub({ token, login: user.login, year, onProgress: (p) => (job.progress = p) });
    for (const tag of unknownTags) unknownTagCounts.set(tag, (unknownTagCounts.get(tag) || 0) + 1);
    source.includesPrivate = Boolean(installationId);
    source.updatedAt = new Date().toISOString();
    // A public-only recount can't see private repos, so keep the private
    // commits from the last private count instead of wiping them.
    if (!installationId) {
      const old = (await store.getSources(user.login, year)).find((s) => s.key === 'github');
      const kept = old?.includesPrivate ? (old.commits || []).filter((c) => c.private) : [];
      if (kept.length) {
        const seen = new Set(source.commits.map((c) => c.sha));
        source.commits.push(...kept.filter((c) => !seen.has(c.sha)));
        source.totalCommits = Math.max(old.totalCommits || 0, source.totalCommits + kept.length);
        source.includesPrivate = true;
      }
    }
    await store.putSource(user.login, year, source);
    job.progress = { phase: 'card' };
    await rebuildCard(user.login, year, {
      profile: { name: user.name, avatarUrl: user.avatar_url },
      addEditKeyHash: job.editKeyHash,
    });
    job.ok = true;
  } catch (e) {
    console.error('count failed', user.login, e);
    job.error = String(e.message || e).slice(0, 300);
    noteFailure('count', job.error, { private: Boolean(installationId) });
  } finally {
    job.progress = { phase: 'cleanup' };
    await revokeSignIn(token);
    if (installationId) job.removed = await removeInstallation(installationId);
    job.status = job.ok ? 'done' : 'error';
    setTimeout(() => jobs.delete([...jobs].find(([, j]) => j === job)?.[0]), 10 * 60 * 1000);
  }
}

// ---------- GitLab (gitlab.com) ----------
// Hidden until GITLAB_CLIENT_ID and GITLAB_CLIENT_SECRET are set.
const GL_ID = setting('GITLAB_CLIENT_ID');
const GL_SECRET = setting('GITLAB_CLIENT_SECRET');
const GL_CALLBACK = `${BASE_URL}/auth/gitlab/callback`;

app.get('/login/gitlab', (req, res) => {
  if (!GL_ID || !GL_SECRET) return res.redirect('/');
  // ".a" = add GitLab to the card this browser already owns.
  const state = crypto.randomBytes(16).toString('hex') + (req.query.add === '1' ? '.a' : '');
  const cookies = [`gl_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secure}`];
  // Which of this browser's cards GitLab gets added to.
  if (req.query.add === '1' && req.query.card) cookies.push(`gl_card=${encodeURIComponent(req.query.card)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900${secure}`);
  res.setHeader('Set-Cookie', cookies);
  const params = new URLSearchParams({ client_id: GL_ID, redirect_uri: GL_CALLBACK, response_type: 'code', state, scope: 'read_api read_user' });
  res.redirect(`${GITLAB}/oauth/authorize?${params}`);
});

app.get('/auth/gitlab/callback', async (req, res) => {
  const fail = (why, detail = '') => {
    noteFailure(`gitlab: ${why}`, detail);
    res.redirect(`/?error=gitlab${detail ? `&detail=${encodeURIComponent(String(detail).slice(0, 160))}` : ''}`);
  };
  if (req.query.error) return fail('denied', req.query.error_description || req.query.error);
  if (!req.query.code) return fail('nocode');
  const saved = cookie(req, 'gl_state');
  if (saved && req.query.state && saved !== req.query.state) return fail('state');
  try {
    const tokenRes = await fetch(`${GITLAB}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: GL_ID, client_secret: GL_SECRET, code: req.query.code, grant_type: 'authorization_code', redirect_uri: GL_CALLBACK }),
    });
    const tokenJson = await tokenRes.json();
    const token = tokenJson.access_token;
    if (!token) return fail('token', tokenJson.error_description || tokenJson.error || `HTTP ${tokenRes.status}`);
    const user = await getGitLabUser(token);

    // Adding to an existing card, or a GitLab-only card of its own.
    const target = cookie(req, 'gl_card');
    const owned = String(req.query.state || '').endsWith('.a') ? await ownedCard(req, thisYear(), target ? decodeURIComponent(target) : null) : null;
    const cardId = owned ? owned.login : `gl~${user.username.toLowerCase()}`;
    const cookies = ['gl_state=; Path=/; Max-Age=0', 'gl_card=; Path=/; Max-Age=0'];
    let editKeyHash = null;
    if (!owned) {
      const editKey = crypto.randomBytes(24).toString('base64url');
      editKeyHash = hashKey(editKey);
      cookies.push(editCookie(req, cardId, editKey));
    }
    const id = crypto.randomBytes(12).toString('hex');
    const job = { status: 'running', login: cardId, display: owned ? owned.handle || owned.login : user.username, progress: { phase: 'gitlab', done: 0, total: 0 }, startedAt: Date.now() };
    jobs.set(id, job);
    (async () => {
      try {
        const year = thisYear();
        const { source, unknownTags } = await countGitLab({ token, user, year, onProgress: (p) => (job.progress = p) });
        for (const tag of unknownTags) unknownTagCounts.set(tag, (unknownTagCounts.get(tag) || 0) + 1);
        source.updatedAt = new Date().toISOString();
        await store.putSource(cardId, year, source);
        job.progress = { phase: 'card' };
        await rebuildCard(cardId, year, {
          profile: owned ? null : { name: user.name, avatarUrl: user.avatar_url, handle: user.username },
          addEditKeyHash: editKeyHash,
        });
        job.ok = true;
      } catch (e) {
        console.error('gitlab count failed', e);
        job.error = String(e.message || e).slice(0, 300);
        noteFailure('gitlab count', job.error);
      } finally {
        job.progress = { phase: 'cleanup' };
        await revokeGitLab(token, GL_ID, GL_SECRET);
        job.status = job.ok ? 'done' : 'error';
        setTimeout(() => jobs.delete(id), 10 * 60 * 1000);
      }
    })();
    res.setHeader('Set-Cookie', cookies);
    res.redirect(`/counting/${id}`);
  } catch (e) {
    fail('exception', e.message);
  }
});

// ---------- cards built from sources ----------

// Recomputes a card from all its sources, saves it and draws its image.
async function rebuildCard(cardId, year, { profile, addEditKeyHash } = {}) {
  const existing = (await store.get(cardId, year)) || {};
  const sources = await store.getSources(cardId, year);
  const stats = aggregate(sources);
  let editKeys = existing.editKeys || [];
  if (addEditKeyHash) editKeys = [addEditKeyHash, ...editKeys.filter((k) => k !== addEditKeyHash)].slice(0, 5);
  const card = {
    login: existing.login || cardId,
    handle: profile?.handle ?? existing.handle ?? null,
    name: profile?.name ?? existing.name ?? null,
    avatarUrl: profile?.avatarUrl ?? existing.avatarUrl ?? null,
    year,
    includesPrivate: Boolean(sources.find((s) => s.kind === 'github')?.includesPrivate),
    selfCounted: sources.some((s) => !s.verified),
    editKeys,
    updatedAt: new Date().toISOString(),
    ...stats,
  };
  await store.put(card);
  // Draw the share image now, so the first link preview is instant.
  await cardPng(card).catch((e) => console.error('card render failed', card.login, e.message));
  return card;
}

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');
// One browser can own several cards (say a GitHub card and a GitLab one).
// cw_edit holds up to 5 "cardId.key" entries joined by "|", newest first.
const sameId = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
function editEntries(req) {
  const raw = cookie(req, 'cw_edit');
  if (!raw) return [];
  return raw.split('|').map((e) => {
    const dot = e.lastIndexOf('.');
    return dot > 0 ? { id: decodeURIComponent(e.slice(0, dot)), key: e.slice(dot + 1) } : null;
  }).filter(Boolean);
}
function writeEditCookie(entries) {
  if (!entries.length) return 'cw_edit=; Path=/; Max-Age=0';
  const value = entries.slice(0, 5).map((e) => `${encodeURIComponent(e.id)}.${e.key}`).join('|');
  return `cw_edit=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`;
}
function editCookie(req, cardId, key) {
  return writeEditCookie([{ id: cardId, key }, ...editEntries(req).filter((e) => !sameId(e.id, cardId))]);
}
// The card this browser may edit: the one named, or else the newest it owns.
async function ownedCard(req, year = thisYear(), cardId = null) {
  for (const e of editEntries(req)) {
    if (cardId && !sameId(e.id, cardId)) continue;
    const card = await store.get(e.id, year);
    if (card && (card.editKeys || []).includes(hashKey(e.key))) return card;
  }
  return null;
}
const wantedCard = (req) => String(req.query.card || req.body?.card || '') || null;

// Paste a git log: the page parses it in the browser and sends only the
// AI commit rows (sha, date, lines, tools) plus a total commit count.
app.get('/add/paste', async (req, res) => {
  const card = await ownedCard(req, thisYear(), wantedCard(req));
  if (!card) return res.redirect('/?error=owner');
  res.send(layout({ title: 'Add a repo · Code Wrapped', baseUrl: BASE_URL, body: pastePage({ card, year: thisYear() }) }));
});

app.post('/api/sources/paste', express.json({ limit: '3mb' }), async (req, res) => {
  try {
    const card = await ownedCard(req, thisYear(), wantedCard(req));
    if (!card) return res.status(403).json({ error: 'This browser can no longer edit this card. Count again on this device to get access back.' });
    const year = thisYear();
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Give the repo a name.' });
    const commits = cleanRows(req.body?.commits, year, new Set(TOOLS.map((t) => t.id)));
    const totalCommits = Math.max(commits.length, Math.min(Number(req.body?.totalCommits) || 0, 100000));
    if (!totalCommits) return res.status(400).json({ error: `No commits from ${year} found in what you pasted.` });
    const key = `paste:${name.toLowerCase()}`;
    await store.putSource(card.login, year, {
      key, kind: 'paste', label: name, verified: false, totalCommits,
      commits: commits.map((c) => ({ ...c, repoKey: key, repo: null, private: true })),
      updatedAt: new Date().toISOString(),
    });
    const updated = await rebuildCard(card.login, year);
    res.json({ ok: true, url: `/u/${encodeURIComponent(updated.login)}?added=1` });
  } catch (e) {
    console.error('paste failed', e);
    noteFailure('paste', e.message);
    res.status(500).json({ error: 'Something went wrong while adding this repo.' });
  }
});

app.post('/api/sources/remove', express.urlencoded({ extended: false }), async (req, res) => {
  const card = await ownedCard(req, thisYear(), wantedCard(req));
  if (!card) return res.redirect('/?error=owner');
  const key = String(req.body?.key || '');
  // GitHub is the card's identity, so only extra sources can be removed.
  if (key && key !== 'github') {
    await store.deleteSource(card.login, thisYear(), key);
    await rebuildCard(card.login, thisYear());
  }
  res.redirect(`/u/${encodeURIComponent(card.login)}`);
});

// Owners can delete their own card. Asks once more before doing it.
app.get('/delete', async (req, res) => {
  const card = await ownedCard(req, thisYear(), wantedCard(req));
  if (!card) return res.redirect('/?error=owner');
  res.send(layout({ title: 'Delete your card · Code Wrapped', baseUrl: BASE_URL, body: deletePage(card) }));
});

app.post('/api/card/delete', express.urlencoded({ extended: false }), async (req, res) => {
  const card = await ownedCard(req, thisYear(), wantedCard(req));
  if (!card) return res.redirect('/?error=owner');
  await store.deleteCard(card.login);
  const prefix = `${card.login.toLowerCase()}:`;
  for (const k of [...pngCache.keys()]) if (k.startsWith(prefix)) pngCache.delete(k);
  // Forget only this card's key; keep any other cards this browser owns.
  res.setHeader('Set-Cookie', writeEditCookie(editEntries(req).filter((e) => !sameId(e.id, card.login))));
  res.redirect('/?deleted=1');
});

// Signs a short-lived token that proves requests come from the app itself.
function appJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 60, exp: now + 540, iss: APP_ID })}`;
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), PRIVATE_KEY).toString('base64url')}`;
}

// Uninstalls the app from the user's account so no access is left behind.
async function removeInstallation(installationId) {
  try {
    const r = await fetch(`https://api.github.com/app/installations/${installationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'codewrapped-app' },
    });
    if (r.status !== 204) console.error('uninstall failed', installationId, r.status, await r.text());
    return r.status === 204;
  } catch (e) {
    console.error('uninstall failed', installationId, e.message);
    return false;
  }
}

// Drops the user's sign-in so the app no longer appears under their authorized apps.
async function revokeSignIn(token) {
  try {
    await fetch(`https://api.github.com/applications/${CLIENT_ID}/grant`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'codewrapped-app',
      },
      body: JSON.stringify({ access_token: token }),
    });
  } catch (e) {
    console.error('revoke failed', e.message);
  }
}

app.get('/counting/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.redirect('/');
  res.send(layout({ title: 'Counting · Code Wrapped', baseUrl: BASE_URL, body: countingPage({ id: req.params.id, login: job.display || job.login }) }));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ status: 'missing' });
  res.json({ status: job.status, login: job.login, progress: job.progress, removed: job.removed, error: job.error });
});

// ---------- misc ----------
app.get('/ads.txt', (req, res) => {
  const pub = (process.env.ADSENSE_CLIENT || '').replace(/^ca-/, '');
  res.type('text').send(pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '');
});
app.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /counting/\nDisallow: /api/\n`));
app.get('/healthz', (req, res) => res.type('text').send(process.env.DATABASE_URL ? 'ok postgres' : 'ok file'));

// Says whether each GitHub setting looks right, without revealing any value.
app.get('/healthz/github', async (req, res) => {
  // Number of accounts that still have the app installed. Should be 0 except
  // while someone's private count is running (the app uninstalls itself after).
  let installs = 'unknown';
  try {
    const r = await fetch('https://api.github.com/app/installations?per_page=100', {
      headers: { Authorization: `Bearer ${appJwt()}`, Accept: 'application/vnd.github+json', 'User-Agent': 'codewrapped-app' },
    });
    installs = r.ok ? String((await r.json()).length) : `error ${r.status}`;
  } catch (e) {
    installs = `error: ${e.message}`;
  }
  let key = 'missing';
  if (PRIVATE_KEY) {
    try { crypto.createPrivateKey(PRIVATE_KEY); key = 'valid'; } catch { key = 'set but not a valid key'; }
  }
  const secretNames = Object.keys(process.env).filter((k) => /secret/i.test(k) && k !== 'GITHUB_CLIENT_SECRET');
  res.type('text').send([
    `client id: ${CLIENT_ID ? `set, starts ${CLIENT_ID.slice(0, 6)}` : 'missing'}`,
    `client secret: ${CLIENT_SECRET ? `set, ${CLIENT_SECRET.length} characters, ${/^[0-9a-f]+$/.test(CLIENT_SECRET) ? 'looks right' : 'contains unexpected characters'}` : 'missing'}`,
    `other variables with "secret" in the name: ${secretNames.join(', ') || 'none'}`,
    `app id: ${APP_ID ? (/^\d+$/.test(APP_ID) ? 'set, a number' : 'set but not a number') : 'missing'}`,
    `app slug: ${APP_SLUG || 'missing'}`,
    `private key: ${key}`,
    `base url: ${BASE_URL}`,
    `accounts with the app installed right now: ${installs}`,
    `gitlab sign-in: ${GL_ID && GL_SECRET ? `on (client id starts ${GL_ID.slice(0, 6)}, secret ${GL_SECRET.length} characters)` : 'off (GITLAB_CLIENT_ID / GITLAB_CLIENT_SECRET not set)'}`,
    '',
    `recent failures (newest first, since last restart): ${failures.length ? '' : 'none'}`,
    ...failures.map((f) => `  ${f.at}  ${f.what}  ${f.detail}  ${JSON.stringify(f.ctx)}`),
    '',
    `unrecognised AI-looking co-author tags (people seen with it, since last restart): ${unknownTagCounts.size ? '' : 'none'}`,
    ...[...unknownTagCounts].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([tag, n]) => `  ${n}x  ${tag}`),
  ].join('\n'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

app.listen(PORT, () => console.log(`Code Wrapped running on ${BASE_URL}`));
