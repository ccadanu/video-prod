import type { ReactNode } from 'react';

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-faint">{children}</div>;
}
