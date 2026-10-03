import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** Menu aksi kartu (Hold / Reschedule / Tunda). Tutup dengan klik di luar atau Escape. */
export function KebabMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded p-0.5 text-faint hover:bg-line-soft hover:text-ink">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-6 z-20 min-w-[190px] rounded-[10px] border border-line bg-white p-1 shadow-[0_8px_30px_rgb(16_27_36/0.16)]">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={`block w-full rounded-md px-2.5 py-2 text-left text-[12.5px] hover:bg-line-soft ${it.danger ? 'text-danger' : ''}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
