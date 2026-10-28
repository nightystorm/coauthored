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
    // How many people with lines this year counted more than `additions`.
    async rank(year, additions) {
      const r = await pool.query(
        `select count(*) filter (where (data->>'additions')::bigint > $2)::int as above,
                count(*)::int as total
         from cards where year = $1 and (data->>'additions')::bigint > 0`,
        [year, additions],
      );
      return r.rows[0];
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
      const peers = Object.values(load()).filter((c) => c.year === year && c.additions > 0);
      return { above: peers.filter((c) => c.additions > additions).length, total: peers.length };
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
  if (!card.additions) return null;
  const { above, total } = await impl.rank(card.year, card.additions);
  if (total < MIN_RANKED) return null;
  const pct = Math.max(1, Math.ceil(((above + 1) / total) * 100));
  return pct <= 50 ? pct : null;
}

export const store = impl;
