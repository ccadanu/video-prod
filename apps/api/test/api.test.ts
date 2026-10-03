import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { migrate, openDb, type Db } from '../src/db';
import { hashPassword, verifyPassword } from '../src/password';

const PASSWORD = 'Rahasia-123';
let db: Db;
let app: FastifyInstance;

async function addUser(email: string, role: string, opts: { active?: boolean; name?: string } = {}) {
  db.prepare('INSERT INTO users (email, password_hash, name, role, active) VALUES (?, ?, ?, ?, ?)').run(
    email,
    await hashPassword(PASSWORD),
    opts.name ?? email.split('@')[0],
    role,
    opts.active === false ? 0 : 1,
  );
}

async function login(email: string, password = PASSWORD) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  const cookie = res.cookies.find((c) => c.name === 'ccp_sid');
  return { res, cookie: cookie ? `ccp_sid=${cookie.value}` : '' };
}

beforeEach(async () => {
  db = openDb(':memory:');
  migrate(db);
  app = await buildApp(db, { ...loadConfig({ NODE_ENV: 'test' }), allowedOrigins: ['http://localhost:5173'] });
  await addUser('admin@x.test', 'admin');
  await addUser('user@x.test', 'user');
  await addUser('off@x.test', 'user', { active: false });
});

afterEach(async () => {
  await app.close();
  db.close();
});

describe('password', () => {
  it('hash unik per panggilan dan bisa diverifikasi', async () => {
    const [a, b] = await Promise.all([hashPassword('abc12345'), hashPassword('abc12345')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('abc12345', a)).toBe(true);
    expect(await verifyPassword('salah', a)).toBe(false);
    expect(await verifyPassword('abc12345', 'bukan-hash')).toBe(false);
  });
});

describe('migrasi', () => {
  it('idempoten: menjalankan ulang tidak menerapkan apa pun', () => {
    expect(migrate(db)).toEqual([]);
  });
});

describe('login & sesi', () => {
  it('login berhasil memasang cookie httpOnly dan /me mengembalikan pengguna tanpa hash', async () => {
    const { res, cookie } = await login('user@x.test');
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email: 'user@x.test', role: 'user' });
    expect(JSON.stringify(res.json())).not.toContain('password');
    const sid = res.cookies.find((c) => c.name === 'ccp_sid')!;
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Lax');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('user@x.test');
  });

  it('email tidak peka huruf besar/kecil', async () => {
    expect((await login('USER@X.TEST')).res.statusCode).toBe(200);
  });

  it('pesan error sama untuk email tak dikenal, password salah, dan akun nonaktif', async () => {
    const messages = await Promise.all([
      login('nobody@x.test'),
      login('user@x.test', 'salah-salah'),
      login('off@x.test'),
    ]);
    for (const m of messages) expect(m.res.statusCode).toBe(401);
    expect(new Set(messages.map((m) => m.res.json().error.message)).size).toBe(1);
  });

  it('login gagal tercatat di audit_log tanpa menyimpan password', async () => {
    await login('user@x.test', 'salah-salah');
    const row = db.prepare("SELECT * FROM audit_log WHERE action = 'auth.login_failed'").get() as { detail: string };
    expect(row).toBeTruthy();
    expect(row.detail).not.toContain('salah-salah');
  });

  it('logout mencabut sesi di server', async () => {
    const { cookie } = await login('user@x.test');
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('sesi tidak berlaku lagi bila akun dinonaktifkan atau sudah kedaluwarsa', async () => {
    const { cookie } = await login('user@x.test');
    db.prepare("UPDATE users SET active = 0 WHERE email = 'user@x.test'").run();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);

    db.prepare("UPDATE users SET active = 1 WHERE email = 'user@x.test'").run();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(200);
    db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('input tidak valid ditolak 400, bukan 500', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'bukan-email' } });
    expect(res.statusCode).toBe(400);
  });

  it('membatasi percobaan login (rate limit)', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await login('user@x.test', 'salah-salah')).res.statusCode;
    expect(last).toBe(429);
  });
});

