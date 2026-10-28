// Builds a card's numbers from all of its sources (GitHub, GitLab, pasted
// git logs). Each source holds one row per AI co-authored commit:
//   { sha, date: 'YYYY-MM-DD', additions, deletions, tools: [ids],
//     repoKey, repo (public name or null), private }
// The same commit found in two sources is counted once (by sha).
import { toolById } from './tools.js';

export const BULK_LINES = 20000;
const DAY = 86400000;

export function aggregate(sources) {
  const order = { github: 0, gitlab: 1, paste: 2 };
  const sorted = [...sources].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));

  const rows = new Map(); // sha -> { row, source }
  let duplicates = 0;
  for (const src of sorted) {
    for (const row of src.commits || []) {
      if (rows.has(row.sha)) duplicates += 1;
      else rows.set(row.sha, { ...row, source: src });
    }
  }

  const months = Array(12).fill(0);
  const days = new Map();
  const tools = new Map();
  const repos = new Map();
  let additions = 0;
  let deletions = 0;
  let verifiedAdditions = 0;
  let bulkCommits = 0;

  for (const row of rows.values()) {
    let add = row.additions || 0;
    let del = row.deletions || 0;
    // Commits this big are almost always lock files, generated or vendored
    // code. They still count as commits but their lines are left out.
    if (add > BULK_LINES) {
      bulkCommits += 1;
      add = 0;
      del = 0;
    }
    additions += add;
    deletions += del;
    if (row.source.verified) verifiedAdditions += add;
    months[Number(row.date.slice(5, 7)) - 1] += add;
    days.set(row.date, (days.get(row.date) || 0) + add);
    // A commit credited to two tools splits its lines between them.
    const ids = row.tools?.length ? row.tools : ['claude'];
    for (const id of ids) {
      const t = tools.get(id) || { id, name: toolById[id]?.name || id, commits: 0, additions: 0 };
      t.commits += 1;
      t.additions += Math.round(add / ids.length);
      tools.set(id, t);
    }
    const kind = row.source.kind === 'paste' ? 'self' : row.private ? 'private' : 'public';
    const key = `${kind}:${row.repoKey}`;
    const url = kind === 'public' ? row.repoUrl || `https://github.com/${row.repo}` : null;
    const r = repos.get(key) || { kind, name: kind === 'public' ? row.repo : null, url, commits: 0, additions: 0 };
    r.commits += 1;
    r.additions += add;
    repos.set(key, r);
  }

  // Longest run of consecutive days with an AI commit.
  let longestStreak = 0;
  let run = 0;
  let prev = null;
  for (const d of [...days.keys()].sort()) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev !== null && t - prev === DAY ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = t;
  }
  const best = [...days].sort((a, b) => b[1] - a[1])[0];

  // Repo table: public repos by name (top 10), everything else grouped.
  const all = [...repos.values()];
  const pub = all.filter((r) => r.kind === 'public').sort((a, b) => b.additions - a.additions);
  const group = (list, g) => list.length && {
    group: g, repos: list.length,
    commits: list.reduce((s, r) => s + r.commits, 0),
    additions: list.reduce((s, r) => s + r.additions, 0),
  };
  const repoList = [
    ...pub.slice(0, 10).map(({ name, url, commits, additions: a }) => ({ name, url, commits, additions: a })),
    group(pub.slice(10), 'public'),
    group(all.filter((r) => r.kind === 'private'), 'private'),
    group(all.filter((r) => r.kind === 'self'), 'self'),
  ].filter(Boolean);

  // Each source counted its own AI commits in its total, so remove the
  // ones we merged as duplicates. Non-AI overlaps can't be detected.
  const totalCommits = Math.max(
    rows.size,
    sorted.reduce((s, src) => s + (src.totalCommits || 0), 0) - duplicates,
  );

  return {
    commits: rows.size,
    additions,
    deletions,
    verifiedAdditions,
    repos: repos.size,
    months,
    tools: [...tools.values()].sort((a, b) => b.additions - a.additions || b.commits - a.commits),
    totalCommits,
    activeDays: days.size,
    longestStreak,
    busiestDay: best && best[1] > 0 ? { date: best[0], additions: best[1] } : null,
    bulkCommits,
    repoList,
    topPublicRepo: pub[0]?.name || null,
    sources: sorted.map((s) => ({ key: s.key, kind: s.kind, label: s.label, verified: Boolean(s.verified), commits: (s.commits || []).length, updatedAt: s.updatedAt })),
  };
}
