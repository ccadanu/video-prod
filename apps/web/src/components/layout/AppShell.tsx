import { Outlet } from 'react-router-dom';
import { IS_DEMO } from '../../lib/demo';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        {IS_DEMO && (
          <p role="note" className="flex-none bg-orange-100 px-7 py-1.5 text-center text-xs text-orange-800">
            <b>Mode pratinjau.</b> Data hanya ada di browser ini dan kembali ke awal saat halaman dimuat ulang.
          </p>
        )}
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
