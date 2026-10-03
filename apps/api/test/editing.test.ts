import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, addWorkdays, mondayOf, nextWorkday, todayJakarta, type EditCard, type EditingSchedule, type EditorBoard } from '@ccp/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db';
import { hashPassword } from '../src/password';
import { openTestDb, resetDb } from './helpers';

const PASSWORD = 'Rahasia-123';
const DOC = 'https://docs.google.com/document/d/abc';
const OUT = 'https://drive.google.com/file/d/hasil/view';
const START = nextWorkday(todayJakarta());
const DUE = addWorkdays(START, 1);

let db: Db;
let app: FastifyInstance;
let user: string, leader: string, admin: string, vg: string, dio: string, rara: string;
let dioId: number, raraId: number;

async function addUser(email: string, role: string): Promise<number> {
  const rows = await db.query<{ id: number }>('INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id', [email, await hashPassword(PASSWORD), email.split('@')[0], role]);
  return rows[0]!.id;
}
async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  return `ccp_sid=${res.cookies.find((c) => c.name === 'ccp_sid')!.value}`;
}
const call = (cookie: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });

/** Brief Daily yang sudah lolos validasi Leader (antrean editing). */
async function queued(judul: string, jenis = 'motion'): Promise<number> {
  const res = await call(user, 'POST', '/api/briefs', { jenis, kategori: 'Infografis', produk: 'ASA', judul, rasio: '1:1', durasiDetik: 15, linkDocs: DOC, catatan: '', attributes: null });
  const id = res.json().brief.id as number;
  expect((await call(leader, 'POST', `/api/briefs/${id}/transition`, { to: 'antre_editing' })).statusCode).toBe(200);
  return id;
}
const input = (o: Record<string, unknown> = {}) => ({ editorId: dioId, scheduledFor: START, dueDate: DUE, bobot: 'gampang', priority: 'normal', ...o });
const assign = (id: number, o: Record<string, unknown> = {}, cookie = leader) => call(cookie, 'POST', `/api/editing/contents/${id}/assign`, input(o));
const act = (id: number, what: string, body?: unknown, cookie = dio) => call(cookie, 'POST', `/api/editing/contents/${id}/${what}`, body);
const schedule = async (cookie = leader): Promise<EditingSchedule> => (await call(cookie, 'GET', '/api/editing/schedule')).json().schedule;
const board = async (cookie = dio, q = ''): Promise<EditorBoard> => (await call(cookie, 'GET', `/api/editing/board${q}`)).json().board;
const cardOf = async (id: number, cookie = dio): Promise<EditCard | undefined> => (await board(cookie)).cards.find((c) => c.id === id);
const statusOf = async (id: number) => (await db.one<{ status: string }>('SELECT status FROM briefs WHERE id = $1', [id]))!.status;
const doSteps = async (id: number, keys: string[], cookie = dio) => {
  for (const key of keys) expect((await act(id, 'step', { key, done: true }, cookie)).statusCode).toBe(200);
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
  await addUser('user@x.test', 'user');
  await addUser('leader@x.test', 'leader');
  await addUser('admin@x.test', 'admin');
  await addUser('vg@x.test', 'videografer');
  dioId = await addUser('dio@x.test', 'editor');
  raraId = await addUser('rara@x.test', 'editor');
  [user, leader, admin, vg, dio, rara] = (await Promise.all(['user', 'leader', 'admin', 'vg', 'dio', 'rara'].map((n) => login(`${n}@x.test`)))) as [string, string, string, string, string, string];
});
afterEach(async () => {
  await app.close();
});

describe('akses', () => {
  it('Schedule: Leader dan Admin; yang lain 403. Assign hanya Leader', async () => {
    const id = await queued('A');
    for (const c of [leader, admin]) expect((await call(c, 'GET', '/api/editing/schedule')).statusCode).toBe(200);
    for (const c of [user, vg, dio]) expect((await call(c, 'GET', '/api/editing/schedule')).statusCode).toBe(403);
    for (const c of [admin, user, vg, dio]) expect((await assign(id, {}, c)).statusCode).toBe(403);
  });

  it('Board: Editor, Leader, Admin; User dan VG 403. Aksi editor hanya Editor', async () => {
    const id = await queued('A');
    await assign(id);
    for (const c of [dio, leader, admin]) expect((await call(c, 'GET', '/api/editing/board')).statusCode).toBe(200);
    for (const c of [user, vg]) expect((await call(c, 'GET', '/api/editing/board')).statusCode).toBe(403);
    for (const c of [leader, admin, user, vg]) expect((await act(id, 'start', undefined, c)).statusCode).toBe(403);
  });
});

