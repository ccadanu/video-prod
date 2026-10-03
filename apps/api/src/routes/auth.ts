import type { FastifyInstance } from 'fastify';
import { changePasswordSchema, loginSchema } from '@ccp/shared';
import { HttpError } from '../app';
import { verifyCredentials } from '../credentials';
import { audit } from '../db';
import { hashPassword, verifyPassword } from '../password';
import { COOKIE_NAME, createSession, deleteSession, revokeUserSessions, toDto } from '../sessions';

const INVALID = 'Email atau password salah';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app;

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await verifyCredentials(db, email, password);
    if (!user) {
      const known = await db.one<{ id: number }>('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
      await audit(db, known?.id ?? null, 'auth.login_failed', 'user', known?.id ?? '', { email });
      throw new HttpError(401, 'invalid_credentials', INVALID);
    }

    const { token, expiresAt } = await createSession(db, user.id, config.sessionTtlMs);
    await audit(db, user.id, 'auth.login', 'user', user.id);
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: config.cookieSameSite,
      secure: config.cookieSecure,
      path: '/',
      expires: expiresAt,
    });
    return { user: toDto(user) };
  });

  app.post('/logout', async (req, reply) => {
    if (req.sessionToken) await deleteSession(db, req.sessionToken);
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
      await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await hashPassword(newPassword), user.id]);
      await revokeUserSessions(db, user.id, req.sessionToken ?? undefined);
      await audit(db, user.id, 'auth.change_password', 'user', user.id);
      return { ok: true };
    },
  );
}
