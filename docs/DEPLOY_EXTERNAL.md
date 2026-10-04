# Deploy Eksternal (Coolify di VPS / Railway)

> **Hanya ada di cabang `deploy-external`.** Dokumen ini, `railway.toml`, `docker-compose.external.yml`, dan `.env.external.example`
> tidak ikut paket serah-terima tim IT (`docs/DEPLOY.md` di cabang lain tetap generik dan bersih).
> Satu-satunya perubahan kode di cabang ini: admin awal otomatis lewat `BOOTSTRAP_ADMIN_*` (lihat bagian 4).

Tujuan: aplikasi dipakai tim **minggu ini** di platform eksternal, dengan data yang bisa dipindahkan utuh ke server internal nanti
(bagian 9), karena aplikasi memakai PostgreSQL standar dan satu image Docker (lihat `docs/PORTABILITAS.md`).

## 1. Pilih jalur

| | **A. Coolify di VPS** | **B. Railway** |
|---|---|---|
| Cocok bila | Ingin kontrol penuh, biaya tetap, data di VPS pilihan Anda | Ingin tercepat, tanpa mengurus server |
| Yang Anda urus | VPS (OS, firewall, update), Coolify, backup | Hampir tidak ada; hanya mengatur layanan |
| HTTPS | Otomatis (Traefik + Let's Encrypt), butuh domain | Otomatis; domain `*.up.railway.app` langsung ada |
| Database | Resource Postgres di Coolify (atau compose) | Plugin PostgreSQL Railway |
| Backup | Jadwal bawaan Coolify ke penyimpanan S3 | Atur sendiri (lihat 6B) |
| Biaya | Sewa VPS tetap | Berbasis pemakaian; periksa halaman harga terbaru |

Keduanya memakai **`Dockerfile` yang sama** dari cabang `deploy-external`. Aplikasi stateless; satu-satunya data ada di Postgres.

> Catatan kejujuran: langkah di bawah disusun dari dokumentasi platform yang saya ketahui, tetapi **belum saya jalankan di akun Anda**
> (sesi pengembangan tidak punya akses ke Coolify/Railway). Nama menu di UI platform bisa sedikit berbeda; tujuan tiap langkah tetap sama.
> Konfigurasi aplikasi sendiri (build, start, health check, bootstrap admin, login via bundel produksi) sudah diuji.

## 2. Sebelum mulai

- Repo GitHub dengan cabang `deploy-external` (sudah ada). Bila repo privat, siapkan akses (GitHub App / deploy key) di platform.
- Nama domain atau subdomain (mis. `video.perusahaan.co.id`) bila memakai domain sendiri.
- Kata sandi admin awal (acak, ≥ 12 karakter): `openssl rand -base64 18`.
- Daftar variabel: `.env.external.example` (isi di UI platform, bukan di git).

## 3A. Jalur Coolify (VPS)

### 3A.1 Siapkan VPS dan Coolify
1. VPS Linux (Ubuntu 22.04/24.04), **minimal 2 vCPU / 2 GB RAM** (build front-end butuh memori; tambahkan swap 2 GB bila ragu), region dekat pengguna (mis. Singapura/Jakarta).
2. Akses SSH dengan kunci (matikan login kata sandi), firewall: buka 22, 80, 443 (dan 8000 hanya sementara untuk setup awal).
3. Pasang Coolify (perintah resmi dari dokumentasi Coolify): `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`
4. Buka `http://IP-VPS:8000`, buat akun admin Coolify. Setelah domain panel diatur, tutup port 8000.
5. DNS: buat catatan `A` untuk domain aplikasi (dan domain panel Coolify) ke IP VPS.

### 3A.2 Database
1. **Project → New Resource → Database → PostgreSQL 16**. Beri nama, mis. `ccp-db`. Start.
2. Salin **Postgres URL (internal)** dari halaman resource. Itu nilai `DATABASE_URL`.
3. Aktifkan **Scheduled Backups** (lihat 6A) dan sambungkan penyimpanan S3-compatible.

### 3A.3 Aplikasi (cara yang disarankan: Dockerfile)
1. **New Resource → Public/Private Repository** → pilih repo, **Branch: `deploy-external`**.
2. **Build Pack: Dockerfile** (Dockerfile di root).
3. **Ports Exposes: `3001`**.
4. **Domains: `https://video.perusahaan.co.id`**.
5. **Health Check**: aktif, path `/api/health`, port `3001`.
6. **Environment Variables**: isi dari `.env.external.example` bagian WAJIB (`DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`) dan `PORT=3001`.
7. **Deploy**. Pantau log build; migrasi database berjalan otomatis saat start.
8. (Opsional) aktifkan **Automatic Deployment** agar tiap push ke `deploy-external` ter-deploy.

### 3A.3b Alternatif: satu paket Docker Compose
Bila ingin app + database dalam satu resource: **Build Pack: Docker Compose**, Compose file `docker-compose.external.yml`.
Isi `POSTGRES_PASSWORD` dan variabel lain di Environment Variables, lalu atur **Domain untuk layanan `app`** ke `https://video.perusahaan.co.id:3001`.
Backup database di mode ini memakai skrip `pg_dump` (bagian 6A-2) karena bukan resource database Coolify.

## 3B. Jalur Railway

1. **New Project → Deploy from GitHub repo** → pilih repo; di **Settings → Source** set **Branch: `deploy-external`**.
   Railway membaca `railway.toml` (builder Dockerfile, health check `/api/health`, satu replika).
2. **+ New → Database → Add PostgreSQL** di project yang sama.
3. Di layanan aplikasi → **Variables**:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (referensi ke plugin; memakai jaringan privat tanpa SSL)
   - `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`
   - **Jangan** isi `PORT` (Railway menyuntikkannya).
4. **Settings → Networking → Generate Domain** (atau custom domain dan ikuti petunjuk DNS-nya).
5. **Settings → Region**: pilih Asia Tenggara bila tersedia, dan pastikan **replika = 1**.
6. Deploy. Setelah status *Active*, buka domainnya.

## 4. Admin awal (tanpa akses shell)

Di platform ini biasanya tidak nyaman membuka terminal, jadi cabang ini menambah **`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`**:

- Saat start, bila **belum ada satu pun pengguna**, aplikasi membuat satu akun Admin dari variabel itu (log: *"Admin awal dibuat…"*).
- Bila sudah ada pengguna, variabel **diabaikan sepenuhnya**: tidak pernah menimpa atau mengubah akun. Aman bila terlambat dihapus.
- Setelah login pertama: **ganti kata sandi** (menu akun), lalu **hapus kedua variabel** dan deploy ulang.
- Berikutnya buat akun tim di **Kelola Pengguna** (Leader, Videografer, Editor, User).

Jangan menjalankan `seed` demo di sini: itu membuat akun contoh `*@ccp.local` dengan kata sandi yang publik.

## 5. Uji asap dan alur uji

Dari laptop Anda (butuh `curl`; skrip ada di repo):

```bash
./scripts/smoke.sh https://video.perusahaan.co.id     # semua harus PASS, termasuk HSTS
```

Lalu satu putaran manual: login admin → buat 4 akun (Leader, Videografer, Editor, User) → login sebagai User, buat brief →
Leader/VG memproses sampai Weekly Listing "Ready" → Daily Shooting → Editing → In Review → User *Approve*.

## 6. Backup (wajib sebelum tim memasukkan data nyata)

### 6A. Coolify
1. **Resource Postgres → Backups**: jadwal harian, retensi, tujuan **S3-compatible** (di luar VPS).
2. Alternatif/tambahan, dari laptop atau server lain (alamat publik/tunnel database; jangan buka port database ke internet tanpa pembatasan IP):
   `pg_dump "$DATABASE_URL" -Fc --no-owner -f ccp-$(date +%F).dump`
3. **Latih pemulihan sekali** ke database kosong: `pg_restore -d "$URL_TUJUAN" --no-owner --clean --if-exists ccp-….dump`.

### 6B. Railway
Jangan mengandalkan satu fitur platform tanpa memeriksa paket Anda. Pegangan yang pasti berhasil: ambil dump berkala dengan `pg_dump`
memakai **alamat publik** plugin Postgres (variabel `DATABASE_PUBLIC_URL`, SSL aktif), mis. mingguan/harian lewat cron di komputer yang selalu hidup,
dan simpan di luar Railway. Latih pemulihan sekali.

## 7. Domain, HTTPS, dan cookie

- Aplikasi tetap **Secure cookie**: login hanya jalan lewat HTTPS. Keduanya menyediakan HTTPS otomatis.
- Proxy platform meneruskan header `Host` asli; pemeriksaan CSRF aplikasi membandingkannya dengan `Origin`. Bila setiap simpan ditolak **403 "Origin tidak diizinkan"**,
  isi `ALLOWED_ORIGINS=https://video.perusahaan.co.id`.
- Setelah menambah domain kustom ke Railway/Coolify, tunggu sertifikat terbit (beberapa menit) sebelum login.

## 8. Pemecahan masalah

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| Build gagal / kehabisan memori | VPS kecil | Tambah RAM atau swap 2 GB, ulangi |
| Aplikasi *unhealthy* / restart terus | `DATABASE_URL` salah atau database belum siap | Cek log; uji host database dari layanan aplikasi; Railway: pakai referensi `${{Postgres.DATABASE_URL}}` |
| Log: `ECONNREFUSED` ke database | Memakai alamat `localhost` | Pakai alamat internal resource database |
| Login berhasil lalu langsung keluar | Akses lewat HTTP biasa (cookie Secure) | Pakai alamat `https://` |
| 403 saat menyimpan | Header `Host` diubah proxy | Isi `ALLOWED_ORIGINS` |
| 502 / 503 dari proxy | Port salah | Coolify: Ports Exposes = `PORT` = 3001. Railway: jangan set `PORT` |
| Login admin awal gagal | Sudah ada pengguna sebelum bootstrap, atau variabel salah ketik | Cek log tentang bootstrap; bila database baru, hapus dan buat ulang |
| `pg_restore` mengeluh *role/owner* | Dump dari server lain | Pakai `--no-owner` (sudah di contoh) |

## 9. Pindah ke server internal nanti (tim IT)

Paket serah-terima = cabang `claude/zen-sagan-njqmbl` (atau `main` setelah Anda menggabungkannya), **tanpa** berkas eksternal. Langkahnya:

1. Jadwalkan jendela perawatan singkat. Hentikan aplikasi eksternal (atau set read-only) supaya tidak ada data baru.
2. `pg_dump "$DATABASE_URL_EKSTERNAL" -Fc --no-owner -f final.dump`
3. Di server internal: ikuti `docs/DEPLOY.md`, jalankan database kosong, lalu `pg_restore -d "$DATABASE_URL_INTERNAL" --no-owner final.dump`
   (migrasi yang sama sudah terdaftar di dalam dump; aplikasi start tanpa migrasi tambahan atau menambah migrasi baru bila versi kode lebih baru).
4. Jalankan `./scripts/smoke.sh <alamat-internal>`, uji login beberapa peran, lalu alihkan DNS.
5. Biarkan layanan eksternal mati (jangan dihapus) beberapa hari sebagai jalur mundur, lalu hapus dan **hapus data di platform eksternal**.

Karena sesi login ada di database, pengguna perlu login ulang setelah pemindahan. Kata sandi ikut terbawa (hash scrypt di tabel `users`).

## 10. Merawat dua jalur tanpa mengotori paket IT

- `deploy-external` = cabang paket IT + berkas eksternal. **Jangan** menggabungkan `deploy-external` ke cabang lain.
- Pembaruan kode baru masuk di cabang utama pengembangan, lalu ditarik ke eksternal:
  ```bash
  git checkout deploy-external
  git merge claude/zen-sagan-njqmbl        # (atau main)
  git push
  ```
- Periksa kebersihan kapan saja: perbedaan cabang eksternal terhadap paket IT hanya boleh berupa berkas ini:
  ```bash
  git diff --name-status claude/zen-sagan-njqmbl deploy-external
  # Harus hanya: railway.toml, docker-compose.external.yml, .env.external.example, docs/DEPLOY_EXTERNAL.md,
  #              apps/api/src/bootstrap.ts, apps/api/test/bootstrap.test.ts, apps/api/src/server.ts (pemanggilan bootstrap)
  ```
- Jika tim IT juga mau admin awal otomatis, ambil commit bootstrap dengan `git cherry-pick`; jika tidak, biarkan hanya di sini.

## 11. Daftar periksa minggu ini

- [ ] Platform dipilih; domain/DNS siap
- [ ] Database dibuat; `DATABASE_URL` terisi
- [ ] Aplikasi ter-deploy dari `deploy-external`; health check hijau
- [ ] `scripts/smoke.sh` semua PASS
- [ ] Login admin awal; kata sandi diganti; `BOOTSTRAP_ADMIN_*` dihapus
- [ ] Akun tim dibuat dan masing-masing berhasil login
- [ ] Alur uji lengkap (brief → complete) berhasil
- [ ] Backup terjadwal berjalan, tersimpan di luar platform, **pemulihan sudah dilatih**
- [ ] Tim sepakat atas asumsi bisnis di `docs/ASSUMPTIONS.md` (yang bertanda "Perlu konfirmasi")
- [ ] Catat: data nyata ada di platform eksternal; siapa yang boleh mengakses akun platform; rencana pemindahan ke internal
