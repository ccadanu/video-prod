-- Daily Shooting: hold dan bukti serah footage.

ALTER TABLE briefs ADD COLUMN hold_reason TEXT;   -- terisi = konten sedang di-hold (tetap di hari yang sama)

-- Bukti serah footage mentah (PRD §7.3). Output VG adalah footage mentah; yang dicatat hanya lokasinya.
CREATE TABLE footage_handoffs (
  brief_id   INTEGER     PRIMARY KEY REFERENCES briefs(id) ON DELETE CASCADE,
  storage    TEXT        NOT NULL CHECK (storage IN ('drive', 'hdd')),
  drive_url  TEXT,
  disk_name  TEXT,
  path       TEXT,
  file_name  TEXT,
  handed_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  handed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (storage = 'drive' AND drive_url IS NOT NULL) OR
    (storage = 'hdd' AND disk_name IS NOT NULL AND path IS NOT NULL AND file_name IS NOT NULL)
  )
);
