import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import express from 'express';
import { countYear, getUser } from './counter.js';
import { renderCard } from './card.js';
import { store } from './store.js';
import { layout, landingPage, countingPage, sharePage, missingPage, privacyPage } from './pages.js';

const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const HOST = new URL(BASE_URL).host;
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const thisYear = () => new Date().getUTCFullYear();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Fonts for the web pages, straight from the npm packages.
app.use('/fonts/bricolage', express.static(path.dirname(require.resolve('@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-400-normal.woff2')), { maxAge: '30d' }));
app.use('/fonts/mono', express.static(path.dirname(require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2')), { maxAge: '30d' }));

const cookie = (req, name) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

// ---------- pages ----------
app.get('/', async (req, res) => {
  const totals = await store.stats().catch(() => ({ users: 0, lines: 0 }));
  res.send(layout({ title: 'Coauthored', baseUrl: BASE_URL, body: landingPage({ totals, year: thisYear(), error: req.query.error }) }));
});

app.get('/privacy', (req, res) => {
  res.send(layout({ title: 'Privacy · Coauthored', baseUrl: BASE_URL, body: privacyPage(process.env.CONTACT_EMAIL) }));
});

app.get('/u/:login', async (req, res) => {
  const year = Number(req.query.year) || thisYear();
  const card = await store.get(req.params.login, year);
  if (!card) {
    return res.status(404).send(layout({ title: 'Coauthored', baseUrl: BASE_URL, body: missingPage(req.params.login) }));
  }
  const pageUrl = `${BASE_URL}/u/${card.login}${year === thisYear() ? '' : `?year=${year}`}`;
  const image = `${BASE_URL}/card/${card.login}/${year}.png?v=${Date.parse(card.updatedAt)}`;
  const desc = `${card.commits.toLocaleString('en-US')} commits co-authored with Claude in ${year}.`;
  res.send(
    layout({
      title: `@${card.login} shipped +${card.additions.toLocaleString('en-US')} lines with Claude`,
      description: desc,
      image,
      url: pageUrl,
      baseUrl: BASE_URL,
      body: sharePage({ card, pageUrl, image, justCounted: req.query.new === '1' }),
    }),
  );
});

// ---------- card images ----------
const EXAMPLE = {
  login: 'octocat', name: 'Your name here', avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
  year: thisYear(), commits: 299, additions: 87380, deletions: 12087, repos: 3,
  months: [1900, 3400, 2600, 5600, 7800, 6400, 9100, 12300, 10200, 28080, 0, 0],
};
let examplePng;
app.get('/card/example.png', async (req, res, next) => {
  try {
    examplePng ||= await renderCard(EXAMPLE, HOST);
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(examplePng);
  } catch (e) { next(e); }
});

const pngCache = new Map();
app.get('/card/:login/:year.png', async (req, res, next) => {
  try {
    const card = await store.get(req.params.login, Number(req.params.year));
    if (!card) return res.sendStatus(404);
    const key = `${card.login}:${card.year}:${card.updatedAt}`;
    let png = pngCache.get(key);
    if (!png) {
      png = await renderCard(card, HOST);
      if (pngCache.size > 500) pngCache.clear();
      pngCache.set(key, png);
    }
    res.type('png').set('Cache-Control', 'public, max-age=3600').send(png);
  } catch (e) { next(e); }
});

// ---------- GitHub sign-in ----------
app.get('/login', (req, res) => {
  if (!CLIENT_ID) return res.status(500).send('GITHUB_CLIENT_ID is not set.');
  const state = crypto.randomBytes(16).toString('hex');
  const wantsPrivate = req.query.private === '1';
  res.setHeader('Set-Cookie', `oauth_state=${state}.${wantsPrivate ? 1 : 0}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${BASE_URL.startsWith('https') ? '; Secure' : ''}`);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/callback`,
    state,
    // No scope = public repos only. "repo" is GitHub's only way to read private commits.
    scope: wantsPrivate ? 'repo' : '',
    allow_signup: 'true',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

const jobs = new Map();

app.get('/auth/callback', async (req, res) => {
  const [state, priv] = (cookie(req, 'oauth_state') || '').split('.');
  if (!req.query.code || !state || state !== req.query.state) return res.redirect('/?error=signin');
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code: req.query.code, redirect_uri: `${BASE_URL}/auth/callback` }),
    });
    const { access_token: token } = await tokenRes.json();
    if (!token) return res.redirect('/?error=signin');

    const user = await getUser(token);
    const id = crypto.randomBytes(12).toString('hex');
    const job = { status: 'running', login: user.login, progress: { phase: 'search', found: 0 }, startedAt: Date.now() };
    jobs.set(id, job);
    runJob(job, token, user, priv === '1');
    res.setHeader('Set-Cookie', 'oauth_state=; Path=/; Max-Age=0');
    res.redirect(`/counting/${id}`);
  } catch (e) {
    console.error('callback failed', e);
    res.redirect('/?error=signin');
  }
});

async function runJob(job, token, user, includesPrivate) {
  try {
    const year = thisYear();
    const result = await countYear({ token, login: user.login, year, onProgress: (p) => (job.progress = p) });
    await store.put({
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      includesPrivate,
      updatedAt: new Date().toISOString(),
      ...result,
    });
    job.status = 'done';
  } catch (e) {
    console.error('count failed', user.login, e);
    job.status = 'error';
  } finally {
    revoke(token);
    setTimeout(() => jobs.delete([...jobs].find(([, j]) => j === job)?.[0]), 10 * 60 * 1000);
  }
}

// We only need the token for one count, so we hand it back to GitHub right away.
async function revoke(token) {
  try {
    await fetch(`https://api.github.com/applications/${CLIENT_ID}/grant`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'coauthored-app',
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
  res.send(layout({ title: 'Counting · Coauthored', baseUrl: BASE_URL, body: countingPage({ id: req.params.id, login: job.login }) }));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ status: 'missing' });
  res.json({ status: job.status, login: job.login, progress: job.progress });
});

// ---------- misc ----------
app.get('/ads.txt', (req, res) => {
  const pub = (process.env.ADSENSE_CLIENT || '').replace(/^ca-/, '');
  res.type('text').send(pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : '');
});
app.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /counting/\nDisallow: /api/\n`));
app.get('/healthz', (req, res) => res.send('ok'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

app.listen(PORT, () => console.log(`Coauthored running on ${BASE_URL}`));
