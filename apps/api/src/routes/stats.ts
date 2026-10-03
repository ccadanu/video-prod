import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isPeriod, type Period } from '@ccp/shared';
import { HttpError } from '../app';
import { getDashboard, getKpi, getPulse } from '../stats';

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
  app.get('/pulse', { preHandler: app.requireRole('user', 'leader', 'videografer', 'editor', 'admin') }, async (req) => ({ pulse: await getPulse(db, viewer(req)) }));
}
