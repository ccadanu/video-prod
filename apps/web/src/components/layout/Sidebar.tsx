import { ChevronDown, ClipboardList, KanbanSquare, LayoutDashboard, LogOut, MessageSquareText, Target, UserCog, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ROLE_LABEL, navFor, type NavItem, type NavKey } from '@ccp/shared';
import { useAuth } from '../../lib/auth';
import { BUILT } from '../../lib/access';
import { cx } from '../ui';

const ICON: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  'brief-order': ClipboardList,
  'production-board': KanbanSquare,
  'weekly-listing': KanbanSquare,
  'daily-shooting': KanbanSquare,
  'editing-schedule': KanbanSquare,
  'editing-execution': KanbanSquare,
  kpi: Target,
  'blind-review': MessageSquareText,
  'admin-users': UserCog,
};

const ITEM = 'flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] text-[#b4c7d6] transition-colors hover:bg-white/5 hover:text-white';
const ACTIVE = 'bg-brand-500/20 text-white shadow-[inset_3px_0_0_var(--color-orange-500)]';

function Soon({ navKey }: { navKey: string }) {
  if (BUILT.has(navKey)) return null;
  return (
    <span title="Segera hadir" className="ml-auto flex-none">
      <span aria-hidden="true" className="block h-1.5 w-1.5 rounded-full bg-orange-500/70" />
      <span className="sr-only">(segera hadir)</span>
    </span>
  );
}

function Group({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(item.path);
  const [open, setOpen] = useState(true);
  const Icon = ICON[item.key];
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cx(ITEM, 'w-full', active && 'text-white')}>
        <Icon size={16} />
        {item.label}
        <ChevronDown size={14} className={cx('ml-auto transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
          {item.children?.map((c) => (
            <NavLink key={c.key} to={c.path} className={({ isActive }) => cx(ITEM, 'py-1.5 text-[12.5px]', isActive && ACTIVE)}>
              {c.label}
              <Soon navKey={c.key} />
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = navFor(user.role);

  return (
    <aside className="relative flex h-full w-[232px] flex-none flex-col overflow-hidden bg-navy-900 px-3.5 py-[18px] text-[#c7d6e2]">
      <div className="flex items-center gap-2.5 px-2 pb-5 pt-1.5">
        <img src="/logo-mark.png" alt="" width={26} height={36} className="h-9 w-auto" />
        <div className="leading-tight">
          <b className="font-display text-[15px] font-bold text-white">CCP Video</b>
          <span className="block text-[10.5px] text-[#8fa8bc]">PT Adanu Adhinata Semesta</span>
        </div>
      </div>

      <nav aria-label="Menu utama" className="relative z-10 flex flex-col gap-0.5">
        {items.map((item) =>
          item.children ? (
            item.children.length > 0 && <Group key={item.key} item={item} />
          ) : (
            <NavLink key={item.key} to={item.path} className={({ isActive }) => cx(ITEM, isActive && ACTIVE)}>
              {(() => { const Icon = ICON[item.key]; return <Icon size={16} />; })()}
              {item.label}
              <Soon navKey={item.key} />
            </NavLink>
          ),
        )}
      </nav>

      {/* Tekstur anyaman: halus, hanya di dasar sidebar. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-56 text-white">
        <div className="weave absolute inset-0 opacity-[0.06]" />
        <div className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-900/60 to-transparent" />
      </div>

      <div className="relative z-10 -mx-3.5 mt-auto border-t border-white/10 bg-navy-900 px-3.5 pt-3">
        <NavLink to="/account" className={({ isActive }) => cx(ITEM, 'items-start', isActive && ACTIVE)}>
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">{user.name[0]}</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[12.5px] font-semibold text-white">{user.name}</span>
            <span className="block truncate text-[10.5px] text-[#8fa8bc]">{ROLE_LABEL[user.role]}</span>
          </span>
        </NavLink>
        <button onClick={() => void logout()} className={cx(ITEM, 'mt-0.5 w-full')}>
          <LogOut size={15} /> Keluar
        </button>
      </div>
    </aside>
  );
}
