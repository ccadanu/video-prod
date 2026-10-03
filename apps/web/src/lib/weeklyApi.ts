import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentPatch, WeekDto } from '@ccp/shared';
import { api } from './api';

export const useWeek = (week: string) =>
  useQuery({
    queryKey: ['week', week],
    queryFn: () => api<{ week: WeekDto }>(`/api/weekly/${week}`).then((r) => r.week),
  });

export function useWeeklyMutations() {
  const qc = useQueryClient();
  const apply = ({ week }: { week: WeekDto }) => {
    qc.setQueryData(['week', week.weekStart], week);
    // Pekan lain (mis. tujuan "tunda") dan daftar Brief Order ikut berubah.
    void qc.invalidateQueries({ queryKey: ['week'], predicate: (q) => q.queryKey[1] !== week.weekStart });
    void qc.invalidateQueries({ queryKey: ['briefs'] });
    void qc.invalidateQueries({ queryKey: ['brief'] });
  };
  const post = <T,>(path: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' = 'POST') =>
    api<{ week: WeekDto }>(path, { method, body }) as Promise<{ week: WeekDto }> & T;

  return {
    patch: useMutation({ mutationFn: (v: { id: number; patch: Partial<ContentPatch> }) => post(`/api/weekly/contents/${v.id}`, v.patch, 'PATCH'), onSuccess: apply }),
    lock: useMutation({ mutationFn: (week: string) => post(`/api/weekly/${week}/lock`), onSuccess: apply }),
    ready: useMutation({ mutationFn: (week: string) => post(`/api/weekly/${week}/ready`), onSuccess: apply }),
    sdm: useMutation({ mutationFn: (v: { id: number; ready: boolean }) => post(`/api/weekly/sdm/${v.id}`, { ready: v.ready }), onSuccess: apply }),
    postpone: useMutation({ mutationFn: (v: { id: number; reason: string }) => post(`/api/weekly/contents/${v.id}/postpone`, { reason: v.reason }), onSuccess: apply }),
    returnToUser: useMutation({ mutationFn: (v: { id: number; reason: string }) => post(`/api/weekly/contents/${v.id}/return`, { reason: v.reason }), onSuccess: apply }),
    doc: useMutation({
      mutationFn: (v: { week: string; day: number; kind: 'shotlist' | 'skrip'; url: string }) =>
        post(`/api/weekly/${v.week}/days/${v.day}/docs`, { kind: v.kind, url: v.url }, 'PUT'),
      onSuccess: apply,
    }),
    reconfirm: useMutation({ mutationFn: (v: { week: string; day: number }) => post(`/api/weekly/${v.week}/days/${v.day}/reconfirm-talent`), onSuccess: apply }),
  };
}
