#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
if [ -f .env ]; then . ./.env; fi
set +a
exec node scripts/content-sync.cjs --publish
