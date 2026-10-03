-- Blind Review / Evaluasi: siklus 2-mingguan, undangan, respons tanpa identitas, FGD & tindak lanjut.

CREATE TABLE eval_cycles (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT        NOT NULL DEFAULT '',
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ,
  fgd_at       DATE,
  fgd_notes    TEXT        NOT NULL DEFAULT '',
  CHECK (period_end >= period_start)
);

-- Siapa yang diundang dan sudah mengisi (hanya partisipasi, bukan isi jawaban).
CREATE TABLE eval_invites (
  cycle_id     INTEGER     NOT NULL REFERENCES eval_cycles(id) ON DELETE CASCADE,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ,
  PRIMARY KEY (cycle_id, user_id)
);

-- Jawaban sengaja TIDAK menyimpan pengisi dan waktu pengisian. Satu konten dinilai paling banyak sekali.
CREATE TABLE eval_responses (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES eval_cycles(id) ON DELETE CASCADE,
  brief_id INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  rating   INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  UNIQUE (brief_id)
);

CREATE TABLE eval_comments (
  id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES eval_cycles(id) ON DELETE CASCADE,
  kind     TEXT    NOT NULL CHECK (kind IN ('good', 'improve')),
  body     TEXT    NOT NULL
);

-- Hasil FGD: umpan balik yang bisa ditindaklanjuti.
CREATE TABLE eval_actions (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_id   INTEGER     NOT NULL REFERENCES eval_cycles(id) ON DELETE CASCADE,
  text       TEXT        NOT NULL,
  done       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_eval_actions_cycle ON eval_actions(cycle_id);
