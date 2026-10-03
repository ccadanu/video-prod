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
  const find = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;

  app.get('/', adminOnly, async () => {
    const rows = db.prepare('SELECT * FROM users ORDER BY active DESC, name COLLATE NOCASE').all() as UserRow[];
    return { users: rows.map(toDto) };
  });

  app.post('/', adminOnly, async (req, reply) => {
    const input = createUserSchema.parse(req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(input.email)) {
      throw new HttpError(409, 'email_taken', 'Email sudah terdaftar');
    }
    const info = db
      .prepare('INSERT INTO users (email, password_hash, name, role, unit, jabatan) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.email, await hashPassword(input.password), input.name, input.role, input.unit, input.jabatan);
    const id = Number(info.lastInsertRowid);
    audit(db, req.user!.id, 'user.create', 'user', id, { email: input.email, role: input.role });
    reply.status(201);
    return { user: toDto(find(id)!) };
  });

  app.patch<{ Params: { id: string } }>('/:id', adminOnly, async (req) => {
    const id = parseId(req.params.id);
    const target = find(id);
    if (!target) throw new HttpError(404, 'not_found', 'Pengguna tidak ditemukan');
    const patch = updateUserSchema.parse(req.body);

    const selfLockout = id === req.user!.id && (patch.active === false || (patch.role && patch.role !== 'admin'));
    if (selfLockout) throw new HttpError(400, 'self_lockout', 'Anda tidak bisa menonaktifkan atau menurunkan peran akun sendiri');

    const next = {
      name: patch.name ?? target.name,
      role: patch.role ?? target.role,
      unit: patch.unit ?? target.unit,
      jabatan: patch.jabatan ?? target.jabatan,
      active: patch.active === undefined ? target.active : patch.active ? 1 : 0,
    };
    db.prepare(
      `UPDATE users SET name = ?, role = ?, unit = ?, jabatan = ?, active = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(next.name, next.role, next.unit, next.jabatan, next.active, id);
    if (next.active === 0 || next.role !== target.role) revokeUserSessions(db, id);
    audit(db, req.user!.id, 'user.update', 'user', id, patch);
    return { user: toDto(find(id)!) };
  });

  app.post<{ Params: { id: string } }>('/:id/reset-password', adminOnly, async (req) => {
    const id = parseId(req.params.id);
    if (!find(id)) throw new HttpError(404, 'not_found', 'Pengguna tidak ditemukan');
    const { newPassword } = resetPasswordSchema.parse(req.body);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(
      await hashPassword(newPassword),
      id,
    );
    revokeUserSessions(db, id);
    audit(db, req.user!.id, 'user.reset_password', 'user', id);
    return { ok: true };
  });
}
