-- Editing: assign editor, jadwal, langkah pengerjaan, dan versi hasil.

ALTER TABLE briefs ADD COLUMN editor_id          INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE briefs ADD COLUMN edit_bobot         TEXT NOT NULL DEFAULT 'gampang' CHECK (edit_bobot IN ('gampang', 'susah'));
ALTER TABLE briefs ADD COLUMN edit_priority      TEXT NOT NULL DEFAULT 'normal' CHECK (edit_priority IN ('normal', 'tinggi'));
ALTER TABLE briefs ADD COLUMN edit_scheduled_for DATE;
ALTER TABLE briefs ADD COLUMN edit_due           DATE;
ALTER TABLE briefs ADD COLUMN edit_started_at    TIMESTAMPTZ;
CREATE INDEX idx_briefs_editor ON briefs(editor_id);

-- Langkah editing yang sudah selesai (checklist per konten).
CREATE TABLE edit_steps (
  brief_id INTEGER     NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  step_key TEXT        NOT NULL,
  done_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  done_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brief_id, step_key)
);

-- Hasil editing yang dikirim ke In Review. Setiap kirim = versi baru (v1, v2, ...), yang terbaru dilihat User.
CREATE TABLE deliverables (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  brief_id     INTEGER     NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  version      INTEGER     NOT NULL,
  url          TEXT        NOT NULL,
  note         TEXT        NOT NULL DEFAULT '',
  submitted_by INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brief_id, version)
);
