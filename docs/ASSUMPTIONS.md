# Asumsi & keputusan terbuka

Hal-hal yang diputuskan sementara saat membangun. Tandai yang sudah dikonfirmasi tim.

## Aturan bisnis

| # | Asumsi | Sumber / alasan | Status |
|---|---|---|---|
| 1 | Bobot → slot: Gampang = 1, Susah = 2 | PRD §6.7 (usulan) | Belum dikonfirmasi |
| 2 | Kapasitas: Senin–Kamis 15 slot, Jumat 7 | PRD §13 | Disepakati |
| 3 | Konten Weekly yang disubmit pada pekan kalender W (Senin–Minggu) masuk pekan produksi W+1; Sabtu sebelum pekan produksi = Locking | PRD §6.1/§6.2, BPM | Perlu konfirmasi (khususnya submit hari Sabtu/Minggu) |
| 4 | Weekly: submit → langsung `listing` (tanpa validasi Leader). Daily: submit → `pending_review` → Leader validasi → `antre_editing` atau `backlog` | PRD §5.3, BPM "pintu leader" | Perlu konfirmasi |
| 5 | Konten Weekly yang brief-nya tidak lengkap dikembalikan VG/Leader ke `backlog` (wajib alasan) lalu User submit ulang | PRD §4.4 "Backlog" | Usulan |
| 6 | Revisi: jalur Shooting + Edit dan Daily kembali ke Editor; Shooting Only / Photoshoot kembali ke VG | PRD §4.4 "atau VG" | Usulan |
| 7 | Field `Produk` (ada di mockup & BPM) diisi User di langkah Brief | Mockup Weekly Listing, BPM | Perlu konfirmasi |
| 8 | PIC Shotlist & Skrip (Hardi, Yofa) dimodelkan sebagai penanggung jawab yang bisa diubah, bukan nama tetap | PRD §6.5 | Usulan |
| 9 | Frekuensi evaluasi: PRD 2-mingguan, BPM "FGD 1–2 bulan sekali jika perlu" | PRD §12 vs BPM | Belum konsisten |

| 10 | Target SLA (hari kalender sejak submit): Shooting+Edit H+3, Shooting Only/Photoshoot H+2, Full AI/Editing Only/Motion H+1. Jam SLA dimulai lagi saat brief dikirim ulang dari Backlog | Angka dari mockup Brief Order | Belum dikonfirmasi |
| 11 | Hanya peran User yang membuat brief; Leader memvalidasi brief Daily; Admin hanya melihat | PRD §2, §5 | Perlu konfirmasi |
| 12 | Link brief harus https dan berdomain docs.google.com / drive.google.com | PRD §5.3 "Google Docs" | Usulan |
| 13 | Durasi wajib kecuali Photoshoot; rasio dipilih (9:16, 1:1, 16:9, 4:5) dan durasi dalam detik, terpisah dari rasio | Mockup menggabungkan "Rasio & Durasi" | Usulan |
| 14 | Lokasi "Lainnya" meminta keterangan lokasi | PRD §5.3 | Usulan |
| 15 | Bulk Order Mode (opsional di PRD) belum dibuat | PRD §5.3 | Ditunda |

## Teknis

- Peran `admin` ditambahkan (tidak ada di PRD) untuk kelola akun; admin tidak bisa melompati alur status.
- Hak akses menu per peran diturunkan dari PRD §2 dan mockup; mudah diubah di `packages/shared/src/nav.ts`.
- Navigasi mengikuti PRD §3 (Weekly Listing di bawah Production Board), bukan sidebar di mockup lama.
- Mockup acuan: `weekly_listing_v6` (bukan v2), `production_board_harian_v2`, `brief_order_video`.
