import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { openDb, splitSql } from '../src/db';

describe('splitSql', () => {
  it('memecah per pernyataan, mengabaikan komentar dan ; di dalam kutip', () => {
    const sql = `-- komentar ; dengan titik koma
CREATE TABLE a (x TEXT DEFAULT 'a;b'); -- sisa baris
INSERT INTO a (x) VALUES ('it''s -- bukan komentar');

SELECT 1`;
    expect(splitSql(sql)).toEqual([
      "CREATE TABLE a (x TEXT DEFAULT 'a;b')",
      "INSERT INTO a (x) VALUES ('it''s -- bukan komentar')",
      'SELECT 1',
    ]);
  });
});

describe('lapisan database', () => {
  it('transaksi di-rollback saat galat dan di-commit saat berhasil', async () => {
    const db = await openDb('pglite::memory:');
    await db.exec('CREATE TABLE t (n INTEGER)');
    await expect(
      db.transaction(async (tx) => {
        await tx.query('INSERT INTO t VALUES (1)');
        throw new Error('batal');
      }),
    ).rejects.toThrow('batal');
    expect(await db.query('SELECT * FROM t')).toEqual([]);
    await db.transaction((tx) => tx.query('INSERT INTO t VALUES (2)'));
    expect(await db.query('SELECT n FROM t')).toEqual([{ n: 2 }]);
    await db.close();
  });

  it('timestamptz selalu string ISO dan COUNT berupa number', async () => {
    const db = await openDb('pglite::memory:');
    const row = await db.one<{ at: unknown; n: unknown }>("SELECT '2026-10-03 10:00:00+07'::timestamptz AS at, COUNT(*) AS n");
    expect(row).toEqual({ at: '2026-10-03T03:00:00.000Z', n: 1 });
    await db.close();
  });

  it('menolak DATABASE_URL yang tidak dikenal', async () => {
    await expect(openDb('mysql://x')).rejects.toThrow(/postgres/);
  });
});

describe('konfigurasi', () => {
  it('production wajib punya DATABASE_URL (tidak diam-diam memakai database tertanam)', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://u:p@h/db' }).databaseUrl).toBe('postgres://u:p@h/db');
    expect(loadConfig({ NODE_ENV: 'development' }).databaseUrl).toMatch(/^pglite:/);
  });

  it('cookie SameSite=None otomatis Secure', () => {
    const c = loadConfig({ NODE_ENV: 'development', COOKIE_SAMESITE: 'none' });
    expect(c).toMatchObject({ cookieSameSite: 'none', cookieSecure: true });
  });
});
