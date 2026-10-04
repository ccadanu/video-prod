import { buildApp } from './app';
import { loadConfig } from './config';
import { bootstrapAdmin } from './bootstrap';
import { migrate, openDb } from './db';
import { purgeExpiredSessions } from './sessions';

const config = loadConfig();
const db = await openDb(config.databaseUrl);
const applied = await migrate(db);
const app = await buildApp(db, config);

if (applied.length) app.log.info({ applied }, 'migrasi diterapkan');
const boot = await bootstrapAdmin(db);
if (boot === 'created') app.log.warn('Admin awal dibuat dari BOOTSTRAP_ADMIN_*. Segera login, ganti kata sandi, lalu hapus variabel tersebut.');
await purgeExpiredSessions(db);
setInterval(() => void purgeExpiredSessions(db).catch((e) => app.log.error(e)), 3_600_000).unref();

const shutdown = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: process.env.HOST ?? '127.0.0.1' });
