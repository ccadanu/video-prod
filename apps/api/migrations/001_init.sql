-- PostgreSQL standar (tanpa ekstensi, RLS, trigger, atau fitur khusus vendor).
-- Berjalan sama di Postgres 14+ mana pun: server internal, Docker, maupun layanan terkelola.

CREATE TABLE users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('user','leader','videografer','editor','admin')),
  unit          TEXT        NOT NULL DEFAULT '',
  jabatan       TEXT        NOT NULL DEFAULT '',
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Email unik tanpa membedakan huruf besar/kecil.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- Sesi opak (bisa dicabut). Yang disimpan hanya hash token.
CREATE TABLE sessions (
  token_hash TEXT        PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Jejak aksi (alasan hold/reschedule/revisi, perubahan peran, dsb.) untuk evaluasi.
CREATE TABLE audit_log (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT        NOT NULL,
  entity     TEXT        NOT NULL DEFAULT '',
  entity_id  TEXT        NOT NULL DEFAULT '',
  detail     JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
