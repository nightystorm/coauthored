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
  };
} else {
  const { fileURLToPath } = await import('node:url');
  const file = fileURLToPath(new URL('../data/cards.json', import.meta.url));
  fs.mkdirSync(path.dirname(file), { recursive: true });
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
  };
}

export const store = impl;
