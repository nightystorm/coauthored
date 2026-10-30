// gitlab.com source: finds the projects the user actually pushed to this
// year, reads this year's commits (with line stats) in each, and keeps the
// ones they authored. GitLab has no search across projects, so we go project
// by project.
import { toolsInMessage, unknownAiTags } from './tools.js';
import { fingerprint } from './counter.js';

export const GITLAB = 'https://gitlab.com';
const MAX_PROJECTS = 300;
const MAX_PAGES_PER_PROJECT = 100; // 10,000 commits per project per year

async function gl(token, path) {
  const res = await fetch(`${GITLAB}/api/v4${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'codewrapped-app' } });
  if (!res.ok) {
    let message = await res.text();
    try { message = JSON.parse(message).message || JSON.parse(message).error || message; } catch {}
    throw new Error(`GitLab said ${res.status}: ${String(message).slice(0, 200)}`);
  }
  return { body: await res.json(), next: res.headers.get('x-next-page') };
}

// Every page of a list endpoint, up to `max` items.
async function all(token, path, max) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page && out.length < max; ) {
    const r = await gl(token, `${path}${sep}per_page=100&page=${page}`);
    out.push(...r.body);
    page = r.next ? Number(r.next) : 0;
  }
  return out;
}

export async function getGitLabUser(token) {
  return (await gl(token, '/user')).body;
}

// Every address the user's commits could be authored with.
async function userEmails(token, user) {
  const emails = new Set([user.email, user.public_email, user.commit_email, `${user.id}-${user.username}@users.noreply.gitlab.com`].filter(Boolean).map((e) => e.toLowerCase()));
  try {
    for (const e of (await gl(token, '/user/emails')).body) if (e.email) emails.add(e.email.toLowerCase());
  } catch {}
  return emails;
}

// Commits often carry a work email that isn't on the GitLab account. In
// projects the user pushed to, the same full name (two words or more) is
// them. A single-word name is too common to trust.
const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function nameMatcher(user) {
  const name = norm(user.name);
  return name.includes(' ') ? (n) => norm(n) === name : () => false;
}

// Projects the user pushed to this year: their push events plus GitLab's own
// "contributed to" list. Membership alone can be hundreds of company repos
// they never touched. Falls back to membership if both come back empty.
async function findProjects(token, user, year) {
  const ids = new Set();
  try {
    const events = await all(token, `/events?action=pushed&after=${year - 1}-12-31`, 5000);
    for (const e of events) if (e.project_id) ids.add(e.project_id);
  } catch {}
  const byId = new Map();
  try {
    for (const p of await all(token, `/users/${user.id}/contributed_projects?simple=true`, 1000)) byId.set(p.id, p);
  } catch {}
  for (const id of ids) {
    if (byId.has(id) || byId.size >= MAX_PROJECTS) continue;
    try { byId.set(id, (await gl(token, `/projects/${id}?simple=true`)).body); } catch {}
  }
  if (!byId.size) {
    for (const p of await all(token, `/projects?membership=true&simple=true&last_activity_after=${year}-01-01T00:00:00Z`, MAX_PROJECTS)) byId.set(p.id, p);
  }
  return [...byId.values()].slice(0, MAX_PROJECTS);
}

export async function countGitLab({ token, user, year, onProgress }) {
  const emails = await userEmails(token, user);
  const sameName = nameMatcher(user);
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;

  onProgress?.({ phase: 'gitlab', done: 0, total: 0, found: 0 });
  const projects = await findProjects(token, user, year);

  const commits = [];
  const unknown = new Set();
  let totalCommits = 0;
  for (const [i, p] of projects.entries()) {
    onProgress?.({ phase: 'gitlab', done: i, total: projects.length, found: commits.length });
    const pub = p.visibility === 'public';
    for (let page = 1, n = 0; page && n < MAX_PAGES_PER_PROJECT; n++) {
      let r;
      try {
        r = await gl(token, `/projects/${p.id}/repository/commits?all=true&with_stats=true&since=${since}&until=${until}&per_page=100&page=${page}`);
      } catch {
        break; // empty repo or no access to code: skip the project
      }
      for (const c of r.body) {
        if ((c.parent_ids || []).length > 1) continue; // merge commit
        if (!emails.has(String(c.author_email || '').toLowerCase()) && !sameName(c.author_name)) continue;
        totalCommits += 1;
        const tools = toolsInMessage(c.message || '');
        for (const t of unknownAiTags(c.message || '')) unknown.add(t);
        if (!tools.length) continue;
        commits.push({
          sha: c.id,
          date: String(c.authored_date).slice(0, 10),
          additions: c.stats?.additions || 0,
          deletions: c.stats?.deletions || 0,
          tools,
          // Private project names are never stored, only a one-way fingerprint.
          repoKey: pub ? `gl:${p.path_with_namespace}` : `gl-${fingerprint(p.path_with_namespace)}`,
          repo: pub ? p.path_with_namespace : null,
          repoUrl: pub ? p.web_url : null,
          private: !pub,
        });
      }
      page = r.next ? Number(r.next) : 0;
    }
  }

  // The same commit can show up on several branches; keep it once.
  const unique = [...new Map(commits.map((c) => [c.sha, c])).values()];
  return {
    source: { key: 'gitlab', kind: 'gitlab', label: 'GitLab', verified: true, totalCommits: Math.max(totalCommits - (commits.length - unique.length), unique.length), commits: unique },
    unknownTags: [...unknown],
  };
}

export async function revokeGitLab(token, clientId, clientSecret) {
  try {
    await fetch(`${GITLAB}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, token }),
    });
  } catch (e) {
    console.error('gitlab revoke failed', e.message);
  }
}
