// gitlab.com source: walks the user's projects and reads this year's commits
// (with line stats), keeping the ones they authored. GitLab has no search
// across projects, so we go project by project.
import { toolsInMessage, unknownAiTags } from './tools.js';
import { fingerprint } from './counter.js';

export const GITLAB = 'https://gitlab.com';
const MAX_PROJECTS = 200;
const MAX_PAGES_PER_PROJECT = 30; // 3,000 commits per project

async function gl(token, path) {
  const res = await fetch(`${GITLAB}/api/v4${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'codewrapped-app' } });
  if (!res.ok) {
    let message = await res.text();
    try { message = JSON.parse(message).message || JSON.parse(message).error || message; } catch {}
    throw new Error(`GitLab said ${res.status}: ${String(message).slice(0, 200)}`);
  }
  return { body: await res.json(), next: res.headers.get('x-next-page') };
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

export async function countGitLab({ token, user, year, onProgress }) {
  const emails = await userEmails(token, user);
  const since = `${year}-01-01T00:00:00Z`;
  const until = `${year}-12-31T23:59:59Z`;

  const projects = [];
  for (let page = 1; page && projects.length < MAX_PROJECTS; ) {
    const r = await gl(token, `/projects?membership=true&simple=true&per_page=100&page=${page}&last_activity_after=${since}`);
    projects.push(...r.body);
    page = r.next ? Number(r.next) : 0;
  }

  const commits = [];
  const unknown = new Set();
  let totalCommits = 0;
  for (const [i, p] of projects.slice(0, MAX_PROJECTS).entries()) {
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
        if (!emails.has(String(c.author_email || '').toLowerCase())) continue;
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
