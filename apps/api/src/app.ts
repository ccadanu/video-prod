import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { Role } from '@ccp/shared';
import type { Config } from './config';
import type { Db } from './db';
import { HttpError } from './errors';
import { COOKIE_NAME, userForToken, type UserRow } from './sessions';
import { authRoutes } from './routes/auth';
import { briefRoutes } from './routes/briefs';
import { dailyRoutes } from './routes/daily';
import { editingRoutes } from './routes/editing';
import { evaluationRoutes } from './routes/evaluation';
import { statsRoutes } from './routes/stats';
import { weeklyRoutes } from './routes/weekly';
import { userRoutes } from './routes/users';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
    sessionToken: string | null;
  }
  interface FastifyInstance {
    db: Db;
    config: Config;
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export { HttpError };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(db: Db, config: Config): Promise<FastifyInstance> {
  // Log terstruktur (JSON) di production; header/cookie tidak pernah ikut tercatat (serializer bawaan hanya method/url/host).
  const app = Fastify({ logger: config.env === 'test' ? false : { level: config.logLevel }, trustProxy: config.env === 'production' });
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  await app.register(cookie);
  // Hanya diperlukan bila web diakses dari origin berbeda dari API; satu origin (reverse proxy) tidak butuh CORS.
  await app.register(cors, { origin: config.allowedOrigins, credentials: true });
  await app.register(rateLimit, { global: false });

  // Header keamanan dasar. CSP mengizinkan hanya sumber sendiri (gaya inline dibutuhkan atribut style React).
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (config.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if (reply.request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  // Perlindungan CSRF: cookie SameSite=Lax + tolak request tulis dari origin asing.
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'bad_origin', 'Origin tidak valid');
    }
    if (host !== req.headers.host && !config.allowedOrigins.includes(origin)) {
      throw new HttpError(403, 'bad_origin', 'Origin tidak diizinkan');
    }
  });

  // Muat pengguna dari cookie sesi (jika ada).
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return;
    const user = await userForToken(db, token);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  });

  app.decorate('requireAuth', async (req: FastifyRequest) => {
    if (!req.user) throw new HttpError(401, 'unauthenticated', 'Silakan login terlebih dahulu');
  });
  app.decorate('requireRole', (...roles: Role[]) => async (req: FastifyRequest) => {
    if (!req.user) throw new HttpError(401, 'unauthenticated', 'Silakan login terlebih dahulu');
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'forbidden', 'Anda tidak memiliki akses');
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      // Satu galat: tampilkan pesannya saja (siap pakai di form). Beberapa galat: sertakan nama kolom agar jelas mana yang salah.
      const message = err.issues.length === 1 ? err.issues[0]!.message : err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
      return reply.status(400).send({ error: { code: 'validation', message } });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: { code: 'request', message: e.message ?? 'Permintaan tidak valid' } });
    }
    app.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Terjadi kesalahan pada server' } });
  });

  // Pemeriksaan kesehatan untuk orchestrator/load balancer: 200 hanya bila database dapat dijangkau.
  app.get('/api/health', async (_req, reply) => {
    try {
      await db.query('SELECT 1');
      return { ok: true };
    } catch (e) {
      app.log.error(e);
      return reply.status(503).send({ ok: false });
    }
  });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(briefRoutes, { prefix: '/api/briefs' });
  await app.register(weeklyRoutes, { prefix: '/api/weekly' });
  await app.register(dailyRoutes, { prefix: '/api/daily' });
  await app.register(editingRoutes, { prefix: '/api/editing' });
  await app.register(statsRoutes, { prefix: '/api/stats' });
  await app.register(evaluationRoutes, { prefix: '/api/eval' });

  // Web statis (opsional): satu origin tanpa reverse proxy tambahan. Aset ber-hash di-cache lama, index.html tidak.
  if (config.webDist) {
    const root = resolve(config.webDist);
    if (!existsSync(resolve(root, 'index.html'))) throw new Error(`WEB_DIST tidak berisi index.html: ${root}`);
    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      setHeaders: (res, path) => {
        res.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    // Rute SPA (react-router): selain /api/*, kembalikan index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.method !== 'GET') return reply.status(404).send({ error: { code: 'not_found', message: 'Endpoint tidak ditemukan' } });
      return reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html');
    });
  }

  return app;
}
