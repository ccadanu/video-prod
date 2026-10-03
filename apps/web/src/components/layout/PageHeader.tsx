import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="relative flex flex-wrap items-center gap-3 overflow-hidden px-7 pb-3 pt-[18px]">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex-1" />
      <div className="relative z-10 flex items-center gap-2">{actions}</div>
      {/* Aksen anyaman di tepi kanan header (sangat halus). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-64 text-brand-500 md:block">
        <div className="weave absolute inset-0 opacity-[0.07]" />
        <div className="absolute inset-0 bg-gradient-to-r from-canvas to-transparent" />
      </div>
    </header>
  );
}
