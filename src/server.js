import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import { countYear, getUser } from './counter.js';
import { renderCard } from './card.js';
import { store, topPercent } from './store.js';
import { rateLimit } from './ratelimit.js';
import { headlineTool, splitText } from './tools.js';
import { layout, landingPage, countingPage, sharePage, missingPage, privacyPage, privatePage } from './pages.js';

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
  res.send(layout({ title: 'Code Wrapped', baseUrl: BASE_URL, body: landingPage({ totals, year: thisYear(), error: req.query.error, detail: req.query.detail }) }));
});

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
  const pageUrl = `${BASE_URL}/u/${card.login}${year === thisYear() ? '' : `?year=${year}`}`;
  // Rank in the image URL so previews refresh when the rank changes.
  const image = `${BASE_URL}/card/${card.login}/${year}.png?v=${Date.parse(card.updatedAt)}-${card.rank || 0}`;
  const split = splitText(card);
  const share = card.totalCommits ? ` AI co-wrote ${Math.max(1, Math.round((card.commits / card.totalCommits) * 100))}% of commits.` : '';
  const desc = `${card.commits.toLocaleString('en-US')} commits co-authored with ${headlineTool(card)} in ${year}${split ? `: ${split}` : ''}.${share}${card.rank ? ` Top ${card.rank}% on Code Wrapped.` : ''}`;
  res.send(
    layout({
      title: `@${card.login} shipped +${card.additions.toLocaleString('en-US')} lines with ${headlineTool(card)}`,
      description: desc,
      image,
      url: pageUrl,
      baseUrl: BASE_URL,
      body: sharePage({ card, pageUrl, image, justCounted: req.query.new === '1', removed: req.query.removed === '1' }),
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

app.get('/login', (req, res) => {
  if (!CLIENT_ID) return res.status(500).send('GITHUB_CLIENT_ID is not set.');
  if (req.query.private === '1') return res.redirect('/private');
  res.redirect(signInUrl(startAuth(res)));
});

// Explains exactly what GitHub will ask before sending the user there.
app.get('/private', (req, res) => {
  res.send(layout({ title: 'Include private repos · Code Wrapped', baseUrl: BASE_URL, body: privatePage({ repoUrl: process.env.REPO_URL }) }));
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

app.get('/auth/callback', async (req, res) => {
  const state = cookie(req, 'oauth_state');
  let installationId = req.query.installation_id ? Number(req.query.installation_id) : null;
  const fail = (why, detail = '') => {
    console.error('sign-in failed', why, detail);
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
    const job = { status: 'running', login: user.login, progress: { phase: 'search', found: 0 }, startedAt: Date.now() };
    jobs.set(id, job);
    runJob(job, token, user, installationId);
    res.setHeader('Set-Cookie', 'oauth_state=; Path=/; Max-Age=0');
    res.redirect(`/counting/${id}`);
  } catch (e) {
    fail('exception', e.message);
  }
});

async function runJob(job, token, user, installationId) {
  try {
    const year = thisYear();
    const result = await countYear({ token, login: user.login, year, onProgress: (p) => (job.progress = p) });
    const card = {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      includesPrivate: Boolean(installationId),
      updatedAt: new Date().toISOString(),
      ...result,
    };
    await store.put(card);
    // Draw the share image now, so the first link preview is instant.
    job.progress = { phase: 'card' };
    await cardPng(card).catch((e) => console.error('card render failed', card.login, e.message));
    job.ok = true;
  } catch (e) {
    console.error('count failed', user.login, e);
    job.error = String(e.message || e).slice(0, 300);
  } finally {
    job.progress = { phase: 'cleanup' };
    await revokeSignIn(token);
    if (installationId) job.removed = await removeInstallation(installationId);
    job.status = job.ok ? 'done' : 'error';
    setTimeout(() => jobs.delete([...jobs].find(([, j]) => j === job)?.[0]), 10 * 60 * 1000);
  }
}

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
  res.send(layout({ title: 'Counting · Code Wrapped', baseUrl: BASE_URL, body: countingPage({ id: req.params.id, login: job.login }) }));
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
  ].join('\n'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

app.listen(PORT, () => console.log(`Code Wrapped running on ${BASE_URL}`));
