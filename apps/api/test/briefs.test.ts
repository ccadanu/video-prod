import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { migrate, openDb, type Db } from '../src/db';
import { hashPassword } from '../src/password';

const PASSWORD = 'Rahasia-123';
let db: Db;
let app: FastifyInstance;

const attributes = { talent: 'Cewek muda', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box product', desain: 'Frame design' };
const weekly = {
  jenis: 'shooting_edit', kategori: 'Talking Head', produk: 'FITGRAINS', judul: 'Promo 9.9', rasio: '9:16', durasiDetik: 60,
  linkDocs: 'https://docs.google.com/document/d/abc', catatan: 'Tayang Jumat', attributes,
};
const daily = { ...weekly, jenis: 'motion', judul: 'Motion Libur', rasio: '1:1', durasiDetik: 15, attributes: null };

async function addUser(email: string, role: string) {
  db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)').run(email, await hashPassword(PASSWORD), email.split('@')[0], role);
}
async function login(email: string): Promise<{ cookie: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  return { cookie: `ccp_sid=${res.cookies.find((c) => c.name === 'ccp_sid')!.value}` };
}
const call = (cookie: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });

const setStatus = (id: number, status: string) => db.prepare('UPDATE briefs SET status = ? WHERE id = ?').run(status, id);

let user: string, user2: string, leader: string, admin: string, vg: string;

beforeEach(async () => {
  db = openDb(':memory:');
  migrate(db);
  app = await buildApp(db, { ...loadConfig({ NODE_ENV: 'test' }), allowedOrigins: [] });
  for (const [e, r] of [['user@x.test', 'user'], ['user2@x.test', 'user'], ['leader@x.test', 'leader'], ['admin@x.test', 'admin'], ['vg@x.test', 'videografer']] as const) {
    await addUser(e, r);
  }
  user = (await login('user@x.test')).cookie;
  user2 = (await login('user2@x.test')).cookie;
  leader = (await login('leader@x.test')).cookie;
  admin = (await login('admin@x.test')).cookie;
  vg = (await login('vg@x.test')).cookie;
});
afterEach(async () => {
  await app.close();
  db.close();
});

