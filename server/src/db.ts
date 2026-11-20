import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { log } from './log.js';
import { APP_ROOT } from './root.js';

// BIGINT и NUMERIC приходят строками — переводим в числа (значения в игре небольшие)
pg.types.setTypeParser(20, (v) => parseInt(v, 10));
pg.types.setTypeParser(1700, (v) => parseFloat(v));

const url = process.env.DATABASE_URL;
if (!url) {
  log.error('DATABASE_URL не задан');
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: url,
  max: Number(process.env.PG_POOL_SIZE ?? 10),
  ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
});
pool.on('error', (e) => log.error('pg pool error', { message: e.message }));

export type Db = pg.PoolClient;

export async function tx<T>(fn: (c: Db) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Применяет SQL-миграции из server/migrations по порядку имён. Защищено advisory-замком от параллельного запуска. */
export async function migrate(): Promise<void> {
  const dir = path.join(APP_ROOT, 'server', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727001)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await c.query('BEGIN');
      try {
        await c.query(sql);
        await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        log.info('migration applied', { name: f });
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    c.release();
  }
}
