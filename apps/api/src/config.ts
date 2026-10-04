import { randomBytes } from 'node:crypto';

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  /** postgres://… (server mana pun) atau pglite:<folder> (Postgres tertanam, untuk dev/tes). */
  databaseUrl: string;
  sessionTtlMs: number;
  cookieSecure: boolean;
  /** 'lax' bila web & API satu situs (disarankan, lewat reverse proxy); 'none' bila beda situs (butuh HTTPS). */
  cookieSameSite: 'lax' | 'strict' | 'none';
  /** Origin tambahan yang boleh melakukan request tulis (mis. Vite dev server). */
  allowedOrigins: string[];
  /** Folder hasil build web. Terisi = API juga melayani web (satu proses/satu origin), tanpa reverse proxy khusus. */
  webDist: string | null;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  if (mode === 'production' && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL wajib diisi di production (postgres://user:pass@host:5432/db).');
  }
  return {
    env: mode,
    port: Number(env.PORT ?? 3001),
    databaseUrl: env.DATABASE_URL ?? 'pglite:data/pgdata',
    sessionTtlMs: Number(env.SESSION_TTL_HOURS ?? 24 * 7) * 3_600_000,
    // Production default Secure (wajib HTTPS). Jaringan internal tanpa HTTPS: set COOKIE_SECURE=false secara sadar.
    cookieSecure: env.COOKIE_SECURE !== undefined ? env.COOKIE_SECURE === 'true' : mode === 'production' || env.COOKIE_SAMESITE === 'none',
    cookieSameSite: env.COOKIE_SAMESITE === 'none' || env.COOKIE_SAMESITE === 'strict' ? env.COOKIE_SAMESITE : 'lax',
    webDist: env.WEB_DIST?.trim() || null,
    logLevel: env.LOG_LEVEL ?? 'info',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export const generateToken = (): string => randomBytes(32).toString('base64url');
