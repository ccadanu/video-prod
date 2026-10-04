# Panduan Deploy

Aplikasi dikemas sebagai **satu image Docker**: API (Fastify) sekaligus melayani web statis. Satu proses, satu origin, jadi tidak perlu
CORS maupun konfigurasi proxy khusus untuk berkas web. Data ada di PostgreSQL standar (lihat `docs/PORTABILITAS.md`).

```
Browser ──HTTPS──▶ [Caddy / Nginx]* ──▶ app :3001 (web + /api) ──▶ PostgreSQL
                                                   * opsional bila sudah ada reverse proxy / HTTPS lain
```

## 1. Prasyarat

- Server Linux dengan Docker Engine 24+ dan plugin Compose v2 (`docker compose version`).
- Spesifikasi awal yang cukup untuk tim kecil: 1 vCPU, 1–2 GB RAM, 10 GB disk.
- Nama domain (publik atau DNS internal) yang menunjuk ke server, bila ingin HTTPS otomatis.
- Tim IT menyiapkan: jadwal backup, dan kebijakan akses ke server.

## 2. Langkah cepat (Docker Compose)

```bash
git clone <repo> /opt/ccp && cd /opt/ccp
cp .env.production.example .env
nano .env        # minimal: POSTGRES_PASSWORD, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, dan DOMAIN bila memakai HTTPS otomatis

# a) HTTPS otomatis lewat Caddy (domain harus mengarah ke server ini; port 80/443 terbuka)
docker compose -f docker-compose.prod.yml --profile tls up -d --build

# b) atau tanpa Caddy (di belakang proxy Anda sendiri; lihat deploy/nginx.conf.example)
docker compose -f docker-compose.prod.yml up -d --build

# Buat admin awal (sekali saja)
docker compose -f docker-compose.prod.yml run --rm app node apps/api/dist/seed.js

# Uji asap
./scripts/smoke.sh https://video.contoh.co.id
```

Lalu buka alamat tersebut, login sebagai admin awal, dan **ganti kata sandinya** (menu akun). Hapus `SEED_ADMIN_PASSWORD`
dari `.env` setelah itu.

Migrasi database berjalan otomatis setiap aplikasi start (aman bila dijalankan bersamaan: memakai kunci advisory).

## 3. Mengisi pengguna

Produksi **tidak** membuat akun/data contoh. Admin membuat akun tim di menu **Kelola Pengguna** (email, peran, kata sandi awal).
Peran: User (pemohon), Leader Produksi, Videografer, Video Editor, Admin. Lupa kata sandi: Admin mengatur ulang dari menu yang sama.

Data contoh (akun `*@ccp.local`, riwayat, dst.) hanya untuk pengembangan/pratinjau; **jangan** menjalankan `seed` dengan `NODE_ENV` selain production
pada database produksi.

## 4. Variabel lingkungan

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | ya | `postgres://user:pass@host:5432/db`. Compose merakitnya dari `POSTGRES_*`. Untuk Postgres terkelola tambahkan `?sslmode=require` |
| `NODE_ENV` | ya (image sudah mengisi `production`) | Production mewajibkan `DATABASE_URL` dan menonaktifkan seed demo |
| `COOKIE_SECURE` | tidak | Default `true` di production (wajib HTTPS). `false` hanya untuk jaringan internal tanpa HTTPS, dipilih secara sadar |
| `PORT` / `HOST` | tidak | Image: `3001` / `0.0.0.0` |
| `WEB_DIST` | tidak | Folder web statis. Image sudah mengisi; kosong = API saja (web dilayani proxy lain) |
| `SESSION_TTL_HOURS` | tidak | Lama sesi login, default 168 (7 hari) |
| `ALLOWED_ORIGINS` | tidak | Hanya bila web berasal dari origin lain; kosongkan untuk satu origin |
| `COOKIE_SAMESITE` | tidak | `lax` (default). `none` hanya bila web dan API beda situs (wajib HTTPS) |
| `LOG_LEVEL` | tidak | `info` (default), log JSON ke stdout |
| `DATABASE_POOL_MAX` | tidak | Ukuran pool koneksi, default 10 |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | hanya saat seed | Membuat admin awal (kata sandi min. 8 karakter) |

## 5. HTTPS

Cookie sesi bersifat `Secure` di production, jadi **login hanya bekerja lewat HTTPS**. Pilihan:

1. **Caddy bawaan** (`--profile tls`): sertifikat otomatis. Perlu `DOMAIN` yang dapat dijangkau (Let's Encrypt untuk domain publik; untuk domain
   internal Caddy menerbitkan sertifikat lokal yang perlu dipercaya perangkat klien).
2. **Proxy yang sudah ada** (Nginx/IIS/Apache/load balancer): teruskan semuanya ke `127.0.0.1:3001`
   (contoh: `deploy/nginx.conf.example`). Pastikan meneruskan `Host` dan `X-Forwarded-For`/`X-Forwarded-Proto`.
3. **Jaringan internal tanpa HTTPS** (tidak disarankan): `COOKIE_SECURE=false`, `APP_BIND=0.0.0.0`. Kata sandi dan sesi lewat jaringan tanpa enkripsi.

## 6. Database

- **Postgres di compose (default)**: data di volume `ccp-pgdata`, tidak dipublikasikan ke luar server.
- **Postgres terkelola atau server database sendiri**: hapus layanan `db` dari compose dan isi `DATABASE_URL`
  langsung. Aplikasi hanya memakai SQL standar (tanpa ekstensi, RLS, atau fungsi vendor). Di balik PgBouncer juga aman.
