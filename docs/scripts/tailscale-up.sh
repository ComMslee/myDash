#!/usr/bin/env bash
# Tailscale 컨테이너 시작 (사전: .env에 TS_AUTHKEY= 추가)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
ssh -i "$KEY" ubuntu@43.202.133.239 '
  cd ~/myDash
  if ! grep -q TS_AUTHKEY .env; then
    echo ".env에 TS_AUTHKEY가 없습니다. 먼저 echo TS_AUTHKEY=tskey-... >> .env 하세요." >&2
    exit 1
  fi
  sudo docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d tailscale
  sleep 3
  sudo docker exec myDash-tailscale-1 tailscale status || sudo docker exec mydash-tailscale-1 tailscale status
'
