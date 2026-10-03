# Portabilitas: pindah server tanpa redesain

Tujuan: aplikasi tidak terikat vendor. Hosting awal (mis. Supabase sebagai Postgres terkelola) dan server internal
tim IT harus bisa saling menggantikan hanya dengan mengubah konfigurasi.

## Ringkasnya

| Hal | Keadaan | Pindah server berarti |
|---|---|---|
| Database | PostgreSQL standar. Skema ada di `apps/api/migrations/*.sql` (identity, `timestamptz`, `boolean`, `jsonb`; tanpa ekstensi, RLS, trigger, atau fungsi vendor) | Ubah `DATABASE_URL` lalu jalankan server (migrasi otomatis). Data lama: `pg_dump` / `pg_restore` |
| Akses data | Satu lapisan `Db`/`Queryable` (`apps/api/src/db.ts`), SQL berparameter `$1, $2` | Tidak ada perubahan kode |
| Logika bisnis | Di kode aplikasi: `packages/shared` (aturan status, kapasitas, validasi) dan rute API. Tidak ada Edge Function, stored procedure, atau trigger | Tidak ada perubahan |
| Autentikasi | Email + password milik sendiri (tabel `users`, hash scrypt, sesi di tabel `sessions`, cookie `httpOnly`). Tidak memakai Supabase Auth | Tidak ada perubahan. Untuk SSO kantor lihat bagian di bawah |
| Alamat backend | Web memanggil `/api/...` lewat satu fungsi (`apps/web/src/lib/api.ts`) | Atur reverse proxy, atau `VITE_API_BASE_URL` |

## Database

- Produksi dan server internal: `DATABASE_URL=postgres://user:pass@host:5432/db`. Dipakai lewat driver `pg` biasa, jadi cocok dengan
  Postgres 14+ mana pun, termasuk di balik PgBouncer (tidak ada prepared statement bernama).
- Pengembangan tanpa instalasi: `DATABASE_URL` kosong memakai PGlite (Postgres sungguhan dalam WASM) di `apps/api/data/pgdata`.
  Dialek SQL-nya Postgres yang sama. `docker-compose.yml` tersedia bila ingin Postgres sungguhan di lokal.
- Tes berjalan di kedua mesin: default PGlite, dan `TEST_DATABASE_URL=postgres://…/nama_test npm test` untuk server sungguhan
  (CI memakai ini). Isi database uji dikosongkan tiap tes, jadi namanya wajib memuat "test".
- Migrasi append-only. Berkas baru = `NNN_nama.sql`; dijalankan berurutan dalam satu transaksi dengan kunci advisory.
- Catatan: migrasi 001 dan 002 ditulis ulang untuk Postgres sebelum rilis pertama (sebelumnya SQLite). Sejak itu hanya boleh ditambah.

### Pindah dari Supabase ke server internal
1. Di server baru: siapkan database Postgres kosong dan user.
2. `pg_dump --no-owner --no-privileges "$SUPABASE_URL" -Fc -f ccp.dump`
3. `pg_restore --no-owner -d "$DATABASE_URL_BARU" ccp.dump`
4. Ubah `DATABASE_URL` aplikasi, jalankan ulang. Selesai. (Tabel Supabase bawaan seperti `auth.*` tidak dipakai aplikasi ini.)

## Autentikasi

Seluruh pengetahuan tentang cara memverifikasi identitas ada di satu fungsi: `verifyCredentials` di `apps/api/src/credentials.ts`.
Bagian lain hanya memakai sesi (`req.user`). Jadi:

- **Tetap email + password**: tidak perlu mengubah apa pun.
- **SSO kantor (OIDC / Azure AD / Google Workspace)**: tambahkan rute callback yang memverifikasi token provider, mencari pengguna
  berdasarkan email, lalu memanggil `createSession`. Tabel, peran, dan UI tidak berubah.
- **LDAP / Active Directory**: ganti isi `verifyCredentials` dengan bind ke direktori.

Catatan: NextAuth/Auth.js dibuat untuk Next.js, sedangkan aplikasi ini Vite (SPA) + Fastify, jadi tidak dipakai. Pola yang sama
(sesi + penyedia identitas yang bisa ditukar) tersedia di fungsi di atas tanpa ketergantungan pada kerangka kerja tertentu.

## Alamat backend

Dua cara, pilih satu:

1. **Satu origin (disarankan).** Reverse proxy (Nginx/Caddy/IIS) melayani file web statis dan meneruskan `/api/*` ke API.
   Cookie tetap `SameSite=Lax`, tidak perlu CORS. Contoh Nginx:
   ```nginx
   location /api/ { proxy_pass http://127.0.0.1:3001; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
   location /     { root /srv/ccp/web; try_files $uri /index.html; }
   ```
2. **Beda host.** Build web dengan `VITE_API_BASE_URL=https://api.contoh.internal`, set di API `ALLOWED_ORIGINS=https://web.contoh.internal`.
   Bila beda situs (domain berbeda), set `COOKIE_SAMESITE=none` (wajib HTTPS).

## Yang sengaja tidak dipakai

Supabase Auth/UI, Row Level Security, Edge Functions, Realtime, Storage, PostgREST, ekstensi Postgres, trigger, dan stored procedure.
Bila nanti butuh unggah berkas atau notifikasi real-time, tambahkan di lapisan aplikasi (S3-kompatibel / WebSocket) agar tetap portabel.
