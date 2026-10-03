import { NAV, flattenNav, navFor, type NavItem, type NavKey, type Role } from '@ccp/shared';

/** Halaman kerja utama tiap peran (tujuan setelah login). Jika tidak tersedia, jatuh ke menu pertama. */
const HOME: Record<Role, NavKey> = {
  user: 'brief-order',
  leader: 'brief-order',
  videografer: 'weekly-listing',
  editor: 'editing-execution',
  admin: 'admin-users',
};

export function homePathFor(role: Role): string {
  const items = flattenNav(navFor(role));
  return (items.find((n) => n.key === HOME[role]) ?? items[0])?.path ?? '/account';
}

/** Halaman di luar NAV (mis. /account) terbuka untuk semua yang sudah login. */
export function canAccessPath(role: Role, pathname: string): boolean {
  const all: NavItem[] = NAV.flatMap((n) => [n, ...(n.children ?? [])]);
  const match = all
    .filter((n) => pathname === n.path || pathname.startsWith(`${n.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match ? match.roles.includes(role) : true;
}

/** Fitur yang sudah dibangun; sisanya tampil sebagai "Segera" di sidebar. */
export const BUILT = new Set<string>(['admin-users', 'brief-order', 'weekly-listing', 'daily-shooting']);

export const ROADMAP: Record<string, { phase: string; blurb: string }> = {
  dashboard: { phase: 'Fase 5', blurb: 'Rangkuman performa tim: konten selesai, kepuasan User, kesesuaian SLA, revision rate.' },
  'brief-order': { phase: 'Fase 1 · MVP', blurb: 'Buat brief, lacak status tiap konten, dan Approve / Minta Revisi saat In Review.' },
  'production-board': { phase: 'Fase 3 · MVP', blurb: 'Ringkasan papan produksi lintas tahap.' },
  'weekly-listing': { phase: 'Fase 2 · MVP', blurb: 'Locking atribut, jadwal syuting per hari dengan kapasitas slot, dan validasi SDM oleh Leader.' },
  'daily-shooting': { phase: 'Fase 3 · MVP', blurb: 'Board syuting harian: take, bukti serah footage, Pull / Hold / Reschedule.' },
  'editing-schedule': { phase: 'Fase 4', blurb: 'Leader meng-assign editor dan menjadwalkan editing. Menunggu keputusan SLA & kapasitas editor.' },
  'editing-execution': { phase: 'Fase 4', blurb: 'Board editor: To Do → On Progress → In Review.' },
  kpi: { phase: 'Fase 5', blurb: 'Performa per peran dan per individu untuk coaching.' },
  'blind-review': { phase: 'Fase 5', blurb: 'Evaluasi berkala dengan blind review dan FGD.' },
};
