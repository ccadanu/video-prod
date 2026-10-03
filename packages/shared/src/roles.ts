export const ROLES = ['user', 'leader', 'videografer', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Aktor transisi status: peran manusia atau sistem (otomatis). */
export type Actor = Role | 'system';

export const ROLE_LABEL: Record<Role, string> = {
  user: 'User (Pemohon)',
  leader: 'Leader Produksi',
  videografer: 'Videografer',
  editor: 'Video Editor',
  admin: 'Admin',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