describe('antrean & assign', () => {
  it('antrean berurut FIFO; konten Prioritas dahulu; memuat asal (Daily/Syuting)', async () => {
    const a = await queued('Pertama');
    const b = await queued('Kedua', 'editing_only');
    const c = await queued('Ketiga', 'full_ai');
    expect((await schedule()).queue.map((x) => x.id)).toEqual([a, b, c]);
    expect((await schedule()).queue.every((x) => x.origin === 'daily')).toBe(true);
    // prioritas ditetapkan saat assign, jadi uji urutan komparator lewat editor yang di-assign: antrean tetap FIFO
    expect((await schedule()).summary).toMatchObject({ antre: 3, terjadwal: 0, berjalan: 0 });
  });

  it('assign: Antre → Editing, PIC = editor, jadwal & bobot tersimpan, ada riwayat', async () => {
    const id = await queued('A');
    expect((await assign(id, { bobot: 'susah', priority: 'tinggi' })).statusCode).toBe(200);
    expect(await statusOf(id)).toBe('editing');
    const s = await schedule();
    expect(s.queue).toEqual([]);
    expect(s.assigned[0]).toMatchObject({ id, editorId: dioId, editorName: 'dio', scheduledFor: START, dueDate: DUE, bobot: 'susah', priority: 'tinggi', column: 'todo' });
    const detail = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief;
    expect(detail.pic).toBe('dio');
    expect(detail.history.at(-1)).toMatchObject({ from: 'antre_editing', to: 'editing' });
    expect(detail.history.at(-1).reason).toContain('Assign: dio');
  });

  it('beban editor per hari dihitung dalam slot (Gampang 1, Susah 2) dan kapasitas 6', async () => {
    const a = await queued('A');
    const b = await queued('B');
    await assign(a, { bobot: 'gampang' });
    await assign(b, { bobot: 'susah' });
    const s = await schedule();
    const dio_ = s.editors.find((e) => e.id === dioId)!;
    expect(s.capacity).toBe(6);
    expect(dio_.slots[s.days.indexOf(START)]).toBe(3);
    expect(s.editors.find((e) => e.id === raraId)!.slots.every((n) => n === 0)).toBe(true);
    expect(s.days).toHaveLength(10);
    expect(s.days[0]).toBe(mondayOf(todayJakarta()));
  });

  it('validasi: editor harus ber-peran editor & aktif; tanggal harus hari kerja; tenggat tidak sebelum mulai', async () => {
    const id = await queued('A');
    const vgId = (await db.one<{ id: number }>("SELECT id FROM users WHERE email = 'vg@x.test'"))!.id;
    expect((await assign(id, { editorId: vgId })).statusCode).toBe(400);
    await db.query('UPDATE users SET active = FALSE WHERE id = $1', [raraId]);
    expect((await assign(id, { editorId: raraId })).statusCode).toBe(400);
    const saturday = addDays(mondayOf(START), 5);
    expect((await assign(id, { scheduledFor: saturday })).statusCode).toBe(400);
    expect((await assign(id, { dueDate: addDays(START, -1) })).json().error.message).toMatch(/Tenggat/);
    expect((await assign(id, { editorId: 99999 })).statusCode).toBe(400);
    expect(await statusOf(id)).toBe('antre_editing');
  });

  it('assign ulang mengubah editor/jadwal tanpa mengubah status; ganti editor mengembalikan ke To Do', async () => {
    const id = await queued('A');
    await assign(id);
    await act(id, 'start');
    expect((await cardOf(id))?.column).toBe('progress');
    expect((await assign(id, { editorId: raraId, scheduledFor: DUE, dueDate: DUE })).statusCode).toBe(200);
    expect(await statusOf(id)).toBe('editing');
    expect(await cardOf(id)).toBeUndefined(); // sudah bukan milik Dio
    expect(await cardOf(id, rara)).toMatchObject({ column: 'todo', scheduledFor: DUE });
  });

  it('konten yang bukan di antrean/editing (mis. Pending Review) tidak bisa di-assign; Shooting Only tidak lewat Editor', async () => {
    const res = await call(user, 'POST', '/api/briefs', { jenis: 'motion', kategori: 'Infografis', produk: 'ASA', judul: 'P', rasio: '1:1', durasiDetik: 15, linkDocs: DOC, catatan: '', attributes: null });
    expect((await assign(res.json().brief.id)).statusCode).toBe(409);
    const so = await call(user, 'POST', '/api/briefs', { jenis: 'shooting_only', kategori: 'Talking Head', produk: 'ASA', judul: 'S', rasio: '9:16', durasiDetik: 30, linkDocs: DOC, catatan: '', attributes: { talent: 'R', kostum: 'C', lokasi: 'Kantor', lokasiDetail: '', properti: 'B', desain: 'T' } });
    expect((await assign(so.json().brief.id)).statusCode).toBe(404);
  });
});

