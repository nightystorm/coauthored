// Counts a GitHub user's commits co-authored with AI tools in a given year.
// 1. Commit search finds every commit with a co-author line (max 1000 results
//    per query, so big date ranges are split until each piece fits). Each
//    co-author line is matched against the tool list in tools.js.
// 2. GraphQL fetches additions/deletions for 100 commits per request.
import crypto from 'node:crypto';
import { toolsInMessage, unknownAiTags } from './tools.js';

const API = 'https://api.github.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(token, url, opts = {}, attempt = 0) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'codewrapped-app',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  // Search allows 30 requests a minute; wait and retry when we hit it.
  // Other 403s (no permission, blocked app) fail straight away.
  const limited =
    res.status === 429 ||
    (res.status === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || res.headers.has('retry-after')));
  if (limited && attempt < 4) {
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
    let message = body.slice(0, 200);
    try { message = JSON.parse(body).message || message; } catch {}
    throw new Error(`GitHub said ${res.status}: ${message}`);
  }
  const json = await res.json();
  if (json.errors && !json.data) throw new Error(`GitHub said: ${json.errors[0]?.message || 'query failed'}`);
  return json;
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
      for (const tag of unknownAiTags(it.commit.message)) found.unknown.add(tag);
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

// Finds this year's AI co-authored commits on GitHub and returns them as a
// source for aggregate.js, plus the user's total commit count.
export async function countGitHub({ token, login, year, onProgress }) {
  const from = Date.UTC(year, 0, 1);
  const to = Math.min(Date.UTC(year, 11, 31), Date.now());
  const found = new Map();
  found.unknown = new Set();
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

  // All commits this year, AI or not, so we can say what share AI co-wrote.
  const allQ = `author:${login} merge:false author-date:${iso(from)}..${iso(to)}`;
  const totalCommits = (await gh(token, `/search/commits?q=${encodeURIComponent(allQ)}&per_page=1`)).total_count;

  const commits = items.map((it) => {
    const s = stats.get(it.sha) || { additions: 0, deletions: 0 };
    const name = it.repository.full_name;
    const priv = Boolean(it.repository.private);
    return {
      sha: it.sha,
      // The author date keeps the committer's own time zone, so slice the day from it.
      date: String(it.commit.author.date).slice(0, 10),
      additions: s.additions,
      deletions: s.deletions,
      tools: it.tools,
      // Private repo names are never stored, only a one-way fingerprint.
      repoKey: priv ? `gh-${fingerprint(name)}` : `gh:${name}`,
      repo: priv ? null : name,
      private: priv,
    };
  });

  return {
    source: { key: 'github', kind: 'github', label: 'GitHub', verified: true, totalCommits: Math.max(totalCommits, commits.length), commits },
    unknownTags: [...found.unknown],
  };
}

export function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text).toLowerCase()).digest('hex').slice(0, 12);
}

export async function getUser(token) {
  return gh(token, '/user');
}
