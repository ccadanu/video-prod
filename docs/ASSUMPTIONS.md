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
| 16 | Status `locking` dihapus; PRD §4.4 memakai satu status "Locking / Validasi SDM". Konten tetap `listing` sampai "Locking Disepakati", lalu `validasi_sdm` sampai "Ready to Execute" | Kamus status PRD | Disederhanakan |
| 17 | Hari syuting dan bobot boleh diatur sejak sebelum Locking Disepakati (bagian sesi Locking, PRD §13). Kebutuhan SDM baru terbentuk setelah Locking Disepakati | PRD §6.2, §6.6, §13 | Perlu konfirmasi |
| 18 | Setelah Locking, mengubah atribut, FU, atau hari wajib beralasan dan tercatat di riwayat konten (dilihat User). Mengubah bobot tidak wajib beralasan | PRD §6.8 | Usulan |
| 19 | Kapasitas lewat batas hanya menampilkan peringatan "⚠ over"; tidak memblokir Ready to Execute | Mockup v6 | Perlu konfirmasi |
| 20 | Konten susulan (disubmit setelah Locking) tampil sebagai Listing dan perlu "Locking Disepakati" lagi. Bila membawa kebutuhan SDM baru, Ready seluruh pekan dibuka kembali | Belum dibahas PRD | Usulan |
| 21 | Item SDM unik per (hari, jenis, nama) tanpa membedakan huruf besar/kecil: talent yang sama di hari yang sama = satu item. Leader menandai Ready/Tidak Ready tanpa catatan. "Tidak Ready" setelah pekan Ready membatalkan Ready | PRD §6.4 | Usulan |
| 22 | Item tindak lanjut Leader (properti dibeli, aset desain diorder, kostum khusus) ditentukan VG dengan mengisi nama item; talent dan lokasi luar selalu menjadi item; lokasi Kantor otomatis Ready | PRD §6.4, BPM | Usulan |
| 23 | Shotlist dan Skrip berupa link Google Docs, bisa diunggah VG mana pun (PIC Hardi/Yofa tidak dikunci) setelah semua SDM hari itu Ready. Konfirmasi ulang talent H-1 oleh Leader tanpa tenggat otomatis | PRD §6.5 | Usulan |
| 24 | User hanya melihat konten miliknya di Weekly Listing, tanpa kapasitas, SDM, atau dokumen harian | PRD §2 "User = read-only" | Perlu konfirmasi |
| 25 | "Tunda ke pekan depan": hari dikosongkan dan SDM disinkronkan. "Kembalikan ke User (Backlog)" hanya sebelum Locking, boleh oleh VG atau Leader | PRD §6.8 | Usulan |
| 26 | Kolom Daily Shooting: Belum Take / Sedang Take / Footage Siap / Terkirim, plus "Nanti" untuk hari berikutnya. Konten hari lampau yang belum terkirim tetap tampil (terlewat/terbawa) sampai diserahkan atau di-reschedule; yang sudah terkirim hanya tampil di hari syutingnya | PRD §6.6 | Usulan |
| 27 | PIC take = VG yang pertama menekan Mulai Take. Hold hanya untuk konten Ready/Syuting/Footage Siap dan wajib beralasan; Resume mengembalikan ke kolom semula | PRD §6.6 | Usulan |
| 28 | Reschedule/Pull to Today memindahkan hari tanpa membatalkan Ready pekan, tetapi SDM hari baru disinkronkan dan harus Ready. Tunda ke pekan depan dari Daily hanya dari Ready/Syuting dan wajib beralasan | PRD §6.6, §6.8 | Usulan |
| 29 | Bukti Serah Footage: Drive wajib tautan drive.google.com; HDD hanya catatan teks (nama disk, path, nama file) tanpa verifikasi. Setelah serah: Shooting+Edit → Antre Editing, Shooting Only/Photoshoot → In Review | PRD §6.7, BPM | Usulan |
| 30 | Revisi Shooting Only/Photoshoot kembali ke VG (take ulang di kolom Belum Take); revisi Shooting+Edit kembali ke Editor | BPM | Perlu konfirmasi |
| 31 | Leader dan Admin hanya membaca Daily Shooting; User tidak punya akses halaman ini | PRD §2 | Usulan |
| 32 | SLA editing = tenggat per konten yang ditetapkan Leader saat assign. Usulan awal: Daily selesai H+1 hari kerja dari tanggal mulai (PRD §8.3), dari Syuting +3 hari kerja. Angka di `packages/shared/src/editing.ts` | PRD §8.3 (Open Item) | Perlu konfirmasi |
| 33 | Kapasitas editor 6 slot per hari kerja (Gampang 1, Susah 2, sama dengan konversi syuting). Bobot editing ditetapkan Leader saat assign (terpisah dari bobot syuting). Melebihi kapasitas hanya memberi peringatan, tidak memblokir | PRD §8.3 (Open Item) | Perlu konfirmasi |
| 34 | Aturan antrean: FIFO berdasarkan waktu masuk antrean (atau kembali sebagai revisi). Prioritas ditetapkan saat assign dan hanya mengurutkan papan editor; Leader bebas memilih konten mana yang di-assign lebih dulu | PRD §8.3 (Open Item) | Perlu konfirmasi |
| 35 | Jadwal editing hanya hari kerja (Senin–Jumat), jendela pekan ini + pekan depan. Satu antrean gabungan Daily dan Dari Syuting, ditandai asalnya | PRD §8.2 | Usulan |
| 36 | Langkah editing mengikuti alur Bispro (aset → klip → warna & audio → efek/subtitle → finishing → Self-QC → export), aset menyesuaikan jenis. Hanya Self-QC yang wajib dicentang sebelum kirim. Revisi membuka kembali Self-QC dan export | PRD §9.2–9.3 (Open Item) | Perlu konfirmasi |
| 37 | Version control: setiap kirim ke In Review = versi baru (v1, v2, …) berupa link Google Drive; User mereview versi terbaru. Tidak ada target waktu editing selain tenggat (asumsi 32) | PRD §9.3 (Open Item) | Perlu konfirmasi |
| 38 | PIC di Brief Order = editor yang di-assign (untuk Shooting + Edit menggantikan VG; riwayat tetap tersimpan di timeline). Mengganti editor mengembalikan konten ke To Do editor baru | PRD §5.1 | Usulan |
| 39 | Revisi dari User kembali ke editor yang sama (To Do + alasan revisi). Revisi tanpa editor muncul di antrean Leader | PRD §4.4 | Usulan |
| 40 | Hanya Editor yang mulai/mencentang/mengirim hasil; Leader meng-assign; Leader dan Admin hanya membaca Editing Execution, Admin hanya membaca Brief Editing Schedule | PRD §2 | Usulan |
| 41 | Shooting Only dan Photoshoot tidak lewat Editor: bahan review User = footage Drive dari VG, tampil di detail Brief Order | PRD §4.2 | Disepakati |

## Teknis

- Peran `admin` ditambahkan (tidak ada di PRD) untuk kelola akun; admin tidak bisa melompati alur status.
- Hak akses menu per peran diturunkan dari PRD §2 dan mockup; mudah diubah di `packages/shared/src/nav.ts`.
- Navigasi mengikuti PRD §3 (Weekly Listing di bawah Production Board), bukan sidebar di mockup lama.
- Mockup acuan: `weekly_listing_v6` (bukan v2), `production_board_harian_v2`, `brief_order_video`.
