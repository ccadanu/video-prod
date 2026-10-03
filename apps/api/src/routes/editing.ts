import type { FastifyInstance } from 'fastify';
import { assignSchema, stepSchema, submitSchema } from '@ccp/shared';
import { HttpError } from '../app';
import { assign, getEditorBoard, getSchedule, setStep, startEdit, submit } from '../editing';

const positiveInt = (raw: string): number => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'bad_id', 'ID tidak valid');
  return n;
};

export async function editingRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const ok = { ok: true };
  const leader = { preHandler: app.requireRole('leader') };
  const editor = { preHandler: app.requireRole('editor') };
  const id = (req: { params: unknown }) => positiveInt((req.params as { id: string }).id);

  // Brief Editing Schedule: Leader mengatur, Admin hanya melihat.
  app.get('/schedule', { preHandler: app.requireRole('leader', 'admin') }, async () => ({ schedule: await getSchedule(db) }));
  app.post('/contents/:id/assign', leader, async (req) => (await assign(db, req.user!.id, id(req), assignSchema.parse(req.body)), ok));

  // Editing Execution: Editor melihat papannya sendiri; Leader/Admin melihat semua atau memilih satu editor.
  app.get<{ Querystring: { editorId?: string } }>('/board', { preHandler: app.requireRole('editor', 'leader', 'admin') }, async (req) => {
    const own = req.user!.role === 'editor';
    const raw = req.query.editorId;
    return { board: await getEditorBoard(db, own ? req.user!.id : raw ? positiveInt(raw) : null) };
  });
  app.post('/contents/:id/start', editor, async (req) => (await startEdit(db, req.user!.id, id(req)), ok));
  app.post('/contents/:id/step', editor, async (req) => {
    const { key, done } = stepSchema.parse(req.body);
    await setStep(db, req.user!.id, id(req), key, done);
    return ok;
  });
  app.post('/contents/:id/submit', editor, async (req) => (await submit(db, req.user!.id, id(req), submitSchema.parse(req.body)), ok));
}
