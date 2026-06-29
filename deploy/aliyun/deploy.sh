#!/usr/bin/env bash
# 服务器端部署脚本 — 在 /www/wwwroot/jade-accounting 执行
set -euo pipefail

DEPLOY_DIR="/www/wwwroot/jade-accounting"
APP_NAME="jade-accounting-server"
PUBLIC_PORT="${PUBLIC_PORT:-4731}"
PUBLIC_HTTP_PORT="${PUBLIC_HTTP_PORT:-4732}"
PUBLIC_IP="${PUBLIC_IP:-8.137.126.18}"

log() { echo "[jade-deploy] $*"; }
fail() { echo "[jade-deploy][FAIL] $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令: $1"
}

prepare_dirs() {
  mkdir -p "$DEPLOY_DIR/logs" "$DEPLOY_DIR/exports" "$DEPLOY_DIR/web"
  mkdir -p "$DEPLOY_DIR/apps/server/prisma/data"
  mkdir -p "$DEPLOY_DIR/apps/server/exports"
  mkdir -p "$DEPLOY_DIR/apps/server/tmp-uploads"
}

install_build() {
  cd "$DEPLOY_DIR"
  require_cmd node
  require_cmd npm
  log "Node $(node -v)"
  log "npm ci"
  npm ci
  log "prisma generate"
  npm run db:generate -w @jade-account/server
  log "db push"
  npm run db:push -w @jade-account/server
  if [[ "${SKIP_SEED:-0}" != "1" ]]; then
    log "db seed"
    npm run db:seed -w @jade-account/server || true
  else
    log "skip seed (existing database)"
  fi
  if [[ -f apps/web/dist/index.html && -f apps/server/dist/index.js ]]; then
    log "use prebuilt dist from upload bundle"
  else
    log "build on server"
    npm run build
  fi
  log "copy web dist"
  rm -rf "$DEPLOY_DIR/web"/*
  cp -a "$DEPLOY_DIR/apps/web/dist/"* "$DEPLOY_DIR/web/"
  log "web assets count: $(find "$DEPLOY_DIR/web/assets" -type f 2>/dev/null | wc -l)"
}

start_pm2() {
  require_cmd pm2
  export NVM_DIR="${NVM_DIR:-/root/.nvm}"
  # shellcheck disable=SC1091
  if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi
  cd "$DEPLOY_DIR"
  cp -f deploy/aliyun/ecosystem.config.cjs ecosystem.config.cjs
  pm2 delete "$APP_NAME" 2>/dev/null || true
  pm2 start ecosystem.config.cjs
  pm2 save
  log "pm2 started $APP_NAME"
}

nginx_setup() {
  log "nginx: 80 端口 /account/ 由 fix-nginx-account80.py 配置（不部署自签名 SSL 独立站点）"
  return 0
}

wait_health() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${PUBLIC_PORT}/api/health" | grep -q 'success'; then
      log "health OK on :${PUBLIC_PORT}"
      return 0
    fi
    sleep 2
  done
  fail "health check failed on :${PUBLIC_PORT}"
}

main() {
  log "DEPLOY_DIR=$DEPLOY_DIR"
  prepare_dirs
  install_build
  start_pm2
  wait_health
  nginx_setup
  log "部署完成"
  log "推荐手机访问: http://8.137.126.18/account/"
  log "域名 HTTPS: 待备案/正式证书完成后启用"
  log "API: http://127.0.0.1:${PUBLIC_PORT}/api/health"
}

main "$@"
