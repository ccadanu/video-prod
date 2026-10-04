#!/usr/bin/env bash
# Pulihkan database dari berkas backup. MENIMPA isi database saat ini.
#   ./scripts/restore.sh backups/ccp-20261004-020000.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Gunakan: restore.sh <berkas.dump>}"
[ -f "$FILE" ] || { echo "Berkas tidak ada: $FILE" >&2; exit 1; }
read -r -p "Ini MENIMPA database saat ini dengan $FILE. Ketik 'pulihkan' untuk lanjut: " ok
[ "$ok" = "pulihkan" ] || { echo "Dibatalkan"; exit 1; }
COMPOSE=(docker compose -f docker-compose.prod.yml)
"${COMPOSE[@]}" stop app
"${COMPOSE[@]}" exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$FILE"
"${COMPOSE[@]}" start app
echo "Selesai. Jalankan scripts/smoke.sh untuk memastikan."
