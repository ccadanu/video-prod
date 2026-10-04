import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isPeriod, type Period } from '@ccp/shared';
import { HttpError } from '../app';
import { z } from 'zod';
import { audit } from '../db';
import { getArena, getDashboard, getKpi, getPulse, setArenaPublic } from '../stats';

function periodOf(raw: unknown): Period {
  const p = raw ?? '1m';
  if (!isPeriod(p)) throw new HttpError(400, 'bad_period', 'Periode harus 2w, 1m, 3m, atau 1y');
  return p;
}

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const viewer = (req: FastifyRequest) => ({ role: req.user!.role, id: req.user!.id });

  // Dashboard Statistik: User (baca), Leader, Admin (PRD §2, §3).
  app.get<{ Querystring: { period?: string } }>('/dashboard', { preHandler: app.requireRole('user', 'leader', 'admin') }, async (req) => ({
    dashboard: await getDashboard(db, periodOf(req.query.period), viewer(req)),
  }));
  // KPI Individu: Leader/Admin melihat semua; VG dan Editor hanya dirinya.
  app.get<{ Querystring: { period?: string } }>('/kpi', { preHandler: app.requireRole('leader', 'videografer', 'editor', 'admin') }, async (req) => ({
    kpi: await getKpi(db, periodOf(req.query.period), viewer(req)),
  }));
  // Papan Prestasi (gamifikasi): tim produksi + Leader/Admin. Detail yang terlihat bergantung peran dan pengaturan Leader.
  app.get<{ Querystring: { period?: string } }>('/arena', { preHandler: app.requireRole('leader', 'videografer', 'editor', 'admin') }, async (req) => ({
    arena: await getArena(db, periodOf(req.query.period), viewer(req)),
  }));
  app.put('/arena-settings', { preHandler: app.requireRole('leader') }, async (req) => {
    const { public: value } = z.object({ public: z.boolean() }).parse(req.body);
    await setArenaPublic(db, req.user!.id, value);
    await audit(db, req.user!.id, 'arena.visibility', 'setting', 0, { public: value });
    return { ok: true };
  });
  app.get('/pulse', { preHandler: app.requireRole('user', 'leader', 'videografer', 'editor', 'admin') }, async (req) => ({ pulse: await getPulse(db, viewer(req)) }));
}
