import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArenaDto, CycleInput, DashboardDto, EvalCycle, EvalForm, EvalResult, KpiDto, Period, ResponseInput } from '@ccp/shared';
import { api } from './api';

export const useDashboard = (period: Period) =>
  useQuery({ queryKey: ['stats', 'dashboard', period], queryFn: () => api<{ dashboard: DashboardDto }>(`/api/stats/dashboard?period=${period}`).then((r) => r.dashboard) });

export const useKpi = (period: Period) =>
  useQuery({ queryKey: ['stats', 'kpi', period], queryFn: () => api<{ kpi: KpiDto }>(`/api/stats/kpi?period=${period}`).then((r) => r.kpi) });

export interface Pulse {
  selesai: DashboardDto['selesai'];
  kepuasan: DashboardDto['kepuasan'];
  sla: DashboardDto['sla'];
  revisi: DashboardDto['revisi'];
  funnel: DashboardDto['funnel'];
  range: DashboardDto['range'];
}
export const usePulse = () => useQuery({ queryKey: ['stats', 'pulse'], queryFn: () => api<{ pulse: Pulse }>('/api/stats/pulse').then((r) => r.pulse) });

export const useCycles = () => useQuery({ queryKey: ['eval', 'cycles'], queryFn: () => api<{ cycles: EvalCycle[] }>('/api/eval/cycles').then((r) => r.cycles) });

export const useResult = (cycleId: number | null) =>
  useQuery({
    queryKey: ['eval', 'result', cycleId],
    enabled: cycleId !== null,
    queryFn: () => api<{ result: EvalResult }>(`/api/eval/cycles/${cycleId}/result`).then((r) => r.result),
  });

export const useForm = (cycleId: number | null) =>
  useQuery({
    queryKey: ['eval', 'form', cycleId],
    enabled: cycleId !== null,
    retry: false,
    queryFn: () => api<{ form: EvalForm }>(`/api/eval/cycles/${cycleId}/form`).then((r) => r.form),
  });

export function useEvalMutations() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['eval'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
  return {
    create: useMutation({ mutationFn: (input: Pick<CycleInput, 'periodStart' | 'periodEnd'> & { name?: string }) => api<{ id: number }>('/api/eval/cycles', { method: 'POST', body: input }), onSuccess: done }),
    close: useMutation({ mutationFn: (id: number) => api(`/api/eval/cycles/${id}/close`, { method: 'POST' }), onSuccess: done }),
    respond: useMutation({ mutationFn: (v: { id: number; input: Pick<ResponseInput, 'ratings' | 'good' | 'improve'> }) => api(`/api/eval/cycles/${v.id}/response`, { method: 'POST', body: v.input }), onSuccess: done }),
    fgd: useMutation({ mutationFn: (v: { id: number; notes: string; at: string }) => api(`/api/eval/cycles/${v.id}/fgd`, { method: 'PUT', body: { notes: v.notes, at: v.at } }), onSuccess: done }),
    addAction: useMutation({ mutationFn: (v: { id: number; text: string }) => api(`/api/eval/cycles/${v.id}/actions`, { method: 'POST', body: { text: v.text } }), onSuccess: done }),
    toggleAction: useMutation({ mutationFn: (v: { id: number; done: boolean }) => api(`/api/eval/actions/${v.id}`, { method: 'PATCH', body: { done: v.done } }), onSuccess: done }),
  };
}

export const useArena = (period: Period) =>
  useQuery({ queryKey: ['stats', 'arena', period], queryFn: () => api<{ arena: ArenaDto }>(`/api/stats/arena?period=${period}`).then((r) => r.arena) });

export function useArenaSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) => api('/api/stats/arena-settings', { method: 'PUT', body: { public: value } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stats', 'arena'] }),
  });
}
