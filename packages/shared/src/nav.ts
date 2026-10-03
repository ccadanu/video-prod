import type { Role } from './roles';

export type NavKey =
  | 'dashboard'
  | 'brief-order'
  | 'production-board'
  | 'weekly-listing'
  | 'daily-shooting'
  | 'editing-schedule'
  | 'editing-execution'
  | 'kpi'
  | 'blind-review'
  | 'admin-users';

export interface NavItem {
  key: NavKey;
  label: string;
  path: string;
  /** Peran yang melihat menu ini (aksi di dalamnya dibatasi terpisah). */
  roles: readonly Role[];
  children?: readonly NavItem[];
}

const ALL: readonly Role[] = ['user', 'leader', 'videografer', 'editor', 'admin'];

/** Struktur sidebar final (PRD §3). Hak akses menu diturunkan dari PRD §2. */
export const NAV: readonly NavItem[] = [
  { key: 'dashboard', label: 'Dashboard Statistik', path: '/dashboard', roles: ['user', 'leader', 'admin'] },
  { key: 'brief-order', label: 'Brief Order', path: '/brief-order', roles: ['user', 'leader', 'admin'] },
  {
    key: 'production-board',
    label: 'Production Board',
    path: '/production-board',
    roles: ['user', 'leader', 'videografer', 'editor', 'admin'],
    children: [
      { key: 'weekly-listing', label: 'Weekly Listing', path: '/production-board/weekly-listing', roles: ['user', 'leader', 'videografer', 'admin'] },
      { key: 'daily-shooting', label: 'Daily Shooting', path: '/production-board/daily-shooting', roles: ['leader', 'videografer', 'admin'] },
      { key: 'editing-schedule', label: 'Brief Editing Schedule', path: '/production-board/editing-schedule', roles: ['leader', 'admin'] },
      { key: 'editing-execution', label: 'Editing Execution', path: '/production-board/editing-execution', roles: ['leader', 'editor', 'admin'] },
    ],
  },
  { key: 'kpi', label: 'KPI Individu', path: '/kpi', roles: ['leader', 'videografer', 'editor', 'admin'] },
  { key: 'blind-review', label: 'Blind Review', path: '/blind-review', roles: ALL },
  { key: 'admin-users', label: 'Kelola Pengguna', path: '/admin/users', roles: ['admin'] },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    ...(item.children ? { children: item.children.filter((c) => c.roles.includes(role)) } : {}),
  }));
}

export function flattenNav(items: readonly NavItem[]): NavItem[] {
  return items.flatMap((item) => (item.children?.length ? [...item.children] : [item]));
}
