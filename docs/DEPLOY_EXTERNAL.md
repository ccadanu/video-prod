# Deploy Eksternal: Hetzner VPS + Coolify

> **Hanya ada di cabang `deploy-external`.** Berkas ini, `.env.external.example`, `deploy/external/*`, dan perubahan kecil pada kode
> (admin awal otomatis, `curl` di image) tidak ikut paket serah-terima tim IT. `docs/DEPLOY.md` di cabang lain tetap generik.

**Hasil akhir:** aplikasi berjalan di `https://video.perusahaan.co.id` (contoh), di VPS Hetzner Anda, dengan HTTPS otomatis, database Postgres terpisah
yang dibackup ke penyimpanan di luar server, dan jalur pindah ke server internal yang sudah disiapkan (bagian 12).
Perkiraan waktu: **1–2 jam** bila domain dan akun Hetzner sudah siap (DNS dan sertifikat kadang butuh beberapa menit tambahan).

> Kejujuran soal pengujian: konfigurasi aplikasi (build Docker, bootstrap admin, health check, login via bundel produksi) sudah diuji.
> Langkah di konsol **Hetzner** dan UI **Coolify** disusun dari dokumentasi yang saya ketahui dan **belum saya jalankan di akun Anda**; nama menu bisa sedikit
> berbeda. Skrip `deploy/external/*.sh` baru diperiksa sintaksnya (dan mode `DRY_RUN`), belum dijalankan di server sungguhan.

## 0. Gambaran

```
Browser ─HTTPS─▶ Hetzner VPS ─ Traefik (Coolify, sertifikat otomatis) ─▶ container app :3001 ─▶ container PostgreSQL
                       └─ Cloud Firewall Hetzner: hanya 22 / 80 / 443          (satu server, jaringan internal Docker)
Backup: Coolify → penyimpanan S3 (di luar VPS)   +   snapshot harian Hetzner   +   dump manual ke laptop
```

## 1. Persiapan

- Akun Hetzner (Cloud) dengan metode bayar, dan **kunci SSH** milik Anda: `ssh-keygen -t ed25519 -C "ccp-vps"` (kunci publik: `~/.ssh/id_ed25519.pub`).
- **Domain** yang DNS-nya Anda kuasai, mis. `video.perusahaan.co.id` (aplikasi) dan `coolify.perusahaan.co.id` (panel Coolify).
- **Penyimpanan S3-compatible** untuk backup database (mis. Hetzner Object Storage atau layanan S3 lain) beserta access key dan nama bucket.
- Akses GitHub ke repo ini. Repo publik cukup dengan URL; repo privat butuh GitHub App/deploy key di Coolify.
- Kata sandi admin awal aplikasi, acak dan ≥ 12 karakter: `openssl rand -base64 18`. Simpan di pengelola kata sandi.

## 2. Buat server di Hetzner

Di Hetzner Console → proyek baru → **Add Server**:

| Pilihan | Nilai |
|---|---|
| Lokasi | **Singapura** bila tersedia (terdekat ke Indonesia); bila tidak, lokasi terdekat yang ada |
| Image | **Ubuntu 24.04** |
| Tipe | **2 vCPU / 4 GB RAM atau lebih**, disk ≥ 40 GB. Coolify sendiri, build front-end, dan database berbagi satu mesin; 2 GB RAM terlalu mepet. Periksa tipe dan harga terbaru di halaman Hetzner |
| Jaringan | IPv4 publik + IPv6 (default) |
| SSH key | Pilih/tambah **kunci SSH** Anda (jangan pakai kata sandi) |
| **Backups** | **Aktifkan** (snapshot otomatis harian; lapisan pengaman tambahan, bukan pengganti backup database) |
| Firewall | Buat **Cloud Firewall** (lihat 2.1) dan pasang ke server |
| Nama | `ccp-video-1` |

### 2.1 Cloud Firewall (penting)
Port yang dipublikasikan Docker **melewati `ufw`**, jadi batasi di level jaringan lewat **Hetzner Cloud Firewall** (Inbound):

| Port | Sumber | Keterangan |
|---|---|---|
| 22/tcp | IP Anda (bila statis), atau semua + mengandalkan kunci SSH & fail2ban | SSH |
| 80/tcp, 443/tcp | Semua | HTTP (tantangan sertifikat) dan HTTPS |
| 8000/tcp | **Hanya IP Anda, dan hanya sementara** | Panel Coolify sebelum domainnya aktif; hapus aturan ini setelah bagian 5.3 |
| ICMP | Semua (opsional) | ping |

