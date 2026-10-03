import { z } from 'zod';
import type { Jenis } from './jenis';
import { isValidYmd, type Ymd } from './weeks';

/** Blind Review / Evaluasi (PRD §12). */

/** Hasil baru ditampilkan bila respons cukup banyak, agar tidak mengarah ke satu orang. */
export const MIN_RESPONSES = 3;
export const MAX_CYCLE_DAYS = 31;

const ymd = z.string().refine(isValidYmd, 'Tanggal tidak valid');

export const cycleSchema = z
  .object({
    name: z.string().trim().max(80, 'Maksimal 80 karakter').default(''),
    periodStart: ymd,
    periodEnd: ymd,
  })
  .superRefine((v, ctx) => {
    if (v.periodEnd < v.periodStart) ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Akhir periode tidak boleh sebelum awal' });
    else if (new Date(`${v.periodEnd}T00:00:00Z`).getTime() - new Date(`${v.periodStart}T00:00:00Z`).getTime() > (MAX_CYCLE_DAYS - 1) * 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['periodEnd'], message: `Periode maksimal ${MAX_CYCLE_DAYS} hari` });
    }
  });
export type CycleInput = z.output<typeof cycleSchema>;

const text = z.string().trim().max(1000, 'Maksimal 1000 karakter').default('');
export const responseSchema = z.object({
  ratings: z
    .array(z.object({ briefId: z.number().int().positive(), rating: z.number({ message: 'Beri rating 1–5' }).int().min(1, 'Beri rating 1–5').max(5, 'Beri rating 1–5') }))
    .min(1, 'Beri rating untuk setiap konten')
    .max(200),
  good: text,
  improve: text,
});
export type ResponseInput = z.output<typeof responseSchema>;

export const actionSchema = z.object({ text: z.string().trim().min(1, 'Wajib diisi').max(300, 'Maksimal 300 karakter') });
export const fgdSchema = z.object({ notes: z.string().trim().max(3000, 'Maksimal 3000 karakter'), at: ymd });

export interface EvalAction {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface EvalCycle {
  id: number;
  name: string;
  periodStart: Ymd;
  periodEnd: Ymd;
  status: 'open' | 'closed';
  createdAt: string;
  closedAt: string | null;
  invited: number;
  submitted: number;
  fgdAt: Ymd | null;
  fgdNotes: string;
  actions: EvalAction[];
  /** Hanya untuk User: apakah dia diundang & sudah mengisi. */
  me?: { invited: boolean; submitted: boolean };
}

export interface EvalFormItem {
  briefId: number;
  code: string;
  judul: string;
  jenis: Jenis;
  completedAt: string;
}

export interface EvalForm {
  cycle: EvalCycle;
  items: EvalFormItem[];
}

export interface EvalResult {
  cycleId: number;
  responses: number;
  enough: boolean;
  min: number;
  avg: number | null;
  dist: number[];
  byJenis: { jenis: Jenis; avg: number; n: number }[];
  /** Komentar tanpa identitas, urutan diacak agar tidak mengikuti urutan pengisian. */
  good: string[];
  improve: string[];
}

/** Pengacakan deterministik (per siklus) agar urutan komentar tidak mengungkap urutan pengisian. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let a = seed | 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    a = (Math.imul(a, 1664525) + 1013904223) | 0;
    const j = Math.abs(a) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
