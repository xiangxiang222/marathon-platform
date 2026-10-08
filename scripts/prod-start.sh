#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a
export PORT="${PORT:-3790}"
export BASE_PATH="${BASE_PATH:-/marathon}"
exec node server/src/index.js
