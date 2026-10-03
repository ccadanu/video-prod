import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, productionWeekFor, todayJakarta, type DailyCard, type DayBoard } from '@ccp/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db';
import { hashPassword } from '../src/password';
import { openTestDb, resetDb } from './helpers';

const PASSWORD = 'Rahasia-123';
const WEEK = productionWeekFor(todayJakarta());
const DOC = 'https://docs.google.com/document/d/abc';
const DRIVE = 'https://drive.google.com/drive/folders/footage1';
const HDD = { storage: 'hdd', diskName: 'HDD-CCP-02', path: '/2026/Okt/Rabu/', fileName: 'clip_1.mp4' };

let db: Db;
let app: FastifyInstance;
let user: string, leader: string, admin: string, vg: string, editor: string;

async function addUser(email: string, role: string) {
  await db.query('INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)', [email, await hashPassword(PASSWORD), email.split('@')[0], role]);
}
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  return `ccp_sid=${res.cookies.find((c) => c.name === 'ccp_sid')!.value}`;
}
const call = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });

/** Membuat konten Weekly, menjadwalkan, lalu membawa pekan sampai Ready to Execute. */
async function readyWeek(specs: { judul: string; day: number; jenis?: string; talent?: string; lokasi?: string }[]): Promise<Record<string, number>> {
  const ids: Record<string, number> = {};
  for (const s of specs) {
    const res = await call(user, 'POST', '/api/briefs', {
      jenis: s.jenis ?? 'shooting_edit', kategori: 'Talking Head', produk: 'ASA', judul: s.judul, rasio: '9:16', durasiDetik: 30, linkDocs: DOC, catatan: '',
      attributes: { talent: s.talent ?? 'Rani', kostum: 'Casual', lokasi: s.lokasi ?? 'Kantor', lokasiDetail: '', properti: 'Box', desain: 'Tidak ada' },
    });
    ids[s.judul] = res.json().brief.id;
    await call(vg, 'PATCH', `/api/weekly/contents/${ids[s.judul]}`, { day: s.day });
  }
  expect((await call(vg, 'POST', `/api/weekly/${WEEK}/lock`)).statusCode).toBe(200);
  for (const i of (await call(leader, 'GET', `/api/weekly/${WEEK}`)).json().week.sdm) await call(leader, 'POST', `/api/weekly/sdm/${i.id}`, { ready: true });
  expect((await call(vg, 'POST', `/api/weekly/${WEEK}/ready`)).statusCode).toBe(200);
  return ids;
}
const board = async (day: number, cookie = vg): Promise<DayBoard> => (await call(cookie, 'GET', `/api/daily/${WEEK}/${day}`)).json().board;
const card = async (day: number, id: number): Promise<DailyCard | undefined> => (await board(day)).cards.find((c) => c.id === id);
const act = (id: number, what: string, body?: unknown, cookie = vg) => call(cookie, 'POST', `/api/daily/contents/${id}/${what}`, body);
const statusOf = async (id: number) => (await db.one<{ status: string }>('SELECT status FROM briefs WHERE id = $1', [id]))!.status;
const toFootage = async (id: number) => {
  expect((await act(id, 'start')).statusCode).toBe(200);
  expect((await act(id, 'finish')).statusCode).toBe(200);
};

beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
  app = await buildApp(db, { ...loadConfig({ NODE_ENV: 'test' }), allowedOrigins: [] });
  for (const [e, r] of [['user@x.test', 'user'], ['leader@x.test', 'leader'], ['admin@x.test', 'admin'], ['vg@x.test', 'videografer'], ['editor@x.test', 'editor']] as const) await addUser(e, r);
  const c = await Promise.all(['user@x.test', 'leader@x.test', 'admin@x.test', 'vg@x.test', 'editor@x.test'].map(login));
  [user, leader, admin, vg, editor] = c as [string, string, string, string, string];
});
afterEach(async () => {
  await app.close();
});

