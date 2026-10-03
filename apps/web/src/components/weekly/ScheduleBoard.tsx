import { useState } from 'react';
import { DAY_NAMES, PLANNING_STATUSES, type DayInfo, type WeekDto, type WeeklyContent } from '@ccp/shared';
import { fmtYmd } from '../../lib/format';
import { Empty, JenisChip, cx } from '../ui';

interface Props {
  week: WeekDto;
  canEdit: boolean;
  showOps: boolean; // kapasitas, SDM, shotlist/skrip (bukan untuk User)
  onMove: (c: WeeklyContent, day: number | null) => void;
  onOpen: (c: WeeklyContent) => void;
  onOpenSdm: (day: number) => void;
  onDoc: (day: DayInfo, kind: 'shotlist' | 'skrip') => void;
}

function Card({ c, draggable, onOpen }: { c: WeeklyContent; draggable: boolean; onOpen: () => void }) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(c.id))}
      className={cx('rounded-lg border bg-white p-2 shadow-sm', draggable && 'cursor-grab active:cursor-grabbing', c.sdmIssue ? 'border-[#f5c0b5] bg-[#fff8f7]' : 'border-line')}
    >
      <button onClick={onOpen} className="mb-1.5 block w-full text-left text-[11.5px] font-semibold leading-snug hover:text-brand-700 focus-visible:underline">
        {c.judul}{c.sdmIssue && <span className="ml-1 text-[9px] text-danger" title="SDM belum Ready">⚠</span>}
      </button>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-[#fdecec] px-1.5 text-[9.5px] text-[#c0483c]">{c.talent}</span>
        <span className="rounded bg-brand-50 px-1.5 text-[9.5px] text-brand-700">{c.lokasi === 'Lainnya' && c.lokasiDetail ? c.lokasiDetail : c.lokasi}</span>
        <JenisChip jenis={c.jenis} className="!px-1.5 !py-0 !text-[9.5px]" />
        <span className={cx('rounded px-1.5 text-[9.5px]', c.bobot === 'susah' ? 'bg-[#fbe4e1] font-semibold text-[#b03a2e]' : 'bg-[#eaf6ee] text-[#15803d]')}>
          {c.bobot === 'susah' ? 'Susah ×2' : 'Gampang'}
        </span>
      </div>
    </div>
  );
}

