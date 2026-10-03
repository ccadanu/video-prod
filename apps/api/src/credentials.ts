import type { Queryable } from './db';
import { DUMMY_HASH, verifyPassword } from './password';
import type { UserRow } from './sessions';

/**
 * TITIK TUKAR AUTENTIKASI. Hanya fungsi ini yang tahu cara memverifikasi identitas.
 * Seluruh aplikasi selanjutnya hanya memakai sesi (`req.user`). Untuk pindah ke SSO perusahaan
 * (OIDC / LDAP / Azure AD), ganti isi fungsi ini atau tambahkan rute callback yang mencari pengguna
 * berdasarkan email lalu memanggil `createSession`. Tabel, peran, dan UI tidak berubah.
 */
export async function verifyCredentials(db: Queryable, email: string, password: string): Promise<UserRow | null> {
  const user = await db.one<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  // Selalu jalankan verifikasi agar waktu respons tidak membocorkan keberadaan email.
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  return user && ok && user.active ? user : null;
}
