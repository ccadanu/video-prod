import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayJakarta } from '@ccp/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db';
import { hashPassword } from '../src/password';
import { openTestDb, resetDb } from './helpers';

const PASSWORD = 'Rahasia-123';
const TODAY = todayJakarta();
const START = addDays(TODAY, -13);

let db: Db;
let app: FastifyInstance;
const ids: Record<string, number> = {};
const ck: Record<string, string> = {};

async function addUser(name: string, role: string): Promise<void> {
  const rows = await db.query<{ id: number }>('INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id', [`${name}@x.test`, await hashPassword(PASSWORD), name, role]);
  ids[name] = rows[0]!.id;
}
async function login(name: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: `${name}@x.test`, password: PASSWORD } });
  return `ccp_sid=${res.cookies.find((c) => c.name === 'ccp_sid')!.value}`;
}
const call = (who: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie: ck[who]! }, ...(payload === undefined ? {} : { payload: payload as object }) });

let n = 0;
async function done(requester: string, daysAgo = 3): Promise<number> {
  n++;
  const row = await db.one<{ id: number }>(
    `INSERT INTO briefs (code, requester_id, jenis, kategori, produk, judul, rasio, link_docs, status, submitted_at, completed_at)
     VALUES ($1, $2, 'motion', 'Infografis', 'ASA', $3, '1:1', 'https://docs.google.com/x', 'complete', $4, $5) RETURNING id`,
    [`VID-E-${n}`, ids[requester], `Konten ${n}`, `${addDays(TODAY, -10)}T03:00:00Z`, `${addDays(TODAY, -daysAgo)}T03:00:00Z`],
  );
  return row!.id;
}
const cycle = async (o: Record<string, unknown> = {}) => (await call('leader', 'POST', '/api/eval/cycles', { periodStart: START, periodEnd: TODAY, ...o })).json().id as number;
const fill = (who: string, cycleId: number, ratings: { briefId: number; rating: number }[], extra: Record<string, unknown> = {}) =>
  call(who, 'POST', `/api/eval/cycles/${cycleId}/response`, { ratings, good: '', improve: '', ...extra });

beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
  app = await buildApp(db, { ...loadConfig({ NODE_ENV: 'test' }), allowedOrigins: [] });
  n = 0;
  for (const [name, role] of [['u1', 'user'], ['u2', 'user'], ['u3', 'user'], ['u4', 'user'], ['leader', 'leader'], ['admin', 'admin'], ['vg', 'videografer'], ['ed', 'editor']] as const) await addUser(name, role);
  for (const name of Object.keys(ids)) ck[name] = await login(name);
});
afterEach(async () => {
  await app.close();
});

describe('distribusi form', () => {
  it('hanya Leader yang membuat siklus; undangan hanya untuk User yang punya konten selesai pada periode', async () => {
    await done('u1');
    await done('u2');
    await done('u3', 40); // di luar periode
    for (const w of ['u1', 'admin', 'vg', 'ed']) expect((await call(w, 'POST', '/api/eval/cycles', { periodStart: START, periodEnd: TODAY })).statusCode, w).toBe(403);
    const id = await cycle();
    const c = (await call('leader', 'GET', '/api/eval/cycles')).json().cycles[0];
    expect(c).toMatchObject({ id, status: 'open', invited: 2, submitted: 0 });
    expect((await call('u1', 'GET', `/api/eval/cycles/${id}/form`)).statusCode).toBe(200);
    expect((await call('u3', 'GET', `/api/eval/cycles/${id}/form`)).statusCode).toBe(404);
  });

  it('validasi periode: akhir ≥ awal, maks 31 hari, tidak di masa depan', async () => {
    expect((await call('leader', 'POST', '/api/eval/cycles', { periodStart: TODAY, periodEnd: START })).statusCode).toBe(400);
    expect((await call('leader', 'POST', '/api/eval/cycles', { periodStart: addDays(TODAY, -60), periodEnd: TODAY })).statusCode).toBe(400);
    expect((await call('leader', 'POST', '/api/eval/cycles', { periodStart: TODAY, periodEnd: addDays(TODAY, 3) })).statusCode).toBe(409);
  });
});

