import { useState } from 'react';
import { DAY_NAMES, SDM_META, SDM_TYPES, type SdmItem, type WeekDto } from '@ccp/shared';
import { ApiError } from '../../lib/api';
import { fmtDateTime, fmtYmd } from '../../lib/format';
import { Button, Drawer, cx } from '../ui';

interface Props {
  week: WeekDto;
  /** Hari yang dibuka; null = semua hari. */
  day: number | 'all' | null;
  canMark: boolean;
  onToggle: (item: SdmItem, ready: boolean) => Promise<unknown>;
  onReconfirm: (day: number) => Promise<unknown>;
  onClose: () => void;
}

export function SdmDrawer({ week, day, canMark, onToggle, onReconfirm, onClose }: Props) {
  const [error, setError] = useState('');
  const days = day === null ? [] : day === 'all' ? [0, 1, 2, 3, 4] : [day];
  const shown = days.filter((d) => week.sdm.some((i) => i.day === d));
  const ready = week.sdm.filter((i) => days.includes(i.day) && i.ready).length;
  const total = week.sdm.filter((i) => days.includes(i.day)).length;

  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan');
    }
  }

  return (
    <Drawer
      open={day !== null}
      title={day === 'all' || day === null ? 'Kebutuhan SDM semua hari' : `Kebutuhan SDM · ${DAY_NAMES[day]}`}
      subtitle={`${week.label} · ${ready}/${total} item Ready`}
      onClose={onClose}
      footer={
        <p className="text-[11px] leading-relaxed text-muted">
          {canMark ? <><b>Tidak Ready</b> → Videografer menyesuaikan hari atau talent. </> : null}
          Lokasi Kantor dan properti/kostum/desain standar otomatis Ready, jadi tidak muncul. Shotlist dan skrip bisa diunggah setelah semua SDM hari itu Ready.
        </p>
      }
    >
      {error && <p role="alert" className="mb-3 text-[12.5px] text-danger">{error}</p>}
      {shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-faint">
          Belum ada kebutuhan SDM. Item muncul setelah Locking Disepakati dan konten punya hari syuting.
        </p>
      )}
      {shown.map((d) => {
        const items = week.sdm.filter((i) => i.day === d);
        const info = week.days[d]!;
        const hasTalent = items.some((i) => i.type === 'talent');
        return (
          <section key={d} className="mb-5">
            <h3 className="mb-2 flex items-center justify-between rounded-md bg-canvas px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
              <span>{DAY_NAMES[d]} · {fmtYmd(info.date)}</span>
              <span className="font-normal normal-case tracking-normal text-faint">{info.sdmReady}/{info.sdmTotal} Ready</span>
            </h3>

            {SDM_TYPES.map((type) => {
              const group = items.filter((i) => i.type === type);
              if (group.length === 0) return null;
              return (
                <div key={type} className="mb-2">
                  <p className="mb-0.5 text-[11px] text-faint">{SDM_META[type].group}</p>
                  {group.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 border-b border-line-soft py-2 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{item.name}</p>
                        <p className="text-[11px] text-faint">
                          {item.contentCount} konten{item.ready && item.readyByName ? ` · Ready oleh ${item.readyByName}` : ''}
                        </p>
                      </div>
                      {canMark ? (
                        <button
                          onClick={() => void run(() => onToggle(item, !item.ready))}
                          aria-pressed={item.ready}
                          className={cx(
                            'whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold',
                            item.ready ? 'bg-[#e5f5ea] text-[#15803d] hover:bg-[#d5eedd]' : 'bg-[#fbe4e1] text-[#b03a2e] hover:bg-[#f6d3ce]',
                          )}
                        >
                          {item.ready ? 'Ready ✓' : 'Tidak Ready ✗'}
                        </button>
                      ) : (
                        <span className={cx('whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold', item.ready ? 'bg-[#e5f5ea] text-[#15803d]' : 'bg-[#fbe4e1] text-[#b03a2e]')}>
                          {item.ready ? 'Ready ✓' : 'Belum Ready'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {hasTalent && (
              <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted">
                {info.talentReconfirmedAt ? (
                  <span>Talent dikonfirmasi ulang oleh <b>{info.talentReconfirmedByName}</b> · {fmtDateTime(info.talentReconfirmedAt)}</span>
                ) : (
                  <span>Talent belum dikonfirmasi ulang (H-1).</span>
                )}
                {canMark && (
                  <Button size="sm" variant="ghost" onClick={() => void run(() => onReconfirm(d))}>
                    {info.talentReconfirmedAt ? 'Konfirmasi lagi' : 'Konfirmasi ulang'}
                  </Button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </Drawer>
  );
}
