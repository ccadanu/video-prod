import { createHash } from 'node:crypto';
import type { Role, UserDto } from '@ccp/shared';
import { generateToken } from './config';
import type { Queryable } from './db';

export const COOKIE_NAME = 'ccp_sid';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  unit: string;
  jabatan: string;
  active: boolean;
}

export const toDto = (u: UserRow): UserDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  unit: u.unit,
  jabatan: u.jabatan,
  active: u.active,
});

export async function createSession(db: Queryable, userId: number, ttlMs: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), userId, expiresAt.toISOString()]);
  return { token, expiresAt };
}

/** Pengguna aktif pemilik sesi yang belum kedaluwarsa, atau null. */
export async function userForToken(db: Queryable, token: string): Promise<UserRow | null> {
  const row = await db.one<UserRow>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)],
  );
  return row ?? null;
}

export async function deleteSession(db: Queryable, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Cabut semua sesi pengguna, kecuali sesi `exceptToken` bila diberikan. */
export async function revokeUserSessions(db: Queryable, userId: number, exceptToken?: string): Promise<void> {
  if (exceptToken) await db.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, hashToken(exceptToken)]);
  else await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function purgeExpiredSessions(db: Queryable): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at <= now()');
}
