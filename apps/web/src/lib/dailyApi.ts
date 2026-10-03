import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DayBoard, HandoffInput } from '@ccp/shared';
import { api } from './api';

export const useBoard = (week: string, day: number) =>
  useQuery({
    queryKey: ['daily', week, day],
    queryFn: () => api<{ board: DayBoard }>(`/api/daily/${week}/${day}`).then((r) => r.board),
  });

export function useDailyMutations() {
  const qc = useQueryClient();
  const done = () => {
    // Status konten berubah: board, Weekly Listing, dan Brief Order ikut disegarkan.
    void qc.invalidateQueries({ queryKey: ['daily'] });
    void qc.invalidateQueries({ queryKey: ['week'] });
    void qc.invalidateQueries({ queryKey: ['briefs'] });
    void qc.invalidateQueries({ queryKey: ['brief'] });
  };
  const post = (id: number, what: string, body?: unknown) => api<{ ok: true }>(`/api/daily/contents/${id}/${what}`, { method: 'POST', body });
  return {
    start: useMutation({ mutationFn: (id: number) => post(id, 'start'), onSuccess: done }),
    finish: useMutation({ mutationFn: (id: number) => post(id, 'finish'), onSuccess: done }),
    handoff: useMutation({ mutationFn: (v: { id: number; input: HandoffInput }) => post(v.id, 'handoff', v.input), onSuccess: done }),
    hold: useMutation({ mutationFn: (v: { id: number; reason: string }) => post(v.id, 'hold', { reason: v.reason }), onSuccess: done }),
    resume: useMutation({ mutationFn: (id: number) => post(id, 'resume'), onSuccess: done }),
    reschedule: useMutation({ mutationFn: (v: { id: number; day: number; reason: string }) => post(v.id, 'reschedule', { day: v.day, reason: v.reason }), onSuccess: done }),
    pull: useMutation({ mutationFn: (v: { id: number; day: number }) => post(v.id, 'pull', { day: v.day }), onSuccess: done }),
    postpone: useMutation({ mutationFn: (v: { id: number; reason: string }) => post(v.id, 'postpone', { reason: v.reason }), onSuccess: done }),
  };
}
