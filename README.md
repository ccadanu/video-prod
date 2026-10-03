# CCP Video Production

Web app satu pintu untuk proses produksi video PT Adanu Adhinata Semesta (CCP): brief → pra-produksi
(locking & jadwal syuting) → produksi harian → editing → review. Peran: User, Leader, Videografer, Editor, Admin.

## Struktur

```
packages/shared   Aturan bisnis bersama (peran, status & transisi, kapasitas, pekan produksi, navigasi, skema zod)
apps/api          Fastify + PostgreSQL (pg): auth email+password, sesi, kelola pengguna, Brief Order, audit log
apps/web          React + TypeScript + Tailwind (Vite): shell, sidebar per peran, komponen dasar
docs/             Asumsi & keputusan desain
```

## Menjalankan (pengembangan)

Butuh Node 22+.

```bash
npm install
npm run seed      # akun + brief contoh (hanya dev)
npm run dev       # API :3001 + web :5173
```

Akun demo (password `Ccp#Demo2026`): `admin@`, `leader@`, `hardi@`, `yofa@`, `dio@`, `rara@`, `sari@`, `budi@`, `maya@`, `arya@` + `ccp.local`.

```bash
npm run typecheck
npm test
npm run build     # build web
```

Tanpa `DATABASE_URL`, dev memakai Postgres tertanam (PGlite) di `apps/api/data/pgdata`: tidak perlu memasang apa pun.
Untuk Postgres sungguhan: `docker compose up -d` lalu set `DATABASE_URL=postgres://ccp:ccp@localhost:5432/ccp`.
Tes: `npm test` (PGlite) atau `TEST_DATABASE_URL=postgres://…/ccp_test npm test` (server sungguhan).

## Portabilitas

Aplikasi memakai SQL Postgres standar, logika bisnis di kode aplikasi, dan auth milik sendiri. Tidak ada ikatan ke vendor
tertentu. Rinciannya, termasuk cara pindah ke server internal, ada di [`docs/PORTABILITAS.md`](docs/PORTABILITAS.md).

## Konfigurasi

Lihat `apps/api/.env.example`. Di production: `NODE_ENV=production` (cookie `Secure`), set `ALLOWED_ORIGINS`
bila web dilayani dari origin berbeda, dan buat admin awal dengan
`NODE_ENV=production SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... npm run seed`.

## Keamanan

- Password di-hash dengan scrypt; sesi opak di database (hash token), cookie `httpOnly` + `SameSite=Lax`.
- Request tulis dari origin asing ditolak; login dibatasi 10x/menit per IP.
- Repo ini **publik**: jangan commit dokumen internal (PRD, BPM, mockup, GSM), data nyata, atau `.env`.
  Folder `docs/reference/` sudah di-gitignore untuk keperluan itu.

## Status

Fase 0 (fondasi), Fase 1 (Brief Order), Fase 2 (Weekly Listing), Fase 3 (Daily Shooting), Fase 4 (Brief Editing Schedule + Editing Execution), dan Fase 5 (Dashboard Statistik, KPI Individu, Blind Review) selesai. Fase 4–5 memakai asumsi sementara untuk Open Item dan spesifikasi yang belum ada (lihat ASSUMPTIONS 32–37 dan 42–56). Lihat `docs/ASSUMPTIONS.md` untuk asumsi yang perlu dikonfirmasi.
Fase berikutnya: Fase 6 (penyelesaian & deploy).
