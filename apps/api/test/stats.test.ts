import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayJakarta, type DashboardDto, type KpiDto } from '@ccp/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db';
import { hashPassword } from '../src/password';
import { openTestDb, resetDb } from './helpers';

const PASSWORD = 'Rahasia-123';
const TODAY = todayJakarta();
const at = (daysAgo: number) => `${addDays(TODAY, -daysAgo)}T03:30:00.000Z`;

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
const get = (who: string, url: string) => app.inject({ method: 'GET', url, headers: { cookie: ck[who]! } });

let n = 0;
/** Konten selesai dengan fakta SLA & revisi; hasil rating masuk lewat siklus yang ditutup. */
async function complete(o: { requester: string; jenis?: string; revisions?: number; vg?: string; editor?: string; handed?: number; shootDaysAgo?: number; delivered?: number; dueDaysAgo?: number; completed?: number; rating?: number; cycle?: number }) {
  n++;
  const jenis = o.jenis ?? 'motion';
  const weekly = o.vg !== undefined;
  const shoot = weekly ? addDays(TODAY, -(o.shootDaysAgo ?? 6)) : null;
  const row = await db.one<{ id: number }>(
    `INSERT INTO briefs (code, requester_id, jenis, kategori, produk, judul, rasio, link_docs, status, revision_count, submitted_at, completed_at, editor_id, edit_due)
     VALUES ($1, $2, $3, 'Infografis', 'ASA', $4, '1:1', 'https://docs.google.com/x', 'complete', $5, $6, $7, $8, $9) RETURNING id`,
    [`VID-T-${n}`, ids[o.requester], jenis, `Konten ${n}`, o.revisions ?? 0, at(12), at(o.completed ?? 3), o.editor ? ids[o.editor]! : null, o.editor ? addDays(TODAY, -(o.dueDaysAgo ?? 5)) : null],
  );
  const id = row!.id;
  if (weekly) {
    await db.query("UPDATE briefs SET week_start = $2, shoot_day = 0 WHERE id = $1", [id, shoot]);
    // hari syuting = week_start + shoot_day; pakai Senin sebagai tanggal syuting agar tanggalnya pasti hari kerja
    await db.query('INSERT INTO footage_handoffs (brief_id, storage, drive_url, handed_by, handed_at) VALUES ($1, $2, $3, $4, $5)', [id, 'drive', 'https://drive.google.com/x', ids[o.vg!], at(o.handed ?? o.shootDaysAgo ?? 6)]);
  }
  if (o.editor) await db.query('INSERT INTO deliverables (brief_id, version, url, submitted_by, submitted_at) VALUES ($1, 1, $2, $3, $4)', [id, 'https://drive.google.com/y', ids[o.editor], at(o.delivered ?? 5)]);
  if (o.rating !== undefined) {
    const c = await db.one<{ id: number }>("INSERT INTO eval_cycles (name, period_start, period_end, status) VALUES ('c', $1, $2, 'closed') RETURNING id", [addDays(TODAY, -30), TODAY]);
    await db.query('INSERT INTO eval_responses (cycle_id, brief_id, rating) VALUES ($1, $2, $3)', [c!.id, id, o.rating]);
  }
  return id;
}

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
  for (const [name, role] of [['sari', 'user'], ['budi', 'user'], ['leader', 'leader'], ['admin', 'admin'], ['hardi', 'videografer'], ['yofa', 'videografer'], ['dio', 'editor'], ['rara', 'editor']] as const) await addUser(name, role);
  for (const name of Object.keys(ids)) ck[name] = await login(name);
});
afterEach(async () => {
  await app.close();
});

describe('akses', () => {
  it('dashboard: User/Leader/Admin; KPI: Leader/VG/Editor/Admin; pulse: semua', async () => {
    for (const w of ['sari', 'leader', 'admin']) expect((await get(w, '/api/stats/dashboard')).statusCode, w).toBe(200);
    for (const w of ['hardi', 'dio']) expect((await get(w, '/api/stats/dashboard')).statusCode, w).toBe(403);
    for (const w of ['leader', 'admin', 'hardi', 'dio']) expect((await get(w, '/api/stats/kpi')).statusCode, w).toBe(200);
    expect((await get('sari', '/api/stats/kpi')).statusCode).toBe(403);
    for (const w of ['sari', 'leader', 'hardi', 'dio', 'admin']) expect((await get(w, '/api/stats/pulse')).statusCode, w).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/stats/dashboard' })).statusCode).toBe(401);
    expect((await get('leader', '/api/stats/dashboard?period=5y')).statusCode).toBe(400);
  });
});

