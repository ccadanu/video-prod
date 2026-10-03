CREATE TABLE briefs (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code           TEXT        NOT NULL UNIQUE,              -- VID-YYYYMMDD-NNN
  requester_id   INTEGER     NOT NULL REFERENCES users(id),
  pic_id         INTEGER     REFERENCES users(id),         -- diisi fase berikutnya (VG / Editor)
  jenis          TEXT        NOT NULL CHECK (jenis IN ('shooting_only','shooting_edit','photoshoot','full_ai','editing_only','motion')),
  kategori       TEXT        NOT NULL,
  produk         TEXT        NOT NULL,
  judul          TEXT        NOT NULL,
  rasio          TEXT        NOT NULL,
  durasi_detik   INTEGER,
  link_docs      TEXT        NOT NULL,
  catatan        TEXT        NOT NULL DEFAULT '',
  status         TEXT        NOT NULL,
  revision_count INTEGER     NOT NULL DEFAULT 0,
  submitted_at   TIMESTAMPTZ NOT NULL,
  sla_target_at  TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_briefs_requester ON briefs(requester_id);
CREATE INDEX idx_briefs_status ON briefs(status);

-- Penomoran kode per hari yang aman terhadap akses bersamaan (pengganti COUNT(*)+1).
CREATE TABLE brief_counters (
  day TEXT    PRIMARY KEY,   -- YYYYMMDD (WIB)
  n   INTEGER NOT NULL
);

-- Atribut produksi isian User (jenis Weekly). Validasi/penimpaan oleh VG ada di fase Weekly Listing.
CREATE TABLE brief_attributes (
  brief_id      INTEGER PRIMARY KEY REFERENCES briefs(id) ON DELETE CASCADE,
  talent        TEXT NOT NULL,
  kostum        TEXT NOT NULL,
  lokasi        TEXT NOT NULL,
  lokasi_detail TEXT NOT NULL DEFAULT '',
  properti      TEXT NOT NULL,
  desain        TEXT NOT NULL
);

-- Riwayat status + alasan (jejak evaluasi).
CREATE TABLE brief_events (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brief_id    INTEGER     NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  actor_id    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  reason      TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brief_events_brief ON brief_events(brief_id);

-- Draf wizard "Buat Brief Baru" (auto-save), satu per pengguna.
CREATE TABLE brief_drafts (
  user_id    INTEGER     PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
