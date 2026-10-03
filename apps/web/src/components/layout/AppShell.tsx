import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import logoMark from '../../assets/logo-mark.png';
import { IS_DEMO } from '../../lib/demo';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="flex h-full">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div aria-hidden="true" onClick={() => setNavOpen(false)} className="fixed inset-0 z-30 bg-navy-950/40 md:hidden" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-none items-center gap-3 border-b border-line bg-white px-4 py-2 md:hidden">
          <button onClick={() => setNavOpen(true)} aria-label="Buka menu" aria-expanded={navOpen} aria-controls="app-sidebar" className="rounded-md p-1.5 hover:bg-line-soft">
            <Menu size={20} />
          </button>
          <img src={logoMark} alt="" className="h-7 w-auto" />
          <b className="font-display text-[14px]">CCP Video</b>
        </header>
        <main className="relative flex min-w-0 flex-1 flex-col overflow-auto">
          {IS_DEMO && (
            <p role="note" className="flex-none bg-orange-100 px-4 py-1.5 text-center text-xs text-orange-800 md:px-7">
              <b>Mode pratinjau.</b> Data hanya ada di browser ini dan kembali ke awal saat halaman dimuat ulang.
            </p>
          )}
          <div className="flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
