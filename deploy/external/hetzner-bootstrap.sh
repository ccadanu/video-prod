#!/usr/bin/env bash
# Persiapan awal VPS Hetzner (Ubuntu 22.04/24.04) SEBELUM memasang Coolify. Jalankan sebagai root, sekali.
#   curl -fsSL <url-mentah>/deploy/external/hetzner-bootstrap.sh -o bootstrap.sh && less bootstrap.sh && bash bootstrap.sh
#   DRY_RUN=1 bash bootstrap.sh     # hanya menampilkan apa yang akan dilakukan
# Yang dilakukan: update paket, zona waktu WIB, swap 2 GB (bila belum ada), pembaruan keamanan otomatis, fail2ban,
# dan SSH hanya dengan kunci (HANYA bila kunci SSH sudah terpasang, agar Anda tidak terkunci di luar).
# Firewall: gunakan Cloud Firewall di konsol Hetzner (port yang dipublikasikan Docker melewati ufw). Lihat docs/DEPLOY_EXTERNAL.md.
set -euo pipefail

DRY="${DRY_RUN:-0}"
run() { echo "+ $*"; [ "$DRY" = "1" ] || "$@"; }
say() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || [ "$DRY" = "1" ] || { echo "Jalankan sebagai root." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

say "Update paket"
run apt-get update -y
run apt-get upgrade -y
run apt-get install -y curl ca-certificates unattended-upgrades fail2ban

say "Zona waktu WIB"
run timedatectl set-timezone Asia/Jakarta

say "Swap 2 GB (membantu saat build front-end)"
if swapon --show | grep -q .; then
  echo "swap sudah ada, dilewati"
else
  run fallocate -l 2G /swapfile
  run chmod 600 /swapfile
  run mkswap /swapfile
  run swapon /swapfile
  if ! grep -q '^/swapfile' /etc/fstab 2>/dev/null; then
    echo "+ tambahkan /swapfile ke /etc/fstab"
    [ "$DRY" = "1" ] || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

say "Pembaruan keamanan otomatis"
run systemctl enable --now unattended-upgrades

say "fail2ban (batasi tebak-tebakan login SSH)"
run systemctl enable --now fail2ban

say "SSH hanya dengan kunci"
if [ -s /root/.ssh/authorized_keys ]; then
  CONF=/etc/ssh/sshd_config.d/99-ccp.conf
  echo "+ tulis $CONF"
  if [ "$DRY" != "1" ]; then
    printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\nKbdInteractiveAuthentication no\n' > "$CONF"
    sshd -t && systemctl reload ssh 2>/dev/null || systemctl reload sshd
  fi
  echo "Login kata sandi dimatikan. JANGAN tutup sesi ini sebelum membuka sesi SSH baru dengan kunci untuk memastikan masih bisa masuk."
else
  echo "PERINGATAN: /root/.ssh/authorized_keys kosong. Login kata sandi TIDAK dimatikan (agar Anda tidak terkunci)."
  echo "Pasang kunci SSH lalu jalankan skrip ini lagi."
fi

say "Selesai"
echo "Langkah berikutnya: pasang Coolify (docs/DEPLOY_EXTERNAL.md bagian 5)."
