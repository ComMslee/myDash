#!/usr/bin/env bash
# myDash Lightsail SSH
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="$DIR/../../lightsail-seoul.pem"
exec ssh -i "$KEY" ubuntu@43.202.133.239 "$@"
