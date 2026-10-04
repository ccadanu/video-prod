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
| 42 | Spesifikasi Dashboard Statistik/KPI/RoG Evaluasi (dokumen terpisah) belum tersedia; definisi metrik di bawah adalah usulan dari PRD §10–13. Semua dihitung dari data aplikasi di `packages/shared/src/stats.ts` | PRD §10–12 | Perlu konfirmasi |
| 43 | Periode 2 Minggu / 1 Bulan / 3 Bulan / 1 Tahun = 14/30/90/365 hari terakhir sampai hari ini (WIB); Δ membandingkan dengan jendela sebelumnya yang sama panjang | PRD §10 | Usulan |
| 44 | Total Konten Selesai = konten Complete pada periode (tanggal selesai). Rata-rata Order = order masuk pada periode, ditampilkan sebagai Weekly per pekan dan Daily per hari kerja | PRD §10.1 | Usulan |
| 45 | Kesesuaian SLA: syuting tepat = footage diserahkan pada/sebelum hari syuting; editing tepat = hasil pertama dikirim pada/sebelum tenggat yang ditetapkan Leader. Menggabungkan keduanya dalam satu donut dengan rincian | PRD §10.1 | Usulan |
| 46 | Revision Rate = % konten selesai pada periode yang pernah direvisi (≥1). Ambang ≤ 25% (PRD §13 menyebut "per hari"; di sini dihitung per periode) | PRD §13 | Perlu konfirmasi |
| 47 | Skor Kepuasan = rata-rata rating blind review (1–5) dari siklus yang sudah ditutup, dikaitkan ke konten yang selesai pada periode. Jadi konten yang baru selesai belum punya rating sampai siklusnya ditutup | PRD §10.1, §12 | Usulan |
| 48 | Funnel memakai status konten saat ini (bukan riwayat per tahap); heatmap = status × jenis untuk konten yang sedang berjalan (semua periode) | PRD §10.1 | Usulan |
| 49 | User melihat Dashboard sebagai baca-saja; nama pemohon lain disamarkan ("Pemohon 1…") dan hanya dirinya yang berlabel "Anda". Leader/Admin melihat nama | PRD §2 | Usulan |
| 50 | Skor KPI 0–100 = 60% Kepuasan (rating/5) + 20% SLA (% tepat waktu) + 20% Revisi (% konten tanpa revisi). Komponen tanpa data dikeluarkan dan bobot dinormalkan ulang. Pita: ≥80 sesuai target, 60–79 perlu perhatian, <60 perlu coaching | PRD §11, §13 | Usulan |
| 51 | Atribusi KPI: VG = yang menyerahkan footage (SLA syuting; revisi hanya untuk Shooting Only/Photoshoot karena footage-nya yang direview); Editor = editor yang di-assign (SLA editing; revisi hasil editing). Rating konten dibagi ke VG dan Editor yang terlibat | PRD §11 | Usulan |
| 52 | Akses KPI berjenjang: Leader/Admin melihat semua individu; Videografer dan Editor hanya scorecard dirinya sendiri; User tidak mengakses KPI | PRD §11 | Disepakati |
| 53 | Blind review: siklus 2-mingguan (periode maks 31 hari). Leader mendistribusikan form ke User yang punya konten selesai pada periode; form menilai tiap konten 1–5 + dua komentar opsional. Jawaban disimpan tanpa pengisi dan waktu; hanya partisipasi yang tercatat. Hasil muncul setelah ≥3 responden agar tidak mengarah ke satu orang | PRD §12 | Usulan |
| 54 | Blind di lapisan aplikasi: tidak ada layar/API yang menampilkan pengisi. Rating terhubung ke konten (untuk KPI), sehingga bukan anonim kriptografis: admin database secara teknis bisa menautkannya ke pemohon konten | PRD §12 | Perlu konfirmasi |
| 55 | Hasil siklus terbuka hanya untuk Leader/Admin; VG/Editor melihat hasil dan tindak lanjut setelah siklus ditutup. FGD berupa catatan + daftar tindak lanjut (centang selesai) yang ditulis Leader. Form bukan tiket revisi | PRD §12 | Usulan |
| 56 | Production Board menjadi halaman ringkasan (strip KPI 2 minggu + funnel + pintasan); klik strip membuka Dashboard (Leader/Admin/User) atau KPI Individu (VG/Editor) | PRD §3, §10 | Usulan |
| 57 | Papan Prestasi (gamifikasi) ditambahkan atas permintaan, di luar PRD. Poin hanya bertambah (tanpa pengurangan) dan dikreditkan saat konten SELESAI, bukan saat dikirim. Papan dipisah per peran (Editor, Videografer) | Permintaan tambahan | Usulan |
| 58 | Poin per konten: dasar 10; +5 tepat waktu (tahap milik orang itu); +5 bobot Susah; +5 disetujui tanpa revisi (VG: hanya jalur Shooting Only/Photoshoot); +2 / +4 untuk rating 4 / 5. Angka di `packages/shared/src/arena.ts` | Permintaan tambahan | Perlu konfirmasi |
| 59 | Level dari poin sepanjang waktu: Rookie 0, Pro 100, Expert 250, Master 500, Legend 900. Lencana: Tepat Waktu, Streak 5/10, Zero Revisi, Favorit User, Jagoan Susah, Produktif, Naik Daun (syarat di panel "Cara kerja") | Permintaan tambahan | Usulan |
| 60 | Tantangan tim (kolaboratif): konten selesai ≥ periode lalu, tepat waktu ≥ 90%, revision rate ≤ 25%, kepuasan ≥ 4,0 | Permintaan tambahan | Usulan |
| 61 | Ketegangan dengan prinsip PRD §11–12 (no blame game, individu hanya melihat dirinya): Leader mengatur "Tampilkan peringkat ke seluruh tim" (default terbuka). Terbuka: tim melihat poin, level, streak, lencana rekan, tetapi BUKAN ketepatan waktu, rating, atau rincian poin rekan. Tertutup: tiap orang hanya melihat dirinya, peringkat, dan ukuran papan | PRD §11–12 | Perlu konfirmasi |
| 62 | Dashboard Statistik ditambah panel Waktu Penyelesaian (rata-rata hari submit → selesai per jenis) dan tab Papan Prestasi untuk Leader/Admin; VG/Editor membukanya dari KPI Individu | Permintaan tambahan | Usulan |

## Teknis

- Peran `admin` ditambahkan (tidak ada di PRD) untuk kelola akun; admin tidak bisa melompati alur status.
- Hak akses menu per peran diturunkan dari PRD §2 dan mockup; mudah diubah di `packages/shared/src/nav.ts`.
- Navigasi mengikuti PRD §3 (Weekly Listing di bawah Production Board), bukan sidebar di mockup lama.
- Mockup acuan: `weekly_listing_v6` (bukan v2), `production_board_harian_v2`, `brief_order_video`.
