import { migrate, openDb, type Db } from '../src/db';

const TABLES = ['brief_drafts', 'brief_events', 'brief_attributes', 'brief_counters', 'briefs', 'audit_log', 'sessions', 'users'];

/**
 * Database uji. Default: Postgres tertanam (PGlite) di memori. Set TEST_DATABASE_URL untuk menguji terhadap
 * server Postgres sungguhan (CI memakainya). Isi tabel DIHAPUS tiap tes, jadi nama database wajib memuat "test".
 */
export async function openTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL ?? 'pglite::memory:';
  if (url.startsWith('postgres') && !/\/[^/?]*test[^/?]*(\?|$)/i.test(url)) {
    throw new Error('TEST_DATABASE_URL harus menunjuk database yang namanya memuat "test" (isinya akan dikosongkan).');
  }
  const db = await openDb(url);
  await migrate(db);
  return db;
}

export async function resetDb(db: Db): Promise<void> {
  await db.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}
