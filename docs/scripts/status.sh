#!/usr/bin/env bash
# 서비스 전체 상태 (컨테이너 + 메모리 + 디스크)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
ssh -i "$KEY" ubuntu@43.202.133.239 '
  echo "=== CONTAINERS ==="
  cd myDash && sudo docker compose ps
  echo
  echo "=== MEMORY ==="
  free -m
  echo
  echo "=== DISK ==="
  df -h /
  echo
  echo "=== UPTIME ==="
  uptime
'
