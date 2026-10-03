import type { FastifyInstance } from 'fastify';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '@ccp/shared';
import { HttpError } from '../app';
import { audit } from '../db';
import { hashPassword } from '../password';
import { revokeUserSessions, toDto, type UserRow } from '../sessions';

const parseId = (raw: string): number => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_id', 'ID tidak valid');
  return id;
};

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const adminOnly = { preHandler: app.requireRole('admin') };
  const find = (id: number) => db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);

  app.get('/', adminOnly, async () => {
    const rows = await db.query<UserRow>('SELECT * FROM users ORDER BY active DESC, lower(name)');
    return { users: rows.map(toDto) };
  });

  app.post('/', adminOnly, async (req, reply) => {
    const input = createUserSchema.parse(req.body);
    if (await db.one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [input.email])) {
      throw new HttpError(409, 'email_taken', 'Email sudah terdaftar');
    }
    const created = await db.one<UserRow>(
      'INSERT INTO users (email, password_hash, name, role, unit, jabatan) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [input.email, await hashPassword(input.password), input.name, input.role, input.unit, input.jabatan],
    );
    await audit(db, req.user!.id, 'user.create', 'user', created!.id, { email: input.email, role: input.role });
    reply.status(201);
    return { user: toDto(created!) };
  });

  app.patch<{ Params: { id: string } }>('/:id', adminOnly, async (req) => {
    const id = parseId(req.params.id);
    const target = await find(id);
    if (!target) throw new HttpError(404, 'not_found', 'Pengguna tidak ditemukan');
    const patch = updateUserSchema.parse(req.body);

    const selfLockout = id === req.user!.id && (patch.active === false || (patch.role && patch.role !== 'admin'));
    if (selfLockout) throw new HttpError(400, 'self_lockout', 'Anda tidak bisa menonaktifkan atau menurunkan peran akun sendiri');

    const next = {
      name: patch.name ?? target.name,
      role: patch.role ?? target.role,
      unit: patch.unit ?? target.unit,
      jabatan: patch.jabatan ?? target.jabatan,
      active: patch.active ?? target.active,
    };
    const updated = await db.one<UserRow>(
      'UPDATE users SET name = $1, role = $2, unit = $3, jabatan = $4, active = $5, updated_at = now() WHERE id = $6 RETURNING *',
      [next.name, next.role, next.unit, next.jabatan, next.active, id],
    );
    if (!next.active || next.role !== target.role) await revokeUserSessions(db, id);
    await audit(db, req.user!.id, 'user.update', 'user', id, patch);
    return { user: toDto(updated!) };
  });

  app.post<{ Params: { id: string } }>('/:id/reset-password', adminOnly, async (req) => {
    const id = parseId(req.params.id);
    if (!(await find(id))) throw new HttpError(404, 'not_found', 'Pengguna tidak ditemukan');
    const { newPassword } = resetPasswordSchema.parse(req.body);
    await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [await hashPassword(newPassword), id]);
    await revokeUserSessions(db, id);
    await audit(db, req.user!.id, 'user.reset_password', 'user', id);
    return { ok: true };
  });
}