async function create(cookie: string, body: unknown = weekly): Promise<{ id: number; code: string; status: string }> {
  const res = await call(cookie, 'POST', '/api/briefs', body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json().brief;
}

describe('buat brief', () => {
  it('Weekly langsung masuk Weekly Listing dengan atribut, kode, SLA, dan riwayat', async () => {
    const res = await call(user, 'POST', '/api/briefs', weekly);
    expect(res.statusCode).toBe(201);
    const b = res.json().brief;
    expect(b.status).toBe('listing');
    expect(b.code).toMatch(/^VID-\d{8}-001$/);
    expect(b.attributes).toMatchObject({ talent: 'Cewek muda', lokasi: 'Studio' });
    expect(b.requester.name).toBe('user');
    expect(new Date(b.slaTargetAt).getTime() - new Date(b.submittedAt).getTime()).toBe(3 * 86_400_000);
    expect(b.history).toHaveLength(1);
    expect(b.history[0]).toMatchObject({ from: null, to: 'listing', actorName: 'user' });
  });

  it('Daily menunggu validasi Leader dan tidak menyimpan atribut', async () => {
    const b = await create(user, { ...daily, attributes });
    expect(b.status).toBe('pending_review');
    const detail = (await call(user, 'GET', `/api/briefs/${b.id}`)).json().brief;
    expect(detail.attributes).toBeNull();
  });

  it('kode brief berurutan dalam sehari', async () => {
    const a = await create(user);
    const b = await create(user);
    expect(a.code.slice(0, -3)).toBe(b.code.slice(0, -3));
    expect(a.code.endsWith('001')).toBe(true);
    expect(b.code.endsWith('002')).toBe(true);
  });

  it('input tidak valid ditolak 400 dengan pesan per kolom', async () => {
    const res = await call(user, 'POST', '/api/briefs', { ...weekly, linkDocs: 'https://evil.example/x', attributes: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/linkDocs/);
    expect(res.json().error.message).toMatch(/attributes/);
    expect((await call(user, 'GET', '/api/briefs')).json().briefs).toHaveLength(0);
  });

  it('hanya User yang bisa membuat brief', async () => {
    for (const c of [leader, admin, vg]) expect((await call(c, 'POST', '/api/briefs', weekly)).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/briefs', payload: weekly })).statusCode).toBe(401);
  });

  it('membuat brief menghapus draf pengguna', async () => {
    await call(user, 'PUT', '/api/briefs/draft/me', { data: { judul: 'setengah jadi' } });
    await create(user);
    expect((await call(user, 'GET', '/api/briefs/draft/me')).json().draft).toBeNull();
  });
});

describe('daftar & akses', () => {
  it('User hanya melihat miliknya; Leader dan Admin melihat semua; Videografer ditolak', async () => {
    await create(user);
    await create(user2, daily);
    expect((await call(user, 'GET', '/api/briefs')).json().briefs).toHaveLength(1);
    expect((await call(user2, 'GET', '/api/briefs')).json().briefs).toHaveLength(1);
    expect((await call(leader, 'GET', '/api/briefs')).json().briefs).toHaveLength(2);
    expect((await call(admin, 'GET', '/api/briefs')).json().briefs).toHaveLength(2);
    expect((await call(vg, 'GET', '/api/briefs')).statusCode).toBe(403);
  });

  it('brief milik orang lain tampak tidak ada (404) bagi User', async () => {
    const b = await create(user);
    expect((await call(user2, 'GET', `/api/briefs/${b.id}`)).statusCode).toBe(404);
    expect((await call(user2, 'POST', `/api/briefs/${b.id}/transition`, { to: 'complete' })).statusCode).toBe(404);
    expect((await call(leader, 'GET', `/api/briefs/${b.id}`)).statusCode).toBe(200);
  });

  it('filter Aktif / Perlu Review / Selesai dan pencarian', async () => {
    const a = await create(user, { ...weekly, judul: 'Alpha 100%' });
    const b = await create(user, { ...daily, judul: 'Beta' });
    const c = await create(user, { ...daily, judul: 'Gamma' });
    setStatus(b.id, 'in_review');
    setStatus(c.id, 'complete');
    const titles = async (q: string) => (await call(user, 'GET', `/api/briefs?${q}`)).json().briefs.map((x: { judul: string }) => x.judul).sort();
    expect(await titles('filter=aktif')).toEqual(['Alpha 100%', 'Beta']);
    expect(await titles('filter=review')).toEqual(['Beta']);
    expect(await titles('filter=selesai')).toEqual(['Gamma']);
    expect(await titles('q=beta')).toEqual(['Beta']);
    expect(await titles(`q=${a.code}`)).toEqual(['Alpha 100%']);
    // karakter wildcard LIKE diperlakukan literal
    expect(await titles('q=100%25')).toEqual(['Alpha 100%']);
    expect(await titles('q=%25')).toEqual(['Alpha 100%']);
    expect((await call(user, 'GET', '/api/briefs?filter=ngawur')).statusCode).toBe(400);
  });
});

describe('validasi Leader (Daily)', () => {
  it('Leader menyetujui → antre editing; riwayat mencatat pelakunya', async () => {
    const b = await create(user, daily);
    const res = await call(leader, 'POST', `/api/briefs/${b.id}/transition`, { to: 'antre_editing' });
    expect(res.statusCode).toBe(200);
    const brief = res.json().brief;
    expect(brief.status).toBe('antre_editing');
    expect(brief.history.at(-1)).toMatchObject({ from: 'pending_review', to: 'antre_editing', actorName: 'leader' });
  });

  it('mengembalikan ke Backlog wajib beralasan, alasan tampil di riwayat', async () => {
    const b = await create(user, daily);
    expect((await call(leader, 'POST', `/api/briefs/${b.id}/transition`, { to: 'backlog' })).statusCode).toBe(400);
    const res = await call(leader, 'POST', `/api/briefs/${b.id}/transition`, { to: 'backlog', reason: 'Naskah belum ada' });
    expect(res.json().brief.history.at(-1).reason).toBe('Naskah belum ada');
  });

  it('User dan Videografer tidak bisa memvalidasi', async () => {
    const b = await create(user, daily);
    expect((await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'antre_editing' })).statusCode).toBe(409);
    expect((await call(vg, 'POST', `/api/briefs/${b.id}/transition`, { to: 'antre_editing' })).statusCode).toBe(403);
  });
});

describe('review User: approve / revisi', () => {
  it('Approve mengisi waktu selesai', async () => {
    const b = await create(user, daily);
    setStatus(b.id, 'in_review');
    const res = await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'complete' });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.status).toBe('complete');
    expect(res.json().brief.completedAt).toBeTruthy();
  });

  it('Minta revisi wajib beralasan dan menambah hitungan revisi', async () => {
    const b = await create(user, daily);
    setStatus(b.id, 'in_review');
    expect((await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'revisi' })).statusCode).toBe(400);
    const res = await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'revisi', reason: 'Teks harga salah' });
    expect(res.json().brief).toMatchObject({ status: 'revisi', revisionCount: 1 });
  });

  it('hanya pemilik yang bisa review; Leader/Admin tidak', async () => {
    const b = await create(user, daily);
    setStatus(b.id, 'in_review');
    expect((await call(user2, 'POST', `/api/briefs/${b.id}/transition`, { to: 'complete' })).statusCode).toBe(404);
    expect((await call(leader, 'POST', `/api/briefs/${b.id}/transition`, { to: 'complete' })).statusCode).toBe(409);
    expect((await call(admin, 'POST', `/api/briefs/${b.id}/transition`, { to: 'complete' })).statusCode).toBe(409);
  });

  it('tidak bisa approve brief yang belum In Review atau melompati status', async () => {
    const b = await create(user, daily);
    expect((await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'complete' })).statusCode).toBe(409);
    expect((await call(leader, 'POST', `/api/briefs/${b.id}/transition`, { to: 'editing' })).statusCode).toBe(409);
  });
});

