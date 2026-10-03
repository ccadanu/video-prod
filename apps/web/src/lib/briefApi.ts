import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BriefDetail, BriefFilter, BriefInput, BriefListItem, Status } from '@ccp/shared';
import { api } from './api';

export const useBriefs = (filter: BriefFilter, q: string) =>
  useQuery({
    queryKey: ['briefs', filter, q],
    queryFn: () => api<{ briefs: BriefListItem[] }>(`/api/briefs?filter=${filter}&q=${encodeURIComponent(q)}`).then((r) => r.briefs),
  });

export const useBrief = (id: number | null) =>
  useQuery({
    queryKey: ['brief', id],
    enabled: id !== null,
    queryFn: () => api<{ brief: BriefDetail }>(`/api/briefs/${id}`).then((r) => r.brief),
  });

export const useDraftQuery = (enabled: boolean) =>
  useQuery({
    queryKey: ['brief-draft'],
    enabled,
    staleTime: 0,
    queryFn: () => api<{ draft: { data: Record<string, unknown>; updatedAt: string } | null }>('/api/briefs/draft/me').then((r) => r.draft),
  });

export function useBriefMutations() {
  const qc = useQueryClient();
  const refresh = async (brief?: BriefDetail) => {
    if (brief) qc.setQueryData(['brief', brief.id], brief);
    await qc.invalidateQueries({ queryKey: ['briefs'] });
  };
  return {
    transition: useMutation({
      mutationFn: (v: { id: number; to: Status; reason?: string }) =>
        api<{ brief: BriefDetail }>(`/api/briefs/${v.id}/transition`, { method: 'POST', body: { to: v.to, reason: v.reason ?? '' } }).then((r) => r.brief),
      onSuccess: refresh,
    }),
    create: useMutation({
      mutationFn: (input: BriefInput) => api<{ brief: BriefDetail }>('/api/briefs', { method: 'POST', body: input }).then((r) => r.brief),
      onSuccess: async (b) => {
        qc.removeQueries({ queryKey: ['brief-draft'] });
        await refresh(b);
      },
    }),
    update: useMutation({
      mutationFn: (v: { id: number; input: BriefInput }) =>
        api<{ brief: BriefDetail }>(`/api/briefs/${v.id}`, { method: 'PATCH', body: v.input }).then((r) => r.brief),
      onSuccess: refresh,
    }),
  };
}