describe('pengisian blind review', () => {
  it('form memuat konten milik sendiri; semua konten wajib dinilai 1–5; sekali isi saja', async () => {
    const a = await done('u1');
    const b = await done('u1');
    await done('u2');
    const id = await cycle();
    const form = (await call('u1', 'GET', `/api/eval/cycles/${id}/form`)).json().form;
    expect(form.items.map((i: { briefId: number }) => i.briefId)).toEqual([a, b]);
    expect((await fill('u1', id, [{ briefId: a, rating: 5 }])).statusCode).toBe(400); // kurang satu
    expect((await fill('u1', id, [{ briefId: a, rating: 7 }, { briefId: b, rating: 4 }])).statusCode).toBe(400);
    expect((await fill('u1', id, [{ briefId: a, rating: 5 }, { briefId: b, rating: 4 }, { briefId: 9999, rating: 4 }])).statusCode).toBe(400);
    expect((await fill('u1', id, [{ briefId: a, rating: 5 }, { briefId: b, rating: 4 }], { good: 'Bagus', improve: 'Lebih cepat' })).statusCode).toBe(200);
    expect((await fill('u1', id, [{ briefId: a, rating: 5 }, { briefId: b, rating: 4 }])).statusCode).toBe(409);
    expect((await call('u1', 'GET', `/api/eval/cycles/${id}/form`)).statusCode).toBe(409);
    expect((await call('leader', 'GET', '/api/eval/cycles')).json().cycles[0]).toMatchObject({ invited: 2, submitted: 1 });
  });

  it('jawaban tidak menyimpan identitas pengisi; Leader tidak punya endpoint yang menampilkannya', async () => {
    const a = await done('u1');
    const id = await cycle();
    await fill('u1', id, [{ briefId: a, rating: 4 }], { good: 'Mantap' });
    for (const table of ['eval_responses', 'eval_comments']) {
      const cols = (await db.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name = $1', [table])).map((c) => c.column_name);
      expect(cols.some((c) => /user|requester|author|created/.test(c)), `${table}: ${cols}`).toBe(false);
    }
    expect((await call('leader', 'GET', `/api/eval/cycles/${id}/form`)).statusCode).toBe(403);
    const json = JSON.stringify((await call('leader', 'GET', `/api/eval/cycles/${id}/result`)).json());
    expect(json).not.toContain('u1');
  });

  it('konten yang sudah dinilai tidak muncul lagi di siklus berikutnya', async () => {
    const a = await done('u1');
    const first = await cycle();
    await fill('u1', first, [{ briefId: a, rating: 4 }]);
    await done('u1', 1);
    const second = await cycle({ name: 'Siklus 2' });
    const form = (await call('u1', 'GET', `/api/eval/cycles/${second}/form`)).json().form;
    expect(form.items).toHaveLength(1);
    expect(form.items[0].briefId).not.toBe(a);
  });

  it('siklus yang sudah ditutup tidak bisa diisi', async () => {
    const a = await done('u1');
    const id = await cycle();
    await call('leader', 'POST', `/api/eval/cycles/${id}/close`);
    expect((await fill('u1', id, [{ briefId: a, rating: 4 }])).statusCode).toBe(409);
    expect((await call('leader', 'POST', `/api/eval/cycles/${id}/close`)).statusCode).toBe(409);
  });
});

describe('hasil, FGD, dan tindak lanjut', () => {
  async function respondents(count: number, close = true): Promise<number> {
    const briefs: Record<string, number> = {};
    for (const u of ['u1', 'u2', 'u3', 'u4'].slice(0, count)) briefs[u] = await done(u);
    const id = await cycle();
    for (const [i, u] of Object.keys(briefs).entries()) await fill(u, id, [{ briefId: briefs[u]!, rating: 5 - (i % 2) }], { good: `Baik ${i}`, improve: `Perbaiki ${i}` });
    if (close) await call('leader', 'POST', `/api/eval/cycles/${id}/close`);
    return id;
  }

  it('respons kurang dari batas minimum: hasil disembunyikan agar tidak mengarah ke satu orang', async () => {
    const id = await respondents(2);
    const r = (await call('leader', 'GET', `/api/eval/cycles/${id}/result`)).json().result;
    expect(r).toMatchObject({ responses: 2, enough: false, min: 3, avg: null, good: [], improve: [] });
  });

  it('cukup respons: rata-rata, distribusi, per jenis, dan komentar tanpa identitas', async () => {
    const id = await respondents(4);
    const r = (await call('leader', 'GET', `/api/eval/cycles/${id}/result`)).json().result;
    expect(r).toMatchObject({ responses: 4, enough: true });
    expect(r.avg).toBeCloseTo(4.5);
    expect(r.dist).toEqual([0, 0, 0, 2, 2]);
    expect(r.byJenis).toEqual([{ jenis: 'motion', avg: 4.5, n: 4 }]);
    expect([...r.good].sort()).toEqual(['Baik 0', 'Baik 1', 'Baik 2', 'Baik 3']);
  });

  it('hak lihat hasil: Leader/Admin kapan saja; VG/Editor setelah ditutup; User tidak pernah', async () => {
    const open = await respondents(3, false);
    expect((await call('leader', 'GET', `/api/eval/cycles/${open}/result`)).statusCode).toBe(200);
    expect((await call('admin', 'GET', `/api/eval/cycles/${open}/result`)).statusCode).toBe(200);
    for (const w of ['vg', 'ed']) expect((await call(w, 'GET', `/api/eval/cycles/${open}/result`)).statusCode, w).toBe(409);
    expect((await call('u1', 'GET', `/api/eval/cycles/${open}/result`)).statusCode).toBe(403);
    await call('leader', 'POST', `/api/eval/cycles/${open}/close`);
    for (const w of ['vg', 'ed']) expect((await call(w, 'GET', `/api/eval/cycles/${open}/result`)).statusCode, w).toBe(200);
  });

  it('daftar siklus menurut peran: User hanya yang mengundangnya (tanpa hasil), VG/Editor hanya yang ditutup', async () => {
    const closed = await respondents(3);
    await done('u1', 1);
    const open = await cycle({ name: 'Berjalan' });
    expect((await call('u1', 'GET', '/api/eval/cycles')).json().cycles.map((c: { id: number }) => c.id).sort()).toEqual([closed, open].sort());
    expect((await call('u1', 'GET', '/api/eval/cycles')).json().cycles.find((c: { id: number }) => c.id === open).me).toEqual({ invited: true, submitted: false });
    expect((await call('vg', 'GET', '/api/eval/cycles')).json().cycles.map((c: { id: number }) => c.id)).toEqual([closed]);
    expect((await call('leader', 'GET', '/api/eval/cycles')).json().cycles).toHaveLength(2);
  });

  it('FGD dan tindak lanjut: hanya Leader yang menulis; VG/Editor membaca pada siklus ditutup', async () => {
    const id = await respondents(3);
    for (const w of ['admin', 'vg', 'u1']) expect((await call(w, 'PUT', `/api/eval/cycles/${id}/fgd`, { notes: 'x', at: TODAY })).statusCode, w).toBe(403);
    expect((await call('leader', 'PUT', `/api/eval/cycles/${id}/fgd`, { notes: 'Sepakat memperjelas estimasi', at: TODAY })).statusCode).toBe(200);
    expect((await call('leader', 'POST', `/api/eval/cycles/${id}/actions`, { text: '' })).statusCode).toBe(400);
    expect((await call('leader', 'POST', `/api/eval/cycles/${id}/actions`, { text: 'Cek teks promo sebelum review' })).statusCode).toBe(200);
    const actionId = (await call('leader', 'GET', '/api/eval/cycles')).json().cycles[0].actions[0].id;
    expect((await call('leader', 'PATCH', `/api/eval/actions/${actionId}`, { done: true })).statusCode).toBe(200);
    const seen = (await call('ed', 'GET', '/api/eval/cycles')).json().cycles[0];
    expect(seen).toMatchObject({ fgdNotes: 'Sepakat memperjelas estimasi', actions: [{ text: 'Cek teks promo sebelum review', done: true }] });
    expect((await call('u1', 'GET', '/api/eval/cycles')).json().cycles[0]).toMatchObject({ fgdNotes: '', actions: [] });
  });
});
