// Counts a GitHub user's commits co-authored with AI tools in a given year.
// 1. Commit search finds every commit with a co-author line (max 1000 results
//    per query, so big date ranges are split until each piece fits). Each
//    co-author line is matched against the tool list in tools.js.
// 2. GraphQL fetches additions/deletions for 100 commits per request.
import { toolsInMessage, toolById } from './tools.js';

const API = 'https://api.github.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(token, url, opts = {}, attempt = 0) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'coauthored-app',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  // Search allows 30 requests a minute; wait and retry when we hit it.
  if ((res.status === 403 || res.status === 429) && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const wait = retryAfter
      ? retryAfter * 1000
      : reset
        ? Math.max(1000, reset * 1000 - Date.now() + 500)
        : 5000 * (attempt + 1);
    await sleep(Math.min(wait, 65000));
    return gh(token, url, opts, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const day = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

async function searchRange(token, login, from, to, found, onProgress) {
  const q = `author:${login} "Co-authored-by" merge:false author-date:${iso(from)}..${iso(to)}`;
  const first = await gh(token, `/search/commits?q=${encodeURIComponent(q)}&per_page=100&page=1`);
  if (first.total_count > 1000 && to - from >= day) {
    const mid = from + Math.floor((to - from) / day / 2) * day;
    await searchRange(token, login, from, mid, found, onProgress);
    await searchRange(token, login, mid + day, to, found, onProgress);
    return;
  }
  const pages = Math.min(10, Math.ceil(first.total_count / 100));
  const add = (items) => {
    for (const it of items) {
      const tools = toolsInMessage(it.commit.message);
      if (tools.length) found.set(it.sha, { ...it, tools });
    }
    onProgress?.({ phase: 'search', found: found.size });
  };
  add(first.items);
  for (let p = 2; p <= pages; p++) {
    const r = await gh(token, `/search/commits?q=${encodeURIComponent(q)}&per_page=100&page=${p}`);
    add(r.items);
  }
}

const STATS_QUERY = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Commit { oid additions deletions } } }`;

export async function countYear({ token, login, year, onProgress }) {
  const from = Date.UTC(year, 0, 1);
  const to = Math.min(Date.UTC(year, 11, 31), Date.now());
  const found = new Map();
  await searchRange(token, login, from, to, found, onProgress);

  const items = [...found.values()];
  const stats = new Map();
  for (let i = 0; i < items.length; i += 100) {
    const ids = items.slice(i, i + 100).map((it) => it.node_id);
    const r = await gh(token, '/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: STATS_QUERY, variables: { ids } }),
    });
    for (const n of r.data?.nodes || []) if (n?.oid) stats.set(n.oid, n);
    onProgress?.({ phase: 'stats', done: Math.min(i + 100, items.length), total: items.length });
  }

  const months = Array(12).fill(0);
  const repos = new Map();
  const tools = new Map();
  let additions = 0;
  let deletions = 0;
  for (const it of items) {
    const s = stats.get(it.sha) || { additions: 0, deletions: 0 };
    additions += s.additions;
    deletions += s.deletions;
    months[new Date(it.commit.author.date).getUTCMonth()] += s.additions;
    // A commit credited to two tools splits its lines between them.
    for (const id of it.tools) {
      const t = tools.get(id) || { id, name: toolById[id].name, commits: 0, additions: 0 };
      t.commits += 1;
      t.additions += Math.round(s.additions / it.tools.length);
      tools.set(id, t);
    }
    const name = it.repository.full_name;
    const r = repos.get(name) || { name, private: it.repository.private, additions: 0 };
    r.additions += s.additions;
    repos.set(name, r);
  }
  // Private repo names never leave the server: only public ones can be shown.
  const topPublicRepo = [...repos.values()]
    .filter((r) => !r.private)
    .sort((a, b) => b.additions - a.additions)[0]?.name || null;

  return {
    year,
    commits: items.length,
    additions,
    deletions,
    repos: repos.size,
    months,
    tools: [...tools.values()].sort((a, b) => b.additions - a.additions || b.commits - a.commits),
    topPublicRepo,
  };
}

export async function getUser(token) {
  return gh(token, '/user');
}
