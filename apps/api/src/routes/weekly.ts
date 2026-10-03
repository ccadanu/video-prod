import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contentPatchSchema, dayDocSchema, isWeekStart, reasonSchema } from '@ccp/shared';
import { HttpError } from '../app';
import {
  getWeek,
  lockWeek,
  markReady,
  patchContent,
  postponeContent,
  reconfirmTalent,
  returnContent,
  saveDayDoc,
  setSdmReady,
} from '../weekly';

const positiveInt = (raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_id', 'ID tidak valid');
  return n;
};
function weekParam(raw: string): string {
  if (!isWeekStart(raw)) throw new HttpError(400, 'bad_week', 'Pekan harus berupa tanggal Senin (YYYY-MM-DD)');
  return raw;
}
function dayParam(raw: string): number {
  const d = Number(raw);
  if (!Number.isInteger(d) || d < 0 || d > 4) throw new HttpError(400, 'bad_day', 'Hari harus 0 (Senin) sampai 4 (Jumat)');
  return d;
}

export async function weeklyRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const viewers = { preHandler: app.requireRole('user', 'leader', 'videografer', 'admin') };
  const vg = { preHandler: app.requireRole('videografer') };
  const leader = { preHandler: app.requireRole('leader') };
  const vgOrLeader = { preHandler: app.requireRole('videografer', 'leader') };

  app.get<{ Params: { week: string } }>('/:week', viewers, async (req) => ({
    week: await getWeek(db, weekParam(req.params.week), req.user!),
  }));

  app.patch<{ Params: { id: string } }>('/contents/:id', vg, async (req) => {
    const week = await patchContent(db, req.user!.id, positiveInt(req.params.id), contentPatchSchema.parse(req.body));
    return { week: await getWeek(db, week, req.user!) };
  });

  app.post<{ Params: { id: string } }>('/contents/:id/postpone', vg, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const week = await postponeContent(db, req.user!.id, positiveInt(req.params.id), reason);
    return { week: await getWeek(db, week, req.user!) };
  });

  app.post<{ Params: { id: string } }>('/contents/:id/return', vgOrLeader, async (req) => {
    const { reason } = reasonSchema.parse(req.body);
    const week = await returnContent(db, req.user!.id, positiveInt(req.params.id), reason);
    return { week: await getWeek(db, week, req.user!) };
  });

  app.post<{ Params: { week: string } }>('/:week/lock', vg, async (req) => {
    const week = weekParam(req.params.week);
    await lockWeek(db, week, req.user!.id);
    return { week: await getWeek(db, week, req.user!) };
  });

  app.post<{ Params: { week: string } }>('/:week/ready', vg, async (req) => {
    const week = weekParam(req.params.week);
    await markReady(db, week, req.user!.id);
    return { week: await getWeek(db, week, req.user!) };
  });

  app.post<{ Params: { id: string } }>('/sdm/:id', leader, async (req) => {
    const { ready } = z.object({ ready: z.boolean() }).parse(req.body);
    const week = await setSdmReady(db, req.user!.id, positiveInt(req.params.id), ready);
    return { week: await getWeek(db, week, req.user!) };
  });

  app.put<{ Params: { week: string; day: string } }>('/:week/days/:day/docs', vg, async (req) => {
    const week = weekParam(req.params.week);
    const { kind, url } = dayDocSchema.parse(req.body);
    await saveDayDoc(db, req.user!.id, week, dayParam(req.params.day), kind, url);
    return { week: await getWeek(db, week, req.user!) };
  });

  app.post<{ Params: { week: string; day: string } }>('/:week/days/:day/reconfirm-talent', leader, async (req) => {
    const week = weekParam(req.params.week);
    await reconfirmTalent(db, req.user!.id, week, dayParam(req.params.day));
    return { week: await getWeek(db, week, req.user!) };
  });
}
