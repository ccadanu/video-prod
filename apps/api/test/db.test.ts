import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { productionWeekFor, todayJakarta } from '@ccp/shared';
import { loadConfig } from '../src/config';
import { migrate, openDb, splitSql } from '../src/db';

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

  it('timestamptz = string ISO, DATE = YYYY-MM-DD apa adanya, COUNT = number', async () => {
    const db = await openDb('pglite::memory:');
    const row = await db.one<{ at: unknown; d: unknown; n: unknown }>("SELECT '2026-10-03 10:00:00+07'::timestamptz AS at, DATE '2026-10-05' AS d, COUNT(*) AS n");
    expect(row).toEqual({ at: '2026-10-03T03:00:00.000Z', d: '2026-10-05', n: 1 });
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

describe('upgrade migrasi', () => {
  it('003 mengisi pekan produksi brief lama persis seperti hitungan aplikasi (batas hari WIB)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    for (const f of ['001_init.sql', '002_briefs.sql']) cpSync(join(__dirname, '..', 'migrations', f), join(dir, f));
    const db = await openDb('pglite::memory:');
    expect(await migrate(db, dir)).toEqual(['001_init.sql', '002_briefs.sql']);

    await db.query("INSERT INTO users (email, password_hash, name, role) VALUES ('u@x.test', 'x', 'U', 'user')");
    // Kamis; Sabtu malam UTC (= Minggu dini hari WIB); Minggu sore UTC (= Senin dini hari WIB, pekan berikutnya)
    const times = ['2026-10-01T03:00:00Z', '2026-10-03T20:00:00Z', '2026-10-04T18:00:00Z', '2026-10-05T03:00:00Z'];
    for (const [i, t] of times.entries()) {
      await db.query(
        `INSERT INTO briefs (code, requester_id, jenis, kategori, produk, judul, rasio, link_docs, status, submitted_at)
         VALUES ($1, 1, $2, 'Talking Head', 'ASA', 'J', '9:16', 'https://docs.google.com/x', 'listing', $3)`,
        [`VID-${i}`, i === 3 ? 'motion' : 'shooting_edit', t],
      );
    }
    expect(await migrate(db)).toEqual(['003_weekly.sql', '004_daily.sql', '005_editing.sql']);

    const rows = await db.query<{ code: string; week_start: string | null; bobot: string }>('SELECT code, week_start, bobot FROM briefs ORDER BY id');
    for (const [i, t] of times.slice(0, 3).entries()) {
      expect(rows[i]!.week_start, t).toBe(productionWeekFor(todayJakarta(new Date(t))));
    }
    expect(rows[3]!.week_start).toBeNull(); // Daily tidak punya pekan produksi
    expect(rows.every((r) => r.bobot === 'gampang')).toBe(true);
    await db.close();
  });
});
