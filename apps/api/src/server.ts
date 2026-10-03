import { buildApp } from './app';
import { loadConfig } from './config';
import { migrate, openDb } from './db';
import { purgeExpiredSessions } from './sessions';

const config = loadConfig();
const db = openDb(config.databasePath);
const applied = migrate(db);
const app = await buildApp(db, config);

if (applied.length) app.log.info({ applied }, 'migrasi diterapkan');
purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db), 3_600_000).unref();

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: process.env.HOST ?? '127.0.0.1' });
