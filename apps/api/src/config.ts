import { randomBytes } from 'node:crypto';

export interface Config {
  env: 'development' | 'production' | 'test';
  port: number;
  databasePath: string;
  sessionTtlMs: number;
  cookieSecure: boolean;
  /** Origin tambahan yang boleh melakukan request tulis (mis. Vite dev server). */
  allowedOrigins: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  return {
    env: mode,
    port: Number(env.PORT ?? 3001),
    databasePath: env.DATABASE_PATH ?? 'data/ccp.sqlite',
    sessionTtlMs: Number(env.SESSION_TTL_HOURS ?? 24 * 7) * 3_600_000,
    cookieSecure: mode === 'production',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export const generateToken = (): string => randomBytes(32).toString('base64url');