describe('ganti password', () => {
  it('butuh password lama yang benar dan mencabut sesi lain', async () => {
    const a = await login('user@x.test');
    const b = await login('user@x.test');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: a.cookie },
      payload: { currentPassword: 'salah', newPassword: 'Baru-Baru-1' },
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie: a.cookie },
      payload: { currentPassword: PASSWORD, newPassword: 'Baru-Baru-1' },
    });
    expect(ok.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: a.cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: b.cookie } })).statusCode).toBe(401);
    expect((await login('user@x.test', 'Baru-Baru-1')).res.statusCode).toBe(200);
  });

  it('menolak password baru yang terlalu pendek', async () => {
    const { cookie } = await login('user@x.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { currentPassword: PASSWORD, newPassword: 'pendek' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('perlindungan CSRF (origin check)', () => {
  it('menolak request tulis dari origin asing, mengizinkan origin yang terdaftar', async () => {
    const evil = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'user@x.test', password: PASSWORD },
    });
    expect(evil.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost:5173' },
      payload: { email: 'user@x.test', password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('kelola pengguna (admin)', () => {
  const newUser = { email: 'baru@x.test', name: 'Baru', role: 'editor', unit: 'CCP', jabatan: 'Editor', password: 'Password-1' };

  it('hanya admin; tanpa login 401, peran lain 403', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/users' })).statusCode).toBe(401);
    const { cookie } = await login('user@x.test');
    expect((await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/users', headers: { cookie }, payload: newUser })).statusCode).toBe(403);
  });

  it('admin membuat pengguna; email ganda 409; pengguna baru bisa login', async () => {
    const { cookie } = await login('admin@x.test');
    const created = await app.inject({ method: 'POST', url: '/api/users', headers: { cookie }, payload: newUser });
    expect(created.statusCode).toBe(201);
    expect(JSON.stringify(created.json())).not.toContain('password');
    const dup = await app.inject({ method: 'POST', url: '/api/users', headers: { cookie }, payload: { ...newUser, email: 'BARU@x.test' } });
    expect(dup.statusCode).toBe(409);
    expect((await login('baru@x.test', 'Password-1')).res.statusCode).toBe(200);
  });

  it('menonaktifkan atau mengubah peran mencabut sesi pengguna tsb', async () => {
    const admin = await login('admin@x.test');
    const target = await login('user@x.test');
    const id = (db.prepare("SELECT id FROM users WHERE email = 'user@x.test'").get() as { id: number }).id;
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${id}`, headers: { cookie: admin.cookie }, payload: { role: 'leader' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('leader');
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: target.cookie } })).statusCode).toBe(401);
  });

  it('admin tidak bisa mengunci akunnya sendiri', async () => {
    const { cookie } = await login('admin@x.test');
    const id = (db.prepare("SELECT id FROM users WHERE email = 'admin@x.test'").get() as { id: number }).id;
    const res = await app.inject({ method: 'PATCH', url: `/api/users/${id}`, headers: { cookie }, payload: { active: false } });
    expect(res.statusCode).toBe(400);
  });

  it('reset password mengganti kredensial dan mencabut sesi', async () => {
    const admin = await login('admin@x.test');
    const target = await login('user@x.test');
    const id = (db.prepare("SELECT id FROM users WHERE email = 'user@x.test'").get() as { id: number }).id;
    const res = await app.inject({ method: 'POST', url: `/api/users/${id}/reset-password`, headers: { cookie: admin.cookie }, payload: { newPassword: 'Reset-Baru-1' } });
    expect(res.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: target.cookie } })).statusCode).toBe(401);
    expect((await login('user@x.test')).res.statusCode).toBe(401);
    expect((await login('user@x.test', 'Reset-Baru-1')).res.statusCode).toBe(200);
  });

  it('404 untuk pengguna yang tidak ada dan 400 untuk id tidak valid', async () => {
    const { cookie } = await login('admin@x.test');
    expect((await app.inject({ method: 'PATCH', url: '/api/users/9999', headers: { cookie }, payload: { name: 'x' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PATCH', url: '/api/users/abc', headers: { cookie }, payload: { name: 'x' } })).statusCode).toBe(400);
  });
});
