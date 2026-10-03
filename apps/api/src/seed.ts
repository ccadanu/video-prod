import { loadConfig } from './config';
import { migrate, openDb } from './db';
import { hashPassword } from './password';

const config = loadConfig();

if (config.env === 'production' && process.env.SEED_ADMIN_EMAIL === undefined) {
  console.error('Seed demo dinonaktifkan di production. Untuk membuat admin awal set SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD.');
  process.exit(1);
}

const db = openDb(config.databasePath);
migrate(db);

const DEMO_PASSWORD = 'Ccp#Demo2026';
const demo =
  config.env === 'production'
    ? [{
        email: process.env.SEED_ADMIN_EMAIL!,
        name: 'Admin',
        role: 'admin',
        unit: 'CCP',
        jabatan: 'Admin',
        password: process.env.SEED_ADMIN_PASSWORD ?? '',
      }]
    : [
        { email: 'admin@ccp.local', name: 'Admin CCP', role: 'admin', unit: 'CCP', jabatan: 'Admin', password: DEMO_PASSWORD },
        { email: 'leader@ccp.local', name: 'Nadia Pratama', role: 'leader', unit: 'CCP', jabatan: 'Leader Produksi', password: DEMO_PASSWORD },
        { email: 'hardi@ccp.local', name: 'Hardi', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', password: DEMO_PASSWORD },
        { email: 'yofa@ccp.local', name: 'Yofa', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', password: DEMO_PASSWORD },
        { email: 'dio@ccp.local', name: 'Dio', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', password: DEMO_PASSWORD },
        { email: 'arya@ccp.local', name: 'Arya Akbar Subakti', role: 'user', unit: 'Marketing', jabatan: 'Marketing Staff', password: DEMO_PASSWORD },
      ];

const insert = db.prepare(
  'INSERT OR IGNORE INTO users (email, password_hash, name, role, unit, jabatan) VALUES (?, ?, ?, ?, ?, ?)',
);
let created = 0;
for (const u of demo) {
  if (u.password.length < 8) {
    console.error(`Password untuk ${u.email} minimal 8 karakter.`);
    process.exit(1);
  }
  created += insert.run(u.email, await hashPassword(u.password), u.name, u.role, u.unit, u.jabatan).changes;
}
console.log(`Seed selesai: ${created} pengguna baru.`);
if (config.env !== 'production') console.log(`Login demo: <email>@ccp.local / ${DEMO_PASSWORD}`);
db.close();