Jangan membuka 5432 (database) atau port lain ke internet.

## 3. DNS

Buat catatan **A** (dan AAAA bila memakai IPv6) ke IP server:

- `video.perusahaan.co.id` → IP server
- `coolify.perusahaan.co.id` → IP server

Bila memakai Cloudflare: awalnya set **DNS only** (awan abu-abu) agar sertifikat Let's Encrypt terbit tanpa kendala.

## 4. Kunci server (sekali)

```bash
ssh root@IP-SERVER
curl -fsSL https://raw.githubusercontent.com/ccadanu/video-prod/deploy-external/deploy/external/hetzner-bootstrap.sh -o bootstrap.sh
less bootstrap.sh                 # baca dulu sebelum menjalankan
DRY_RUN=1 bash bootstrap.sh       # lihat rencananya
bash bootstrap.sh
```

Skrip: update paket, zona waktu WIB, swap 2 GB, pembaruan keamanan otomatis, fail2ban, dan **SSH hanya dengan kunci** (hanya bila kunci Anda sudah terpasang;
**buka sesi SSH kedua untuk memastikan masih bisa masuk sebelum menutup sesi pertama**). Alternatif: salin isi skrip lewat editor jika repo privat.

## 5. Pasang Coolify

### 5.1 Instal
Di server (sebagai root), perintah resmi Coolify:
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
Skrip memasang Docker (bila belum ada) dan Coolify; tunggu sampai selesai dan menampilkan alamat panel.

### 5.2 Daftar admin Coolify SEGERA
Buka `http://IP-SERVER:8000` dan **daftar saat itu juga**: akun pertama otomatis menjadi admin instance, jadi jangan dibiarkan terbuka lama.
(Itulah sebabnya 8000 dibatasi ke IP Anda di firewall.) Aktifkan 2FA bila tersedia. Pada pengenalan awal, pilih server **localhost** (server ini sendiri).

### 5.3 Pasang domain panel dan tutup port 8000
**Settings → Instance's Domain** = `https://coolify.perusahaan.co.id` → simpan. Setelah panel terbuka lewat HTTPS, **hapus aturan 8000** dari Cloud Firewall.
Di **Settings** isi email untuk sertifikat dan notifikasi (lihat 10).

## 6. Database (resource Postgres)

1. **Projects → New Project** (`ccp`) → **Production** → **+ New Resource → Database → PostgreSQL** (versi 16).
2. Nama `ccp-db`. **Jangan** aktifkan "Make it publicly available". **Start**.
3. Di halaman resource, salin **Postgres URL (internal)**. Itu nilai `DATABASE_URL`.
4. **Backups → Scheduled backup**: harian, retensi sesuai kebutuhan (mis. 14 hari lokal + lebih lama di S3), tujuan **S3** (tambahkan di **Storages/S3**, lalu pilih).
5. Jalankan **Backup now** sekali dan pastikan berkasnya benar-benar muncul di bucket.

## 7. Aplikasi

**Project `ccp` → Production → + New Resource → Public Repository** (atau Private Repository bila repo privat):

| Kolom | Isi |
|---|---|
| Repository URL | URL repo GitHub |
| **Branch** | **`deploy-external`** |
| **Build Pack** | **Dockerfile** (lokasi `/Dockerfile`) |
| **Ports Exposes** | **`3001`** |
| **Domains** | `https://video.perusahaan.co.id` |
| Health Check | Aktif: path `/api/health`, port `3001` (image berisi `curl` dan `wget`) |

