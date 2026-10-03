import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { PRIORITY_LABEL, type EditCard, type EditSla } from '@ccp/shared';
import { fmtDateTime, fmtYmd } from '../../lib/format';
import { Badge, Drawer, JenisChip, StatusPill } from '../ui';

const SHORT_DAY = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
/** 'YYYY-MM-DD' → "Rab 07 Okt". */
export function fmtDay(ymd: string): string {
  const dow = (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;
  return `${SHORT_DAY[dow]} ${fmtYmd(ymd)}`;
}

export function SlaTag({ sla }: { sla: EditSla }) {
  if (sla === 'telat') return <Badge tone="red">Telat</Badge>;
  if (sla === 'hari_ini') return <Badge tone="amber">Tenggat hari ini</Badge>;
  if (sla === 'aman') return <Badge tone="green">Sesuai SLA</Badge>;
  return null;
}

export function OriginChip({ origin }: { origin: EditCard['origin'] }) {
  return origin === 'daily' ? (
    <span className="rounded-md bg-[#e5f5ea] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803d]">Daily</span>
  ) : (
    <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">Dari Syuting</span>
  );
}

export function PriorityTag({ priority }: { priority: EditCard['priority'] }) {
  return priority === 'tinggi' ? <Badge tone="coral">★ {PRIORITY_LABEL.tinggi}</Badge> : null;
}

/** Lama menunggu dalam hari kalender (cukup untuk antrean harian). */
export function waitingLabel(iso: string, now: number = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'hari ini' : `${days} hari lalu`;
}

const Row = ({ k, children }: { k: string; children: ReactNode }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-line-soft py-2 text-[13px] last:border-0">
    <dt className="text-muted">{k}</dt>
    <dd className="font-medium">{children}</dd>
  </div>
);

const link = 'inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline';

/** Detail satu konten editing. `children` = aksi khusus peran (assign, checklist, kirim). */
export function EditDetailDrawer({ card, onClose, footer, children }: { card: EditCard | null; onClose: () => void; footer?: ReactNode; children?: ReactNode }) {
  return (
    <Drawer open={card !== null} title={card?.judul ?? ''} subtitle={card ? `${card.code} · ${card.produk}` : undefined} onClose={onClose} footer={footer}>
      {card && (
        <>
          {card.revisionReason && (
            <p className="mb-3 rounded-lg bg-[#fbe4e1] px-3 py-2 text-xs text-[#b03a2e]"><b>Catatan revisi dari User:</b> {card.revisionReason}</p>
          )}
          {children}
          <h3 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-faint">Konten</h3>
          <dl>
            <Row k="Status"><StatusPill status={card.status} />{card.revisionCount > 0 && <span className="ml-1.5 text-[11px] font-bold text-danger">Rev {card.revisionCount}×</span>}</Row>
            <Row k="Jenis"><JenisChip jenis={card.jenis} /> <OriginChip origin={card.origin} /></Row>
            <Row k="Kategori">{card.kategori}</Row>
            <Row k="Rasio · Durasi">{card.rasio} · {card.durasiDetik === null ? '—' : `${card.durasiDetik} dtk`}</Row>
            <Row k="Editor">{card.editorName ?? <span className="font-normal text-faint">Belum di-assign</span>}</Row>
            <Row k="Jadwal">{card.scheduledFor ? `${fmtDay(card.scheduledFor)} → tenggat ${card.dueDate ? fmtDay(card.dueDate) : '—'}` : <span className="font-normal text-faint">Belum dijadwalkan</span>}</Row>
            <Row k="Masuk antrean">{fmtDateTime(card.queuedAt)}</Row>
            <Row k="Naskah / brief"><a className={link} href={card.linkDocs} target="_blank" rel="noopener noreferrer">Buka Google Docs <ExternalLink size={12} /></a></Row>
            {card.catatan && <Row k="Catatan">{card.catatan}</Row>}
          </dl>
          {card.footage && (
            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Footage dari syuting</h3>
              {card.footage.storage === 'drive' && card.footage.driveUrl ? (
                <a className={link} href={card.footage.driveUrl} target="_blank" rel="noopener noreferrer">Buka folder Drive <ExternalLink size={12} /></a>
              ) : (
                <p className="text-xs">🖥️ {card.footage.diskName} · {card.footage.path}{card.footage.fileName}</p>
              )}
              <p className="mt-1 text-[11px] text-faint">Diserahkan {fmtDateTime(card.footage.handedAt)}{card.footage.handedByName ? ` oleh ${card.footage.handedByName}` : ''}</p>
            </section>
          )}
          {card.versions.length > 0 && (
            <section className="mt-4">
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Versi hasil</h3>
              <ul className="space-y-1.5 text-xs">
                {[...card.versions].reverse().map((v) => (
                  <li key={v.version} className="rounded-md bg-canvas px-2.5 py-1.5">
                    <a className={link} href={v.url} target="_blank" rel="noopener noreferrer">v{v.version} <ExternalLink size={11} /></a>
                    <span className="ml-2 text-faint">{fmtDateTime(v.at)}{v.byName ? ` · ${v.byName}` : ''}</span>
                    {v.note && <p className="mt-0.5 text-muted">{v.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
