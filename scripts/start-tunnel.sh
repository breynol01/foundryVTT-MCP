#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-8787}

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

echo "Starting Cloudflare Tunnel to http://localhost:${PORT}"
cloudflared tunnel --url "http://localhost:${PORT}"
