#!/usr/bin/env bash
# 컨테이너 로그 실시간 팔로우
# 사용: logs.sh [service=dashboard]
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
SERVICE="${1:-dashboard}"
ssh -i "$KEY" ubuntu@43.202.133.239 "cd myDash && sudo docker compose logs -f --tail 100 $SERVICE"
