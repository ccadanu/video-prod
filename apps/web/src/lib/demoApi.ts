import {
  BRIEF_FILTERS,
  DAY_CAPACITY,
  DAY_NAMES,
  HIDDEN_FROM_WEEK,
  PLANNING_STATUSES,
  SAMPLE_BRIEFS,
  addDays,
  contentPatchSchema,
  dayDocSchema,
  isWeekStart,
  lockingDayOf,
  productionWeekFor,
  reasonSchema,
  sampleWeekly,
  sdmKey,
  sdmNeeds,
  slotsUsed,
  weekLabel,
  weekProgress,
  dailyColumn,
  handoffNeedsDrive,
  handoffSchema,
  mondayOf,
  pullSchema,
  rescheduleSchema,
  routeOf,
  sampleExecution,
  summarize,
  type DailyCard,
  type DeliverableVersion,
  type EditPriority,
  type EditRow,
  type Bobot,
  type ReviewMaterial,
  SAMPLE_EDITING,
  SAMPLE_QUEUE,
  SAMPLE_REVIEW_FOOTAGE,
  REQUIRED_STEP,
  RESET_ON_REVISION,
  assignSchema,
  buildEditorBoard,
  buildSchedule,
  isEditJenis,
  isStepKey,
  nextWorkday,
  stepSchema,
  submitSchema,
  suggestDue,
  type DayBoard,
  type HandoffProof,
  type SdmItem,
  type SdmType,
  type DayInfo,
  type WeekDto,
  type WeeklyContent,
  STATUSES,
  briefInputSchema,
  canEditBrief,
  canViewBriefs,
  checkBriefMove,
  draftSchema,
  isWeekly,
  jalurOf,
  requiresReason,
  slaTargetFor,
  todayJakarta,
  type BriefDetail,
  type BriefEvent,
  type BriefFilter,
  type BriefInput,
  type BriefListItem,
  type Status,
  changePasswordSchema,
  createUserSchema,
  loginSchema,
  resetPasswordSchema,
  updateUserSchema,
  type UserDto,
} from '@ccp/shared';
import { ZodError, z } from 'zod';
import { ApiError } from './api';

/**
 * API tiruan untuk pratinjau statis. Meniru kontrak dan aturan server (validasi, pesan galat,
 * larangan mengunci akun sendiri), tetapi data hanya hidup di memori browser dan hilang saat dimuat ulang.
 */
export { DEMO_PASSWORD } from './demoAccounts';
import { DEMO_PASSWORD } from './demoAccounts';

interface Rec extends UserDto {
  password: string;
}

