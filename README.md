# CCP Video Production

Web app satu pintu untuk proses produksi video PT Adanu Adhinata Semesta (CCP): brief → pra-produksi
(locking & jadwal syuting) → produksi harian → editing → review. Peran: User, Leader, Videografer, Editor, Admin.

## Struktur

```
packages/shared   Aturan bisnis bersama (peran, status & transisi, kapasitas, pekan produksi, navigasi, skema zod)
apps/api          Fastify + SQLite (better-sqlite3): auth email+password, sesi, kelola pengguna, audit log
apps/web          React + TypeScript + Tailwind (Vite): shell, sidebar per peran, komponen dasar
docs/             Asumsi & keputusan desain
```

## Menjalankan (pengembangan)

Butuh Node 22+.

```bash
npm install
npm run seed      # membuat akun demo (hanya dev)
npm run dev       # API :3001 + web :5173
```

Akun demo (password `Ccp#Demo2026`): `admin@`, `leader@`, `hardi@`, `yofa@`, `dio@`, `arya@` + `ccp.local`.

```bash
npm run typecheck
npm test
npm run build     # build web
```

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

Fase 0 (fondasi) selesai. Lihat `docs/ASSUMPTIONS.md` untuk asumsi yang perlu dikonfirmasi.
Fase berikutnya: Brief Order → Weekly Listing → Daily Shooting (MVP).