### 7.1 Environment Variables
Isi dari `.env.external.example` (bagian WAJIB + `PORT`). Minimal: `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `PORT=3001`, `COOKIE_SECURE=true`.
Nilai ini hanya dibutuhkan saat runtime; tidak perlu dicentang sebagai *build variable*.

### 7.2 Deploy
Klik **Deploy** dan pantau log. Build pertama beberapa menit (instal dependensi + build front-end). Saat start, aplikasi menjalankan migrasi database sendiri
dan (karena belum ada pengguna) membuat admin awal.
Bila build gagal kehabisan memori, pastikan swap dari bagian 4 aktif (`free -h`).

Opsional: aktifkan **Automatic Deployment** (webhook GitHub) agar push ke `deploy-external` langsung ter-deploy. Untuk tim yang sedang mulai, deploy manual lebih terkendali.

## 8. Uji dan serah ke tim

```bash
./scripts/smoke.sh https://video.perusahaan.co.id        # semua PASS (termasuk HSTS)
```

1. Buka alamat aplikasi, login dengan admin awal. **Ganti kata sandi** (menu akun).
2. Di Coolify, **hapus `BOOTSTRAP_ADMIN_EMAIL` dan `BOOTSTRAP_ADMIN_PASSWORD`**, lalu **Redeploy**.
3. Di **Kelola Pengguna** buat akun tim (Leader, Videografer, Editor, User) dan bagikan kata sandi awal lewat kanal aman; minta mereka menggantinya.
4. Satu putaran uji: User buat brief → Leader/VG sampai Weekly Listing "Ready" → Daily Shooting → Editing → In Review → User *Approve*.

Jangan menjalankan `seed` demo di server ini (akun contoh `*@ccp.local` berkata sandi publik).

## 9. Backup & pemulihan

Tiga lapis, jangan hanya mengandalkan satu:

1. **Coolify → S3** (bagian 6.4): lapis utama untuk data aplikasi.
2. **Snapshot Hetzner** (bagian 2): pulihkan seluruh server bila rusak parah.
3. **Dump manual ke laptop** secara berkala, terutama sebelum upgrade besar:
   ```bash
   ./deploy/external/dump-from-vps.sh root@IP-SERVER <bagian-nama-container-db> <user-db> <nama-db>
   ```
   (nama container: `docker ps` di server; user/nama database: halaman resource database di Coolify).

**Latih pemulihan sebelum tim mengisi data nyata**: buat Postgres kosong sementara (mis. `docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:16-alpine`
di laptop), lalu `pg_restore -h localhost -p 5433 -U postgres -d postgres --no-owner --clean --if-exists backups/ccp-….dump` dan periksa isinya
(`psql … -c "select count(*) from briefs"`). Backup yang belum pernah dipulihkan belum bisa dianggap aman.

## 10. Operasional

- **Update aplikasi:**
  ```bash
  git checkout deploy-external && git merge claude/zen-sagan-njqmbl && git push     # tarik kode terbaru
  ```
  lalu **Deploy** di Coolify (atau otomatis bila webhook aktif). **Dump manual dulu** sebelum update yang menyentuh database (migrasi hanya menambah).
- **Rollback:** di Coolify buka aplikasi → **Deployments** dan deploy ulang versi sebelumnya. Migrasi bersifat append-only, jadi kode lama umumnya tetap jalan di skema yang lebih baru;
  bila perlu mundur penuh, pulihkan dump sebelum update.
- **Pantau:** pasang uptime monitor eksternal untuk `https://video.perusahaan.co.id/api/health` (mis. UptimeRobot/Better Stack) dengan notifikasi ke email/HP.
  Di Coolify → **Notifications** aktifkan email/Telegram untuk kegagalan deploy dan backup. Periksa pemakaian disk berkala (`df -h`);
  bersihkan image lama dengan `docker image prune -f` bila disk menipis.
- **Log:** Coolify → aplikasi → **Logs** (JSON; tidak memuat cookie atau kata sandi).
- **Update server:** pembaruan keamanan OS otomatis (bagian 4). Update Coolify lewat tombol di panelnya, di jam sepi.
- **Akses panel:** batasi siapa yang punya akses ke Coolify dan Hetzner (aktifkan 2FA), karena mereka punya akses penuh ke data.

