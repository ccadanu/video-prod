import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Lapisan akses data. Seluruh aplikasi hanya bergantung pada `Db`/`Queryable` (SQL Postgres + placeholder $1, $2…),
 * bukan pada driver. Mengganti server database = mengganti DATABASE_URL.
 *
 *   postgres://user:pass@host:5432/db   server Postgres mana pun (internal, Docker, layanan terkelola) lewat `pg`
 *   pglite:data/pgdata                  Postgres sungguhan di dalam proses (WASM), tanpa instalasi: untuk dev/tes
 *   pglite::memory:                     sama, di memori
 */
export type Row = Record<string, unknown>;

export interface Queryable {
  /** Menjalankan SQL berparameter dan mengembalikan baris hasil. */
  query<T = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Baris pertama, atau undefined. */
  one<T = Row>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
}

export interface Db extends Queryable {
  /** Menjalankan beberapa pernyataan SQL sekaligus (tanpa parameter), mis. berkas migrasi. */
  exec(sql: string): Promise<void>;
  /** COMMIT bila `fn` selesai, ROLLBACK bila melempar galat. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const OID = { INT8: 20, DATE: 1082, TIMESTAMPTZ: 1184 } as const;
const toIso = (v: string) => new Date(v).toISOString();
const toNumber = (v: string) => Number(v);
const keep = (v: string) => v; // DATE tetap 'YYYY-MM-DD' (tanpa konversi zona waktu)

function queryable(run: (sql: string, params: readonly unknown[]) => Promise<Row[]>): Queryable {
  const query = (async (sql: string, params: readonly unknown[] = []) => run(sql, params)) as Queryable['query'];
  return { query, one: async (sql, params = []) => (await query(sql, params))[0] as never };
}

function openPg(url: string): Db {
  // Timestamp selalu ISO-8601 (string) dan bigint (mis. COUNT) menjadi number, apa pun versi server.
  const types = {
    getTypeParser: (oid: number, format?: 'text' | 'binary') => {
      if (oid === OID.TIMESTAMPTZ) return toIso;
      if (oid === OID.DATE) return keep;
      if (oid === OID.INT8) return toNumber;
      return pg.types.getTypeParser(oid, format as 'text');
    },
  };
  const pool = new pg.Pool({ connectionString: url, types: types as pg.CustomTypesConfig, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  const base = queryable(async (sql, params) => (await pool.query(sql, params as unknown[])).rows as Row[]);
  return {
    ...base,
    exec: async (sql) => void (await pool.query(sql)),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(queryable(async (sql, params) => (await client.query(sql, params as unknown[])).rows as Row[]));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openPglite(location: string): Promise<Db> {
  let mod: typeof import('@electric-sql/pglite');
  try {
    mod = await import('@electric-sql/pglite');
  } catch {
    throw new Error('DATABASE_URL pglite: membutuhkan paket @electric-sql/pglite (devDependency). Di production pakai DATABASE_URL=postgres://…');
  }
  if (location !== ':memory:') mkdirSync(location, { recursive: true });
  const db = new mod.PGlite(location === ':memory:' ? undefined : location);
  await db.waitReady;
  // Parser kustom di PGlite berlaku per query (sama hasilnya dengan driver pg: timestamp = string ISO, date = 'YYYY-MM-DD', bigint = number).
  const opts = { parsers: { [mod.types.TIMESTAMPTZ]: toIso, [mod.types.INT8]: toNumber, [mod.types.DATE]: keep } };
  const wrap = (q: { query: (sql: string, params?: unknown[], options?: typeof opts) => Promise<{ rows: unknown[] }> }) =>
    queryable(async (sql, params) => (await q.query(sql, params as unknown[], opts)).rows as Row[]);
  return {
    ...wrap(db),
    exec: async (sql) => void (await db.exec(sql)),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
  };
}

export async function openDb(url: string): Promise<Db> {
  if (url.startsWith('pglite:')) return openPglite(url.slice('pglite:'.length) || ':memory:');
  if (/^postgres(ql)?:\/\//.test(url)) return openPg(url);
  throw new Error('DATABASE_URL harus berupa postgres://… atau pglite:<folder>');
}

/** Menjalankan berkas migrations/NNN_nama.sql yang belum diterapkan, berurutan, dalam satu transaksi. */
export async function migrate(db: Db, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  return db.transaction(async (tx) => {
    // Kunci advisory: dua instance yang start bersamaan tidak menjalankan migrasi dobel.
    await tx.query('SELECT pg_advisory_xact_lock(727274)');
    await tx.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const done = new Set((await tx.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
    const applied: string[] = [];
    for (const file of readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
      if (done.has(file)) continue;
      // Pernyataan dipisah agar bekerja sama di semua driver (tanpa parameter, tanpa pernyataan `;` di dalam string).
      for (const stmt of splitSql(readFileSync(join(dir, file), 'utf8'))) await tx.query(stmt);
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.push(file);
    }
    return applied;
  });
}

/** Memecah skrip SQL per pernyataan; mengabaikan komentar `--` dan tanda `;` di dalam kutip. */
export function splitSql(script: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote = false;
  for (const line of script.split('\n')) {
    let l = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === "'") quote = !quote;
      if (!quote && c === '-' && line[i + 1] === '-') break;
      l += c;
    }
    cur += `${l}\n`;
    if (!quote && l.trimEnd().endsWith(';')) {
      out.push(cur.trim().replace(/;$/, ''));
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

export async function audit(
  q: Queryable,
  actorId: number | null,
  action: string,
  entity = '',
  entityId: string | number = '',
  detail: Record<string, unknown> = {},
): Promise<void> {
  await q.query('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)', [
    actorId, action, entity, String(entityId), JSON.stringify(detail),
  ]);
}
