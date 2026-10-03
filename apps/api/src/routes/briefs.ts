import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  BRIEF_FILTERS,
  STATUSES,
  briefInputSchema,
  canEditBrief,
  canViewBriefs,
  checkBriefMove,
  draftSchema,
  isWeekly,
  jalurOf,
  requiresReason,
  type BriefFilter,
} from '@ccp/shared';
import { HttpError } from '../app';
import {
  applyTransition,
  getBriefDetail,
  getBriefRow,
  insertBrief,
  listBriefs,
  updateBriefContent,
} from '../briefs';
import { audit } from '../db';

const transitionSchema = z.object({ to: z.enum(STATUSES), reason: z.string().trim().max(500).default('') });
const MAX_DRAFT_BYTES = 20_000;

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'bad_id', 'ID tidak valid');
  return id;
}

export async function briefRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app;
  const viewers = {
    preHandler: async (req: Parameters<typeof app.requireAuth>[0], reply: Parameters<typeof app.requireAuth>[1]) => {
      await app.requireAuth(req, reply);
      if (!canViewBriefs(req.user!.role)) throw new HttpError(403, 'forbidden', 'Anda tidak memiliki akses');
    },
  };
  const requesters = { preHandler: app.requireRole('user') };

  /** User hanya melihat miliknya (404, bukan 403, agar keberadaan brief lain tidak bocor). */
  async function visibleRow(req: { user: { id: number; role: string } | null }, id: number) {
    const row = await getBriefRow(db, id);
    if (!row || (req.user!.role === 'user' && row.requester_id !== req.user!.id)) {
      throw new HttpError(404, 'not_found', 'Brief tidak ditemukan');
    }
    return row;
  }

  app.get<{ Querystring: { filter?: string; q?: string } }>('/', viewers, async (req) => {
    const filter = (req.query.filter ?? 'all') as BriefFilter;
    if (!(filter in BRIEF_FILTERS)) throw new HttpError(400, 'bad_filter', 'Filter tidak dikenal');
    const user = req.user!;
    return {
      briefs: await listBriefs(db, {
        ...(user.role === 'user' ? { requesterId: user.id } : {}),
        filter,
        q: (req.query.q ?? '').trim().slice(0, 100),
      }),
    };
  });

  app.get<{ Params: { id: string } }>('/:id', viewers, async (req) => {
    const row = await visibleRow(req, parseId(req.params.id));
    return { brief: await getBriefDetail(db, row.id) };
  });

  app.post('/', requesters, async (req, reply) => {
    const input = briefInputSchema.parse(req.body);
    // Weekly langsung ke Weekly Listing; Daily menunggu validasi Leader (PRD §5.3).
    const status = isWeekly(input.jenis) ? 'listing' : 'pending_review';
    const user = req.user!;
    const id = await insertBrief(db, { requesterId: user.id, input, status, actorId: user.id });
    await db.query('DELETE FROM brief_drafts WHERE user_id = $1', [user.id]);
    await audit(db, user.id, 'brief.create', 'brief', id, { jenis: input.jenis });
    reply.status(201);
    return { brief: await getBriefDetail(db, id) };
  });

  app.patch<{ Params: { id: string } }>('/:id', requesters, async (req) => {
    const row = await visibleRow(req, parseId(req.params.id));
    const user = req.user!;
    if (!canEditBrief(user.role, row.requester_id === user.id, row.status)) {
      throw new HttpError(409, 'not_editable', 'Brief hanya bisa diubah saat dikembalikan ke Backlog');
    }
    const input = briefInputSchema.parse(req.body);
    if (input.jenis !== row.jenis) throw new HttpError(400, 'jenis_locked', 'Jenis pengerjaan tidak bisa diubah. Buat brief baru bila jalurnya berbeda.');
    await updateBriefContent(db, row.id, user.id, input);
    return { brief: await getBriefDetail(db, row.id) };
  });

  app.post<{ Params: { id: string } }>('/:id/transition', viewers, async (req) => {
    const row = await visibleRow(req, parseId(req.params.id));
    const user = req.user!;
    const { to, reason } = transitionSchema.parse(req.body);

    const check = checkBriefMove({ jenis: row.jenis, from: row.status, to, role: user.role, isOwner: row.requester_id === user.id });
    if (!check.ok) {
      throw check.code === 'not_owner'
        ? new HttpError(404, 'not_found', 'Brief tidak ditemukan')
        : new HttpError(409, 'bad_transition', 'Perubahan status ini tidak diizinkan');
    }
    if (requiresReason(jalurOf(row.jenis), row.status, to) && !reason) {
      throw new HttpError(400, 'reason_required', 'Alasan wajib diisi');
    }
    await applyTransition(db, row, to, user.id, reason);
    return { brief: await getBriefDetail(db, row.id) };
  });

  // ── Draf wizard (auto-save) ──
  app.get('/draft/me', requesters, async (req) => {
    const row = await db.one<{ data: Record<string, unknown>; updated_at: string }>(
      'SELECT data, updated_at FROM brief_drafts WHERE user_id = $1',
      [req.user!.id],
    );
    return { draft: row ? { data: row.data, updatedAt: row.updated_at } : null };
  });

  app.put('/draft/me', requesters, async (req) => {
    const { data } = z.object({ data: draftSchema }).parse(req.body);
    const json = JSON.stringify(data);
    if (json.length > MAX_DRAFT_BYTES) throw new HttpError(413, 'draft_too_large', 'Draf terlalu besar');
    await db.query(
      `INSERT INTO brief_drafts (user_id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [req.user!.id, json],
    );
    return { ok: true };
  });

  app.delete('/draft/me', requesters, async (req) => {
    await db.query('DELETE FROM brief_drafts WHERE user_id = $1', [req.user!.id]);
    return { ok: true };
  });
}
