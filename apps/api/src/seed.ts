import { SAMPLE_BRIEFS, briefInputSchema } from '@ccp/shared';
import { insertBrief } from './briefs';
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

// Brief contoh (dev saja) untuk pemohon demo, hanya bila belum ada brief.
let briefsCreated = 0;
if (config.env !== 'production') {
  const requester = db.prepare("SELECT id FROM users WHERE email = 'arya@ccp.local'").get() as { id: number } | undefined;
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM briefs').get() as { n: number }).n;
  if (requester && existing === 0) {
    for (const s of [...SAMPLE_BRIEFS].reverse()) {
      const weekly = s.jenis === 'shooting_only' || s.jenis === 'shooting_edit' || s.jenis === 'photoshoot';
      const input = briefInputSchema.parse({
        jenis: s.jenis, kategori: s.kategori, produk: s.produk, judul: s.judul, rasio: s.rasio, durasiDetik: s.durasiDetik,
        linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
        attributes: weekly ? { talent: 'Cewek muda', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box product', desain: 'Tidak ada' } : null,
      });
      const day = 86_400_000;
      const submittedAt = new Date(Date.now() - s.daysAgo * day);
      insertBrief(db, {
        requesterId: requester.id, input, status: s.status, actorId: requester.id, submittedAt,
        revisionCount: s.revisionCount ?? 0, reason: s.reason ?? '',
        completedAt: s.status === 'complete' ? new Date(submittedAt.getTime() + day) : null,
      });
      briefsCreated++;
    }
  }
}
console.log(`Seed selesai: ${created} pengguna baru, ${briefsCreated} brief contoh.`);
if (config.env !== 'production') console.log(`Login demo: <email>@ccp.local / ${DEMO_PASSWORD}`);
db.close();