describe('board & akses', () => {
  it('VG, Leader, Admin melihat board; User dan Editor 403; hanya VG yang beraksi', async () => {
    const ids = await readyWeek([{ judul: 'A', day: 2 }]);
    for (const c of [vg, leader, admin]) expect((await call(c, 'GET', `/api/daily/${WEEK}/2`)).statusCode).toBe(200);
    for (const c of [user, editor]) expect((await call(c, 'GET', `/api/daily/${WEEK}/2`)).statusCode).toBe(403);
    for (const c of [leader, admin, user, editor]) expect((await act(ids.A!, 'start', undefined, c)).statusCode).toBe(403);
    expect((await call(vg, 'GET', `/api/daily/${WEEK}/7`)).statusCode).toBe(400);
    expect((await call(vg, 'GET', `/api/daily/2026-10-06/1`)).statusCode).toBe(400);
  });

  it('menampilkan konten Ready per kolom, ringkasan, jumlah per hari, dan panduan (shotlist/skrip) hari itu', async () => {
    await readyWeek([{ judul: 'Rabu 1', day: 2 }, { judul: 'Rabu 2', day: 2, talent: 'Bima' }, { judul: 'Kamis 1', day: 3 }]);
    await call(vg, 'PUT', `/api/weekly/${WEEK}/days/2/docs`, { kind: 'shotlist', url: DOC });
    const b = await board(2);
    expect(b).toMatchObject({ weekReady: true, day: 2, dayCounts: [0, 0, 2, 1, 0], summary: { total: 2, taken: 0, taking: 0, handed: 0, held: 0 } });
    expect(b.guide.shotlistUrl).toBe(DOC);
    expect(b.cards.map((c) => `${c.judul}:${c.column}`).sort()).toEqual(['Kamis 1:later', 'Rabu 1:belum', 'Rabu 2:belum']);
  });

  it('pekan yang belum Ready tidak menampilkan kartu', async () => {
    const res = await call(user, 'POST', '/api/briefs', { jenis: 'shooting_edit', kategori: 'Talking Head', produk: 'ASA', judul: 'Belum', rasio: '9:16', durasiDetik: 30, linkDocs: DOC, catatan: '', attributes: { talent: 'Rani', kostum: 'C', lokasi: 'Kantor', lokasiDetail: '', properti: 'B', desain: 'T' } });
    await call(vg, 'PATCH', `/api/weekly/contents/${res.json().brief.id}`, { day: 1 });
    const b = await board(1);
    expect(b.weekReady).toBe(false);
    expect(b.cards).toEqual([]);
  });
});

describe('alur take → footage → serah', () => {
  it('Shooting + Edit: start → finish → Drive → antrean Editor; PIC = VG; riwayat lengkap', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    expect((await act(A!, 'finish')).statusCode).toBe(409); // belum mulai
    await act(A!, 'start');
    expect((await card(2, A!))).toMatchObject({ column: 'sedang', status: 'syuting' });
    expect((await act(A!, 'start')).statusCode).toBe(409); // sudah mulai
    expect((await act(A!, 'handoff', { storage: 'drive', driveUrl: DRIVE })).statusCode).toBe(409); // footage belum siap
    await act(A!, 'finish');
    expect((await card(2, A!))?.column).toBe('footage');

    expect((await act(A!, 'handoff', { storage: 'drive', driveUrl: DRIVE })).statusCode).toBe(200);
    expect(await statusOf(A!)).toBe('antre_editing');
    const c = (await card(2, A!))!;
    expect(c).toMatchObject({ column: 'terkirim', route: 'editor', proof: { storage: 'drive', driveUrl: DRIVE, handedByName: 'vg' } });
    expect((await board(2)).summary).toMatchObject({ total: 1, taken: 1, handed: 1 });

    const detail = (await call(leader, 'GET', `/api/briefs/${A}`)).json().brief;
    expect(detail.pic).toBe('vg');
    expect(detail.history.slice(-5).map((h: { to: string; actorName: string | null }) => `${h.to}:${h.actorName}`)).toEqual([
      'validasi_sdm:vg', 'ready:vg', 'syuting:vg', 'footage_siap:vg', 'terkirim:vg',
    ].slice(0, 0).concat(['ready:vg', 'syuting:vg', 'footage_siap:vg', 'terkirim:vg', 'antre_editing:null']));
  });

  it('Shooting Only / Photoshoot: wajib Drive, langsung ke Review User yang bisa Approve', async () => {
    const ids = await readyWeek([{ judul: 'SO', day: 2, jenis: 'shooting_only' }, { judul: 'PS', day: 2, jenis: 'photoshoot' }]);
    await toFootage(ids.SO!);
    const hdd = await act(ids.SO!, 'handoff', HDD);
    expect(hdd.statusCode).toBe(409);
    expect(hdd.json().error.code).toBe('drive_required');
    expect(await statusOf(ids.SO!)).toBe('footage_siap');
    expect((await act(ids.SO!, 'handoff', { storage: 'drive', driveUrl: DRIVE })).statusCode).toBe(200);
    expect(await statusOf(ids.SO!)).toBe('in_review');
    expect((await card(2, ids.SO!))?.route).toBe('review');

    const approve = await call(user, 'POST', `/api/briefs/${ids.SO}/transition`, { to: 'complete' });
    expect(approve.json().brief.status).toBe('complete');
    await toFootage(ids.PS!);
    expect((await act(ids.PS!, 'handoff', { storage: 'drive', driveUrl: DRIVE })).statusCode).toBe(200);
  });

  it('Shooting + Edit boleh Hard Disk: nama disk, path, nama file (tanpa upload)', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    await toFootage(A!);
    expect((await act(A!, 'handoff', { storage: 'hdd', diskName: 'HDD', path: '', fileName: 'a.mp4' })).statusCode).toBe(400);
    expect((await act(A!, 'handoff', HDD)).statusCode).toBe(200);
    expect((await card(2, A!))?.proof).toMatchObject({ storage: 'hdd', diskName: 'HDD-CCP-02', path: '/2026/Okt/Rabu/', fileName: 'clip_1.mp4', driveUrl: null });
  });

  it('link Drive harus drive.google.com (docs.google.com dan situs lain ditolak)', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    await toFootage(A!);
    for (const bad of [DOC, 'https://evil.example/x', 'http://drive.google.com/x', '']) {
      expect((await act(A!, 'handoff', { storage: 'drive', driveUrl: bad })).statusCode, bad).toBe(400);
    }
    expect(await statusOf(A!)).toBe('footage_siap');
  });

  it('revisi User untuk Shooting Only kembali ke VG: take ulang lalu serah ulang menggantikan bukti lama', async () => {
    const { SO } = await readyWeek([{ judul: 'SO', day: 2, jenis: 'shooting_only' }]);
    await toFootage(SO!);
    await act(SO!, 'handoff', { storage: 'drive', driveUrl: DRIVE });
    await call(user, 'POST', `/api/briefs/${SO}/transition`, { to: 'revisi', reason: 'Audio bising' });
    expect((await card(2, SO!))).toMatchObject({ column: 'belum', status: 'revisi' });
    expect((await board(0)).cards.find((c) => c.id === SO)?.column).toBe('belum'); // tampil di hari mana pun
    await toFootage(SO!);
    const newUrl = 'https://drive.google.com/drive/folders/footage2';
    expect((await act(SO!, 'handoff', { storage: 'drive', driveUrl: newUrl })).statusCode).toBe(200);
    expect(await statusOf(SO!)).toBe('in_review');
    expect((await card(2, SO!))?.proof?.driveUrl).toBe(newUrl);
  });

  it('revisi Shooting + Edit tidak kembali ke board VG (jadi urusan Editor)', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    await toFootage(A!);
    await act(A!, 'handoff', { storage: 'drive', driveUrl: DRIVE });
    await db.query("UPDATE briefs SET status = 'revisi' WHERE id = $1", [A]);
    expect((await card(2, A!))?.column).toBe('terkirim');
    expect((await act(A!, 'start')).statusCode).toBe(409);
  });
});