describe('alur editor', () => {
  it('To Do → Mulai Edit → centang langkah → kirim → In Review (versi 1) → User melihat bahan review', async () => {
    const id = await queued('A');
    await assign(id);
    expect(await cardOf(id)).toMatchObject({ column: 'todo', steps: expect.any(Array) });
    expect((await act(id, 'step', { key: 'klip', done: true })).statusCode).toBe(409); // belum mulai
    expect((await act(id, 'start')).statusCode).toBe(200);
    expect((await act(id, 'start')).statusCode).toBe(409);
    expect((await cardOf(id))?.column).toBe('progress');
    expect((await act(id, 'step', { key: 'ngawur', done: true })).statusCode).toBe(400);
    await doSteps(id, ['aset', 'klip']);
    expect((await cardOf(id))?.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['aset', 'klip']);

    const bad = await act(id, 'submit', { url: OUT });
    expect(bad.statusCode).toBe(409);
    expect(bad.json().error.code).toBe('selfqc_required');
    await doSteps(id, ['selfqc']);
    expect((await act(id, 'submit', { url: 'https://example.com/x' })).statusCode).toBe(400);
    expect((await act(id, 'submit', { url: OUT, note: 'Versi pertama' })).statusCode).toBe(200);
    expect(await statusOf(id)).toBe('in_review');
    expect(await cardOf(id)).toMatchObject({ column: 'review', versions: [{ version: 1, url: OUT, note: 'Versi pertama' }] });

    const detail = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief;
    expect(detail.reviewMaterial).toMatchObject({ source: 'editor', version: 1, url: OUT });
    expect((await act(id, 'submit', { url: OUT })).statusCode).toBe(409); // sudah In Review
  });

  it('centang bisa dibatalkan; Editor lain tidak bisa mengerjakan konten orang lain', async () => {
    const id = await queued('A');
    await assign(id);
    await act(id, 'start');
    await doSteps(id, ['klip']);
    await act(id, 'step', { key: 'klip', done: false });
    expect((await cardOf(id))?.steps.some((s) => s.done)).toBe(false);
    for (const what of ['start', 'step', 'submit']) expect((await act(id, what, { key: 'klip', done: true, url: OUT }, rara)).statusCode).toBe(403);
  });

  it('revisi dari User: kembali ke Editor yang sama (To Do + alasan), Self-QC/export dibuka lagi, kirim = versi 2', async () => {
    const id = await queued('A');
    await assign(id);
    await act(id, 'start');
    await doSteps(id, ['aset', 'klip', 'selfqc', 'export']);
    await act(id, 'submit', { url: OUT });
    expect((await call(user, 'POST', `/api/briefs/${id}/transition`, { to: 'revisi', reason: 'Teks harga salah' })).statusCode).toBe(200);
    const c = await cardOf(id);
    expect(c).toMatchObject({ column: 'todo', status: 'revisi', revisionReason: 'Teks harga salah', revisionCount: 1 });
    expect((await act(id, 'start', undefined, rara)).statusCode).toBe(403);
    expect((await act(id, 'start')).statusCode).toBe(200);
    expect(await statusOf(id)).toBe('editing');
    expect((await cardOf(id))?.steps.filter((s) => s.done).map((s) => s.key)).toEqual(['aset', 'klip']);
    expect((await act(id, 'submit', { url: OUT })).statusCode).toBe(409); // Self-QC harus diulang
    await doSteps(id, ['selfqc']);
    expect((await act(id, 'submit', { url: 'https://drive.google.com/file/d/v2/view', note: 'Perbaikan harga' })).statusCode).toBe(200);
    const detail = (await call(user, 'GET', `/api/briefs/${id}`)).json().brief;
    expect(detail.reviewMaterial).toMatchObject({ version: 2, note: 'Perbaikan harga' });
    expect((await call(user, 'POST', `/api/briefs/${id}/transition`, { to: 'complete' })).statusCode).toBe(200);
    expect(await cardOf(id)).toBeUndefined(); // selesai: keluar dari papan
  });

  it('revisi tanpa editor (mis. Shooting+Edit lama) muncul di antrean Leader dan bisa di-assign tanpa mengubah status', async () => {
    const id = await queued('A');
    await db.query("UPDATE briefs SET status = 'revisi', revision_count = 1 WHERE id = $1", [id]);
    await db.query("INSERT INTO brief_events (brief_id, from_status, to_status, reason) VALUES ($1, 'in_review', 'revisi', 'Warna kurang')", [id]);
    const s = await schedule();
    expect(s.queue[0]).toMatchObject({ id, status: 'revisi', revisionReason: 'Warna kurang' });
    expect(s.summary.revisi).toBe(1);
    await assign(id);
    expect(await statusOf(id)).toBe('revisi');
    expect((await cardOf(id))?.column).toBe('todo');
  });
});

