#!/usr/bin/env bash
# Dashboard(5000) + TeslaMate(4000) → localhost 포트포워딩
# 실행 후 브라우저에서 http://localhost:5000
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
exec ssh -i "$KEY" -N \
  -L 5000:localhost:5000 \
  -L 4000:localhost:4000 \
  ubuntu@43.202.133.239