describe('hold & resume', () => {
  it('hold wajib beralasan, memblokir aksi, tercatat di riwayat; resume melanjutkan', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    expect((await act(A!, 'hold', {})).statusCode).toBe(400);
    expect((await act(A!, 'hold', { reason: 'Talent terlambat 2 jam' })).statusCode).toBe(200);
    expect((await act(A!, 'hold', { reason: 'lagi' })).statusCode).toBe(409);
    expect((await card(2, A!))).toMatchObject({ holdReason: 'Talent terlambat 2 jam', column: 'belum' });
    expect((await board(2)).summary.held).toBe(1);
    expect((await act(A!, 'start')).statusCode).toBe(409);
    expect((await act(A!, 'pull', { day: 1 })).statusCode).toBe(409);

    await act(A!, 'resume');
    expect((await card(2, A!))?.holdReason).toBeNull();
    expect((await act(A!, 'resume')).statusCode).toBe(409);
    expect((await act(A!, 'start')).statusCode).toBe(200);
    const hist = (await call(user, 'GET', `/api/briefs/${A}`)).json().brief.history.map((h: { reason: string }) => h.reason);
    expect(hist).toEqual(expect.arrayContaining(['Hold: Talent terlambat 2 jam', 'Hold dilanjutkan (Resume)']));
  });

  it('konten yang sudah terkirim tidak bisa di-hold', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    await toFootage(A!);
    await act(A!, 'handoff', { storage: 'drive', driveUrl: DRIVE });
    expect((await act(A!, 'hold', { reason: 'x' })).statusCode).toBe(409);
  });
});

