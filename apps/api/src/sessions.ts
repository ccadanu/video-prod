import { createHash } from 'node:crypto';
import type { Role, UserDto } from '@ccp/shared';
import { generateToken } from './config';
import type { Db } from './db';

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
  active: number;
}

export const toDto = (u: UserRow): UserDto => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  unit: u.unit,
  jabatan: u.jabatan,
  active: u.active === 1,
});

export function createSession(db: Db, userId: number, ttlMs: number): { token: string; expiresAt: Date } {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    userId,
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

/** Mengembalikan pengguna aktif pemilik sesi yang belum kedaluwarsa, atau null. */
export function userForToken(db: Db, token: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .get(hashToken(token), new Date().toISOString());
  return (row as UserRow | undefined) ?? null;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Cabut semua sesi pengguna, kecuali sesi `exceptToken` bila diberikan. */
export function revokeUserSessions(db: Db, userId: number, exceptToken?: string): void {
  if (exceptToken) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, hashToken(exceptToken));
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function purgeExpiredSessions(db: Db): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}
