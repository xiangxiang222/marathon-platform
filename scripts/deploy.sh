#!/usr/bin/env bash
# 同步到同一台腾讯云，目录和进程都跟同行者众分开。
# 用法：./scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DEPLOY_HOST:-140.143.171.77}"
RETIRED_HOST="192.144.167.212"
if [ "$HOST" = "$RETIRED_HOST" ]; then
  echo "==> 忽略已下线主机 $RETIRED_HOST，改连 140.143.171.77"
  HOST="140.143.171.77"
fi
USER="${DEPLOY_USER:-ubuntu}"
DIR="${DEPLOY_DIR:-/var/www/marathon}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keyscan -H "$HOST" >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 "$USER@$HOST")
RSYNC_SSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes"

if ! "${SSH[@]}" "echo ok" >/dev/null; then
  echo "无法免密登录 $USER@$HOST"
  exit 1
fi

echo "==> 准备目录 $USER@$HOST:$DIR"
"${SSH[@]}" "sudo mkdir -p '$DIR' && sudo chown '$USER:$USER' '$DIR'"
rsync -azh --delete --partial --timeout=120 --stats -e "$RSYNC_SSH" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'web/node_modules/' \
  --exclude 'server/node_modules/' \
  --exclude 'miniprogram/node_modules/' \
  --exclude 'web/dist/' \
  --exclude 'coverage/' \
  --exclude 'server/data/' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.DS_Store' \
  "$ROOT/" "$USER@$HOST:$DIR/"

echo "==> 远程安装并启动"
"${SSH[@]}" bash -s -- "$DIR" <<'REMOTE'
set -euo pipefail
DIR="$1"
cd "$DIR"
mkdir -p server/data
if [ ! -f .env ]; then
  cat > .env <<'ENV'
PORT=3790
BASE_PATH=/marathon
NODE_ENV=production
ENV
  chmod 600 .env
fi
npm install --prefix server --omit=dev
npm install --prefix web
npm run build --prefix web
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi
pm2 delete marathon >/dev/null 2>&1 || true
pm2 start scripts/prod-start.sh --name marathon --interpreter bash --cwd "$DIR"
pm2 save
sudo python3 "$DIR/scripts/patch-nginx.py"
sudo nginx -t
sudo systemctl reload nginx
REMOTE
echo "==> https://togetherbetter.cn/marathon/"