let nextId = 8;
const users: Rec[] = [
  { id: 1, email: 'admin@ccp.local', name: 'Admin CCP', role: 'admin', unit: 'CCP', jabatan: 'Admin', active: true, password: DEMO_PASSWORD },
  { id: 2, email: 'leader@ccp.local', name: 'Nadia Pratama', role: 'leader', unit: 'CCP', jabatan: 'Leader Produksi', active: true, password: DEMO_PASSWORD },
  { id: 3, email: 'hardi@ccp.local', name: 'Hardi', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', active: true, password: DEMO_PASSWORD },
  { id: 4, email: 'yofa@ccp.local', name: 'Yofa', role: 'videografer', unit: 'CCP', jabatan: 'Videografer', active: true, password: DEMO_PASSWORD },
  { id: 5, email: 'dio@ccp.local', name: 'Dio', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', active: true, password: DEMO_PASSWORD },
  { id: 7, email: 'rara@ccp.local', name: 'Rara', role: 'editor', unit: 'CCP', jabatan: 'Video Editor', active: true, password: DEMO_PASSWORD },
  { id: 6, email: 'arya@ccp.local', name: 'Arya Akbar Subakti', role: 'user', unit: 'Marketing', jabatan: 'Marketing Staff', active: true, password: DEMO_PASSWORD },
];

const KEY = 'ccp-demo-session';
let currentId: number | null = null;
try {
  const saved = sessionStorage.getItem(KEY);
  if (saved) currentId = Number(saved);
} catch {
  /* storage diblokir: sesi demo hanya bertahan sampai halaman dimuat ulang */
}
const setCurrent = (id: number | null) => {
  currentId = id;
  try {
    if (id === null) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, String(id));
  } catch {
    /* abaikan */
  }
};

const dto = ({ password: _password, ...u }: Rec): UserDto => u;
const me = (): Rec | undefined => users.find((u) => u.id === currentId && u.active);

function needAuth(): Rec {
  const u = me();
  if (!u) throw new ApiError(401, 'unauthenticated', 'Silakan login terlebih dahulu');
  return u;
}
function needAdmin(): Rec {
  const u = needAuth();
  if (u.role !== 'admin') throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
function find(id: string): Rec {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  const u = users.find((x) => x.id === n);
  if (!u) throw new ApiError(404, 'not_found', 'Pengguna tidak ditemukan');
  return u;
}


// ───────────── Brief Order (memori) ─────────────

interface EditRec {
  editorId: number | null;
  bobot: Bobot;
  priority: EditPriority;
  scheduledFor: string | null;
  dueDate: string | null;
  startedAt: string | null;
  steps: string[];
  versions: DeliverableVersion[];
}

interface BriefRec {
  id: number;
  code: string;
  requesterId: number;
  input: BriefInput;
  status: Status;
  revisionCount: number;
  submittedAt: string;
  completedAt: string | null;
  weekStart: string | null;
  bobot: 'gampang' | 'susah';
  day: number | null;
  fu: { properti: string; kostum: string; desain: string };
  hold: string | null;
  proof: HandoffProof | null;
  picId: number | null;
  ed: EditRec;
  history: { from: Status | null; to: Status; actorId: number | null; reason: string; at: string }[];
}

const nameOf = (id: number | null) => (id === null ? null : (users.find((u) => u.id === id)?.name ?? null));

const DAY = 86_400_000;
const briefs: BriefRec[] = [];
const drafts = new Map<number, Record<string, unknown>>();
let nextBriefId = 1;

function demoCode(at: Date): string {
  const prefix = `VID-${todayJakarta(at).replaceAll('-', '')}-`;
  return `${prefix}${String(briefs.filter((b) => b.code.startsWith(prefix)).length + 1).padStart(3, '0')}`;
}

function pushBrief(requesterId: number, input: BriefInput, status: Status, at: Date, extra: Partial<BriefRec> = {}, reason = ''): BriefRec {
  const rec: BriefRec = {
    id: nextBriefId++, code: demoCode(at), requesterId, input, status, revisionCount: 0, submittedAt: at.toISOString(), completedAt: null,
    weekStart: isWeekly(input.jenis) ? productionWeekFor(todayJakarta(at)) : null, bobot: 'gampang', day: null,
    fu: { properti: '', kostum: '', desain: '' }, hold: null, proof: null, picId: null,
    ed: { editorId: null, bobot: 'gampang', priority: 'normal', scheduledFor: null, dueDate: null, startedAt: null, steps: [], versions: [] },
    history: [{ from: null, to: status, actorId: requesterId, reason, at: at.toISOString() }], ...extra,
  };
  briefs.push(rec);
  return rec;
}

for (const [idx, s] of [...SAMPLE_BRIEFS].reverse().entries()) {
  const weekly = isWeekly(s.jenis);
  const input = briefInputSchema.parse({
    jenis: s.jenis, kategori: s.kategori, produk: s.produk, judul: s.judul, rasio: s.rasio, durasiDetik: s.durasiDetik,
    linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
    attributes: weekly ? { talent: 'Cewek muda', kostum: 'Casual', lokasi: 'Studio', lokasiDetail: '', properti: 'Box product', desain: 'Tidak ada' } : null,
  });
  const at = new Date(Date.now() - s.daysAgo * DAY);
  const rec = pushBrief(6, input, s.status, at, {
    revisionCount: s.revisionCount ?? 0,
    completedAt: s.status === 'complete' ? new Date(at.getTime() + DAY).toISOString() : null,
    // Weekly yang sudah melewati tahap perencanaan berasal dari pekan sebelumnya dan punya hari syuting.
    ...(weekly && !['listing', 'backlog', 'pending_review'].includes(s.status) ? { weekStart: addDays(productionWeekFor(todayJakarta()), -7), day: idx % 5 } : {}),
  }, s.reason ?? '');
  const ed = SAMPLE_EDITING[s.judul];
  if (ed) seedEditing(rec, ed);
  if ((SAMPLE_REVIEW_FOOTAGE as readonly string[]).includes(s.judul)) {
    rec.proof = { storage: 'drive', driveUrl: `https://drive.google.com/drive/folders/review-${rec.id}`, diskName: null, path: null, fileName: null, handedAt: at.toISOString(), handedByName: 'Hardi' };
  }
}

/** Menempelkan kondisi editing pada brief contoh (editor, jadwal, langkah, versi hasil). */
function seedEditing(rec: BriefRec, ed: (typeof SAMPLE_EDITING)[string]): void {
  const start = nextWorkday(todayJakarta());
  const eid = ed.editor === 'dio' ? 5 : 7;
  rec.picId = eid;
  rec.ed = {
    editorId: eid, bobot: ed.bobot, priority: 'normal',
    scheduledFor: ed.done ? addDays(start, -3) : start,
    dueDate: ed.done ? addDays(start, -1) : suggestDue(rec.input.jenis, start),
    startedAt: ed.started || ed.done ? new Date().toISOString() : null,
    steps: [...(ed.steps ?? [])],
    versions: Array.from({ length: ed.versions ?? 0 }, (_, i) => ({
      version: i + 1, url: `https://drive.google.com/file/d/hasil-${rec.id}-v${i + 1}/view`, note: i > 0 ? 'Perbaikan sesuai catatan revisi' : '', at: new Date().toISOString(), byName: nameOf(eid),
    })),
  };
}



// Satu pekan contoh Weekly Listing (belum dikunci) agar alur Locking → Ready bisa dicoba.
const SAMPLE_WEEK = productionWeekFor(todayJakarta());
for (const w of sampleWeekly()) {
  const input = briefInputSchema.parse({
    jenis: w.jenis, kategori: w.kategori, produk: w.produk, judul: w.judul, rasio: w.rasio, durasiDetik: w.durasiDetik,
    linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
    attributes: { talent: w.talent, kostum: w.kostum, lokasi: w.lokasi, lokasiDetail: '', properti: w.properti, desain: w.desain },
  });
  pushBrief(6, input, 'listing', new Date(), {
    weekStart: SAMPLE_WEEK, bobot: w.bobot, day: w.day, fu: { properti: w.fuProperti, kostum: w.fuKostum, desain: w.fuDesain },
  });
}

// Antrean editing: konten Daily yang lolos validasi dan menunggu assign editor.
for (const q of SAMPLE_QUEUE) {
  const input = briefInputSchema.parse({
    jenis: q.jenis, kategori: q.kategori, produk: q.produk, judul: q.judul, rasio: q.rasio, durasiDetik: q.durasiDetik,
    linkDocs: 'https://docs.google.com/document/d/contoh', catatan: q.catatan, attributes: null,
  });
  pushBrief(6, input, 'antre_editing', new Date(Date.now() - q.daysAgo * DAY));
}

// ───────────── Weekly Listing (memori) ─────────────

interface WeekRec { lockedAt: string | null; lockedBy: number | null; readyAt: string | null; readyBy: number | null }
interface SdmRec { id: number; week: string; day: number; type: SdmType; name: string; ready: boolean; readyBy: number | null; readyAt: string | null }
interface DocRec {
  shotlistUrl: string | null; shotlistBy: number | null; skripUrl: string | null; skripBy: number | null;
  talentAt: string | null; talentBy: number | null;
}
const weeks = new Map<string, WeekRec>();
const sdmItems: SdmRec[] = [];
const docs = new Map<string, DocRec>();
let nextSdmId = 1;

const inWeek = (week: string) => briefs.filter((b) => b.weekStart === week && !HIDDEN_FROM_WEEK.includes(b.status));
const sdmSrc = (b: BriefRec) => ({
  talent: b.input.attributes?.talent ?? '', lokasi: b.input.attributes?.lokasi ?? '', lokasiDetail: b.input.attributes?.lokasiDetail ?? '',
  fuProperti: b.fu.properti, fuKostum: b.fu.kostum, fuDesain: b.fu.desain,
});
const weekRec = (week: string): WeekRec => {
  let w = weeks.get(week);
  if (!w) weeks.set(week, (w = { lockedAt: null, lockedBy: null, readyAt: null, readyBy: null }));
  return w;
};
const progressOf = (week: string) =>
  weekProgress({
    lockedAt: weeks.get(week)?.lockedAt ?? null, readyAt: weeks.get(week)?.readyAt ?? null,
    contents: inWeek(week).map((b) => ({ status: b.status, day: b.day })),
    items: sdmItems.filter((i) => i.week === week),
  });
const evt = (b: BriefRec, to: Status, actorId: number, reason: string) => {
  b.history.push({ from: b.status, to, actorId, reason, at: new Date().toISOString() });
  b.status = to;
};

function syncSdm(week: string): void {
  const desired = new Map<string, { day: number; type: SdmType; name: string }>();
  for (const b of inWeek(week)) {
    if (b.day === null || b.status === 'listing') continue;
    for (const n of sdmNeeds(sdmSrc(b))) desired.set(sdmKey(b.day, n), { day: b.day, type: n.type, name: n.name });
  }
  const have = new Set<string>();
  for (let i = sdmItems.length - 1; i >= 0; i--) {
    const it = sdmItems[i]!;
    if (it.week !== week) continue;
    const k = sdmKey(it.day, it);
    if (desired.has(k)) have.add(k);
    else sdmItems.splice(i, 1);
  }
  for (const [k, d] of desired) {
    if (!have.has(k)) sdmItems.push({ id: nextSdmId++, week, ...d, ready: false, readyBy: null, readyAt: null });
  }
}

function reevaluate(week: string, actorId: number, why: string): void {
  const w = weeks.get(week);
  if (!w?.readyAt || progressOf(week).lockedGateOk) return;
  w.readyAt = null;
  w.readyBy = null;
  for (const b of briefs.filter((x) => x.weekStart === week && x.status === 'ready')) evt(b, 'validasi_sdm', actorId, `Ready dibatalkan: ${why}`);
}

function weekDto(week: string, viewer: Rec): WeekDto {
  const isUser = viewer.role === 'user';
  const all = inWeek(week);
  const items = sdmItems.filter((i) => i.week === week);
  const unready = new Set(items.filter((i) => !i.ready).map((i) => sdmKey(i.day, i)));
  const counts = new Map<string, number>();
  for (const b of all) {
    if (b.day === null || b.status === 'listing') continue;
    for (const n of sdmNeeds(sdmSrc(b))) counts.set(sdmKey(b.day, n), (counts.get(sdmKey(b.day, n)) ?? 0) + 1);
  }
  const visible = isUser ? all.filter((b) => b.requesterId === viewer.id) : all;
  const contents: WeeklyContent[] = visible.map((b) => {
    const a = b.input.attributes!;
    return {
      id: b.id, code: b.code, judul: b.input.judul, produk: b.input.produk, kategori: b.input.kategori, jenis: b.input.jenis, status: b.status,
      linkDocs: b.input.linkDocs, requesterName: nameOf(b.requesterId) ?? '—', talent: a.talent, kostum: a.kostum, lokasi: a.lokasi,
      lokasiDetail: a.lokasiDetail, properti: a.properti, desain: a.desain, fuProperti: b.fu.properti, fuKostum: b.fu.kostum, fuDesain: b.fu.desain,
      bobot: b.bobot, day: b.day,
      sdmIssue: b.day !== null && b.status !== 'listing' && sdmNeeds(sdmSrc(b)).some((n) => unready.has(sdmKey(b.day!, n))),
    };
  });
  const days: DayInfo[] = DAY_NAMES.map((_, day) => {
    const dayItems = items.filter((i) => i.day === day);
    const d = docs.get(`${week}#${day}`);
    const ready = dayItems.filter((i) => i.ready).length;
    const lockedOnDay = all.some((b) => b.day === day && b.status !== 'listing');
    return {
      day, date: addDays(week, day), count: visible.filter((b) => b.day === day).length,
      slots: isUser ? null : slotsUsed(all.filter((b) => b.day === day)), capacity: isUser ? null : DAY_CAPACITY[day]!,
      sdmReady: isUser ? 0 : ready, sdmTotal: isUser ? 0 : dayItems.length, docsOpen: !isUser && lockedOnDay && ready === dayItems.length,
      shotlistUrl: isUser ? null : (d?.shotlistUrl ?? null), shotlistByName: isUser ? null : nameOf(d?.shotlistBy ?? null),
      skripUrl: isUser ? null : (d?.skripUrl ?? null), skripByName: isUser ? null : nameOf(d?.skripBy ?? null),
      talentReconfirmedAt: isUser ? null : (d?.talentAt ?? null), talentReconfirmedByName: isUser ? null : nameOf(d?.talentBy ?? null),
    };
  });
  const sdm: SdmItem[] = isUser
    ? []
    : items.map((i) => ({ id: i.id, day: i.day, type: i.type, name: i.name, ready: i.ready, readyByName: nameOf(i.readyBy), readyAt: i.readyAt, contentCount: counts.get(sdmKey(i.day, i)) ?? 0 }));
  const w = weeks.get(week);
  return {
    weekStart: week, label: weekLabel(week), lockingDay: lockingDayOf(week),
    lockedAt: w?.lockedAt ?? null, lockedByName: nameOf(w?.lockedBy ?? null), readyAt: w?.readyAt ?? null, readyByName: nameOf(w?.readyBy ?? null),
    progress: progressOf(week), contents, days, sdm,
  };
}

// ───────────── Pekan yang sedang berjalan (Daily Shooting) ─────────────

const EXEC_WEEK = mondayOf(todayJakarta());
{
  const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
  for (const [i, x] of sampleExecution().entries()) {
    const input = briefInputSchema.parse({
      jenis: x.jenis, kategori: x.kategori, produk: x.produk, judul: x.judul, rasio: x.rasio, durasiDetik: x.durasiDetik,
      linkDocs: 'https://docs.google.com/document/d/contoh', catatan: '',
      attributes: { talent: x.talent, kostum: 'Casual', lokasi: x.lokasi, lokasiDetail: '', properti: 'Box produk', desain: 'Tidak ada' },
    });
    const next: Status = routeOf(x.jenis) === 'editor' ? 'antre_editing' : 'in_review';
    const status: Status = x.state === 'ready' ? 'ready' : x.state === 'syuting' ? 'syuting' : x.state === 'footage' ? 'footage_siap' : next;
    const rec = pushBrief(6, input, status, new Date(Date.now() - 7 * DAY), { weekStart: EXEC_WEEK, bobot: x.bobot, day: x.day });
    if (x.state !== 'ready') rec.picId = 3;
    if (x.hold) rec.hold = x.hold;
    if (x.state === 'handed') {
      rec.proof = x.storage === 'hdd'
        ? { storage: 'hdd', driveUrl: null, diskName: 'HDD-CCP-02', path: `/${EXEC_WEEK.slice(0, 4)}/Okt/${dayNames[x.day]}/`, fileName: `clip_${i + 1}.mp4`, handedAt: new Date().toISOString(), handedByName: 'Hardi' }
        : { storage: 'drive', driveUrl: `https://drive.google.com/drive/folders/contoh-${i + 1}`, diskName: null, path: null, fileName: null, handedAt: new Date().toISOString(), handedByName: 'Hardi' };
    }
  }
  weeks.set(EXEC_WEEK, { lockedAt: new Date().toISOString(), lockedBy: 3, readyAt: new Date().toISOString(), readyBy: 3 });
  syncSdm(EXEC_WEEK);
  for (const it of sdmItems.filter((x) => x.week === EXEC_WEEK)) Object.assign(it, { ready: true, readyBy: 2, readyAt: new Date().toISOString() });
  for (let d = 0; d < 5; d++) {
    docs.set(`${EXEC_WEEK}#${d}`, {
      shotlistUrl: `https://docs.google.com/document/d/shotlist-${d}`, shotlistBy: 3, skripUrl: `https://docs.google.com/document/d/skrip-${d}`, skripBy: 3, talentAt: new Date().toISOString(), talentBy: 2,
    });
  }
}

// ───────────── Daily Shooting (memori) ─────────────

function boardOf(week: string, day: number): DayBoard {
  const unready = new Set(sdmItems.filter((i) => i.week === week && !i.ready).map((i) => sdmKey(i.day, i)));
  const cards: DailyCard[] = [];
  for (const b of briefs) {
    if (b.weekStart !== week || b.day === null || !(['ready', 'syuting', 'footage_siap'].includes(b.status) || b.proof)) continue;
    const column = dailyColumn({ status: b.status, day: b.day, handedOff: b.proof !== null, redo: b.status === 'revisi' && routeOf(b.input.jenis) === 'review' }, day);
    if (!column) continue;
    const a = b.input.attributes!;
    cards.push({
      id: b.id, code: b.code, judul: b.input.judul, produk: b.input.produk, jenis: b.input.jenis, status: b.status, day: b.day, column,
      talent: a.talent, lokasi: a.lokasi === 'Lainnya' && a.lokasiDetail ? a.lokasiDetail : a.lokasi, bobot: b.bobot, route: routeOf(b.input.jenis),
      holdReason: b.hold, fromDay: b.day < day && column !== 'terkirim' ? b.day : null,
      sdmIssue: sdmNeeds(sdmSrc(b)).some((n) => unready.has(sdmKey(b.day!, n))), proof: b.proof,
    });
  }
  const d = docs.get(`${week}#${day}`);
  return {
    weekStart: week, day, date: addDays(week, day), weekLabel: weekLabel(week), weekReady: weeks.get(week)?.readyAt != null,
    summary: summarize(cards), guide: { shotlistUrl: d?.shotlistUrl ?? null, skripUrl: d?.skripUrl ?? null },
    dayCounts: [0, 1, 2, 3, 4].map((x) => briefs.filter((b) => b.weekStart === week && b.day === x && (['ready', 'syuting', 'footage_siap'].includes(b.status) || b.proof)).length),
    cards,
  };
}

function dailyRoute(method: string, path: string, body: unknown): unknown | undefined {
  let m = /^\/api\/daily\/([^/]+)\/(\d+)$/.exec(path);
  if (m && method === 'GET') {
    role('videografer', 'leader', 'admin');
    if (!isWeekStart(m[1]!)) throw new ApiError(400, 'bad_week', 'Pekan harus berupa tanggal Senin (YYYY-MM-DD)');
    const day = Number(m[2]);
    if (day < 0 || day > 4) throw new ApiError(400, 'bad_day', 'Hari harus 0 (Senin) sampai 4 (Jumat)');
    return { board: boardOf(m[1]!, day) };
  }
  m = /^\/api\/daily\/contents\/(\d+)\/([a-z]+)$/.exec(path);
  if (!m || method !== 'POST') return undefined;
  const u = role('videografer');
  const b = briefs.find((x) => x.id === Number(m![1]));
  if (!b || !b.weekStart || b.day === null) throw new ApiError(404, 'not_found', 'Konten tidak ditemukan');
  const need = (cond: boolean, msg: string, code = 'bad_state') => {
    if (!cond) throw conflict(code, msg);
  };
  const notHeld = () => need(b.hold === null, 'Konten sedang di-hold. Lanjutkan dulu (Resume).', 'held');
  const week = b.weekStart;
  const redo = b.status === 'revisi' && routeOf(b.input.jenis) === 'review';

  switch (m[2]) {
    case 'start':
      need(b.status === 'ready' || redo, 'Hanya konten Ready (atau revisi Shooting Only/Photoshoot) yang bisa mulai take');
      notHeld();
      b.picId ??= u.id;
      evt(b, 'syuting', u.id, redo ? 'Take ulang karena revisi' : '');
      return { ok: true };
    case 'finish':
      need(b.status === 'syuting', 'Take belum dimulai');
      notHeld();
      evt(b, 'footage_siap', u.id, '');
      return { ok: true };
    case 'handoff': {
      need(b.status === 'footage_siap', 'Footage belum siap diserahkan');
      notHeld();
      const input = handoffSchema.parse(body);
      if (handoffNeedsDrive(b.input.jenis) && input.storage !== 'drive') throw conflict('drive_required', 'Jenis ini langsung ke Review User, footage wajib diunggah ke Drive.');
      b.proof = {
        storage: input.storage, driveUrl: input.storage === 'drive' ? input.driveUrl : null, diskName: input.storage === 'hdd' ? input.diskName : null,
        path: input.storage === 'hdd' ? input.path : null, fileName: input.storage === 'hdd' ? input.fileName : null, handedAt: new Date().toISOString(), handedByName: u.name,
      };
      evt(b, 'terkirim', u.id, input.storage === 'drive' ? 'Footage di Drive' : `Footage di ${input.diskName}`);
      evt(b, routeOf(b.input.jenis) === 'editor' ? 'antre_editing' : 'in_review', 0, '');
      b.history[b.history.length - 1]!.actorId = null;
      return { ok: true };
    }
    case 'hold': {
      const { reason } = reasonSchema.parse(body);
      need(['ready', 'syuting', 'footage_siap'].includes(b.status), 'Konten ini tidak bisa di-hold');
      need(b.hold === null, 'Konten sudah di-hold');
      b.hold = reason;
      evt(b, b.status, u.id, `Hold: ${reason}`);
      return { ok: true };
    }
    case 'resume':
      need(b.hold !== null, 'Konten tidak sedang di-hold');
      b.hold = null;
      evt(b, b.status, u.id, 'Hold dilanjutkan (Resume)');
      return { ok: true };
    case 'reschedule': {
      const { day, reason } = rescheduleSchema.parse(body);
      need(b.status === 'ready' || b.status === 'syuting', 'Hanya konten yang belum selesai di-take yang bisa dijadwal ulang');
      need(day !== b.day, 'Pilih hari yang berbeda', 'same_day');
      const from = b.day;
      b.day = day;
      b.hold = null;
      evt(b, 'ready', u.id, `Reschedule ${DAY_NAMES[from]} → ${DAY_NAMES[day]}. Alasan: ${reason}`);
      syncSdm(week);
      return { ok: true };
    }
    case 'pull': {
      const { day } = pullSchema.parse(body);
      need(b.status === 'ready', 'Hanya konten Ready yang bisa ditarik');
      notHeld();
      need(b.day > day, 'Hanya konten hari berikutnya yang bisa ditarik', 'not_later');
      const from = b.day;
      b.day = day;
      evt(b, 'ready', u.id, `Ditarik ke hari ini: ${DAY_NAMES[from]} → ${DAY_NAMES[day]}`);
      syncSdm(week);
      return { ok: true };
    }
    case 'postpone': {
      const { reason } = reasonSchema.parse(body);
      need(b.status === 'ready' || b.status === 'syuting', 'Hanya konten yang belum selesai di-take yang bisa ditunda');
      b.weekStart = addDays(week, 7);
      b.day = null;
      b.hold = null;
      evt(b, 'listing', u.id, `Ditunda ke ${weekLabel(b.weekStart)}. Alasan: ${reason}`);
      syncSdm(week);
      return { ok: true };
    }
    default:
      return undefined;
  }
}

// ───────────── Editing (memori) ─────────────

function editRows(): EditRow[] {
  return briefs
    .filter((b) => isEditJenis(b.input.jenis) && (['antre_editing', 'editing', 'revisi'].includes(b.status) || (b.status === 'in_review' && b.ed.editorId !== null)))
    .map((b) => {
      const queued = [...b.history].reverse().find((h) => h.to === 'antre_editing' || h.to === 'revisi');
      const rev = [...b.history].reverse().find((h) => h.to === 'revisi');
      return {
        id: b.id, code: b.code, judul: b.input.judul, produk: b.input.produk, kategori: b.input.kategori, jenis: b.input.jenis, rasio: b.input.rasio,
        durasiDetik: b.input.durasiDetik, status: b.status, linkDocs: b.input.linkDocs, catatan: b.input.catatan, revisionCount: b.revisionCount,
        revisionReason: b.status === 'revisi' ? (rev?.reason ?? null) : null, queuedAt: queued?.at ?? b.submittedAt,
        editorId: b.ed.editorId, editorName: nameOf(b.ed.editorId), bobot: b.ed.bobot, priority: b.ed.priority, scheduledFor: b.ed.scheduledFor,
        dueDate: b.ed.dueDate, startedAt: b.ed.startedAt, doneSteps: b.ed.steps, footage: b.proof, versions: b.ed.versions,
      };
    });
}
const activeEditors = () => users.filter((u) => u.role === 'editor' && u.active).sort((a, b) => a.name.localeCompare(b.name)).map((u) => ({ id: u.id, name: u.name }));

function editingRoute(method: string, path: string, body: unknown): unknown | undefined {
  if (path === '/api/editing/schedule' && method === 'GET') {
    role('leader', 'admin');
    return { schedule: buildSchedule(editRows(), activeEditors(), todayJakarta()) };
  }
  const board = /^\/api\/editing\/board(?:\?editorId=(.*))?$/.exec(path);
  if (board && method === 'GET') {
    const u = role('editor', 'leader', 'admin');
    let eid: number | null = null;
    if (u.role === 'editor') eid = u.id;
    else if (board[1]) {
      eid = Number(board[1]);
      if (!Number.isInteger(eid) || eid <= 0) throw new ApiError(400, 'bad_id', 'ID tidak valid');
    }
    return { board: buildEditorBoard(editRows(), eid, todayJakarta()) };
  }
  const m = /^\/api\/editing\/contents\/(\d+)\/([a-z]+)$/.exec(path);
  if (!m || method !== 'POST') return undefined;
  const what = m[2]!;
  const u = role(what === 'assign' ? 'leader' : 'editor');
  const b = briefs.find((x) => x.id === Number(m[1]));
  if (!b || !isEditJenis(b.input.jenis)) throw new ApiError(404, 'not_found', 'Konten tidak ditemukan');
  const need = (cond: boolean, msg: string, code = 'bad_state') => {
    if (!cond) throw conflict(code, msg);
  };
  const mine = () => {
    if (b.ed.editorId !== u.id) throw new ApiError(403, 'not_assignee', 'Konten ini bukan tugas Anda');
  };
  switch (what) {
    case 'assign': {
      const input = assignSchema.parse(body);
      need(['antre_editing', 'editing', 'revisi'].includes(b.status), 'Konten ini tidak bisa di-assign');
      const ed = users.find((x) => x.id === input.editorId && x.role === 'editor' && x.active);
      if (!ed) throw new ApiError(400, 'bad_editor', 'Editor tidak ditemukan atau tidak aktif');
      const changed = b.ed.editorId !== null && b.ed.editorId !== input.editorId;
      const detail = `${ed.name} · mulai ${input.scheduledFor} · tenggat ${input.dueDate}${input.priority === 'tinggi' ? ' · prioritas' : ''}`;
      const wasQueued = b.status === 'antre_editing';
      Object.assign(b.ed, { editorId: ed.id, bobot: input.bobot, priority: input.priority, scheduledFor: input.scheduledFor, dueDate: input.dueDate });
      if (changed) b.ed.startedAt = null;
      b.picId = ed.id;
      const to: Status = wasQueued ? 'editing' : b.status;
      b.history.push({ from: b.status, to, actorId: u.id, reason: wasQueued ? `Assign: ${detail}` : `Jadwal editing diubah: ${detail}`, at: new Date().toISOString() });
      b.status = to;
      return { ok: true };
    }
    case 'start':
      mine();
      if (b.status === 'revisi') {
        b.history.push({ from: 'revisi', to: 'editing', actorId: u.id, reason: 'Mulai mengerjakan revisi', at: new Date().toISOString() });
        b.status = 'editing';
        b.ed.startedAt = new Date().toISOString();
        b.ed.steps = b.ed.steps.filter((k) => !(RESET_ON_REVISION as readonly string[]).includes(k));
      } else {
        need(b.status === 'editing' && b.ed.startedAt === null, 'Konten ini tidak bisa dimulai');
        b.ed.startedAt = new Date().toISOString();
        b.history.push({ from: 'editing', to: 'editing', actorId: u.id, reason: 'Mulai edit', at: b.ed.startedAt });
      }
      return { ok: true };
    case 'step': {
      mine();
      const { key, done } = stepSchema.parse(body);
      need(b.status === 'editing' && b.ed.startedAt !== null, 'Mulai edit dulu sebelum mencentang langkah');
      if (!isStepKey(b.input.jenis, key)) throw new ApiError(400, 'bad_step', 'Langkah tidak dikenal');
      b.ed.steps = done ? [...new Set([...b.ed.steps, key])] : b.ed.steps.filter((k) => k !== key);
      return { ok: true };
    }
    case 'submit': {
      mine();
      const input = submitSchema.parse(body);
      need(b.status === 'editing' && b.ed.startedAt !== null, 'Konten belum berstatus On Progress');
      need(b.ed.steps.includes(REQUIRED_STEP), 'Selesaikan Self-QC dulu sebelum mengirim ke In Review', 'selfqc_required');
      const version = (b.ed.versions.at(-1)?.version ?? 0) + 1;
      const now = new Date().toISOString();
      b.ed.versions.push({ version, url: input.url, note: input.note, at: now, byName: u.name });
      b.history.push({ from: 'editing', to: 'in_review', actorId: u.id, reason: `Hasil editing v${version} dikirim${input.note ? `: ${input.note}` : ''}`, at: now });
      b.status = 'in_review';
      return { ok: true };
    }
    default:
      return undefined;
  }
}

function role(...allowed: Rec['role'][]): Rec {
  const u = needAuth();
  if (!allowed.includes(u.role)) throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
const conflict = (code: string, msg: string) => new ApiError(409, code, msg);
function contentOf(rawId: string): BriefRec {
  const b = briefs.find((x) => x.id === Number(rawId));
  if (!b || !b.weekStart) throw new ApiError(404, 'not_found', 'Konten Weekly tidak ditemukan');
  return b;
}
const planning = (b: BriefRec) => {
  if (!PLANNING_STATUSES.includes(b.status)) throw conflict('not_adjustable', 'Konten ini sudah masuk produksi, ubah lewat Daily Shooting');
};
const dayLabel = (d: number | null) => (d === null ? 'belum dijadwal' : DAY_NAMES[d]!);

function weeklyRoute(method: string, path: string, body: unknown): unknown | undefined {
  const m = /^\/api\/weekly\/(.+)$/.exec(path);
  if (!m) return undefined;
  const parts = m[1]!.split('/');
  const wk = (raw: string) => {
    if (!isWeekStart(raw)) throw new ApiError(400, 'bad_week', 'Pekan harus berupa tanggal Senin (YYYY-MM-DD)');
    return raw;
  };

  if (parts.length === 1 && method === 'GET') {
    const u = role('user', 'leader', 'videografer', 'admin');
    return { week: weekDto(wk(parts[0]!), u) };
  }

  if (parts[0] === 'contents' && parts[1]) {
    const b = contentOf(parts[1]);
    const week = b.weekStart!;
    if (parts.length === 2 && method === 'PATCH') {
      const u = role('videografer');
      const patch = contentPatchSchema.parse(body);
      planning(b);
      const a = { ...b.input.attributes! };
      const lokasi = patch.lokasi ?? a.lokasi;
      const detail = lokasi === 'Lainnya' ? (patch.lokasiDetail ?? a.lokasiDetail) : '';
      if (lokasi === 'Lainnya' && !detail) throw new ApiError(400, 'validation', 'lokasiDetail: Sebutkan lokasinya');
      const next = { ...a, talent: patch.talent ?? a.talent, kostum: patch.kostum ?? a.kostum, lokasi, lokasiDetail: detail, properti: patch.properti ?? a.properti, desain: patch.desain ?? a.desain };
      const nextFu = { properti: patch.fuProperti ?? b.fu.properti, kostum: patch.fuKostum ?? b.fu.kostum, desain: patch.fuDesain ?? b.fu.desain };
      const attrChanged = (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== a[k]) || (Object.keys(nextFu) as (keyof typeof nextFu)[]).some((k) => nextFu[k] !== b.fu[k]);
      const dayChanged = patch.day !== undefined && patch.day !== b.day;
      const bobotChanged = patch.bobot !== undefined && patch.bobot !== b.bobot;
      if (!attrChanged && !dayChanged && !bobotChanged) return { week: weekDto(week, u) };
      const locked = b.status !== 'listing';
      if (locked && (attrChanged || dayChanged) && !patch.reason) throw new ApiError(400, 'reason_required', 'Alasan wajib diisi untuk penyesuaian setelah Locking');
      const summary = [dayChanged ? `hari: ${dayLabel(b.day)} → ${dayLabel(patch.day ?? null)}` : '', attrChanged ? 'atribut diperbarui' : '', bobotChanged ? `bobot: ${b.bobot} → ${patch.bobot}` : ''].filter(Boolean).join('; ');
      b.input = { ...b.input, attributes: next };
      b.fu = nextFu;
      if (patch.bobot) b.bobot = patch.bobot;
      if (patch.day !== undefined) b.day = patch.day;
      if (locked) {
        syncSdm(week);
        reevaluate(week, u.id, patch.reason || 'penyesuaian jadwal/atribut');
        if (patch.reason) evt(b, b.status, u.id, `Penyesuaian (${summary}). Alasan: ${patch.reason}`);
      }
      return { week: weekDto(week, u) };
    }
    if (parts.length === 3 && parts[2] === 'postpone' && method === 'POST') {
      const u = role('videografer');
      const { reason } = reasonSchema.parse(body);
      planning(b);
      const was = b.status;
      b.weekStart = addDays(week, 7);
      b.day = null;
      evt(b, 'listing', u.id, `Ditunda ke ${weekLabel(b.weekStart)}. Alasan: ${reason}`);
      if (was !== 'listing') {
        syncSdm(week);
        reevaluate(week, u.id, `konten ${b.code} ditunda`);
      }
      return { week: weekDto(week, u) };
    }
    if (parts.length === 3 && parts[2] === 'return' && method === 'POST') {
      const u = role('videografer', 'leader');
      const { reason } = reasonSchema.parse(body);
      if (b.status !== 'listing') throw conflict('not_returnable', 'Konten yang sudah dikunci tidak bisa dikembalikan. Gunakan “Tunda ke pekan depan”.');
      b.day = null;
      evt(b, 'backlog', u.id, reason);
      return { week: weekDto(week, u) };
    }
  }

  if (parts[0] === 'sdm' && parts[1] && method === 'POST') {
    const u = role('leader');
    const { ready } = z.object({ ready: z.boolean() }).parse(body);
    const it = sdmItems.find((i) => i.id === Number(parts[1]));
    if (!it) throw new ApiError(404, 'not_found', 'Item SDM tidak ditemukan');
    it.ready = ready;
    it.readyBy = ready ? u.id : null;
    it.readyAt = ready ? new Date().toISOString() : null;
    if (!ready) reevaluate(it.week, u.id, 'ada item SDM yang ditandai Tidak Ready');
    return { week: weekDto(it.week, u) };
  }

  const week = wk(parts[0]!);
  if (parts.length === 2 && parts[1] === 'lock' && method === 'POST') {
    const u = role('videografer');
    const pending = inWeek(week).filter((b) => b.status === 'listing');
    if (pending.length === 0) throw conflict('nothing_to_lock', 'Tidak ada konten yang perlu dikunci');
    for (const b of pending) evt(b, 'validasi_sdm', u.id, '');
    const w = weekRec(week);
    w.lockedAt ??= new Date().toISOString();
    w.lockedBy ??= u.id;
    syncSdm(week);
    reevaluate(week, u.id, 'ada konten susulan yang baru dikunci');
    return { week: weekDto(week, u) };
  }
  if (parts.length === 2 && parts[1] === 'ready' && method === 'POST') {
    const u = role('videografer');
    const p = progressOf(week);
    if (!p.canMarkReady) {
      throw conflict(
        'not_ready',
        p.pendingLock > 0 ? 'Masih ada konten yang belum dikunci (Locking Disepakati).' : p.unscheduled > 0 ? `Masih ada ${p.unscheduled} konten tanpa hari syuting.` : !p.steps[2] ? 'Masih ada SDM yang belum Ready.' : 'Pekan ini belum bisa ditandai Ready.',
      );
    }
    for (const b of inWeek(week).filter((x) => x.status === 'validasi_sdm')) evt(b, 'ready', u.id, '');
    const w = weekRec(week);
    w.readyAt = new Date().toISOString();
    w.readyBy = u.id;
    return { week: weekDto(week, u) };
  }
  if (parts.length === 4 && parts[1] === 'days') {
    const day = Number(parts[2]);
    if (!Number.isInteger(day) || day < 0 || day > 4) throw new ApiError(400, 'bad_day', 'Hari harus 0 (Senin) sampai 4 (Jumat)');
    if (parts[3] === 'docs' && method === 'PUT') {
      const u = role('videografer');
      const { kind, url } = dayDocSchema.parse(body);
      const lockedOnDay = inWeek(week).some((b) => b.day === day && b.status !== 'listing');
      if (!lockedOnDay || sdmItems.some((i) => i.week === week && i.day === day && !i.ready)) {
        throw conflict('docs_closed', 'Shotlist dan skrip bisa diunggah setelah semua SDM hari itu Ready');
      }
      const key = `${week}#${day}`;
      const d = docs.get(key) ?? { shotlistUrl: null, shotlistBy: null, skripUrl: null, skripBy: null, talentAt: null, talentBy: null };
      if (kind === 'shotlist') Object.assign(d, { shotlistUrl: url, shotlistBy: u.id });
      else Object.assign(d, { skripUrl: url, skripBy: u.id });
      docs.set(key, d);
      return { week: weekDto(week, u) };
    }
    if (parts[3] === 'reconfirm-talent' && method === 'POST') {
      const u = role('leader');
      if (!sdmItems.some((i) => i.week === week && i.day === day && i.type === 'talent')) throw conflict('no_talent', 'Tidak ada talent yang perlu dikonfirmasi pada hari ini');
      const key = `${week}#${day}`;
      const d = docs.get(key) ?? { shotlistUrl: null, shotlistBy: null, skripUrl: null, skripBy: null, talentAt: null, talentBy: null };
      Object.assign(d, { talentAt: new Date().toISOString(), talentBy: u.id });
      docs.set(key, d);
      return { week: weekDto(week, u) };
    }
  }
  return undefined;
}


function toItem(b: BriefRec): BriefListItem {
  const r = users.find((u) => u.id === b.requesterId);
  return {
    id: b.id, code: b.code, status: b.status, judul: b.input.judul, produk: b.input.produk, kategori: b.input.kategori, jenis: b.input.jenis,
    rasio: b.input.rasio, durasiDetik: b.input.durasiDetik, requester: { id: b.requesterId, name: r?.name ?? '—', unit: r?.unit ?? '' },
    pic: nameOf(b.picId), submittedAt: b.submittedAt, slaTargetAt: slaTargetFor(b.input.jenis, b.submittedAt), completedAt: b.completedAt, revisionCount: b.revisionCount,
  };
}

function reviewMaterialOf(b: BriefRec): ReviewMaterial | null {
  const v = b.ed.versions.at(-1);
  if (v) return { source: 'editor', version: v.version, url: v.url, note: v.note, at: v.at, byName: v.byName };
  if ((b.input.jenis === 'shooting_only' || b.input.jenis === 'photoshoot') && b.proof?.storage === 'drive' && b.proof.driveUrl) {
    return { source: 'footage', version: 1, url: b.proof.driveUrl, note: 'Footage dari Videografer', at: b.proof.handedAt, byName: b.proof.handedByName };
  }
  return null;
}

function toDetail(b: BriefRec): BriefDetail {
  const history: BriefEvent[] = b.history.map((h) => ({ from: h.from, to: h.to, actorName: nameOf(h.actorId), reason: h.reason, at: h.at }));
  return { ...toItem(b), reviewMaterial: reviewMaterialOf(b), linkDocs: b.input.linkDocs, catatan: b.input.catatan, attributes: b.input.attributes, history };
}

function viewer(): Rec {
  const u = needAuth();
  if (!canViewBriefs(u.role)) throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
function requester(): Rec {
  const u = needAuth();
  if (u.role !== 'user') throw new ApiError(403, 'forbidden', 'Anda tidak memiliki akses');
  return u;
}
function visibleBrief(u: Rec, rawId: string): BriefRec {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'bad_id', 'ID tidak valid');
  const b = briefs.find((x) => x.id === id);
  if (!b || (u.role === 'user' && b.requesterId !== u.id)) throw new ApiError(404, 'not_found', 'Brief tidak ditemukan');
  return b;
}

const transitionSchema = z.object({ to: z.enum(STATUSES), reason: z.string().trim().max(500).default('') });

function briefRoute(method: string, path: string, body: unknown): unknown | undefined {
  if (path === '/api/briefs/draft/me') {
    const u = requester();
    if (method === 'GET') {
      const data = drafts.get(u.id);
      return { draft: data ? { data, updatedAt: new Date().toISOString() } : null };
    }
    if (method === 'PUT') {
      const { data } = z.object({ data: draftSchema }).parse(body);
      if (JSON.stringify(data).length > 20_000) throw new ApiError(413, 'draft_too_large', 'Draf terlalu besar');
      drafts.set(u.id, data);
      return { ok: true };
    }
    if (method === 'DELETE') {
      drafts.delete(u.id);
      return { ok: true };
    }
  }

  const list = /^\/api\/briefs(?:\?(.*))?$/.exec(path);
  if (list && method === 'GET') {
    const u = viewer();
    const params = new URLSearchParams(list[1] ?? '');
    const filter = (params.get('filter') ?? 'all') as BriefFilter;
    if (!(filter in BRIEF_FILTERS)) throw new ApiError(400, 'bad_filter', 'Filter tidak dikenal');
    const q = (params.get('q') ?? '').trim().toLowerCase();
    const rows = briefs
      .filter((b) => (u.role !== 'user' || b.requesterId === u.id) && BRIEF_FILTERS[filter](b.status))
      .filter((b) => !q || [b.code, b.input.judul, b.input.produk].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id - a.id);
    return { briefs: rows.map(toItem) };
  }
  if (path === '/api/briefs' && method === 'POST') {
    const u = requester();
    const input = briefInputSchema.parse(body);
    const rec = pushBrief(u.id, input, isWeekly(input.jenis) ? 'listing' : 'pending_review', new Date());
    drafts.delete(u.id);
    return { brief: toDetail(rec) };
  }

  const one = /^\/api\/briefs\/([^/]+)(\/transition)?$/.exec(path);
  if (one) {
    const u = viewer();
    const b = visibleBrief(u, one[1]!);
    if (!one[2] && method === 'GET') return { brief: toDetail(b) };
    if (!one[2] && method === 'PATCH') {
      requester();
      if (!canEditBrief(u.role, b.requesterId === u.id, b.status)) throw new ApiError(409, 'not_editable', 'Brief hanya bisa diubah saat dikembalikan ke Backlog');
      const input = briefInputSchema.parse(body);
      if (input.jenis !== b.input.jenis) throw new ApiError(400, 'jenis_locked', 'Jenis pengerjaan tidak bisa diubah. Buat brief baru bila jalurnya berbeda.');
      b.input = input;
      return { brief: toDetail(b) };
    }
    if (one[2] && method === 'POST') {
      const { to, reason } = transitionSchema.parse(body);
      const check = checkBriefMove({ jenis: b.input.jenis, from: b.status, to, role: u.role, isOwner: b.requesterId === u.id });
      if (!check.ok) {
        throw check.code === 'not_owner' ? new ApiError(404, 'not_found', 'Brief tidak ditemukan') : new ApiError(409, 'bad_transition', 'Perubahan status ini tidak diizinkan');
      }
      if (requiresReason(jalurOf(b.input.jenis), b.status, to) && !reason) throw new ApiError(400, 'reason_required', 'Alasan wajib diisi');
      const now = new Date().toISOString();
      if (b.status === 'backlog') {
        b.submittedAt = now;
        if (isWeekly(b.input.jenis)) {
          b.weekStart = productionWeekFor(todayJakarta(new Date(now)));
          b.day = null;
        }
      }
      if (to === 'complete') b.completedAt = now;
      if (to === 'revisi') b.revisionCount += 1;
      b.history.push({ from: b.status, to, actorId: u.id, reason, at: now });
      b.status = to;
      return { brief: toDetail(b) };
    }
  }
  return undefined;
}

function route(method: string, path: string, body: unknown): unknown {
  const handled = briefRoute(method, path, body) ?? weeklyRoute(method, path, body) ?? dailyRoute(method, path, body) ?? editingRoute(method, path, body);
  if (handled !== undefined) return handled;

  if (method === 'POST' && path === '/api/auth/login') {
    const { email, password } = loginSchema.parse(body);
    const u = users.find((x) => x.email === email);
    if (!u || !u.active || u.password !== password) throw new ApiError(401, 'invalid_credentials', 'Email atau password salah');
    setCurrent(u.id);
    return { user: dto(u) };
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    setCurrent(null);
    return { ok: true };
  }
  if (method === 'GET' && path === '/api/auth/me') return { user: dto(needAuth()) };
  if (method === 'POST' && path === '/api/auth/change-password') {
    const u = needAuth();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);
    if (u.password !== currentPassword) throw new ApiError(400, 'wrong_password', 'Password saat ini salah');
    u.password = newPassword;
    return { ok: true };
  }

  if (path === '/api/users' && method === 'GET') {
    needAdmin();
    return { users: [...users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map(dto) };
  }
  if (path === '/api/users' && method === 'POST') {
    needAdmin();
    const input = createUserSchema.parse(body);
    if (users.some((u) => u.email === input.email)) throw new ApiError(409, 'email_taken', 'Email sudah terdaftar');
    const rec: Rec = { id: nextId++, active: true, ...input };
    users.push(rec);
    return { user: dto(rec) };
  }
  const m = /^\/api\/users\/([^/]+)(\/reset-password)?$/.exec(path);
  if (m) {
    const admin = needAdmin();
    const target = find(m[1]!);
    if (m[2] && method === 'POST') {
      target.password = resetPasswordSchema.parse(body).newPassword;
      if (target.id === currentId) setCurrent(null);
      return { ok: true };
    }
    if (!m[2] && method === 'PATCH') {
      const patch = updateUserSchema.parse(body);
      if (target.id === admin.id && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
        throw new ApiError(400, 'self_lockout', 'Anda tidak bisa menonaktifkan atau menurunkan peran akun sendiri');
      }
      Object.assign(target, patch);
      return { user: dto(target) };
    }
  }
  throw new ApiError(404, 'not_found', 'Endpoint tidak ditemukan');
}

export async function demoApi<T>(path: string, method: string, body: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 120)); // terasa seperti jaringan
  try {
    return route(method, path, body) as T;
  } catch (e) {
    if (e instanceof ZodError) {
      throw new ApiError(400, 'validation', e.issues.length === 1 ? e.issues[0]!.message : e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
    }
    throw e;
  }
}
