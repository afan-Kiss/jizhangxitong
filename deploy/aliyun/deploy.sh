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
  local conf_src="$DEPLOY_DIR/deploy/aliyun/nginx-jade-accounting.conf"
  local conf_dst="/www/server/panel/vhost/nginx/jade-accounting.conf"
  if [[ ! -f "$conf_src" ]]; then
    log "WARN: nginx config not found, skip"
    return 0
  fi
  if [[ -d /www/server/panel/vhost/nginx ]]; then
    cp -a "$conf_dst" "/www/backup/nginx-jade-accounting-$(date +%Y%m%d-%H%M%S).conf.bak" 2>/dev/null || true
    cp "$conf_src" "$conf_dst"
    log "nginx config -> $conf_dst"
  fi
  mkdir -p /etc/aa_nginx/conf.d /www/backup
  cp -a /etc/aa_nginx/conf.d/jade-accounting.conf "/www/backup/nginx-jade-accounting-conf.d-$(date +%Y%m%d-%H%M%S).bak" 2>/dev/null || true
  cp "$conf_src" /etc/aa_nginx/conf.d/jade-accounting.conf
  log "nginx config -> /etc/aa_nginx/conf.d/jade-accounting.conf"
  local nginx_bin=""
  if command -v aa_nginx >/dev/null 2>&1; then nginx_bin=aa_nginx
  elif [[ -x /usr/sbin/aa_nginx ]]; then nginx_bin=/usr/sbin/aa_nginx
  elif command -v nginx >/dev/null 2>&1; then nginx_bin=nginx
  fi
  if [[ -z "$nginx_bin" ]]; then
    log "WARN: nginx binary not found, skip reload"
    return 0
  fi
  if $nginx_bin -t; then
    $nginx_bin -s reload || true
    log "nginx reloaded via $nginx_bin"
  else
    fail "nginx -t failed"
  fi
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

enable_trial_mode() {
  log "enable trial_mode_enabled"
  cd "$DEPLOY_DIR"
  node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.systemSetting.upsert({
  where: { settingKey: 'trial_mode_enabled' },
  create: { settingKey: 'trial_mode_enabled', settingValue: 'true', valueType: 'string' },
  update: { settingValue: 'true' },
}).then(() => p.\$disconnect()).catch(e => { console.error(e); process.exit(1); });
" || log "WARN: trial mode upsert skipped"
}

main() {
  log "DEPLOY_DIR=$DEPLOY_DIR"
  prepare_dirs
  install_build
  start_pm2
  wait_health
  nginx_setup
  enable_trial_mode
  log "部署完成"
  log "手机访问: http://${PUBLIC_IP}:${PUBLIC_HTTP_PORT}/"
  log "或: http://account.xiangyuzhubao.xyz/ (需 DNS)"
  log "API: http://127.0.0.1:${PUBLIC_PORT}/api/health"
}

main "$@"
