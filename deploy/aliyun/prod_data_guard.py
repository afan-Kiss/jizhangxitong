#!/usr/bin/env python3
"""生产数据库保护：部署/脚本不得覆盖或清空线上 accounting.db。"""
from __future__ import annotations

import os
import sys

PRODUCTION_HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PRODUCTION_DB_REL = "apps/server/prisma/data/accounting.db"
PRODUCTION_DATA_REL = "apps/server/prisma/data"
LEGACY_DB_REL = "apps/server/data/accounting.db"
LEGACY_DATA_REL = "apps/server/data"
SAFE_DB_BACKUP_DIR_REL = "data/backups"

# 本地/上传包覆盖线上库 — 永久禁止（即使设环境变量也不允许）
FORBIDDEN_ENV_VARS = (
    "DEPLOY_UPLOAD_LOCAL_DB",
    "DEPLOY_REPLACE_PRODUCTION_DB",
    "DEPLOY_RESET_PRODUCTION_DB",
)

# 远程 destructive 操作 — 必须显式二次确认
DESTRUCTIVE_CONFIRM_ENV = "CONFIRM_DESTROY_PRODUCTION_DATA"
DESTRUCTIVE_CONFIRM_VALUE = "YES_I_UNDERSTAND_DATA_LOSS"


class ProductionDataGuardError(RuntimeError):
    pass


def forbid_local_db_overwrite() -> None:
    for key in FORBIDDEN_ENV_VARS:
        val = os.environ.get(key, "").strip().lower()
        if val in ("1", "true", "yes"):
            raise ProductionDataGuardError(
                f"禁止 {key}：生产 accounting.db 不可被本地或上传包覆盖。"
                " 数据优先；请使用 restore-prod-db-from-backup.py 从 /www/backup 恢复。"
            )


def require_destructive_confirmation(action: str) -> None:
    if os.environ.get(DESTRUCTIVE_CONFIRM_ENV, "").strip() != DESTRUCTIVE_CONFIRM_VALUE:
        print(
            f"[prod-data-guard] 拒绝执行「{action}」。"
            f" 生产库禁止通过部署脚本增删改查业务数据。"
            f" 若确需运维操作，请设置 {DESTRUCTIVE_CONFIRM_ENV}={DESTRUCTIVE_CONFIRM_VALUE}",
            file=sys.stderr,
        )
        sys.exit(1)


def assert_restore_backup_allowed(backup_db_path: str) -> None:
    if not backup_db_path.startswith("/www/backup/jade-accounting-"):
        raise ProductionDataGuardError(
            f"拒绝从非标准备份路径恢复: {backup_db_path}"
        )
    if not backup_db_path.endswith("/apps/server/prisma/data/accounting.db"):
        raise ProductionDataGuardError(
            f"备份路径必须是 .../apps/server/prisma/data/accounting.db: {backup_db_path}"
        )