## 11. Pemecahan masalah

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| Sertifikat tidak terbit / "not secure" | DNS belum menunjuk, atau proxy Cloudflare menyala | Cek `dig +short video.perusahaan.co.id`; set DNS only; tunggu beberapa menit; cek log proxy di Coolify |
| Build gagal / killed | Kehabisan memori | `free -h`; pastikan swap aktif; naikkan tipe server |
| Aplikasi *unhealthy*, restart terus | `DATABASE_URL` salah | Cek log aplikasi; salin ulang "Postgres URL (internal)"; pastikan aplikasi dan database di satu server/jaringan Coolify yang sama |
| Log `ECONNREFUSED` ke database | Memakai `localhost` | Pakai host internal dari URL internal resource database |
| 502/503 dari proxy | Port salah | **Ports Exposes** dan `PORT` harus sama (3001) |
| Login berhasil lalu langsung keluar | Akses lewat `http://` | Gunakan `https://` (cookie Secure) |
| 403 "Origin tidak diizinkan" saat menyimpan | Header `Host` diubah proxy | Isi `ALLOWED_ORIGINS=https://video.perusahaan.co.id` |
| Admin awal tidak dibuat | Sudah ada pengguna, atau variabel kosong/salah | Cek log bagian bootstrap. Database sudah berisi pengguna = variabel diabaikan (sengaja) |
| Terkunci dari SSH | Login kata sandi dimatikan, kunci salah | Gunakan **Rescue/Console** di Hetzner Console, perbaiki `authorized_keys` |

## 12. Pindah ke server internal nanti (tim IT)

Paket serah-terima = cabang `claude/zen-sagan-njqmbl` (atau `main` setelah Anda menggabungkannya), **tanpa** berkas eksternal. Langkah:

1. Jadwalkan jendela perawatan singkat; hentikan aplikasi di Coolify supaya tidak ada data baru.
2. `./deploy/external/dump-from-vps.sh …` → `final.dump`.
3. Di server internal: ikuti `docs/DEPLOY.md`, jalankan database kosong, lalu `pg_restore -d "$DATABASE_URL_INTERNAL" --no-owner final.dump`.
4. `./scripts/smoke.sh <alamat-internal>`, uji login beberapa peran, lalu alihkan DNS.
5. Biarkan server Hetzner mati (jangan dihapus) beberapa hari sebagai jalur mundur; setelah itu **hapus data dan server** (dan snapshot/backup S3) sesuai kebijakan data Anda.

Pengguna perlu login ulang setelah pindah (sesi ada di database). Kata sandi ikut terbawa (hash scrypt di tabel `users`).

## 13. Merawat dua jalur tanpa mengotori paket IT

- `deploy-external` = paket IT + berkas eksternal. **Jangan** menggabungkannya ke cabang lain.
- Pembaruan kode masuk di cabang pengembangan, lalu ditarik: `git checkout deploy-external && git merge claude/zen-sagan-njqmbl && git push`.
- Periksa kebersihan kapan saja:
  ```bash
  git diff --name-status claude/zen-sagan-njqmbl deploy-external
  # Hanya boleh: .env.external.example, docs/DEPLOY_EXTERNAL.md, deploy/external/*.sh,
  #              apps/api/src/bootstrap.ts, apps/api/test/bootstrap.test.ts, apps/api/src/server.ts (panggilan bootstrap),
  #              Dockerfile (menambah curl)
  ```
- Bila tim IT ingin admin awal otomatis atau `curl` di image, ambil commit terkait dengan `git cherry-pick`.

## 14. Daftar periksa minggu ini

- [ ] Server Hetzner dibuat (Ubuntu 24.04, ≥ 2 vCPU/4 GB, kunci SSH, Backups aktif), Cloud Firewall terpasang
- [ ] DNS `video.…` dan `coolify.…` menunjuk ke server
- [ ] `hetzner-bootstrap.sh` dijalankan; masih bisa SSH dengan kunci
- [ ] Coolify terpasang; admin didaftarkan; domain panel aktif; **port 8000 ditutup**
- [ ] Postgres `ccp-db` berjalan; backup terjadwal ke S3 dan **sudah dicoba "Backup now"**
- [ ] Aplikasi ter-deploy dari `deploy-external`; health check hijau; `scripts/smoke.sh` semua PASS
- [ ] Admin awal login, kata sandi diganti, `BOOTSTRAP_ADMIN_*` dihapus dan di-redeploy
- [ ] Akun tim dibuat; alur uji lengkap berhasil
- [ ] **Pemulihan backup sudah dilatih** ke database sementara
- [ ] Uptime monitor `/api/health` dan notifikasi Coolify aktif
- [ ] Tim sepakat atas asumsi bisnis di `docs/ASSUMPTIONS.md` (yang "Perlu konfirmasi")
- [ ] Dicatat: siapa yang punya akses Hetzner/Coolify; rencana pemindahan ke internal