describe('reschedule, pull, tunda', () => {
  it('reschedule ke hari lain wajib beralasan; SDM pindah ke hari baru tanpa membatalkan Ready pekan', async () => {
    const { A, B } = await readyWeek([{ judul: 'A', day: 2, talent: 'Rani' }, { judul: 'B', day: 2, talent: 'Bima' }]);
    expect((await act(A!, 'reschedule', { day: 3 })).statusCode).toBe(400);
    expect((await act(A!, 'reschedule', { day: 2, reason: 'sama' })).statusCode).toBe(409);
    expect((await act(A!, 'reschedule', { day: 3, reason: 'Talent cancel' })).statusCode).toBe(200);

    expect((await card(2, A!))?.column).toBe('later'); // pada tampilan Rabu: pindah ke "Terjadwal Nanti"
    expect((await card(3, A!))?.column).toBe('belum');
    const items = (await call(leader, 'GET', `/api/weekly/${WEEK}`)).json().week;
    expect(items.sdm.map((i: { day: number; name: string; ready: boolean }) => `${i.day}:${i.name}:${i.ready}`).sort()).toEqual(['2:Bima:true', '3:Rani:false']);
    expect(items.readyAt).toBeTruthy(); // Ready pekan tidak dicabut oleh penyesuaian hari-H
    expect((await card(3, A!))?.sdmIssue).toBe(true); // tetapi kartu ditandai SDM hari baru belum Ready
    expect((await card(2, B!))?.sdmIssue).toBe(false);
  });

  it('reschedule dari Sedang Take membatalkan take; hold ikut hilang; yang sudah Footage Siap tidak bisa', async () => {
    const { A, B } = await readyWeek([{ judul: 'A', day: 2 }, { judul: 'B', day: 2, talent: 'Bima' }]);
    await act(A!, 'start');
    await act(A!, 'hold', { reason: 'listrik mati' });
    expect((await act(A!, 'reschedule', { day: 4, reason: 'Listrik mati seharian' })).statusCode).toBe(200);
    expect(await statusOf(A!)).toBe('ready');
    expect((await card(4, A!))).toMatchObject({ column: 'belum', holdReason: null });
    await toFootage(B!);
    expect((await act(B!, 'reschedule', { day: 4, reason: 'x' })).statusCode).toBe(409);
  });

  it('Pull to Today menarik konten hari berikutnya; hanya yang Ready dan lebih ke depan', async () => {
    const { A, B } = await readyWeek([{ judul: 'A', day: 3 }, { judul: 'B', day: 1, talent: 'Bima' }]);
    expect((await act(B!, 'pull', { day: 2 })).statusCode).toBe(409); // hari sebelumnya
    expect((await act(A!, 'pull', { day: 2 })).statusCode).toBe(200);
    expect((await card(2, A!))).toMatchObject({ column: 'belum', day: 2, fromDay: null });
    expect((await card(1, A!))?.column).toBe('later'); // dari sudut pandang Selasa, Rabu adalah "nanti"
    expect((await card(3, A!))).toMatchObject({ column: 'belum', fromDay: 2 }); // pada hari Kamis terbawa sebagai terlewat
    const hist = (await call(user, 'GET', `/api/briefs/${A}`)).json().brief.history.at(-1);
    expect(hist.reason).toMatch(/Ditarik ke hari ini: Kamis → Rabu/);
  });

  it('konten hari sebelumnya yang belum di-take tidak hilang: tampil "terlewat" di hari berikutnya', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 0 }]);
    const c = (await card(2, A!))!;
    expect(c).toMatchObject({ column: 'belum', fromDay: 0 });
    expect((await board(2)).summary.total).toBe(1);
  });

  it('tunda ke pekan depan (dari Belum Take maupun Sedang Take): kembali Listing, hari & hold dikosongkan', async () => {
    const { A, B } = await readyWeek([{ judul: 'A', day: 2 }, { judul: 'B', day: 2, talent: 'Bima' }]);
    await act(B!, 'start');
    expect((await act(A!, 'postpone', {})).statusCode).toBe(400);
    expect((await act(A!, 'postpone', { reason: 'Talent cuti' })).statusCode).toBe(200);
    expect((await act(B!, 'postpone', { reason: 'Cuaca' })).statusCode).toBe(200);
    for (const id of [A!, B!]) {
      const row = (await db.one<{ status: string; week_start: string; shoot_day: number | null; hold_reason: string | null }>('SELECT status, week_start, shoot_day, hold_reason FROM briefs WHERE id = $1', [id]))!;
      expect(row).toMatchObject({ status: 'listing', week_start: addDays(WEEK, 7), shoot_day: null, hold_reason: null });
    }
    expect((await board(2)).cards).toEqual([]);
    const sdm = (await call(leader, 'GET', `/api/weekly/${WEEK}`)).json().week.sdm;
    expect(sdm).toEqual([]);
  });

  it('Weekly Listing tidak boleh menunda konten yang sudah mulai syuting (hanya Daily Shooting)', async () => {
    const { A } = await readyWeek([{ judul: 'A', day: 2 }]);
    await act(A!, 'start');
    expect((await call(vg, 'POST', `/api/weekly/contents/${A}/postpone`, { reason: 'x' })).statusCode).toBe(409);
  });
});