describe('perbaiki dari Backlog', () => {
  async function backlogged(body: unknown = daily) {
    const b = await create(user, body);
    setStatus(b.id, 'backlog');
    return b;
  }

  it('pemilik mengedit lalu mengirim ulang; jam SLA dimulai lagi', async () => {
    const b = await backlogged();
    db.prepare("UPDATE briefs SET submitted_at = '2020-01-01T00:00:00.000Z', sla_target_at = '2020-01-02T00:00:00.000Z' WHERE id = ?").run(b.id);
    const edit = await call(user, 'PATCH', `/api/briefs/${b.id}`, { ...daily, judul: 'Motion Libur (revisi naskah)' });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().brief.judul).toBe('Motion Libur (revisi naskah)');
    const res = await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'pending_review' });
    expect(res.json().brief.status).toBe('pending_review');
    expect(new Date(res.json().brief.submittedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it('Weekly kembali ke listing, bukan pending_review', async () => {
    const b = await backlogged(weekly);
    expect((await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'pending_review' })).statusCode).toBe(409);
    expect((await call(user, 'POST', `/api/briefs/${b.id}/transition`, { to: 'listing' })).json().brief.status).toBe('listing');
  });

  it('tidak bisa diedit di luar Backlog, oleh orang lain, atau mengganti jenis', async () => {
    const b = await backlogged();
    expect((await call(user2, 'PATCH', `/api/briefs/${b.id}`, daily)).statusCode).toBe(404);
    expect((await call(leader, 'PATCH', `/api/briefs/${b.id}`, daily)).statusCode).toBe(403);
    expect((await call(user, 'PATCH', `/api/briefs/${b.id}`, { ...weekly })).statusCode).toBe(400);
    setStatus(b.id, 'pending_review');
    expect((await call(user, 'PATCH', `/api/briefs/${b.id}`, daily)).statusCode).toBe(409);
  });
});

describe('draf wizard', () => {
  it('simpan, baca, timpa, dan hapus; terpisah per pengguna', async () => {
    expect((await call(user, 'GET', '/api/briefs/draft/me')).json().draft).toBeNull();
    await call(user, 'PUT', '/api/briefs/draft/me', { data: { step: 2, judul: 'A' } });
    await call(user, 'PUT', '/api/briefs/draft/me', { data: { step: 3, judul: 'B' } });
    expect((await call(user, 'GET', '/api/briefs/draft/me')).json().draft.data).toEqual({ step: 3, judul: 'B' });
    expect((await call(user2, 'GET', '/api/briefs/draft/me')).json().draft).toBeNull();
    await call(user, 'DELETE', '/api/briefs/draft/me');
    expect((await call(user, 'GET', '/api/briefs/draft/me')).json().draft).toBeNull();
  });

  it('menolak draf terlalu besar atau bukan objek; hanya User', async () => {
    expect((await call(user, 'PUT', '/api/briefs/draft/me', { data: { x: 'a'.repeat(25_000) } })).statusCode).toBe(413);
    expect((await call(user, 'PUT', '/api/briefs/draft/me', { data: 'teks' })).statusCode).toBe(400);
    expect((await call(leader, 'PUT', '/api/briefs/draft/me', { data: {} })).statusCode).toBe(403);
  });
});
