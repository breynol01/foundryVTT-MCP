#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODULE_DIR="$ROOT_DIR/foundry-mcp"
DIST_DIR="$ROOT_DIR/dist"

if [ ! -d "$MODULE_DIR" ]; then
  echo "Module directory not found: $MODULE_DIR" >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$MODULE_DIR/module.json" "$DIST_DIR/module.json"
(
  cd "$ROOT_DIR"
  zip -r "$DIST_DIR/foundry-mcp.zip" foundry-mcp \
    -x "*/.DS_Store" "*/.git*"
)

echo "Wrote $DIST_DIR/module.json"
echo "Wrote $DIST_DIR/foundry-mcp.zip"
