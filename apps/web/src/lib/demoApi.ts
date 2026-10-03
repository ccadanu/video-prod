import {
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
  type UserDto,
} from '@ccp/shared';
import { ZodError } from 'zod';
import { ApiError } from './api';

/**
 * API tiruan untuk pratinjau statis. Meniru kontrak dan aturan server (validasi, pesan galat,
 * larangan mengunci akun sendiri), tetapi data hanya hidup di memori browser dan hilang saat dimuat ulang.
 */
export { DEMO_PASSWORD } from './demoAccounts';
import { DEMO_PASSWORD } from './demoAccounts';

interface Rec extends UserDto {
  password: string;
}

let nextId = 7;
const users: Rec[] = [
  { id: 1, email: 'admin@ccp.local', name: 'Admin CCP', role: 'admin', unit: 'CCP', jabatan: 'Admin', active: true, password: DEMO_PASSWORD },
  { id: 2, email: 'leader@ccp.local', name: 'Nadia Pratama', role: 'leader', unit: 'CCP', jabatan: 'Leader Produksi', active: true, password: DEMO_PASSWORD },
  { id: 3, email: 'hardi@ccp.local', name: 'Hardi', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', active: true, password: DEMO_PASSWORD },
  { id: 4, email: 'yofa@ccp.local', name: 'Yofa', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', active: true, password: DEMO_PASSWORD },
  { id: 5, email: 'dio@ccp.local', name: 'Dio', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', active: true, password: DEMO_PASSWORD },
  { id: 6, email: 'arya@ccp.local', name: 'Arya Akbar Subakti', role: 'user', unit: 'Marketing', jabatan: 'Marketing Staff', active: true, password: DEMO_PASSWORD },
];

const KEY = 'ccp-demo-session';
let currentId: number | null = null;
try {
  const saved = sessionStorage.getItem(KEY);
  if (saved) currentId = Number(saved);
} catch {
  /* storage diblokir: sesi demo hanya bertahan sampai halaman dimuat ulang */
}
const setCurrent = (id: number | null) => {
  currentId = id;
  try {
    if (id === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(id));
  } catch {
    /* abaikan */
  }
};

const dto = ({ password: _password, ...u }: Rec): UserDto => u;
const me = (): Rec | undefined => users.find((u) => u.id === currentId && u.active);

function needAuth(): Rec {
  const u = me();
  if (!u) throw new ApiError(401, 'unauthenticated', 'Silakan login terlebih dahulu');
  return u;
}
function needAdmin(): Rec {
  const u = needAuth();
  if (u.role !== 'admin') throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
function find(id: string): Rec {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  const u = users.find((x) => x.id === n);
  if (!u) throw new ApiError(404, 'not_found', 'Pengguna tidak ditemukan');
  return u;
}

function route(method: string, path: string, body: unknown): unknown {
  if (method === 'POST' && path === '/api/auth/login') {
    const { email, password } = loginSchema.parse(body);
    const u = users.find((x) => x.email === email);
    if (!u || !u.active || u.password !== password) throw new ApiError(401, 'invalid_credentials', 'Email atau password salah');
    setCurrent(u.id);
    return { user: dto(u) };
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    setCurrent(null);
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/auth/me') return { user: dto(needAuth()) };
  if (method === 'POST' && path === '/api/auth/change-password') {
    const u = needAuth();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);
    if (u.password !== currentPassword) throw new ApiError(400, 'wrong_password', 'Password saat ini salah');
    u.password = newPassword;
    return { ok: true };
  }

  if (path === '/api/users' && method === 'GET') {
    needAdmin();
    return { users: [...users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map(dto) };
  }
  if (path === '/api/users' && method === 'POST') {
    needAdmin();
    const input = createUserSchema.parse(body);
    if (users.some((u) => u.email === input.email)) throw new ApiError(409, 'email_taken', 'Email sudah terdaftar');
    const rec: Rec = { id: nextId++, active: true, ...input };
    users.push(rec);
    return { user: dto(rec) };
  }
  const m = /^\/api\/users\/([^/]+)(\/reset-password)?$/.exec(path);
  if (m) {
    const admin = needAdmin();
    const target = find(m[1]!);
    if (m[2] && method === 'POST') {
      target.password = resetPasswordSchema.parse(body).newPassword;
      if (target.id === currentId) setCurrent(null);
      return { ok: true };
    }
    if (!m[2] && method === 'PATCH') {
      const patch = updateUserSchema.parse(body);
      if (target.id === admin.id && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
        throw new ApiError(400, 'self_lockout', 'Anda tidak bisa menonaktifkan atau menurunkan peran akun sendiri');
      }
      Object.assign(target, patch);
      return { user: dto(target) };
    }
  }
  throw new ApiError(404, 'not_found', 'Endpoint tidak ditemukan');
}

export async function demoApi<T>(path: string, method: string, body: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 120)); // terasa seperti jaringan
  try {
    return route(method, path, body) as T;
  } catch (e) {
    if (e instanceof ZodError) {
      throw new ApiError(400, 'validation', e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
    }
    throw e;
  }
}
