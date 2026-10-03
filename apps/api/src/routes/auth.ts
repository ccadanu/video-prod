import type { FastifyInstance } from 'fastify';
import { changePasswordSchema, loginSchema } from '@ccp/shared';
import { HttpError } from '../app';
import { audit } from '../db';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../password';
import {
  COOKIE_NAME,
  createSession,
  deleteSession,
  revokeUserSessions,
  toDto,
  type UserRow,
} from '../sessions';

const INVALID = 'Email atau password salah';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;

    // Selalu jalankan verifikasi agar waktu respons tidak membocorkan keberadaan email.
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || user.active !== 1) {
      audit(db, user?.id ?? null, 'auth.login_failed', 'user', user?.id ?? '', { email });
      throw new HttpError(401, 'invalid_credentials', INVALID);
    }

    const { token, expiresAt } = createSession(db, user.id, config.sessionTtlMs);
    audit(db, user.id, 'auth.login', 'user', user.id);
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      expires: expiresAt,
    });
    return { user: toDto(user) };
  });

  app.post('/logout', async (req, reply) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/me', { preHandler: app.requireAuth }, async (req) => ({ user: toDto(req.user!) }));

  app.post(
    '/change-password',
    { preHandler: app.requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const user = req.user!;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      if (!(await verifyPassword(currentPassword, user.password_hash))) {
        throw new HttpError(400, 'wrong_password', 'Password saat ini salah');
      }
      db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(
        await hashPassword(newPassword),
        user.id,
      );
      revokeUserSessions(db, user.id, req.sessionToken ?? undefined);
      audit(db, user.id, 'auth.change_password', 'user', user.id);
      return { ok: true };
    },
  );
}
