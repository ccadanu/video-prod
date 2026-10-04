import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../src/bootstrap';
import type { Db } from '../src/db';
import { verifyPassword } from '../src/password';
import { openTestDb, resetDb } from './helpers';

let db: Db;
beforeAll(async () => {
  db = await openTestDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDb(db);
});

const env = { BOOTSTRAP_ADMIN_EMAIL: 'owner@perusahaan.test', BOOTSTRAP_ADMIN_PASSWORD: 'Sangat-Rahasia-2026' };

describe('bootstrapAdmin', () => {
  it('tanpa variabel: tidak melakukan apa pun', async () => {
    expect(await bootstrapAdmin(db, {})).toBe('skipped_not_configured');
    expect(await bootstrapAdmin(db, { BOOTSTRAP_ADMIN_EMAIL: 'a@b.test' })).toBe('skipped_not_configured');
    expect((await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM users'))!.n).toBe(0);
  });

  it('database kosong: membuat satu Admin dengan password ter-hash, tercatat di audit', async () => {
    expect(await bootstrapAdmin(db, { ...env, BOOTSTRAP_ADMIN_NAME: 'Pemilik' })).toBe('created');
    const u = await db.one<{ email: string; role: string; name: string; active: boolean; password_hash: string }>('SELECT * FROM users');
    expect(u).toMatchObject({ email: 'owner@perusahaan.test', role: 'admin', name: 'Pemilik', active: true });
    expect(u!.password_hash).not.toContain('Sangat-Rahasia');
    expect(await verifyPassword('Sangat-Rahasia-2026', u!.password_hash)).toBe(true);
    expect((await db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM audit_log WHERE action = 'bootstrap.admin'"))!.n).toBe(1);
  });

  it('sudah ada pengguna: tidak menambah dan tidak mengubah akun apa pun (aman dibiarkan terpasang)', async () => {
    await bootstrapAdmin(db, env);
    expect(await bootstrapAdmin(db, { ...env, BOOTSTRAP_ADMIN_PASSWORD: 'Password-Lain-999' })).toBe('skipped_users_exist');
    expect(await bootstrapAdmin(db, { BOOTSTRAP_ADMIN_EMAIL: 'lain@x.test', BOOTSTRAP_ADMIN_PASSWORD: 'Password-Lain-999' })).toBe('skipped_users_exist');
    const rows = await db.query<{ email: string; password_hash: string }>('SELECT email, password_hash FROM users');
    expect(rows).toHaveLength(1);
    expect(await verifyPassword('Sangat-Rahasia-2026', rows[0]!.password_hash)).toBe(true);
  });

  it('password lemah atau email tidak valid: gagal dengan pesan jelas, tidak membuat akun', async () => {
    await expect(bootstrapAdmin(db, { ...env, BOOTSTRAP_ADMIN_PASSWORD: 'pendek' })).rejects.toThrow();
    await expect(bootstrapAdmin(db, { ...env, BOOTSTRAP_ADMIN_EMAIL: 'bukan-email' })).rejects.toThrow();
    expect((await db.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM users'))!.n).toBe(0);
  });
});
