// Reads the output of the git log command shown on the "Add a repo" page.
// This file runs in the browser (served as /paste.js), so the pasted text,
// including file paths, never leaves the user's computer. Only the rows it
// returns are sent: commit id, date, lines added/deleted and AI tools.
import { toolsInMessage } from './tools.js';

export const pasteCommand = (year) =>
  `git log --all --since=${year}-01-01 --no-merges --author="$(git config user.email)" --numstat --format="@@@%H|%aI|%(trailers:key=Co-authored-by,valueonly,separator=%x1f)"`;

export function parsePastedLog(text, year) {
  const commits = [];
  let totalCommits = 0;
  let cur = null;
  const done = () => {
    if (cur && cur.tools.length) commits.push(cur);
    cur = null;
  };
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith('@@@')) {
      done();
      const [sha, date, trailers = ''] = line.slice(3).split('|');
      if (!/^[0-9a-f]{40}$/i.test(sha) || !date?.startsWith(String(year))) continue;
      totalCommits += 1;
      const message = trailers.split('\x1f').filter(Boolean).map((t) => `Co-authored-by: ${t}`).join('\n');
      cur = { sha: sha.toLowerCase(), date: date.slice(0, 10), additions: 0, deletions: 0, tools: toolsInMessage(message) };
      continue;
    }
    // numstat: "<added>\t<deleted>\t<path>"; binary files show "-".
    const m = cur && line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (m) {
      cur.additions += m[1] === '-' ? 0 : Number(m[1]);
      cur.deletions += m[2] === '-' ? 0 : Number(m[2]);
    }
  }
  done();
  return { totalCommits, commits };
}

// Server side: accept only well-formed rows, nothing else.
export function cleanRows(rows, year, knownTools) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const out = [];
  for (const r of rows.slice(0, 50000)) {
    const sha = String(r?.sha || '').toLowerCase();
    const date = String(r?.date || '');
    if (!/^[0-9a-f]{40}$/.test(sha) || seen.has(sha)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(String(year))) continue;
    const tools = (Array.isArray(r.tools) ? r.tools : []).filter((t) => knownTools.has(t)).slice(0, 5);
    if (!tools.length) continue;
    const n = (v) => Math.max(0, Math.min(Number(v) || 0, 10_000_000));
    seen.add(sha);
    out.push({ sha, date, additions: n(r.additions), deletions: n(r.deletions), tools });
  }
  return out;
}
