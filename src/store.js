// Saves each user's latest card. Postgres when DATABASE_URL is set
// (production), otherwise a JSON file in ./data (local development).
import fs from 'node:fs';
import path from 'node:path';

let impl;

if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false },
  });
  await pool.query(`create table if not exists cards (
    login text not null,
    year int not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (login, year)
  )`);
  // Each card's sources (GitHub, GitLab, pasted repos) with their commit rows.
  await pool.query(`create table if not exists card_sources (
    card_id text not null,
    year int not null,
    key text not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (card_id, year, key)
  )`);
  // Rendered card images, one per card version (data + rank).
  await pool.query(`create table if not exists card_images (
    key text primary key,
    login text not null,
    year int not null,
    png bytea not null,
    created_at timestamptz not null default now()
  )`);
  impl = {
    async get(login, year) {
      const r = await pool.query('select data from cards where login = $1 and year = $2', [login.toLowerCase(), year]);
      return r.rows[0]?.data || null;
    },
    async put(card) {
      await pool.query(
        `insert into cards (login, year, data) values ($1, $2, $3)
         on conflict (login, year) do update set data = excluded.data, updated_at = now()`,
        [card.login.toLowerCase(), card.year, card],
      );
    },
    async stats() {
      const r = await pool.query(`select count(*)::int as users, coalesce(sum((data->>'additions')::bigint), 0)::bigint as lines from cards`);
      return { users: r.rows[0].users, lines: Number(r.rows[0].lines) };
    },
    // How many people counted more checked lines this year than `additions`.
    // Self-counted (pasted) lines are left out so the rank stays fair.
    async rank(year, additions) {
      const r = await pool.query(
        `select count(*) filter (where coalesce((data->>'verifiedAdditions')::bigint, (data->>'additions')::bigint) > $2)::int as above,
                count(*)::int as total
         from cards where year = $1 and coalesce((data->>'verifiedAdditions')::bigint, (data->>'additions')::bigint) > 0`,
        [year, additions],
      );
      return r.rows[0];
    },
    async getSources(cardId, year) {
      const r = await pool.query('select data from card_sources where card_id = $1 and year = $2', [cardId.toLowerCase(), year]);
      return r.rows.map((x) => x.data);
    },
    async putSource(cardId, year, source) {
      await pool.query(
        `insert into card_sources (card_id, year, key, data) values ($1, $2, $3, $4)
         on conflict (card_id, year, key) do update set data = excluded.data, updated_at = now()`,
        [cardId.toLowerCase(), year, source.key, source],
      );
    },
    async deleteSource(cardId, year, key) {
      await pool.query('delete from card_sources where card_id = $1 and year = $2 and key = $3', [cardId.toLowerCase(), year, key]);
    },
    // Removes the card, its sources and its images, for every year.
    async deleteCard(cardId) {
      const id = cardId.toLowerCase();
      await pool.query('delete from cards where login = $1', [id]);
      await pool.query('delete from card_sources where card_id = $1', [id]);
      await pool.query('delete from card_images where login = $1', [id]);
    },
    async getImage(key) {
      const r = await pool.query('select png from card_images where key = $1', [key]);
      return r.rows[0]?.png || null;
    },
    // Saves the new version and drops older versions of the same card.
    async putImage(key, login, year, png) {
      await pool.query(
        `insert into card_images (key, login, year, png) values ($1, $2, $3, $4) on conflict (key) do nothing`,
        [key, login.toLowerCase(), year, png],
      );
      await pool.query('delete from card_images where login = $1 and year = $2 and key <> $3', [login.toLowerCase(), year, key]);
    },
  };
} else {
  const { fileURLToPath } = await import('node:url');
  const file = fileURLToPath(new URL('../data/cards.json', import.meta.url));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sourcesFile = path.join(path.dirname(file), 'sources.json');
  const loadSources = () => {
    try { return JSON.parse(fs.readFileSync(sourcesFile, 'utf8')); } catch { return {}; }
  };
  const imgDir = path.join(path.dirname(file), 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const load = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  const key = (login, year) => `${login.toLowerCase()}:${year}`;
  impl = {
    async get(login, year) { return load()[key(login, year)] || null; },
    async put(card) {
      const all = load();
      all[key(card.login, card.year)] = card;
      fs.writeFileSync(file, JSON.stringify(all, null, 2));
    },
    async stats() {
      const all = Object.values(load());
      return { users: all.length, lines: all.reduce((s, c) => s + c.additions, 0) };
    },
    async rank(year, additions) {
      const v = (c) => c.verifiedAdditions ?? c.additions;
      const peers = Object.values(load()).filter((c) => c.year === year && v(c) > 0);
      return { above: peers.filter((c) => v(c) > additions).length, total: peers.length };
    },
    async getSources(cardId, year) {
      return Object.values(loadSources()[key(cardId, year)] || {});
    },
    async putSource(cardId, year, source) {
      const all = loadSources();
      (all[key(cardId, year)] ||= {})[source.key] = source;
      fs.writeFileSync(sourcesFile, JSON.stringify(all));
    },
    async deleteSource(cardId, year, k) {
      const all = loadSources();
      if (all[key(cardId, year)]) delete all[key(cardId, year)][k];
      fs.writeFileSync(sourcesFile, JSON.stringify(all));
    },
    async deleteCard(cardId) {
      const id = cardId.toLowerCase();
      const cards = load();
      const sources = loadSources();
      for (const k of Object.keys(cards)) if (k.startsWith(`${id}:`)) delete cards[k];
      for (const k of Object.keys(sources)) if (k.startsWith(`${id}:`)) delete sources[k];
      fs.writeFileSync(file, JSON.stringify(cards, null, 2));
      fs.writeFileSync(sourcesFile, JSON.stringify(sources));
      const prefix = encodeURIComponent(`${id}:`);
      for (const f of fs.readdirSync(imgDir)) if (f.startsWith(prefix)) fs.rmSync(path.join(imgDir, f));
    },
    async getImage(key) {
      try { return fs.readFileSync(path.join(imgDir, `${encodeURIComponent(key)}.png`)); } catch { return null; }
    },
    async putImage(key, login, year, png) {
      fs.mkdirSync(imgDir, { recursive: true });
      const prefix = encodeURIComponent(`${login.toLowerCase()}:${year}:`);
      for (const f of fs.readdirSync(imgDir)) if (f.startsWith(prefix)) fs.rmSync(path.join(imgDir, f));
      fs.writeFileSync(path.join(imgDir, `${encodeURIComponent(key)}.png`), png);
    },
  };
}

// "Top 6%" style rank, only once enough people have counted for it to mean something.
export const MIN_RANKED = 50;
export async function topPercent(card) {
  const mine = card.verifiedAdditions ?? card.additions;
  if (!mine) return null;
  const { above, total } = await impl.rank(card.year, mine);
  if (total < MIN_RANKED) return null;
  const pct = Math.max(1, Math.ceil(((above + 1) / total) * 100));
  return pct <= 50 ? pct : null;
}

export const store = impl;
