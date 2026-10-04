import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { Db } from '../src/db';
import { openTestDb } from './helpers';

let db: Db;
let dist: string;
beforeAll(async () => {
  db = await openTestDb();
  dist = mkdtempSync(join(tmpdir(), 'ccp-web-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
});
afterAll(async () => {
  await db.close();
  rmSync(dist, { recursive: true, force: true });
});

const cfg = (env: Record<string, string> = {}) => ({ ...loadConfig({ NODE_ENV: 'test', ...env }), allowedOrigins: [] });

describe('konfigurasi', () => {
  it('production wajib DATABASE_URL; cookie Secure default di production dan bisa dimatikan sadar untuk intranet HTTP', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' }).cookieSecure).toBe(true);
    expect(loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(loadConfig({ NODE_ENV: 'development' }).cookieSecure).toBe(false);
  });
  it('ALLOWED_ORIGINS kosong berarti tanpa origin tambahan; WEB_DIST kosong = tanpa web statis', () => {
    expect(loadConfig({ ALLOWED_ORIGINS: '' }).allowedOrigins).toEqual([]);
    expect(loadConfig({}).webDist).toBeNull();
    expect(loadConfig({ WEB_DIST: ' /srv/web ' }).webDist).toBe('/srv/web');
  });
});

describe('health & header keamanan', () => {
  it('/api/health 200 bila database terjangkau, 503 bila tidak', async () => {
    const app = await buildApp(db, cfg());
    expect((await app.inject('/api/health')).json()).toEqual({ ok: true });
    await app.close();
    const broken = { ...db, query: async () => { throw new Error('db mati'); } } as unknown as Db;
    const bad = await buildApp(broken, cfg());
    const res = await bad.inject('/api/health');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false });
    await bad.close();
  });

  it('header keamanan ada; API tidak di-cache; HSTS hanya bila cookie Secure', async () => {
    const plain = await buildApp(db, cfg());
    const r = await plain.inject('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['strict-transport-security']).toBeUndefined();
    await plain.close();
    const secure = await buildApp(db, { ...cfg(), cookieSecure: true });
    expect((await secure.inject('/api/health')).headers['strict-transport-security']).toContain('max-age=');
    await secure.close();
  });
});

describe('web statis (WEB_DIST)', () => {
  it('melayani index, aset ber-hash (cache lama), dan rute SPA; /api tetap 404 JSON', async () => {
    const app = await buildApp(db, { ...cfg(), webDist: dist });
    const index = await app.inject('/');
    expect(index.statusCode).toBe(200);
    expect(index.headers['cache-control']).toBe('no-cache');
    expect(index.body).toContain('id="root"');
    const asset = await app.inject('/assets/app-abc123.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toContain('immutable');
    const spa = await app.inject('/production-board/daily-shooting');
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('id="root"');
    const api = await app.inject('/api/tidak-ada');
    expect(api.statusCode).toBe(404);
    expect(api.json().error.code).toBe('not_found');
    expect((await app.inject({ method: 'POST', url: '/tidak-ada', payload: {} })).statusCode).toBe(404);
    await app.close();
  });

  it('gagal start dengan pesan jelas bila WEB_DIST tidak berisi index.html', async () => {
    await expect(buildApp(db, { ...cfg(), webDist: join(dist, 'assets') })).rejects.toThrow(/index\.html/);
  });

  it('tanpa WEB_DIST, rute non-API 404', async () => {
    const app = await buildApp(db, cfg());
    expect((await app.inject('/')).statusCode).toBe(404);
    await app.close();
  });
});
