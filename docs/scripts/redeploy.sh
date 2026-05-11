#!/usr/bin/env bash
# 대시보드 수동 재배포 (GHA 대신)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
ssh -i "$KEY" ubuntu@43.202.133.239 '
  set -e
  cd ~/myDash
  git fetch --all --prune
  git reset --hard origin/master
  sudo docker compose build dashboard
  sudo docker compose up -d dashboard
  sudo docker image prune -f
  echo === DONE ===
  sudo docker compose ps
'
