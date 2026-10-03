import { describe, expect, it } from 'vitest';
import { briefInputSchema, canEditBrief, checkBriefMove, isGoogleDocsUrl, slaState, slaTargetFor, type BriefInput } from './index';

const attributes = { talent: 'Cewek muda', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box product', desain: 'Frame design' };
const weekly = {
  jenis: 'shooting_edit', kategori: 'Talking Head', produk: 'FITGRAINS', judul: 'Promo 9.9', rasio: '9:16', durasiDetik: 60,
  linkDocs: 'https://docs.google.com/document/d/abc', catatan: '', attributes,
};
const daily = { ...weekly, jenis: 'motion', attributes: null };
const issues = (v: unknown) => {
  const r = briefInputSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('briefInputSchema', () => {
  it('menerima brief weekly dan daily yang lengkap', () => {
    expect(briefInputSchema.safeParse(weekly).success).toBe(true);
    expect(briefInputSchema.safeParse(daily).success).toBe(true);
  });

  it('weekly wajib atribut produksi; daily membuang atribut yang terkirim', () => {
    expect(issues({ ...weekly, attributes: null })).toContain('attributes');
    const parsed = briefInputSchema.parse({ ...daily, attributes }) as BriefInput;
    expect(parsed.attributes).toBeNull();
  });

  it('semua atribut weekly wajib terisi, lokasi "Lainnya" butuh keterangan', () => {
    expect(issues({ ...weekly, attributes: { ...attributes, talent: '  ' } })).toContain('attributes.talent');
    expect(issues({ ...weekly, attributes: { ...attributes, lokasi: 'Lainnya' } })).toContain('attributes.lokasiDetail');
    expect(briefInputSchema.safeParse({ ...weekly, attributes: { ...attributes, lokasi: 'Lainnya', lokasiDetail: 'Rumah talent' } }).success).toBe(true);
  });

  it('durasi wajib kecuali photoshoot', () => {
    expect(issues({ ...weekly, durasiDetik: null })).toContain('durasiDetik');
    expect(briefInputSchema.safeParse({ ...weekly, jenis: 'photoshoot', durasiDetik: null }).success).toBe(true);
    expect(issues({ ...weekly, durasiDetik: 0 })).toContain('durasiDetik');
    expect(issues({ ...weekly, durasiDetik: 1.5 })).toContain('durasiDetik');
  });

  it('link brief harus https Google Docs/Drive', () => {
    for (const bad of ['http://docs.google.com/x', 'https://evil.example/x', 'javascript:alert(1)', 'docs.google.com/x', '']) {
      expect(issues({ ...weekly, linkDocs: bad }), bad).toContain('linkDocs');
    }
    expect(isGoogleDocsUrl('https://drive.google.com/drive/folders/1')).toBe(true);
    expect(isGoogleDocsUrl('https://docs.google.com.evil.example/x')).toBe(false);
  });

  it('menolak jenis/kategori/rasio di luar daftar dan memangkas spasi', () => {
    expect(issues({ ...weekly, jenis: 'live' })).toContain('jenis');
    expect(issues({ ...weekly, kategori: 'Lain' })).toContain('kategori');
    expect(issues({ ...weekly, rasio: '3:2' })).toContain('rasio');
    expect(briefInputSchema.parse({ ...weekly, judul: '  Promo  ' }).judul).toBe('Promo');
  });
});

describe('SLA', () => {
  const submitted = '2026-10-01T03:00:00.000Z';

  it('target = submit + hari SLA jenisnya', () => {
    expect(slaTargetFor('motion', submitted)).toBe('2026-10-02T03:00:00.000Z');
    expect(slaTargetFor('shooting_edit', submitted)).toBe('2026-10-04T03:00:00.000Z');
  });

  it('selesai: tepat bila selesai sebelum/tepat target, telat bila sesudahnya', () => {
    const slaTargetAt = slaTargetFor('motion', submitted);
    expect(slaState({ status: 'complete', slaTargetAt, completedAt: '2026-10-02T02:00:00.000Z' })).toBe('tepat');
    expect(slaState({ status: 'complete', slaTargetAt, completedAt: '2026-10-02T05:00:00.000Z' })).toBe('telat');
  });

  it('belum selesai: berjalan sebelum target, lewat sesudahnya; backlog tidak dihitung', () => {
    const slaTargetAt = slaTargetFor('motion', submitted);
    const base = { slaTargetAt, completedAt: null };
    expect(slaState({ ...base, status: 'editing' }, new Date('2026-10-01T10:00:00Z'))).toBe('berjalan');
    expect(slaState({ ...base, status: 'editing' }, new Date('2026-10-03T10:00:00Z'))).toBe('lewat');
    expect(slaState({ ...base, status: 'backlog' }, new Date('2026-10-03T10:00:00Z'))).toBe('none');
  });
});

describe('aturan perpindahan status di Brief Order', () => {
  const move = (o: Partial<Parameters<typeof checkBriefMove>[0]>) =>
    checkBriefMove({ jenis: 'motion', from: 'in_review', to: 'complete', role: 'user', isOwner: true, ...o });

  it('pemilik boleh approve dan minta revisi; bukan pemilik ditolak', () => {
    expect(move({}).ok).toBe(true);
    expect(move({ to: 'revisi' }).ok).toBe(true);
    expect(move({ isOwner: false })).toEqual({ ok: false, code: 'not_owner' });
  });

  it('Leader dan Admin tidak bisa approve', () => {
    expect(move({ role: 'leader' })).toEqual({ ok: false, code: 'not_allowed' });
    expect(move({ role: 'admin' })).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('Leader memvalidasi brief Daily; User tidak', () => {
    expect(move({ role: 'leader', from: 'pending_review', to: 'antre_editing', isOwner: false }).ok).toBe(true);
    expect(move({ role: 'leader', from: 'pending_review', to: 'backlog', isOwner: false }).ok).toBe(true);
    expect(move({ role: 'user', from: 'pending_review', to: 'antre_editing' }).ok).toBe(false);
  });

  it('kirim ulang dari backlog: Daily ke pending_review, Weekly ke listing', () => {
    expect(move({ from: 'backlog', to: 'pending_review' }).ok).toBe(true);
    expect(move({ from: 'backlog', to: 'listing' }).ok).toBe(false);
    expect(move({ jenis: 'shooting_edit', from: 'backlog', to: 'listing' }).ok).toBe(true);
    expect(move({ jenis: 'shooting_edit', from: 'backlog', to: 'pending_review' }).ok).toBe(false);
  });

  it('perpindahan di luar Brief Order ditolak di sini', () => {
    expect(move({ from: 'editing', to: 'in_review', role: 'editor', isOwner: false }).ok).toBe(false);
  });

  it('edit hanya oleh pemilik saat backlog', () => {
    expect(canEditBrief('user', true, 'backlog')).toBe(true);
    expect(canEditBrief('user', true, 'listing')).toBe(false);
    expect(canEditBrief('user', false, 'backlog')).toBe(false);
    expect(canEditBrief('leader', true, 'backlog')).toBe(false);
  });
});