function Column({
  title, sub, tone, over, onDropContent, children, head,
}: {
  title: string; sub: string; tone?: 'warn'; over?: boolean; onDropContent?: (id: number) => void; children: React.ReactNode; head?: React.ReactNode;
}) {
  const [hot, setHot] = useState(false);
  return (
    <section
      aria-label={title}
      onDragOver={onDropContent ? (e) => { e.preventDefault(); setHot(true); } : undefined}
      onDragLeave={() => setHot(false)}
      onDrop={onDropContent ? (e) => { e.preventDefault(); setHot(false); const id = Number(e.dataTransfer.getData('text/plain')); if (id) onDropContent(id); } : undefined}
      className={cx(
        'flex max-h-full w-[236px] flex-none flex-col rounded-xl border bg-[#f7f9fb]',
        tone === 'warn' ? 'border-[#f0dcc2] bg-[#fff8f0]' : over ? 'border-[#f5c0b5]' : 'border-line',
        hot && 'ring-2 ring-brand-400',
      )}
    >
      <header className="border-b border-line px-3 py-2.5">
        <div className="flex items-center justify-between">
          <b className="text-[13px]">{title}</b>
          <span className="text-[11px] text-muted">{sub}</span>
        </div>
        {head}
      </header>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

/** Tab Jadwal (papan): kolom per hari dengan bar kapasitas, indikator SDM, dan chip Shotlist/Skrip. Kartu bisa diseret oleh VG. */
export function ScheduleBoard({ week, canEdit, showOps, onMove, onOpen, onOpenSdm, onDoc }: Props) {
  const byId = new Map(week.contents.map((c) => [c.id, c]));
  const move = (id: number, day: number | null) => {
    const c = byId.get(id);
    if (c && c.day !== day && PLANNING_STATUSES.includes(c.status)) onMove(c, day);
  };
  const unscheduled = week.contents.filter((c) => c.day === null && PLANNING_STATUSES.includes(c.status));

  return (
    <div className="flex h-[calc(100vh-290px)] gap-3 overflow-x-auto pb-2">
      <Column title="Belum Dijadwal" sub={String(unscheduled.length)} tone="warn" onDropContent={canEdit ? (id) => move(id, null) : undefined}
        head={<p className="mt-1 text-[10.5px] text-orange-800">{canEdit ? 'Seret ke hari syuting, atau pilih di tab Locking' : 'Menunggu dijadwalkan Videografer'}</p>}>
        {unscheduled.length === 0 ? <Empty>Semua terjadwal 🎉</Empty> : unscheduled.map((c) => <Card key={c.id} c={c} draggable={canEdit} onOpen={() => onOpen(c)} />)}
      </Column>

      {week.days.map((d) => {
        const items = week.contents.filter((c) => c.day === d.day);
        const over = d.slots !== null && d.capacity !== null && d.slots > d.capacity;
        const pct = d.slots !== null && d.capacity ? Math.min(100, Math.round((d.slots / d.capacity) * 100)) : 0;
        const prev = d.day === 0 ? 'Sabtu' : DAY_NAMES[d.day - 1];
        const allReady = d.sdmTotal > 0 && d.sdmReady === d.sdmTotal;
        const doc = (kind: 'shotlist' | 'skrip') => {
          const url = kind === 'shotlist' ? d.shotlistUrl : d.skripUrl;
          const name = kind === 'shotlist' ? 'Shotlist' : 'Skrip';
          if (url) return <a key={kind} href={url} target="_blank" rel="noopener noreferrer" title={`Dibuat oleh ${(kind === 'shotlist' ? d.shotlistByName : d.skripByName) ?? '—'}`} className="flex-1 rounded-md border border-[#b7e0c4] bg-[#e5f5ea] px-1 py-1 text-center text-[10px] font-semibold text-[#15803d]">{name} ✓</a>;
          const label = `${name} (H-1: ${prev})`;
          if (d.docsOpen && canEdit) return <button key={kind} onClick={() => onDoc(d, kind)} className="flex-1 rounded-md border border-dashed border-[#cbd5dd] px-1 py-1 text-center text-[10px] font-semibold text-muted hover:border-brand-400 hover:text-brand-700">{label}</button>;
          return <span key={kind} title={d.docsOpen ? 'Menunggu Videografer' : 'Terbuka setelah semua SDM hari ini Ready'} className="flex-1 cursor-not-allowed rounded-md border border-dashed border-line bg-line-soft px-1 py-1 text-center text-[10px] font-semibold text-faint">{label}</span>;
        };

        return (
          <Column
            key={d.day}
            title={DAY_NAMES[d.day]!}
            sub={`${fmtYmd(d.date)} · ${d.count} konten`}
            over={over}
            onDropContent={canEdit ? (id) => move(id, d.day) : undefined}
            head={
              showOps && (
                <div className="mt-2 space-y-1.5">
                  <div>
                    <div className="mb-0.5 flex justify-between text-[10.5px] text-muted">
                      <span>Kapasitas <b className="text-ink">{d.slots}/{d.capacity}</b> slot{d.day === 4 && <span className="text-orange-800"> · ½ hari</span>}</span>
                      {over && <b className="text-danger">⚠ over</b>}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded bg-[#e7ecf0]" role="progressbar" aria-valuenow={d.slots ?? 0} aria-valuemax={d.capacity ?? 0} aria-label={`Kapasitas ${DAY_NAMES[d.day]}`}>
                      <div className={cx('h-full rounded', over ? 'bg-danger' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button onClick={() => onOpenSdm(d.day)} className="flex w-full items-center gap-2 rounded-md border border-line bg-white px-2 py-1 text-left text-[11px] text-muted hover:border-brand-300 hover:bg-brand-50/50">
                    <span aria-hidden="true" className={cx('h-2 w-2 flex-none rounded-full', d.sdmTotal === 0 ? 'bg-faint' : allReady ? 'bg-ok' : 'bg-danger')} />
                    <span className="flex-1">SDM: <b className="text-ink">{d.sdmTotal === 0 ? 'Tidak ada' : `${d.sdmReady}/${d.sdmTotal} Ready`}</b></span>
                    <span aria-hidden="true">›</span>
                  </button>
                  <div className="flex gap-1.5">{doc('shotlist')}{doc('skrip')}</div>
                </div>
              )
            }
          >
            {items.length === 0 ? <p className="px-1 py-2 text-[11px] text-faint">Belum ada konten</p> : items.map((c) => <Card key={c.id} c={c} draggable={canEdit && PLANNING_STATUSES.includes(c.status)} onOpen={() => onOpen(c)} />)}
          </Column>
        );
      })}
    </div>
  );
}