describe('dashboard', () => {
  it('menghitung selesai, kepuasan (hanya siklus ditutup), revision rate, dan SLA dari data nyata', async () => {
    await complete({ requester: 'sari', editor: 'dio', revisions: 0, rating: 5, dueDaysAgo: 4, delivered: 4 }); // tepat
    await complete({ requester: 'sari', editor: 'dio', revisions: 1, rating: 3, dueDaysAgo: 6, delivered: 5 }); // telat 1 hari
    await complete({ requester: 'budi', jenis: 'shooting_edit', vg: 'hardi', editor: 'rara', shootDaysAgo: 8, handed: 8, dueDaysAgo: 5, delivered: 5, rating: 4 });
    const d = (await get('leader', '/api/stats/dashboard?period=1m')).json().dashboard as DashboardDto;
    expect(d.selesai.value).toBe(3);
    expect(d.kepuasan).toMatchObject({ n: 3 });
    expect(d.kepuasan.avg).toBeCloseTo(4);
    expect(d.revisi).toMatchObject({ count: 1, total: 3 });
    expect(d.sla.syuting).toEqual({ tepat: 1, total: 1 });
    expect(d.sla.editing).toEqual({ tepat: 2, total: 3 });
    expect(d.volume.total.value).toBe(3);
    expect(d.users.map((u) => `${u.label}:${u.count}`)).toEqual(['sari:2', 'budi:1']);
  });

  it('rating dari siklus yang masih terbuka tidak dihitung', async () => {
    const id = await complete({ requester: 'sari', editor: 'dio' });
    const c = await db.one<{ id: number }>("INSERT INTO eval_cycles (name, period_start, period_end, status) VALUES ('c', $1, $2, 'open') RETURNING id", [addDays(TODAY, -10), TODAY]);
    await db.query('INSERT INTO eval_responses (cycle_id, brief_id, rating) VALUES ($1, $2, 5)', [c!.id, id]);
    expect(((await get('leader', '/api/stats/dashboard')).json().dashboard as DashboardDto).kepuasan).toMatchObject({ avg: null, n: 0 });
  });

  it('Δ vs periode lalu dan pemilihan periode', async () => {
    await complete({ requester: 'sari', editor: 'dio', completed: 3 });
    await complete({ requester: 'sari', editor: 'dio', completed: 20 }); // periode lalu pada 2w
    const d2 = (await get('leader', '/api/stats/dashboard?period=2w')).json().dashboard as DashboardDto;
    expect(d2.selesai).toMatchObject({ value: 1, prev: 1, pct: 0 });
    const d1 = (await get('leader', '/api/stats/dashboard?period=1m')).json().dashboard as DashboardDto;
    expect(d1.selesai.value).toBe(2);
  });

  it('User melihat distribusi dengan pemohon lain dianonimkan', async () => {
    await complete({ requester: 'sari', editor: 'dio' });
    await complete({ requester: 'budi', editor: 'dio' });
    const d = (await get('sari', '/api/stats/dashboard')).json().dashboard as DashboardDto;
    expect(d.users.map((u) => u.label).sort()).toEqual(['Anda', 'Pemohon 1']);
    expect(JSON.stringify(d)).not.toContain('budi');
  });

  it('dasbor kosong tidak error (tanpa pembagian nol)', async () => {
    const d = (await get('leader', '/api/stats/dashboard')).json().dashboard as DashboardDto;
    expect(d).toMatchObject({ selesai: { value: 0 }, kepuasan: { avg: null }, sla: { pct: null }, revisi: { rate: null } });
  });
});

describe('KPI individu', () => {
  beforeEach(async () => {
    await complete({ requester: 'sari', jenis: 'shooting_only', vg: 'hardi', shootDaysAgo: 8, handed: 8, rating: 5 });
    await complete({ requester: 'sari', jenis: 'shooting_only', vg: 'hardi', shootDaysAgo: 8, handed: 7, revisions: 1, rating: 3 }); // telat
    await complete({ requester: 'budi', editor: 'dio', rating: 4, dueDaysAgo: 6, delivered: 5 }); // telat
  });

  it('Leader melihat semua; skor berbobot dari US, SLA, revisi', async () => {
    const k = (await get('leader', '/api/stats/kpi?period=1m')).json().kpi as KpiDto;
    expect(k.individuals.map((c) => c.name).sort()).toEqual(['dio', 'hardi', 'rara', 'yofa']);
    const hardi = k.individuals.find((c) => c.name === 'hardi')!;
    expect(hardi.us).toEqual({ avg: 4, n: 2 });
    expect(hardi.sla).toEqual({ tepat: 1, total: 2 });
    expect(hardi.revisi).toEqual({ count: 1, total: 2 });
    expect(hardi.score).toBeCloseTo(0.6 * 80 + 0.2 * 50 + 0.2 * 50);
    expect(k.individuals.find((c) => c.name === 'yofa')?.score).toBeNull();
  });

  it('VG dan Editor hanya melihat scorecard dirinya sendiri', async () => {
    for (const [who, name] of [['hardi', 'hardi'], ['dio', 'dio']] as const) {
      const k = (await get(who, '/api/stats/kpi')).json().kpi as KpiDto;
      expect(k.individuals.map((c) => c.name)).toEqual([name]);
    }
    expect(JSON.stringify((await get('dio', '/api/stats/kpi')).json())).not.toContain('hardi');
  });
});
