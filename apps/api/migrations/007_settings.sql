-- Pengaturan aplikasi sederhana (kunci → nilai teks). Dipakai a.l. untuk visibilitas Papan Prestasi.
CREATE TABLE app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_by INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
