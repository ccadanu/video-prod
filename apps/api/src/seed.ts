import { SAMPLE_BRIEFS, SAMPLE_EDITING, SAMPLE_EVAL_COMMENTS, SAMPLE_FGD, isWeekly, sampleCycles, sampleHistory, SAMPLE_QUEUE, SAMPLE_REVIEW_FOOTAGE, addDays, briefInputSchema, mondayOf, nextWorkday, productionWeekFor, routeOf, sampleExecution, sampleWeekly, suggestDue, todayJakarta, type Status } from '@ccp/shared';
import { insertBrief } from './briefs';
import { createCycle } from './evaluation';
import { syncSdm } from './weekly';
import { loadConfig } from './config';
import { migrate, openDb } from './db';
import { hashPassword } from './password';

const config = loadConfig();

if (config.env === 'production' && process.env.SEED_ADMIN_EMAIL === undefined) {
  console.error('Seed demo dinonaktifkan di production. Untuk membuat admin awal set SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD.');
  process.exit(1);
}

const db = await openDb(config.databaseUrl);
await migrate(db);

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
        { email: 'rara@ccp.local', name: 'Rara', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', password: DEMO_PASSWORD },
        { email: 'gilang@ccp.local', name: 'Gilang', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', password: DEMO_PASSWORD },
        { email: 'tika@ccp.local', name: 'Tika', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', password: DEMO_PASSWORD },
        { email: 'bayu@ccp.local', name: 'Bayu', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', password: DEMO_PASSWORD },
        { email: 'arya@ccp.local', name: 'Arya Akbar Subakti', role: 'user', unit: 'Marketing', jabatan: 'Marketing Staff', password: DEMO_PASSWORD },
        { email: 'sari@ccp.local', name: 'Sari Wulandari', role: 'user', unit: 'Sales', jabatan: 'Sales Executive', password: DEMO_PASSWORD },
        { email: 'budi@ccp.local', name: 'Budi Santoso', role: 'user', unit: 'Operasional', jabatan: 'Staff Operasional', password: DEMO_PASSWORD },
        { email: 'maya@ccp.local', name: 'Maya Putri', role: 'user', unit: 'Marketing', jabatan: 'Brand Executive', password: DEMO_PASSWORD },
      ];

let created = 0;
for (const u of demo) {
  if (u.password.length < 8) {
    console.error(`Password untuk ${u.email} minimal 8 karakter.`);
    process.exit(1);
  }
  const rows = await db.query(
    'INSERT INTO users (email, password_hash, name, role, unit, jabatan) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id',
    [u.email, await hashPassword(u.password), u.name, u.role, u.unit, u.jabatan],
  );
  created += rows.length;
}


const userIdOf = async (email: string) => (await db.one<{ id: number }>('SELECT id FROM users WHERE lower(email) = $1', [email]))?.id ?? null;

/** Menempelkan kondisi editing (editor, jadwal, langkah, versi hasil) pada brief contoh. */
async function seedEditing(briefId: number, ed: (typeof SAMPLE_EDITING)[string]): Promise<void> {
  const eid = await userIdOf(`${ed.editor}@ccp.local`);
  if (eid === null) return;
  const row = await db.one<{ jenis: Parameters<typeof suggestDue>[0] }>('SELECT jenis FROM briefs WHERE id = $1', [briefId]);
  const start = nextWorkday(todayJakarta());
  await db.query(
    `UPDATE briefs SET editor_id = $2, pic_id = $2, edit_bobot = $3, edit_scheduled_for = $4, edit_due = $5, edit_started_at = $6 WHERE id = $1`,
    [briefId, eid, ed.bobot, ed.done ? addDays(start, -3) : start, ed.done ? addDays(start, -1) : suggestDue(row!.jenis, start), ed.started || ed.done ? new Date().toISOString() : null],
  );
  for (const key of ed.steps ?? []) await db.query('INSERT INTO edit_steps (brief_id, step_key, done_by) VALUES ($1, $2, $3)', [briefId, key, eid]);
  for (let v = 1; v <= (ed.versions ?? 0); v++) {
    await db.query('INSERT INTO deliverables (brief_id, version, url, note, submitted_by) VALUES ($1, $2, $3, $4, $5)', [
      briefId, v, `https://drive.google.com/file/d/hasil-${briefId}-v${v}/view`, v > 1 ? 'Perbaikan sesuai catatan revisi' : '', eid,
    ]);
  }
}

// Brief contoh (dev saja) untuk pemohon demo, hanya bila belum ada brief.
let briefsCreated = 0;
if (config.env !== 'production') {
  const requester = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'arya@ccp.local'");
  const existing = (await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM briefs'))!.n;
  if (requester && existing === 0) {
    const prevWeek = addDays(productionWeekFor(todayJakarta()), -7);
    for (const [idx, s] of [...SAMPLE_BRIEFS].reverse().entries()) {
      const weekly = s.jenis === 'shooting_only' || s.jenis === 'shooting_edit' || s.jenis === 'photoshoot';
      const input = briefInputSchema.parse({
        jenis: s.jenis, kategori: s.kategori, produk: s.produk, judul: s.judul, rasio: s.rasio, durasiDetik: s.durasiDetik,
        linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
        attributes: weekly ? { talent: 'Cewek muda', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box product', desain: 'Tidak ada' } : null,
      });
      const day = 86_400_000;
      const submittedAt = new Date(Date.now() - s.daysAgo * day);
      const briefId = await insertBrief(db, {
        requesterId: requester.id, input, status: s.status, actorId: requester.id, submittedAt,
        revisionCount: s.revisionCount ?? 0, reason: s.reason ?? '',
        completedAt: s.status === 'complete' ? new Date(submittedAt.getTime() + day) : null,
        // Weekly yang sudah melewati tahap perencanaan berasal dari pekan sebelumnya dan punya hari syuting.
        ...(weekly && !['listing', 'backlog', 'pending_review'].includes(s.status)
          ? { weekly: { weekStart: prevWeek, bobot: 'gampang' as const, day: idx % 5, fuProperti: '', fuKostum: '', fuDesain: '' } }
          : {}),
      });
      briefsCreated++;
      const ed = SAMPLE_EDITING[s.judul];
      if (ed) await seedEditing(briefId, ed);
      if ((SAMPLE_REVIEW_FOOTAGE as readonly string[]).includes(s.judul)) {
        const vg = await userIdOf('hardi@ccp.local');
        await db.query('INSERT INTO footage_handoffs (brief_id, storage, drive_url, handed_by) VALUES ($1, $2, $3, $4)', [briefId, 'drive', `https://drive.google.com/drive/folders/review-${briefId}`, vg]);
      }
    }
  }
}

// Satu pekan Weekly Listing berisi konten contoh (belum dikunci) agar alur Locking → Ready bisa dicoba.
let weeklyCreated = 0;
if (config.env !== 'production') {
  const requester = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'arya@ccp.local'");
  const week = productionWeekFor(todayJakarta());
  const existing = (await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM briefs WHERE judul = $1', [sampleWeekly()[0]!.judul]))!.n;
  if (requester && existing === 0) {
    for (const s of sampleWeekly()) {
      const input = briefInputSchema.parse({
        jenis: s.jenis, kategori: s.kategori, produk: s.produk, judul: s.judul, rasio: s.rasio, durasiDetik: s.durasiDetik,
        linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
        attributes: { talent: s.talent, kostum: s.kostum, lokasi: s.lokasi, lokasiDetail: '', properti: s.properti, desain: s.desain },
      });
      await insertBrief(db, {
        requesterId: requester.id, input, status: 'listing', actorId: requester.id,
        weekly: { weekStart: week, bobot: s.bobot, day: s.day, fuProperti: s.fuProperti, fuKostum: s.fuKostum, fuDesain: s.fuDesain },
      });
      weeklyCreated++;
    }
  }
}

// Pekan yang sedang berjalan (Ready to Execute) untuk mencoba Daily Shooting.
let execCreated = 0;
if (config.env !== 'production') {
  const requester = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'arya@ccp.local'");
  const vgUser = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'hardi@ccp.local'");
  const leaderUser = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'leader@ccp.local'");
  const week = mondayOf(todayJakarta());
  const marker = sampleExecution()[0]!.judul;
  const exists = (await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM briefs WHERE judul = $1', [marker]))!.n;
  if (requester && vgUser && leaderUser && exists === 0) {
    for (const [i, x] of sampleExecution().entries()) {
      const input = briefInputSchema.parse({
        jenis: x.jenis, kategori: x.kategori, produk: x.produk, judul: x.judul, rasio: x.rasio, durasiDetik: x.durasiDetik,
        linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
        attributes: { talent: x.talent, kostum: 'Casual', lokasi: x.lokasi, lokasiDetail: '', properti: 'Box produk', desain: 'Tidak ada' },
      });
      const next: Status = routeOf(x.jenis) === 'editor' ? 'antre_editing' : 'in_review';
      const status: Status = x.state === 'ready' ? 'ready' : x.state === 'syuting' ? 'syuting' : x.state === 'footage' ? 'footage_siap' : next;
      const id = await insertBrief(db, {
        requesterId: requester.id, input, status, actorId: requester.id, submittedAt: new Date(Date.now() - 7 * 86_400_000),
        weekly: { weekStart: week, bobot: x.bobot, day: x.day, fuProperti: '', fuKostum: '', fuDesain: '' },
      });
      if (x.state !== 'ready') await db.query('UPDATE briefs SET pic_id = $2 WHERE id = $1', [id, vgUser.id]);
      if (x.hold) await db.query('UPDATE briefs SET hold_reason = $2 WHERE id = $1', [id, x.hold]);
      if (x.state === 'handed') {
        await db.query(
          'INSERT INTO footage_handoffs (brief_id, storage, drive_url, disk_name, path, file_name, handed_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          x.storage === 'hdd'
            ? [id, 'hdd', null, 'HDD-CCP-02', `/${week.slice(0, 4)}/Okt/${['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'][x.day]}/`, `clip_${i + 1}.mp4`, vgUser.id]
            : [id, 'drive', `https://drive.google.com/drive/folders/contoh-${i + 1}`, null, null, null, vgUser.id],
        );
      }
      execCreated++;
    }
    await db.query('INSERT INTO weekly_weeks (week_start, locked_at, locked_by, ready_at, ready_by) VALUES ($1, now(), $2, now(), $2) ON CONFLICT (week_start) DO UPDATE SET locked_at = now(), locked_by = $2, ready_at = now(), ready_by = $2', [week, vgUser.id]);
    await syncSdm(db, week);
    await db.query('UPDATE sdm_items SET ready = TRUE, ready_by = $2, ready_at = now() WHERE week_start = $1', [week, leaderUser.id]);
    for (let d = 0; d < 5; d++) {
      await db.query(
        `INSERT INTO weekly_day_docs (week_start, day, shotlist_url, shotlist_by, shotlist_at, skrip_url, skrip_by, skrip_at, talent_reconfirmed_by, talent_reconfirmed_at)
         VALUES ($1, $2, $3, $4, now(), $5, $4, now(), $6, now()) ON CONFLICT DO NOTHING`,
        [week, d, `https://docs.google.com/document/d/shotlist-${d}`, vgUser.id, `https://docs.google.com/document/d/skrip-${d}`, leaderUser.id],
      );
    }
  }
}

// Antrean editing: konten Daily yang sudah lolos validasi dan menunggu Leader meng-assign editor.
let queueCreated = 0;
if (config.env !== 'production') {
  const requester = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'arya@ccp.local'");
  const exists = (await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM briefs WHERE judul = $1', [SAMPLE_QUEUE[0]!.judul]))!.n;
  if (requester && exists === 0) {
    for (const q of SAMPLE_QUEUE) {
      const input = briefInputSchema.parse({
        jenis: q.jenis, kategori: q.kategori, produk: q.produk, judul: q.judul, rasio: q.rasio, durasiDetik: q.durasiDetik,
        linkDocs: 'https://docs.google.com/document/d/contoh', catatan: q.catatan, attributes: null,
      });
      await insertBrief(db, { requesterId: requester.id, input, status: 'antre_editing', actorId: requester.id, submittedAt: new Date(Date.now() - q.daysAgo * 86_400_000) });
      queueCreated++;
    }
  }
}

// Riwayat ±3 bulan (konten selesai, SLA, revisi) dan siklus evaluasi agar Dashboard, KPI, dan Blind Review berisi.
let historyCreated = 0;
if (config.env !== 'production') {
  const history = sampleHistory();
  const exists = (await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM briefs WHERE judul = $1', [history[0]!.judul]))!.n;
  const leaderRow = await db.one<{ id: number }>("SELECT id FROM users WHERE lower(email) = 'leader@ccp.local'");
  if (exists === 0 && leaderRow) {
    const ids = new Map<string, number>();
    for (const u of ['sari', 'budi', 'maya', 'hardi', 'yofa', 'bayu', 'dio', 'rara', 'gilang', 'tika']) ids.set(u, (await userIdOf(`${u}@ccp.local`))!);
    const briefIds: number[] = [];
    for (const x of history) {
      const weekly = isWeekly(x.jenis);
      const input = briefInputSchema.parse({
        jenis: x.jenis, kategori: x.kategori, produk: x.produk, judul: x.judul, rasio: x.rasio, durasiDetik: x.durasiDetik,
        linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
        attributes: weekly ? { talent: 'Rani', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box produk', desain: 'Tidak ada' } : null,
      });
      const requesterId = ids.get(x.requester)!;
      const id = await insertBrief(db, {
        requesterId, input, status: 'complete', actorId: requesterId, submittedAt: new Date(x.submittedAt), completedAt: new Date(x.completedAt), revisionCount: x.revisions,
        ...(x.shoot ? { weekly: { weekStart: x.shoot.weekStart, bobot: x.shootBobot, day: x.shoot.day, fuProperti: '', fuKostum: '', fuDesain: '' } } : {}),
      });
      briefIds.push(id);
      const vgId = x.vg ? ids.get(x.vg)! : null;
      const editorId = x.editor ? ids.get(x.editor)! : null;
      await db.query('UPDATE briefs SET pic_id = $2, editor_id = $3, edit_due = $4, edit_scheduled_for = $4, edit_bobot = $5 WHERE id = $1', [id, editorId ?? vgId, editorId, x.edit?.due ?? null, x.editBobot]);
      if (x.shoot && vgId) {
        await db.query('INSERT INTO footage_handoffs (brief_id, storage, drive_url, handed_by, handed_at) VALUES ($1, $2, $3, $4, $5)', [id, 'drive', `https://drive.google.com/drive/folders/riwayat-${id}`, vgId, x.shoot.handedAt]);
      }
      if (x.edit && editorId) {
        await db.query('INSERT INTO deliverables (brief_id, version, url, note, submitted_by, submitted_at) VALUES ($1, 1, $2, $3, $4, $5)', [id, `https://drive.google.com/file/d/riwayat-${id}/view`, '', editorId, x.edit.deliveredAt]);
      }
      historyCreated++;
    }
    // Siklus evaluasi: yang lama ditutup dengan jawaban, yang berjalan terbuka (User contoh diundang).
    const cycles = sampleCycles();
    for (const [ci, c] of [...cycles].reverse().entries()) {
      const cycleId = await createCycle(db, leaderRow.id, { name: c.name, periodStart: c.periodStart, periodEnd: c.periodEnd });
      if (c.status === 'open') continue;
      const inWindow = history.map((x, i) => ({ x, id: briefIds[i]! })).filter(({ x }) => x.completedAt.slice(0, 10) >= c.periodStart && x.completedAt.slice(0, 10) <= c.periodEnd);
      const respondents = new Set<string>();
      for (const { x, id } of inWindow) {
        if (x.rating === null) continue;
        await db.query('INSERT INTO eval_responses (cycle_id, brief_id, rating) VALUES ($1, $2, $3)', [cycleId, id, x.rating]);
        respondents.add(x.requester);
      }
      for (const name of respondents) await db.query('UPDATE eval_invites SET submitted_at = now() WHERE cycle_id = $1 AND user_id = $2', [cycleId, ids.get(name)!]);
      if (respondents.size >= 3) {
        for (const kind of ['good', 'improve'] as const) {
          for (let k = 0; k < 2; k++) await db.query('INSERT INTO eval_comments (cycle_id, kind, body) VALUES ($1, $2, $3)', [cycleId, kind, SAMPLE_EVAL_COMMENTS[kind][(ci + k) % SAMPLE_EVAL_COMMENTS[kind].length]]);
        }
      }
      await db.query("UPDATE eval_cycles SET status = 'closed', closed_at = $2 WHERE id = $1", [cycleId, `${c.periodEnd}T09:00:00Z`]);
      if (ci === cycles.length - 2) {
        await db.query('UPDATE eval_cycles SET fgd_notes = $2, fgd_at = $3 WHERE id = $1', [cycleId, SAMPLE_FGD.notes, c.periodEnd]);
        for (const a of SAMPLE_FGD.actions) await db.query('INSERT INTO eval_actions (cycle_id, text, done, created_by) VALUES ($1, $2, $3, $4)', [cycleId, a.text, a.done, leaderRow.id]);
      }
    }
  }
}
console.log(`Seed selesai: ${created} pengguna baru, ${briefsCreated} brief contoh, ${weeklyCreated} konten pekan Weekly Listing, ${execCreated} konten pekan berjalan, ${queueCreated} konten antrean editing, ${historyCreated} konten riwayat.`);
if (config.env !== 'production') console.log(`Login demo: <email>@ccp.local / ${DEMO_PASSWORD}`);
await db.close();
