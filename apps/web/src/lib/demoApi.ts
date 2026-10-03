import {
  BRIEF_FILTERS,
  SAMPLE_BRIEFS,
  STATUSES,
  briefInputSchema,
  canEditBrief,
  canViewBriefs,
  checkBriefMove,
  draftSchema,
  isWeekly,
  jalurOf,
  requiresReason,
  slaTargetFor,
  todayJakarta,
  type BriefDetail,
  type BriefEvent,
  type BriefFilter,
  type BriefInput,
  type BriefListItem,
  type Status,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
  type UserDto,
} from '@ccp/shared';
import { ZodError, z } from 'zod';
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


// ───────────── Brief Order (memori) ─────────────

interface BriefRec {
  id: number;
  code: string;
  requesterId: number;
  input: BriefInput;
  status: Status;
  revisionCount: number;
  submittedAt: string;
  completedAt: string | null;
  history: { from: Status | null; to: Status; actorId: number | null; reason: string; at: string }[];
}

const DAY = 86_400_000;
const briefs: BriefRec[] = [];
const drafts = new Map<number, Record<string, unknown>>();
let nextBriefId = 1;

function demoCode(at: Date): string {
  const prefix = `VID-${todayJakarta(at).replaceAll('-', '')}-`;
  return `${prefix}${String(briefs.filter((b) => b.code.startsWith(prefix)).length + 1).padStart(3, '0')}`;
}

function pushBrief(requesterId: number, input: BriefInput, status: Status, at: Date, extra: Partial<BriefRec> = {}, reason = ''): BriefRec {
  const rec: BriefRec = {
    id: nextBriefId++, code: demoCode(at), requesterId, input, status, revisionCount: 0, submittedAt: at.toISOString(), completedAt: null,
    history: [{ from: null, to: status, actorId: requesterId, reason, at: at.toISOString() }], ...extra,
  };
  briefs.push(rec);
  return rec;
}

