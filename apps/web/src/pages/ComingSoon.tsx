import { Hammer } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui';
import { ROADMAP } from '../lib/access';

export function ComingSoon({ navKey, title }: { navKey: string; title: string }) {
  const info = ROADMAP[navKey];
  return (
    <>
      <PageHeader title={title} subtitle={info?.blurb} />
      <div className="px-7 pb-8 pt-2">
        <Card className="flex max-w-xl items-start gap-4 p-6">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-orange-100 text-orange-800">
            <Hammer size={20} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold">Sedang dibangun</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Fitur ini dijadwalkan pada <b className="text-ink">{info?.phase ?? 'fase berikutnya'}</b>.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
