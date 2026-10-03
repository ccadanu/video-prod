import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignInput, EditingSchedule, EditorBoard, SubmitInput } from '@ccp/shared';
import { api } from './api';

export const useSchedule = (enabled = true) =>
  useQuery({
    queryKey: ['editing', 'schedule'],
    queryFn: () => api<{ schedule: EditingSchedule }>('/api/editing/schedule').then((r) => r.schedule),
    enabled,
  });

/** editorId null = semua editor (Leader/Admin). Untuk Editor, server selalu memakai akunnya sendiri. */
export const useEditorBoard = (editorId: number | null) =>
  useQuery({
    queryKey: ['editing', 'board', editorId],
    queryFn: () => api<{ board: EditorBoard }>(`/api/editing/board${editorId === null ? '' : `?editorId=${editorId}`}`).then((r) => r.board),
  });

export function useEditingMutations() {
  const qc = useQueryClient();
  const done = () => {
    // Status konten berubah: jadwal, papan editor, Brief Order, dan detail ikut disegarkan.
    void qc.invalidateQueries({ queryKey: ['editing'] });
    void qc.invalidateQueries({ queryKey: ['briefs'] });
    void qc.invalidateQueries({ queryKey: ['brief'] });
    void qc.invalidateQueries({ queryKey: ['daily'] });
  };
  const post = (id: number, what: string, body?: unknown) => api<{ ok: true }>(`/api/editing/contents/${id}/${what}`, { method: 'POST', body });
  return {
    assign: useMutation({ mutationFn: (v: { id: number; input: AssignInput }) => post(v.id, 'assign', v.input), onSuccess: done }),
    start: useMutation({ mutationFn: (id: number) => post(id, 'start'), onSuccess: done }),
    step: useMutation({ mutationFn: (v: { id: number; key: string; done: boolean }) => post(v.id, 'step', { key: v.key, done: v.done }), onSuccess: done }),
    submit: useMutation({ mutationFn: (v: { id: number; input: Pick<SubmitInput, 'url' | 'note'> }) => post(v.id, 'submit', v.input), onSuccess: done }),
  };
}
