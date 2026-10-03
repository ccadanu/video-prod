import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, productionWeekFor, todayJakarta, type WeekDto } from '@ccp/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db';
import { hashPassword } from '../src/password';
import { openTestDb, resetDb } from './helpers';

const PASSWORD = 'Rahasia-123';
const WEEK = productionWeekFor(todayJakarta());
const NEXT_WEEK = addDays(WEEK, 7);
const DOC = 'https://docs.google.com/document/d/abc';

let db: Db;
let app: FastifyInstance;
let user: string, user2: string, leader: string, admin: string, vg: string, editor: string;

async function addUser(email: string, role: string) {
  await db.query('INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)', [email, await hashPassword(PASSWORD), email.split('@')[0], role]);
}
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  return `ccp_sid=${res.cookies.find((c) => c.name === 'ccp_sid')!.value}`;
}
const call = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });

const attrs = (o: Record<string, string> = {}) => ({ talent: 'Rani', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box', desain: 'Tidak ada', ...o });
async function mk(cookie: string, o: { judul?: string; jenis?: string; attributes?: Record<string, string> } = {}): Promise<number> {
  const res = await call(cookie, 'POST', '/api/briefs', {
    jenis: o.jenis ?? 'shooting_edit', kategori: 'Talking Head', produk: 'ASA', judul: o.judul ?? 'Konten', rasio: '9:16', durasiDetik: 30,
    linkDocs: DOC, catatan: '', attributes: attrs(o.attributes),
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json().brief.id;
}
const getWeek = async (cookie: string, week = WEEK): Promise<WeekDto> => (await call(cookie, 'GET', `/api/weekly/${week}`)).json().week;
const patch = (id: number, body: object, cookie = vg) => call(cookie, 'PATCH', `/api/weekly/contents/${id}`, body);
const lock = (cookie = vg, week = WEEK) => call(cookie, 'POST', `/api/weekly/${week}/lock`);
const ready = (cookie = vg, week = WEEK) => call(cookie, 'POST', `/api/weekly/${week}/ready`);
const sdmToggle = (id: number, value: boolean, cookie = leader) => call(cookie, 'POST', `/api/weekly/sdm/${id}`, { ready: value });
const markAllSdm = async () => {
  for (const i of (await getWeek(leader)).sdm) expect((await sdmToggle(i.id, true)).statusCode).toBe(200);
};
const statusOf = async (id: number) => (await db.one<{ status: string }>('SELECT status FROM briefs WHERE id = $1', [id]))!.status;

beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
  app = await buildApp(db, { ...loadConfig({ NODE_ENV: 'test' }), allowedOrigins: [] });
  for (const [e, r] of [['user@x.test', 'user'], ['user2@x.test', 'user'], ['leader@x.test', 'leader'], ['admin@x.test', 'admin'], ['vg@x.test', 'videografer'], ['editor@x.test', 'editor']] as const) {
    await addUser(e, r);
  }
  const cookies = await Promise.all(['user@x.test', 'user2@x.test', 'leader@x.test', 'admin@x.test', 'vg@x.test', 'editor@x.test'].map(login));
  [user, user2, leader, admin, vg, editor] = cookies as [string, string, string, string, string, string];
});
afterEach(async () => {
  await app.close();
});

describe('penempatan & akses', () => {
  it('brief Weekly masuk pekan produksi berikutnya; Daily dan Backlog tidak tampil', async () => {
    const a = await mk(user, { judul: 'Weekly A' });
    await call(user, 'POST', '/api/briefs', { jenis: 'motion', kategori: 'Infografis', produk: 'ASA', judul: 'Daily', rasio: '1:1', durasiDetik: 10, linkDocs: DOC, catatan: '', attributes: null });
    const w = await getWeek(vg);
    expect(w.contents.map((c) => c.judul)).toEqual(['Weekly A']);
    expect(w.contents[0]).toMatchObject({ id: a, status: 'listing', day: null, bobot: 'gampang', talent: 'Rani' });
    expect(w.label).toMatch(/Pekan \d$/);
    expect(w.lockingDay).toBe(addDays(WEEK, -2));
    expect((await getWeek(vg, NEXT_WEEK)).contents).toEqual([]);
  });

  it('pekan harus tanggal Senin; Editor 403; tanpa login 401', async () => {
    expect((await call(vg, 'GET', `/api/weekly/${addDays(WEEK, 1)}`)).statusCode).toBe(400);
    expect((await call(vg, 'GET', '/api/weekly/besok')).statusCode).toBe(400);
    expect((await call(editor, 'GET', `/api/weekly/${WEEK}`)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/weekly/${WEEK}` })).statusCode).toBe(401);
  });

  it('User hanya melihat miliknya, tanpa kapasitas, SDM, dan dokumen; Leader/Admin/VG melihat semua', async () => {
    await mk(user, { judul: 'Milik 1' });
    await mk(user2, { judul: 'Milik 2' });
    const mine = await getWeek(user);
    expect(mine.contents.map((c) => c.judul)).toEqual(['Milik 1']);
    expect(mine.sdm).toEqual([]);
    expect(mine.days.every((d) => d.slots === null && d.capacity === null && d.shotlistUrl === null)).toBe(true);
    expect(mine.progress.pendingLock).toBe(2); // progres tingkat pekan tetap utuh
    for (const c of [leader, admin, vg]) expect((await getWeek(c)).contents).toHaveLength(2);
  });

  it('hanya VG yang mengubah/mengunci; Leader, User, Admin ditolak', async () => {
    const id = await mk(user);
    for (const c of [leader, user, admin, editor]) {
      expect((await patch(id, { bobot: 'susah' }, c)).statusCode).toBe(403);
      expect((await lock(c)).statusCode).toBe(403);
      expect((await ready(c)).statusCode).toBe(403);
    }
  });
});

describe('Locking (sebelum disepakati)', () => {
  it('VG bebas menimpa atribut, bobot, dan hari tanpa alasan; belum ada SDM', async () => {
    const id = await mk(user);
    const res = await patch(id, { talent: 'dr. Aji', bobot: 'susah', day: 2, fuProperti: 'Teko keramik' });
    expect(res.statusCode).toBe(200);
    const c = res.json().week.contents[0];
    expect(c).toMatchObject({ talent: 'dr. Aji', bobot: 'susah', day: 2, fuProperti: 'Teko keramik', status: 'listing' });
    expect(res.json().week.sdm).toEqual([]);
    expect(res.json().week.days[2]).toMatchObject({ count: 1, slots: 2, capacity: 15 });
  });

  it('input tidak valid ditolak', async () => {
    const id = await mk(user);
    expect((await patch(id, { day: 5 })).statusCode).toBe(400);
    expect((await patch(id, { bobot: 'sedang' })).statusCode).toBe(400);
    expect((await patch(id, { talent: ' ' })).statusCode).toBe(400);
    expect((await patch(id, { lokasi: 'Lainnya' })).statusCode).toBe(400);
    expect((await patch(id, { lokasi: 'Lainnya', lokasiDetail: 'Rumah talent' })).statusCode).toBe(200);
    expect((await patch(999999, { bobot: 'susah' })).statusCode).toBe(404);
  });

  it('kapasitas dihitung dalam slot, bukan jumlah konten (Jumat 7, Senin 15)', async () => {
    const a = await mk(user);
    const b = await mk(user);
    await patch(a, { day: 4, bobot: 'susah' });
    await patch(b, { day: 4, bobot: 'susah' });
    const w = await getWeek(vg);
    expect(w.days[4]).toMatchObject({ count: 2, slots: 4, capacity: 7 });
    expect(w.days[0]).toMatchObject({ count: 0, slots: 0, capacity: 15 });
  });
});

describe('Locking Disepakati → kebutuhan SDM', () => {
  it('mengunci semua konten Listing dan menurunkan SDM per hari; Kantor & properti standar tidak jadi item', async () => {
    const a = await mk(user, { judul: 'A', attributes: { talent: 'Rani', lokasi: 'Studio' } });
    const b = await mk(user, { judul: 'B', attributes: { talent: 'rani', lokasi: 'Kantor' } });
    const c = await mk(user, { judul: 'C', attributes: { talent: 'Bima', lokasi: 'Kantor' } });
    await patch(a, { day: 0, fuDesain: 'Frame design' });
    await patch(b, { day: 0 });
    await patch(c, { day: 1, fuKostum: 'Kebaya' });
    const res = await lock();
    expect(res.statusCode).toBe(200);
    const w: WeekDto = res.json().week;
    expect(w.contents.map((x) => x.status)).toEqual(['validasi_sdm', 'validasi_sdm', 'validasi_sdm']);
    expect(w.lockedAt).toBeTruthy();
    expect(w.lockedByName).toBe('vg');

    const items = w.sdm.map((i) => `${i.day}:${i.type}:${i.name.toLowerCase()}:${i.contentCount}:${i.ready}`);
    // Diurutkan per hari lalu jenis. Hari 0: talent "Rani" dipakai A dan B (tanpa membedakan huruf besar/kecil) → 1 item, 2 konten.
    expect(items).toEqual(['0:desain:frame design:1:false', '0:lokasi:studio:1:false', '0:talent:rani:2:false', '1:kostum:kebaya:1:false', '1:talent:bima:1:false']);
    expect(w.days[0]).toMatchObject({ sdmTotal: 3, sdmReady: 0, docsOpen: false });
    expect(w.progress.steps).toEqual([true, true, false, false]); // semua terjadwal, SDM belum Ready
  });

  it('konten ditandai bermasalah (sdmIssue) selama item SDM-nya belum Ready', async () => {
    const id = await mk(user);
    await patch(id, { day: 3 });
    await lock();
    expect((await getWeek(vg)).contents[0]!.sdmIssue).toBe(true);
    await markAllSdm();
    expect((await getWeek(vg)).contents[0]!.sdmIssue).toBe(false);
  });

  it('tanpa konten Listing → 409; riwayat konten mencatat perubahan status', async () => {
    expect((await lock()).statusCode).toBe(409);
    const id = await mk(user);
    await lock();
    expect((await lock()).statusCode).toBe(409);
    const hist = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief.history;
    expect(hist.at(-1)).toMatchObject({ from: 'listing', to: 'validasi_sdm', actorName: 'vg' });
  });
});

describe('Ready to Execute', () => {
  it('ditolak dengan alasan jelas: belum dikunci, ada konten tanpa hari, SDM belum Ready', async () => {
    const a = await mk(user);
    const b = await mk(user, { attributes: { talent: 'Bima' } });
    expect((await ready()).json().error.message).toMatch(/belum dikunci/);
    await patch(a, { day: 0 });
    await lock();
    expect((await ready()).json().error.message).toMatch(/1 konten tanpa hari/);
    await patch(b, { day: 1, reason: 'jadwal disusun' });
    expect((await ready()).json().error.message).toMatch(/SDM yang belum Ready/);
  });

  it('hanya Leader yang menandai SDM; setelah semua Ready, VG menandai pekan Ready dan konten menjadi ready', async () => {
    const a = await mk(user);
    await patch(a, { day: 0 });
    await lock();
    const item = (await getWeek(vg)).sdm[0]!;
    expect((await sdmToggle(item.id, true, vg)).statusCode).toBe(403);
    expect((await sdmToggle(item.id, true, user)).statusCode).toBe(403);
    expect((await sdmToggle(9999, true)).statusCode).toBe(404);
    await markAllSdm();

    const w: WeekDto = (await getWeek(vg));
    expect(w.progress).toMatchObject({ steps: [true, true, true, false], canMarkReady: true });
    expect(w.sdm.every((i) => i.ready && i.readyByName === 'leader')).toBe(true);

    const done: WeekDto = (await ready()).json().week;
    expect(done.progress.steps).toEqual([true, true, true, true]);
    expect(done.readyByName).toBe('vg');
    expect(done.contents[0]!.status).toBe('ready');
    expect((await ready()).statusCode).toBe(409); // sudah Ready
  });

  it('pekan yang semuanya Kantor (tanpa SDM) langsung bisa Ready', async () => {
    const a = await mk(user, { attributes: { talent: 'Tidak ada', lokasi: 'Kantor' } });
    await patch(a, { day: 2 });
    await lock();
    expect((await getWeek(vg)).sdm).toEqual([]);
    expect((await ready()).statusCode).toBe(200);
  });
});

describe('penyesuaian setelah Locking (Field Adjustment)', () => {
  async function lockedOnDay0() {
    const id = await mk(user, { attributes: { talent: 'Rani', lokasi: 'Studio' } });
    await patch(id, { day: 0 });
    await lock();
    return id;
  }

  it('ganti hari/atribut wajib beralasan; bobot tidak; tercatat di riwayat brief', async () => {
    const id = await lockedOnDay0();
    expect((await patch(id, { day: 1 })).statusCode).toBe(400);
    expect((await patch(id, { talent: 'Bima' })).statusCode).toBe(400);
    expect((await patch(id, { bobot: 'susah' })).statusCode).toBe(200);
    const res = await patch(id, { day: 1, reason: 'Talent baru bisa Selasa' });
    expect(res.statusCode).toBe(200);
    const hist = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief.history;
    expect(hist.at(-1).reason).toMatch(/hari: Senin → Selasa.*Talent baru bisa Selasa/);
  });

  it('SDM ikut pindah hari; item yang tidak dibutuhkan lagi dihapus, status Ready item yang tetap dipertahankan', async () => {
    const id = await lockedOnDay0();
    const [talent] = (await getWeek(leader)).sdm.filter((i) => i.type === 'talent');
    await sdmToggle(talent!.id, true);
    await patch(id, { lokasi: 'Kantor', reason: 'Pindah ke kantor' });
    const w = await getWeek(leader);
    expect(w.sdm.map((i) => `${i.day}:${i.type}:${i.ready}`)).toEqual(['0:talent:true']); // lokasi Studio hilang, talent tetap Ready
    await patch(id, { day: 3, reason: 'Geser' });
    expect((await getWeek(leader)).sdm.map((i) => `${i.day}:${i.type}:${i.ready}`)).toEqual(['3:talent:false']); // hari baru = item baru
  });

  it('mengganti talent setelah pekan Ready membatalkan Ready (konten kembali ke validasi SDM)', async () => {
    const id = await lockedOnDay0();
    await markAllSdm();
    expect((await ready()).statusCode).toBe(200);
    expect(await statusOf(id)).toBe('ready');

    await patch(id, { talent: 'Bima', reason: 'Rani sakit' });
    const w = await getWeek(vg);
    expect(w.readyAt).toBeNull();
    expect(w.contents[0]!.status).toBe('validasi_sdm');
    expect(w.sdm.find((i) => i.name === 'Bima')!.ready).toBe(false);
    const hist = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief.history.map((h: { to: string; reason: string }) => `${h.to}|${h.reason}`);
    expect(hist.some((h: string) => h.startsWith('validasi_sdm|Ready dibatalkan'))).toBe(true);
  });

  it('Leader menandai "Tidak Ready" setelah pekan Ready juga membatalkan Ready', async () => {
    const id = await lockedOnDay0();
    await markAllSdm();
    await ready();
    const item = (await getWeek(leader)).sdm[0]!;
    await sdmToggle(item.id, false);
    expect(await statusOf(id)).toBe('validasi_sdm');
    expect((await getWeek(vg)).readyAt).toBeNull();
  });

  it('konten yang sudah masuk produksi tidak bisa diubah dari Weekly Listing', async () => {
    const id = await lockedOnDay0();
    await db.query("UPDATE briefs SET status = 'syuting' WHERE id = $1", [id]);
    expect((await patch(id, { bobot: 'susah' })).statusCode).toBe(409);
  });

  it('konten susulan (disubmit setelah Locking) menunggu dikunci dan membuka kembali validasi SDM', async () => {
    const first = await lockedOnDay0();
    await markAllSdm();
    await ready();
    const late = await mk(user, { judul: 'Susulan', attributes: { talent: 'Cindo', lokasi: 'Studio' } });
    await patch(late, { day: 0 });
    let w = await getWeek(vg);
    expect(w.progress).toMatchObject({ pendingLock: 1, canLock: true, canMarkReady: false });
    expect(w.progress.steps[0]).toBe(false);
    expect(await statusOf(first)).toBe('ready'); // konten lama tidak terganggu

    await lock();
    w = await getWeek(vg);
    expect(await statusOf(late)).toBe('validasi_sdm');
    expect(w.readyAt).toBeNull(); // item SDM baru (Cindo) belum Ready → Ready dibuka lagi
    expect(await statusOf(first)).toBe('validasi_sdm');
  });
});

describe('tunda & kembalikan', () => {
  it('tunda ke pekan depan wajib beralasan: kembali Listing, hari dikosongkan, SDM disinkronkan', async () => {
    const id = await mk(user);
    await patch(id, { day: 1 });
    await lock();
    expect((await call(vg, 'POST', `/api/weekly/contents/${id}/postpone`, {})).statusCode).toBe(400);
    const res = await call(vg, 'POST', `/api/weekly/contents/${id}/postpone`, { reason: 'Talent cuti' });
    expect(res.statusCode).toBe(200);
    expect(res.json().week.contents).toEqual([]);
    expect(res.json().week.sdm).toEqual([]);
    const next = await getWeek(vg, NEXT_WEEK);
    expect(next.contents[0]).toMatchObject({ id, status: 'listing', day: null });
    const hist = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief.history.at(-1);
    expect(hist.reason).toMatch(/Ditunda ke .*Talent cuti/);
  });

  it('kembalikan ke User (Backlog): hanya sebelum dikunci, wajib beralasan; User bisa kirim ulang', async () => {
    const id = await mk(user);
    expect((await call(vg, 'POST', `/api/weekly/contents/${id}/return`, {})).statusCode).toBe(400);
    expect((await call(user, 'POST', `/api/weekly/contents/${id}/return`, { reason: 'x' })).statusCode).toBe(403);
    const res = await call(leader, 'POST', `/api/weekly/contents/${id}/return`, { reason: 'Naskah belum ada' });
    expect(res.statusCode).toBe(200);
    expect(res.json().week.contents).toEqual([]);
    expect(await statusOf(id)).toBe('backlog');

    const back = await call(user, 'POST', `/api/briefs/${id}/transition`, { to: 'listing' });
    expect(back.json().brief.status).toBe('listing');
    expect((await getWeek(vg)).contents.map((c) => c.id)).toEqual([id]);

    await lock();
    expect((await call(vg, 'POST', `/api/weekly/contents/${id}/return`, { reason: 'x' })).statusCode).toBe(409);
  });
});

describe('Shotlist, Skrip, dan konfirmasi ulang talent', () => {
  async function readyDay0() {
    const id = await mk(user);
    await patch(id, { day: 0 });
    await lock();
    return id;
  }
  const doc = (kind: 'shotlist' | 'skrip', url = DOC, day = 0, cookie = vg) => call(cookie, 'PUT', `/api/weekly/${WEEK}/days/${day}/docs`, { kind, url });

  it('terkunci sampai semua SDM hari itu Ready; link harus Google; hanya VG', async () => {
    await readyDay0();
    expect((await doc('shotlist')).statusCode).toBe(409);
    await markAllSdm();
    expect((await doc('shotlist', 'https://evil.example/x')).statusCode).toBe(400);
    expect((await doc('shotlist', DOC, 0, leader)).statusCode).toBe(403);
    expect((await doc('shotlist', DOC, 9)).statusCode).toBe(400);
    expect((await doc('shotlist', DOC, 3)).statusCode).toBe(409); // hari tanpa konten terkunci

    const res = await doc('shotlist');
    expect(res.statusCode).toBe(200);
    await doc('skrip', 'https://drive.google.com/file/d/2');
    const d = (await getWeek(leader)).days[0]!;
    expect(d).toMatchObject({ docsOpen: true, shotlistUrl: DOC, shotlistByName: 'vg', skripUrl: 'https://drive.google.com/file/d/2' });
  });

  it('Leader mengonfirmasi ulang talent H-1: hanya bila ada talent; User tidak', async () => {
    await readyDay0();
    const re = (day: number, cookie = leader) => call(cookie, 'POST', `/api/weekly/${WEEK}/days/${day}/reconfirm-talent`);
    expect((await re(0, vg)).statusCode).toBe(403);
    expect((await re(0, user)).statusCode).toBe(403);
    expect((await re(2)).statusCode).toBe(409);
    const res = await re(0);
    expect(res.statusCode).toBe(200);
    expect(res.json().week.days[0]).toMatchObject({ talentReconfirmedByName: 'leader' });
    expect(res.json().week.days[0].talentReconfirmedAt).toBeTruthy();
  });
});
