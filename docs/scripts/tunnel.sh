#!/usr/bin/env bash
# myDash SSH Tunnel: Dashboard(5000) + TeslaMate(4000) → localhost
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
HOST="ubuntu@43.202.133.239"

echo "================================================"
echo " myDash SSH Tunnel"
echo "================================================"
echo " Dashboard  http://localhost:5000"
echo " TeslaMate  http://localhost:4000"
echo "------------------------------------------------"
echo " * Keep this terminal OPEN while using tunnel"
echo " * Press Ctrl+C to stop"
echo "================================================"
echo

if [ ! -f "$KEY" ]; then
  echo "[ERROR] Key file not found: $KEY" >&2
  exit 1
fi

exec ssh -i "$KEY" \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 \
  -o ExitOnForwardFailure=yes \
  -N \
  -L 5000:localhost:5000 \
  -L 4000:localhost:4000 \
  "$HOST"