for (const s of [...SAMPLE_BRIEFS].reverse()) {
  const weekly = isWeekly(s.jenis);
  const input = briefInputSchema.parse({
    jenis: s.jenis, kategori: s.kategori, produk: s.produk, judul: s.judul, rasio: s.rasio, durasiDetik: s.durasiDetik,
    linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
    attributes: weekly ? { talent: 'Cewek muda', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box product', desain: 'Tidak ada' } : null,
  });
  const at = new Date(Date.now() - s.daysAgo * DAY);
  pushBrief(6, input, s.status, at, {
    revisionCount: s.revisionCount ?? 0,
    completedAt: s.status === 'complete' ? new Date(at.getTime() + DAY).toISOString() : null,
  }, s.reason ?? '');
}

const nameOf = (id: number | null) => (id === null ? null : (users.find((u) => u.id === id)?.name ?? null));

function toItem(b: BriefRec): BriefListItem {
  const r = users.find((u) => u.id === b.requesterId);
  return {
    id: b.id, code: b.code, status: b.status, judul: b.input.judul, produk: b.input.produk, kategori: b.input.kategori, jenis: b.input.jenis,
    rasio: b.input.rasio, durasiDetik: b.input.durasiDetik, requester: { id: b.requesterId, name: r?.name ?? '—', unit: r?.unit ?? '' },
    pic: null, submittedAt: b.submittedAt, slaTargetAt: slaTargetFor(b.input.jenis, b.submittedAt), completedAt: b.completedAt, revisionCount: b.revisionCount,
  };
}

function toDetail(b: BriefRec): BriefDetail {
  const history: BriefEvent[] = b.history.map((h) => ({ from: h.from, to: h.to, actorName: nameOf(h.actorId), reason: h.reason, at: h.at }));
  return { ...toItem(b), linkDocs: b.input.linkDocs, catatan: b.input.catatan, attributes: b.input.attributes, history };
}

function viewer(): Rec {
  const u = needAuth();
  if (!canViewBriefs(u.role)) throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
function requester(): Rec {
  const u = needAuth();
  if (u.role !== 'user') throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
function visibleBrief(u: Rec, rawId: string): BriefRec {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  const b = briefs.find((x) => x.id === id);
  if (!b || (u.role === 'user' && b.requesterId !== u.id)) throw new ApiError(404, 'not_found', 'Brief tidak ditemukan');
  return b;
}

const transitionSchema = z.object({ to: z.enum(STATUSES), reason: z.string().trim().max(500).default('') });

function briefRoute(method: string, path: string, body: unknown): unknown | undefined {
  if (path === '/api/briefs/draft/me') {
    const u = requester();
    if (method === 'GET') {
      const data = drafts.get(u.id);
      return { draft: data ? { data, updatedAt: new Date().toISOString() } : null };
    }
    if (method === 'PUT') {
      const { data } = z.object({ data: draftSchema }).parse(body);
      if (JSON.stringify(data).length > 20_000) throw new ApiError(413, 'draft_too_large', 'Draf terlalu besar');
      drafts.set(u.id, data);
      return { ok: true };
    }
    if (method === 'DELETE') {
      drafts.delete(u.id);
      return { ok: true };
    }
  }

  const list = /^\/api\/briefs(?:\?(.*))?$/.exec(path);
  if (list && method === 'GET') {
    const u = viewer();
    const params = new URLSearchParams(list[1] ?? '');
    const filter = (params.get('filter') ?? 'all') as BriefFilter;
    if (!(filter in BRIEF_FILTERS)) throw new ApiError(400, 'bad_filter', 'Filter tidak dikenal');
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const rows = briefs
      .filter((b) => (u.role !== 'user' || b.requesterId === u.id) && BRIEF_FILTERS[filter](b.status))
      .filter((b) => !q || [b.code, b.input.judul, b.input.produk].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id - a.id);
    return { briefs: rows.map(toItem) };
  }
  if (path === '/api/briefs' && method === 'POST') {
    const u = requester();
    const input = briefInputSchema.parse(body);
    const rec = pushBrief(u.id, input, isWeekly(input.jenis) ? 'listing' : 'pending_review', new Date());
    drafts.delete(u.id);
    return { brief: toDetail(rec) };
  }

  const one = /^\/api\/briefs\/([^/]+)(\/transition)?$/.exec(path);
  if (one) {
    const u = viewer();
    const b = visibleBrief(u, one[1]!);
    if (!one[2] && method === 'GET') return { brief: toDetail(b) };
    if (!one[2] && method === 'PATCH') {
      requester();
      if (!canEditBrief(u.role, b.requesterId === u.id, b.status)) throw new ApiError(409, 'not_editable', 'Brief hanya bisa diubah saat dikembalikan ke Backlog');
      const input = briefInputSchema.parse(body);
      if (input.jenis !== b.input.jenis) throw new ApiError(400, 'jenis_locked', 'Jenis pengerjaan tidak bisa diubah. Buat brief baru bila jalurnya berbeda.');
      b.input = input;
      return { brief: toDetail(b) };
    }
    if (one[2] && method === 'POST') {
      const { to, reason } = transitionSchema.parse(body);
      const check = checkBriefMove({ jenis: b.input.jenis, from: b.status, to, role: u.role, isOwner: b.requesterId === u.id });
      if (!check.ok) {
        throw check.code === 'not_owner' ? new ApiError(404, 'not_found', 'Brief tidak ditemukan') : new ApiError(409, 'bad_transition', 'Perubahan status ini tidak diizinkan');
      }
      if (requiresReason(jalurOf(b.input.jenis), b.status, to) && !reason) throw new ApiError(400, 'reason_required', 'Alasan wajib diisi');
      const now = new Date().toISOString();
      if (b.status === 'backlog') b.submittedAt = now;
      if (to === 'complete') b.completedAt = now;
      if (to === 'revisi') b.revisionCount += 1;
      b.history.push({ from: b.status, to, actorId: u.id, reason, at: now });
      b.status = to;
      return { brief: toDetail(b) };
    }
  }
  return undefined;
}

function route(method: string, path: string, body: unknown): unknown {
  const handled = briefRoute(method, path, body);
  if (handled !== undefined) return handled;

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
