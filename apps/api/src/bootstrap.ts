import { createUserSchema } from '@ccp/shared';
import { audit, type Db } from './db';
import { hashPassword } from './password';

export type BootstrapResult = 'created' | 'skipped_users_exist' | 'skipped_not_configured';

/**
 * Admin awal untuk platform tanpa akses shell (PaaS): bila BOOTSTRAP_ADMIN_EMAIL dan BOOTSTRAP_ADMIN_PASSWORD terisi
 * DAN belum ada satu pun pengguna, buat satu akun Admin. Tidak pernah menimpa atau mengubah akun yang sudah ada,
 * jadi aman dibiarkan terpasang; setelah login pertama, hapus variabelnya.
 */
export async function bootstrapAdmin(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<BootstrapResult> {
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return 'skipped_not_configured';

  const parsed = createUserSchema.parse({ email, password, name: env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Admin', role: 'admin', unit: 'CCP', jabatan: 'Admin' });
  const hash = await hashPassword(parsed.password);
  return db.transaction(async (tx) => {
    const n = (await tx.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM users'))!.n;
    if (n > 0) return 'skipped_users_exist';
    // ON CONFLICT: dua instance yang start bersamaan tidak saling bertabrakan.
    const rows = await tx.query<{ id: number }>(
      'INSERT INTO users (email, password_hash, name, role, unit, jabatan) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id',
      [parsed.email, hash, parsed.name, 'admin', parsed.unit, parsed.jabatan],
    );
    if (rows.length === 0) return 'skipped_users_exist';
    await audit(tx, rows[0]!.id, 'bootstrap.admin', 'user', rows[0]!.id);
    return 'created';
  });
}
