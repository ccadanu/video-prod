-- Weekly Listing: pekan produksi, bobot, hari syuting, atribut tindak lanjut (FU), SDM, dan dokumen harian.

ALTER TABLE briefs ADD COLUMN week_start DATE;   -- Senin pekan produksi (hanya jenis Weekly)
ALTER TABLE briefs ADD COLUMN bobot TEXT NOT NULL DEFAULT 'gampang' CHECK (bobot IN ('gampang', 'susah'));
ALTER TABLE briefs ADD COLUMN shoot_day SMALLINT CHECK (shoot_day BETWEEN 0 AND 4);  -- 0 = Senin … 4 = Jumat
CREATE INDEX idx_briefs_week ON briefs(week_start);

-- Brief Weekly yang sudah ada: submit pada pekan W (WIB) masuk pekan produksi W+1.
UPDATE briefs
   SET week_start = (date_trunc('week', submitted_at AT TIME ZONE 'Asia/Jakarta') + interval '7 days')::date
 WHERE jenis IN ('shooting_only', 'shooting_edit', 'photoshoot');

-- Item yang butuh tindak lanjut Leader. Ditentukan VG saat Locking (bukan User); kosong = tidak perlu.
ALTER TABLE brief_attributes ADD COLUMN fu_properti TEXT NOT NULL DEFAULT '';
ALTER TABLE brief_attributes ADD COLUMN fu_kostum   TEXT NOT NULL DEFAULT '';
ALTER TABLE brief_attributes ADD COLUMN fu_desain   TEXT NOT NULL DEFAULT '';

-- Status per pekan. Tahap (Locking / Propose / Validasi SDM / Ready) diturunkan dari data, bukan disimpan.
CREATE TABLE weekly_weeks (
  week_start DATE        PRIMARY KEY,
  locked_at  TIMESTAMPTZ,
  locked_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  ready_at   TIMESTAMPTZ,
  ready_by   INTEGER     REFERENCES users(id) ON DELETE SET NULL
);

-- Kebutuhan sumber daya per hari, diturunkan dari konten terjadwal. Leader menandai Ready / Tidak Ready.
CREATE TABLE sdm_items (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_start DATE        NOT NULL,
  day        SMALLINT    NOT NULL CHECK (day BETWEEN 0 AND 4),
  type       TEXT        NOT NULL CHECK (type IN ('talent', 'lokasi', 'prop', 'desain', 'kostum')),
  name       TEXT        NOT NULL,
  ready      BOOLEAN     NOT NULL DEFAULT FALSE,
  ready_by   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  ready_at   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sdm_items_key ON sdm_items (week_start, day, type, lower(name));

-- Shotlist & Skrip per hari syuting (disiapkan H-1) dan konfirmasi ulang talent oleh Leader.
CREATE TABLE weekly_day_docs (
  week_start              DATE        NOT NULL,
  day                     SMALLINT    NOT NULL CHECK (day BETWEEN 0 AND 4),
  shotlist_url            TEXT,
  shotlist_by             INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  shotlist_at             TIMESTAMPTZ,
  skrip_url               TEXT,
  skrip_by                INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  skrip_at                TIMESTAMPTZ,
  talent_reconfirmed_by   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  talent_reconfirmed_at   TIMESTAMPTZ,
  PRIMARY KEY (week_start, day)
);