def shell_preserve_production_data(deploy_dir: str) -> str:
    """部署前保全生产库（prisma/data 与旧版 data/ 双路径），并写入不可被清理脚本删掉的备份目录。"""
    prisma_dir = f"{deploy_dir}/{PRODUCTION_DATA_REL}"
    legacy_db = f"{deploy_dir}/{LEGACY_DB_REL}"
    safe_backup_dir = f"{deploy_dir}/{SAFE_DB_BACKUP_DIR_REL}"
    return f"""
DATA_PRESERVE=/tmp/jade-data-preserve-$$
DEPLOY_TS=$(date +%Y%m%d-%H%M%S)
SAFE_DB_DIR="{safe_backup_dir}"
PRISMA_DB="{prisma_dir}/accounting.db"
LEGACY_DB="{legacy_db}"
mkdir -p "$SAFE_DB_DIR"

pick_best_db() {{
  local best=""
  local best_count=0
  for candidate in "$@"; do
    [ -f "$candidate" ] || continue
    local cnt
    cnt=$(sqlite3 "$candidate" "SELECT count(*) FROM Expense WHERE isVoided=0;" 2>/dev/null || echo 0)
    if [ "$cnt" -gt "$best_count" ]; then
      best_count=$cnt
      best="$candidate"
    elif [ "$cnt" -eq "$best_count" ] && [ -n "$candidate" ]; then
      local sz bs
      sz=$(stat -c%s "$candidate" 2>/dev/null || echo 0)
      if [ -n "$best" ]; then
        bs=$(stat -c%s "$best" 2>/dev/null || echo 0)
      else
        bs=0
      fi
      if [ "$sz" -gt "$bs" ]; then best="$candidate"; fi
    fi
  done
  echo "$best"
}}

if [ -f "$PRISMA_DB" ] || [ -f "$LEGACY_DB" ]; then
  BEST_DB=$(pick_best_db "$PRISMA_DB" "$LEGACY_DB")
  if [ -n "$BEST_DB" ]; then
    cp -a "$BEST_DB" "$SAFE_DB_DIR/accounting-$DEPLOY_TS.db"
    echo "[deploy][DATA] 已写入安全备份: $SAFE_DB_DIR/accounting-$DEPLOY_TS.db"
    ls -t "$SAFE_DB_DIR"/accounting-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi
fi

if ! mkdir -p "$DATA_PRESERVE"; then
  echo "[deploy][FATAL] 创建保全目录失败" >&2
  exit 1
fi
if [ -f "$PRISMA_DB" ]; then
  mkdir -p "$DATA_PRESERVE/prisma-data"
  cp -a {prisma_dir}/. "$DATA_PRESERVE/prisma-data/"
  echo "[deploy][DATA] 已保全 prisma/data ($(stat -c%s "$PRISMA_DB" 2>/dev/null || echo 0) bytes)"
fi
if [ -f "$LEGACY_DB" ]; then
  mkdir -p "$DATA_PRESERVE/legacy-data"
  cp -a {deploy_dir}/{LEGACY_DATA_REL}/. "$DATA_PRESERVE/legacy-data/"
  echo "[deploy][DATA] 已保全 apps/server/data ($(stat -c%s "$LEGACY_DB" 2>/dev/null || echo 0) bytes)"
fi
BEST_DB=$(pick_best_db "$DATA_PRESERVE/prisma-data/accounting.db" "$DATA_PRESERVE/legacy-data/accounting.db")
if [ -z "$BEST_DB" ]; then
  echo "[deploy][DATA] 无历史 accounting.db，全新部署"
else
  mkdir -p "$DATA_PRESERVE/canonical"
  cp -a "$BEST_DB" "$DATA_PRESERVE/canonical/accounting.db"
  echo "[deploy][DATA] 选定主库: $BEST_DB"
fi
"""


def shell_restore_preserved_data(deploy_dir: str) -> str:
    prisma_dir = f"{deploy_dir}/{PRODUCTION_DATA_REL}"
    return f"""
rm -f /tmp/jade-upload/accounting.db
if ! mkdir -p {prisma_dir}; then
  echo "[deploy][FATAL] 创建 prisma/data 目录失败" >&2
  exit 1
fi
if [ -f /tmp/jade-upload/accounting.db ]; then
  echo "[deploy][FATAL] 检测到上传 accounting.db，生产环境禁止覆盖线上数据库" >&2
  exit 1
fi
if [ -f "$DATA_PRESERVE/canonical/accounting.db" ]; then
  if ! cp -a "$DATA_PRESERVE/canonical/accounting.db" {prisma_dir}/accounting.db; then
    echo "[deploy][FATAL] 恢复 accounting.db 失败" >&2
    exit 1
  fi
  RESTORE_SIZE=$(stat -c%s "{prisma_dir}/accounting.db" 2>/dev/null || echo 0)
  if [ "$RESTORE_SIZE" -le 0 ]; then
    echo "[deploy][FATAL] 恢复后 accounting.db 大小为 0" >&2
    exit 1
  fi
  rm -rf "$DATA_PRESERVE"
  echo "[deploy][DATA] 已恢复线上 accounting.db 到 prisma/data (${{RESTORE_SIZE}} bytes)"
else
  echo "[deploy][DATA] 无历史 accounting.db，保留空 prisma/data 目录"
fi
"""


def exit_on_guard_error(fn):
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except ProductionDataGuardError as e:
            print(f"[prod-data-guard] {e}", file=sys.stderr)
            sys.exit(1)

    return wrapper
