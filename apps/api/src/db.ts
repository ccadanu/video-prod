import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

/** Menjalankan berkas migrations/NNN_nama.sql yang belum pernah diterapkan, berurutan. */
export function migrate(db: Db, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name));
  const applied: string[] = [];
  for (const file of readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();
    applied.push(file);
  }
  return applied;
}

export function audit(
  db: Db,
  actorId: number | null,
  action: string,
  entity = '',
  entityId: string | number = '',
  detail: Record<string, unknown> = {},
): void {
  db.prepare('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)').run(
    actorId,
    action,
    entity,
    String(entityId),
    JSON.stringify(detail),
  );
}
