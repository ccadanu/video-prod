#!/usr/bin/env bash
# Backup database (format custom pg_dump) ke ./backups, simpan N terakhir.
#   ./scripts/backup.sh            # compose produksi
#   KEEP=30 ./scripts/backup.sh
# Jadwalkan lewat cron, mis. setiap hari 02.00:  0 2 * * * cd /opt/ccp && ./scripts/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP="${KEEP:-14}"
COMPOSE=(docker compose -f docker-compose.prod.yml)
mkdir -p backups
FILE="backups/ccp-$(date +%Y%m%d-%H%M%S).dump"
"${COMPOSE[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$FILE"
[ -s "$FILE" ] || { echo "Backup kosong, dibatalkan" >&2; rm -f "$FILE"; exit 1; }
echo "OK: $FILE ($(du -h "$FILE" | cut -f1))"
ls -1t backups/ccp-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f
