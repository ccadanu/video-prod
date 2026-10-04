#!/usr/bin/env bash
# Ambil dump database dari VPS ke komputer Anda lewat SSH (tanpa membuka port database ke internet).
#   ./deploy/external/dump-from-vps.sh root@IP-VPS <bagian-nama-container-db> <user-db> <nama-db>
# Contoh:
#   ./deploy/external/dump-from-vps.sh root@203.0.113.10 ccp-db postgres postgres
# Nama container: lihat `docker ps` di VPS (resource Postgres Coolify namanya berawalan UUID; cukup bagian yang unik).
# User/nama DB: halaman resource database di Coolify.
set -euo pipefail
HOST="${1:?Gunakan: dump-from-vps.sh root@IP <bagian-nama-container> <user-db> <nama-db>}"
MATCH="${2:?bagian nama container db}"
DBUSER="${3:?user db}"
DBNAME="${4:?nama db}"
mkdir -p backups
OUT="backups/ccp-$(date +%Y%m%d-%H%M%S).dump"
# Nilai dikutip ke sisi VPS dengan printf %q agar aman dari karakter khusus.
REMOTE="c=\$(docker ps -q --filter name=$(printf %q "$MATCH") | head -n1); [ -n \"\$c\" ] || { echo 'container tidak ditemukan' >&2; exit 2; }; docker exec \"\$c\" pg_dump -U $(printf %q "$DBUSER") -d $(printf %q "$DBNAME") -Fc --no-owner"
ssh "$HOST" "$REMOTE" > "$OUT"
[ -s "$OUT" ] || { echo "Dump kosong, dibatalkan" >&2; rm -f "$OUT"; exit 1; }
echo "OK: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Salin juga ke penyimpanan lain (jangan hanya satu tempat)."
