import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actionSchema, cycleSchema, fgdSchema, responseSchema } from '@ccp/shared';
import { HttpError } from '../app';
import { addAction, closeCycle, createCycle, getForm, getResult, listCycles, saveFgd, submitResponse, toggleAction } from '../evaluation';

const positiveInt = (raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_id', 'ID tidak valid');
  return n;
};

export async function evaluationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const ok = { ok: true };
  const anyone = { preHandler: app.requireRole('user', 'leader', 'videografer', 'editor', 'admin') };
  const leader = { preHandler: app.requireRole('leader') };
  const user = { preHandler: app.requireRole('user') };
  const id = (req: { params: unknown }) => positiveInt((req.params as { id: string }).id);

  app.get('/cycles', anyone, async (req) => ({ cycles: await listCycles(db, { role: req.user!.role, id: req.user!.id }) }));
  // Leader mendistribusikan form (membuat siklus + undangan).
  app.post('/cycles', leader, async (req) => ({ id: await createCycle(db, req.user!.id, cycleSchema.parse(req.body)) }));
  app.post('/cycles/:id/close', leader, async (req) => (await closeCycle(db, req.user!.id, id(req)), ok));
  // Hasil tim: Leader/Admin kapan saja; VG/Editor setelah ditutup; User tidak.
  app.get('/cycles/:id/result', { preHandler: app.requireRole('leader', 'admin', 'videografer', 'editor') }, async (req) => ({ result: await getResult(db, { role: req.user!.role }, id(req)) }));

  // Pengisian blind review oleh User.
  app.get('/cycles/:id/form', user, async (req) => ({ form: await getForm(db, req.user!.id, id(req)) }));
  app.post('/cycles/:id/response', user, async (req) => (await submitResponse(db, req.user!.id, id(req), responseSchema.parse(req.body)), ok));

  // FGD & tindak lanjut.
  app.put('/cycles/:id/fgd', leader, async (req) => {
    const { notes, at } = fgdSchema.parse(req.body);
    await saveFgd(db, req.user!.id, id(req), notes, at);
    return ok;
  });
  app.post('/cycles/:id/actions', leader, async (req) => (await addAction(db, req.user!.id, id(req), actionSchema.parse(req.body).text), ok));
  app.patch('/actions/:id', leader, async (req) => (await toggleAction(db, req.user!.id, id(req), z.object({ done: z.boolean() }).parse(req.body).done), ok));
}
