#!/usr/bin/env python3
"""生产数据库保护：部署/脚本不得覆盖或清空线上 accounting.db。"""
from __future__ import annotations

import os
import sys

PRODUCTION_HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PRODUCTION_DB_REL = "apps/server/prisma/data/accounting.db"
PRODUCTION_DATA_REL = "apps/server/prisma/data"

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
    """部署时保全线上 data 目录，禁止用上传 accounting.db 覆盖。"""
    data_dir = f"{deploy_dir}/{PRODUCTION_DATA_REL}"
    return f"""
DATA_PRESERVE=/tmp/jade-data-preserve-$$
if [ -d {data_dir} ]; then
  mkdir -p "$DATA_PRESERVE"
  cp -a {data_dir}/. "$DATA_PRESERVE/" 2>/dev/null || true
  if [ -f "$DATA_PRESERVE/accounting.db" ]; then
    echo "[deploy][DATA] 已保全线上 accounting.db ($(stat -c%s "$DATA_PRESERVE/accounting.db" 2>/dev/null || echo ?) bytes)"
  fi
fi
"""


def shell_restore_preserved_data(deploy_dir: str) -> str:
    data_dir = f"{deploy_dir}/{PRODUCTION_DATA_REL}"
    return f"""
mkdir -p {data_dir}
if [ -d "$DATA_PRESERVE" ] && [ -f "$DATA_PRESERVE/accounting.db" ]; then
  cp -a "$DATA_PRESERVE/." {data_dir}/
  rm -rf "$DATA_PRESERVE"
  echo "[deploy][DATA] 已恢复线上 accounting.db（拒绝本地/上传包覆盖）"
elif [ -f /tmp/jade-upload/accounting.db ]; then
  echo "[deploy][FATAL] 检测到上传 accounting.db，生产环境禁止覆盖线上数据库" >&2
  exit 1
else
  echo "[deploy][DATA] 无历史 accounting.db，保留空 data 目录"
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