- Tidak ada langkah migrasi manual: berkas `apps/api/migrations/*.sql` dijalankan berurutan saat start.

## 7. Backup & pemulihan

```bash
./scripts/backup.sh                       # ke ./backups/ccp-AAAAMMDD-JJMMDD.dump, simpan 14 terakhir (KEEP=30 untuk mengubah)
./scripts/restore.sh backups/ccp-....dump # MENIMPA database saat ini; meminta konfirmasi
```

Jadwalkan harian lewat cron (`0 2 * * * cd /opt/ccp && ./scripts/backup.sh`) dan **salin berkas backup ke lokasi lain** (bukan hanya di server yang sama).
**Latih pemulihan sekali sebelum go-live** di server uji; backup yang belum pernah dipulihkan belum bisa dianggap aman.

## 8. Upgrade & rollback

```bash
cd /opt/ccp
./scripts/backup.sh                                  # selalu backup dulu
git pull                                             # atau ganti CCP_IMAGE ke versi baru
docker compose -f docker-compose.prod.yml up -d --build
./scripts/smoke.sh https://video.contoh.co.id
```

Migrasi bersifat **append-only** (hanya menambah). Rollback kode ke versi lama biasanya aman selama versi lama tidak membutuhkan skema yang lebih lama
(migrasi baru hanya menambah tabel/kolom). Bila perlu mundur penuh: hentikan aplikasi, `restore.sh` dari backup sebelum upgrade, jalankan versi lama.

Image dapat diterbitkan otomatis ke GHCR: buat tag `v1.0.0` → workflow `release.yml` membangun dan mendorong `ghcr.io/<pemilik>/<repo>`.
Di server: `CCP_IMAGE=ghcr.io/<pemilik>/<repo>:1.0.0` lalu `docker compose -f docker-compose.prod.yml pull && ... up -d`.
Periksa visibilitas paket GHCR (default privat) sebelum membagikannya.

## 9. Pemantauan

- Kesehatan: `GET /api/health` → `200 {"ok":true}` hanya bila database terjangkau (`503` bila tidak). Dipakai juga oleh `HEALTHCHECK` Docker.
- Log: JSON ke stdout (`docker compose -f docker-compose.prod.yml logs -f app`). Cookie, header, dan isi request tidak dicatat.
- Pantau: status container (`docker compose ps`), ruang disk volume `ccp-pgdata`, dan keberhasilan job backup.
- Audit: tabel `audit_log` mencatat aksi penting (login, perubahan status, penugasan, pengaturan).

## 10. Keamanan (sudah ada di aplikasi)

- Kata sandi di-hash scrypt; sesi opak di database (token di-hash), cookie `httpOnly` + `SameSite=Lax` + `Secure`.
- Pembatasan percobaan login (rate limit), pemeriksaan `Origin` untuk request tulis (CSRF), validasi semua input (zod).
- Header: CSP ketat (hanya sumber sendiri), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS (saat HTTPS), `Cache-Control: no-store` untuk `/api`.
- Container berjalan sebagai pengguna non-root; database tidak dipublikasikan keluar.
- Blind review: jawaban tidak menyimpan pengisi/waktu; lihat catatan keterbatasannya di `docs/ASSUMPTIONS.md` (baris 54).

Yang menjadi tanggung jawab server/IT: firewall (buka hanya 80/443 atau port proxy), pembaruan OS dan image dasar, penyimpanan `.env` (izin `600`, bukan di git), dan
rotasi kata sandi database.

## 11. Daftar periksa go-live

- [ ] `.env` terisi; `POSTGRES_PASSWORD` acak dan panjang; `.env` tidak masuk git
- [ ] HTTPS aktif; `./scripts/smoke.sh <alamat>` semua lulus (termasuk HSTS)
- [ ] Admin awal dibuat, kata sandi diganti, `SEED_ADMIN_PASSWORD` dihapus dari `.env`
- [ ] Akun tim dibuat (Leader, Videografer, Editor, User) dan masing-masing login berhasil
- [ ] Satu alur uji end-to-end di produksi: brief → Weekly Listing → Daily Shooting → Editing → In Review → Complete
- [ ] Backup terjadwal berjalan, salinannya dikirim keluar server, dan **pemulihan sudah dilatih**
- [ ] Pemantauan `/api/health` terpasang (uptime monitor) dan ada yang menerima peringatan
- [ ] Tim sepakat atas asumsi bisnis di `docs/ASSUMPTIONS.md` (terutama yang bertanda "Perlu konfirmasi")

## 12. Batasan yang perlu diketahui

- **Satu instance aplikasi** adalah konfigurasi yang diuji. Sesi ada di database sehingga beberapa instance mungkin dilakukan, tetapi
  pembatasan login (rate limit) bersifat per-proses.
- Tidak ada pengiriman email (tidak ada reset kata sandi mandiri): Admin yang mengatur ulang kata sandi.
- Angka kebijakan (kapasitas slot, SLA editing, poin Papan Prestasi, dll.) ada di kode (`packages/shared`) dan dicatat di `docs/ASSUMPTIONS.md`;
  mengubahnya berarti rilis ulang.
- SSO kantor (OIDC/LDAP) belum ada; titik pemasangannya sudah disiapkan (lihat `docs/PORTABILITAS.md`).