describe('papan editor & SLA', () => {
  it('Editor hanya melihat tugasnya; Leader/Admin melihat semua atau memfilter editor', async () => {
    const a = await queued('A');
    const b = await queued('B');
    await assign(a);
    await assign(b, { editorId: raraId });
    expect((await board(dio)).cards.map((c) => c.id)).toEqual([a]);
    expect((await board(dio, `?editorId=${raraId}`)).cards.map((c) => c.id)).toEqual([a]); // parameter diabaikan untuk Editor
    expect((await board(leader)).cards.map((c) => c.id).sort()).toEqual([a, b].sort());
    expect((await board(admin, `?editorId=${raraId}`)).cards.map((c) => c.id)).toEqual([b]);
    expect((await call(leader, 'GET', '/api/editing/board?editorId=abc')).statusCode).toBe(400);
  });

  it('SLA editing: aman → hari ini → telat berdasarkan tenggat', async () => {
    const id = await queued('A');
    const today = todayJakarta();
    await assign(id, { scheduledFor: nextWorkday(today), dueDate: addWorkdays(nextWorkday(today), 2) });
    expect((await cardOf(id))?.sla).toBe('aman');
    await db.query('UPDATE briefs SET edit_due = $2 WHERE id = $1', [id, today]);
    expect((await cardOf(id))?.sla).toBe('hari_ini');
    await db.query('UPDATE briefs SET edit_due = $2 WHERE id = $1', [id, addDays(today, -1)]);
    expect((await cardOf(id))?.sla).toBe('telat');
    expect((await schedule()).summary.telat).toBe(1);
  });

  it('Shooting + Edit dari Syuting: antrean menyertakan bukti footage dan asal "syuting"', async () => {
    const id = await queued('A');
    await db.query("UPDATE briefs SET jenis = 'shooting_edit' WHERE id = $1", [id]);
    await db.query("INSERT INTO footage_handoffs (brief_id, storage, drive_url, handed_by) VALUES ($1, 'drive', 'https://drive.google.com/drive/folders/f1', 3)", [id]);
    const q = (await schedule()).queue[0]!;
    expect(q).toMatchObject({ origin: 'syuting', footage: { storage: 'drive', driveUrl: 'https://drive.google.com/drive/folders/f1' } });
  });

  it('Shooting Only In Review: bahan review = footage Drive dari VG', async () => {
    const so = await call(user, 'POST', '/api/briefs', { jenis: 'shooting_only', kategori: 'Talking Head', produk: 'ASA', judul: 'S', rasio: '9:16', durasiDetik: 30, linkDocs: DOC, catatan: '', attributes: { talent: 'R', kostum: 'C', lokasi: 'Kantor', lokasiDetail: '', properti: 'B', desain: 'T' } });
    const id = so.json().brief.id as number;
    await db.query("UPDATE briefs SET status = 'in_review' WHERE id = $1", [id]);
    await db.query("INSERT INTO footage_handoffs (brief_id, storage, drive_url, handed_by) VALUES ($1, 'drive', 'https://drive.google.com/drive/folders/f2', 3)", [id]);
    expect((await call(user, 'GET', `/api/briefs/${id}`)).json().brief.reviewMaterial).toMatchObject({ source: 'footage', url: 'https://drive.google.com/drive/folders/f2' });
  });
});
