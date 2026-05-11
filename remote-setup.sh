#!/bin/bash
# Lightsail 1GB instance initial setup
set -euxo pipefail

# Timezone
sudo timedatectl set-timezone Asia/Seoul

# Swap 4GB (essential for 1GB RAM)
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  sudo sysctl vm.swappiness=20
  echo 'vm.swappiness=20' | sudo tee -a /etc/sysctl.conf
fi

# Update base system
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# Docker
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker ubuntu
fi

# Base tooling
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ufw fail2ban unattended-upgrades git ca-certificates

# UFW — Lightsail firewall handles edge; UFW adds defense-in-depth
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw --force enable

# fail2ban
sudo systemctl enable --now fail2ban

# Auto security updates
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

# Verify
echo "=== SWAP ==="
free -m
echo "=== DOCKER ==="
docker --version
echo "=== UFW ==="
sudo ufw status
echo "=== DONE ==="
