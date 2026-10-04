#!/usr/bin/env bash
# Uji asap setelah deploy. Tanpa kredensial; hanya memastikan layanan hidup dan terkonfigurasi benar.
#   ./scripts/smoke.sh https://video.contoh.co.id
#   ./scripts/smoke.sh http://localhost:3001
set -uo pipefail
BASE="${1:-http://localhost:3001}"
BASE="${BASE%/}"
fail=0
check() { # nama, kondisi (0 = lulus)
  if [ "$2" -eq 0 ]; then echo "PASS $1"; else echo "FAIL $1"; fail=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check "GET /api/health = 200 (database terjangkau)" "$([ "$(code "$BASE/api/health")" = 200 ] && echo 0 || echo 1)"
check "GET / = 200 (web statis)" "$([ "$(code "$BASE/")" = 200 ] && echo 0 || echo 1)"
check "GET /production-board/daily-shooting = 200 (rute SPA)" "$([ "$(code "$BASE/production-board/daily-shooting")" = 200 ] && echo 0 || echo 1)"
check "GET /api/auth/me tanpa login = 401" "$([ "$(code "$BASE/api/auth/me")" = 401 ] && echo 0 || echo 1)"
check "GET /api/briefs tanpa login = 401" "$([ "$(code "$BASE/api/briefs")" = 401 ] && echo 0 || echo 1)"
check "GET /api/tidak-ada = 404" "$([ "$(code "$BASE/api/tidak-ada")" = 404 ] && echo 0 || echo 1)"
H="$(curl -sI "$BASE/")"
for h in 'content-security-policy' 'x-content-type-options' 'x-frame-options'; do
  echo "$H" | grep -qi "^$h:" && check "header $h ada" 0 || check "header $h ada" 1
done
case "$BASE" in
  https://*) echo "$H" | grep -qi '^strict-transport-security:' && check "HSTS aktif (HTTPS)" 0 || check "HSTS aktif (HTTPS)" 1 ;;
  *) echo "INFO  HTTP biasa: pastikan COOKIE_SECURE=false sengaja dipilih (jaringan internal)" ;;
esac
[ "$fail" -eq 0 ] && echo "SEMUA LULUS" || echo "ADA YANG GAGAL"
exit "$fail"
