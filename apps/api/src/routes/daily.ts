import type { FastifyInstance } from 'fastify';
import { handoffSchema, isWeekStart, pullSchema, reasonSchema, rescheduleSchema } from '@ccp/shared';
import { HttpError } from '../app';
import { getBoard, finishTake, handoff, hold, pull, reschedule, resume, startTake } from '../daily';
import { postponeContent } from '../weekly';

const positiveInt = (raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_id', 'ID tidak valid');
  return n;
};

export async function dailyRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const viewers = { preHandler: app.requireRole('videografer', 'leader', 'admin') };
  const vg = { preHandler: app.requireRole('videografer') };
  const ok = { ok: true };

  app.get<{ Params: { week: string; day: string } }>('/:week/:day', viewers, async (req) => {
    if (!isWeekStart(req.params.week)) throw new HttpError(400, 'bad_week', 'Pekan harus berupa tanggal Senin (YYYY-MM-DD)');
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || day < 0 || day > 4) throw new HttpError(400, 'bad_day', 'Hari harus 0 (Senin) sampai 4 (Jumat)');
    return { board: await getBoard(db, req.params.week, day) };
  });

  const id = (req: { params: unknown }) => positiveInt((req.params as { id: string }).id);
  app.post('/contents/:id/start', vg, async (req) => (await startTake(db, req.user!.id, id(req)), ok));
  app.post('/contents/:id/finish', vg, async (req) => (await finishTake(db, req.user!.id, id(req)), ok));
  app.post('/contents/:id/handoff', vg, async (req) => (await handoff(db, req.user!.id, id(req), handoffSchema.parse(req.body)), ok));
  app.post('/contents/:id/hold', vg, async (req) => (await hold(db, req.user!.id, id(req), reasonSchema.parse(req.body).reason), ok));
  app.post('/contents/:id/resume', vg, async (req) => (await resume(db, req.user!.id, id(req)), ok));
  app.post('/contents/:id/reschedule', vg, async (req) => {
    const { day, reason } = rescheduleSchema.parse(req.body);
    await reschedule(db, req.user!.id, id(req), day, reason);
    return ok;
  });
  app.post('/contents/:id/pull', vg, async (req) => (await pull(db, req.user!.id, id(req), pullSchema.parse(req.body).day), ok));
  app.post('/contents/:id/postpone', vg, async (req) => {
    await postponeContent(db, req.user!.id, id(req), reasonSchema.parse(req.body).reason, true);
    return ok;
  });
}
