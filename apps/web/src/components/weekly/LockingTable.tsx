import { BOBOT, BOBOT_LABEL, DAY_NAMES, PLANNING_STATUSES, SLOT_PER_BOBOT, isLokasiLuar, type WeeklyContent } from '@ccp/shared';
import { cx, JenisChip, StatusPill } from '../ui';

interface Props {
  contents: WeeklyContent[];
  canEdit: boolean;
  onBobot: (c: WeeklyContent, bobot: (typeof BOBOT)[number]) => void;
  onDay: (c: WeeklyContent, day: number | null) => void;
  onOpen: (c: WeeklyContent) => void;
}

const TH = 'whitespace-nowrap px-2.5 py-2 text-left text-xs font-semibold text-[#42505c]';
const TD = 'whitespace-nowrap px-2.5 py-1.5 align-middle';
const SELECT = 'rounded-md border border-line bg-white px-1.5 py-1 text-[11.5px] focus:border-brand-500 focus:outline-none disabled:bg-canvas disabled:text-faint';

/** Tab Locking: validasi atribut, bobot, dan hari syuting per konten. Kolom abu = otomatis dari Brief. */
export function LockingTable({ contents, canEdit, onBobot, onDay, onOpen }: Props) {
  return (
    <div className="relative max-h-[calc(100vh-290px)] overflow-auto rounded-xl border border-line bg-white shadow-card">
      <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th colSpan={2} className="bg-white" />
            <th colSpan={6} className="bg-[#f3f5f7] px-2.5 pb-0.5 pt-2 text-left text-[10px] font-bold uppercase tracking-wider text-faint">Dari Brief (otomatis)</th>
            <th colSpan={7} className="bg-[#f0f8f6] px-2.5 pb-0.5 pt-2 text-left text-[10px] font-bold uppercase tracking-wider text-faint">Atribut Videografer · validasi</th>
          </tr>
          <tr className="bg-canvas">
            {['#', 'Status', 'Judul Konten', 'Produk', 'User', 'Kategori', 'Jenis', 'Brief', 'Talent', 'Kostum', 'Lokasi', 'Properti', 'Kebutuhan Desain', 'Bobot', 'Hari Syuting'].map((h, i) => (
              <th key={h} className={cx(TH, 'border-b border-line', i >= 2 && i <= 7 && 'bg-[#f3f5f7]', i >= 8 && 'bg-[#f0f8f6]')}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contents.map((c, i) => {
            const planning = PLANNING_STATUSES.includes(c.status);
            const editable = canEdit && planning;
            return (
              <tr key={c.id} className={cx('group border-b border-line-soft', c.sdmIssue ? 'bg-[#fff5f4]' : 'hover:bg-brand-50/40')}>
                <td className={cx(TD, 'text-faint')}>{i + 1}</td>
                <td className={TD}>
                  {c.sdmIssue ? <span className="rounded-full bg-[#fbe4e1] px-2 py-0.5 text-[10px] font-semibold text-[#b03a2e]">⚠ SDM</span> : <StatusPill status={c.status} />}
                </td>
                <td className={cx(TD, 'max-w-[220px] bg-[#f3f5f7] font-semibold')}>
                  <button onClick={() => onOpen(c)} className="max-w-full truncate text-left hover:text-brand-700 focus-visible:underline" title={c.judul}>{c.judul}</button>
                </td>
                <td className={cx(TD, 'bg-[#f3f5f7]')}>{c.produk}</td>
                <td className={cx(TD, 'bg-[#f3f5f7]')}>{c.requesterName}</td>
                <td className={cx(TD, 'bg-[#f3f5f7]')}>{c.kategori}</td>
                <td className={cx(TD, 'bg-[#f3f5f7]')}><JenisChip jenis={c.jenis} /></td>
                <td className={cx(TD, 'bg-[#f3f5f7]')}>
                  <a href={c.linkDocs} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-600 hover:underline">Docs</a>
                </td>
                <td className={TD}>{c.talent}</td>
                <td className={TD}>{c.fuKostum ? <span className="rounded bg-[#fbe4e1] px-1.5 py-0.5 text-[10px] font-semibold text-[#b03a2e]">FU: {c.fuKostum}</span> : c.kostum}</td>
                <td className={TD}>
                  {c.lokasi === 'Lainnya' && c.lokasiDetail ? c.lokasiDetail : c.lokasi}{' '}
                  <span className={cx('rounded px-1 text-[9.5px]', isLokasiLuar(c.lokasi) ? 'bg-brand-50 text-brand-700' : 'bg-line-soft text-muted')}>{isLokasiLuar(c.lokasi) ? 'Luar' : 'Kantor'}</span>
                </td>
                <td className={TD}>{c.fuProperti ? <span className="rounded bg-[#fbe4e1] px-1.5 py-0.5 text-[10px] font-semibold text-[#b03a2e]">Beli: {c.fuProperti}</span> : c.properti}</td>
                <td className={TD}>{c.fuDesain ? <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">Order: {c.fuDesain}</span> : <span className="text-faint">—</span>}</td>
                <td className={TD}>
                  <label className="sr-only" htmlFor={`bobot-${c.id}`}>Bobot {c.judul}</label>
                  <select
                    id={`bobot-${c.id}`}
                    disabled={!editable}
                    value={c.bobot}
                    onChange={(e) => onBobot(c, e.target.value as (typeof BOBOT)[number])}
                    className={cx(SELECT, c.bobot === 'susah' && 'border-[#f5c0b5] bg-[#fbe4e1] font-semibold text-[#b03a2e]')}
                  >
                    {BOBOT.map((b) => <option key={b} value={b}>{BOBOT_LABEL[b]} ({SLOT_PER_BOBOT[b]})</option>)}
                  </select>
                </td>
                <td className={TD}>
                  <label className="sr-only" htmlFor={`hari-${c.id}`}>Hari syuting {c.judul}</label>
                  <select
                    id={`hari-${c.id}`}
                    disabled={!editable}
                    value={c.day === null ? '' : String(c.day)}
                    onChange={(e) => onDay(c, e.target.value === '' ? null : Number(e.target.value))}
                    className={cx(SELECT, c.day !== null && 'border-[#b7e0c4] bg-[#e5f5ea] font-semibold text-[#15803d]')}
                  >
                    <option value="">— pilih hari —</option>
                    {DAY_NAMES.map((d, di) => <option key={d} value={di}>{d}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
