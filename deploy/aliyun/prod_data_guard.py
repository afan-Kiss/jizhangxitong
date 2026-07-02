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
    """部署前保全生产库：只认 canonical prisma/data；双库不一致则中断部署。"""
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

db_summary() {{
  local db="$1"
  [ -f "$db" ] || {{ echo "MISSING"; return; }}
  local size total active max_id max_occ max_created
  size=$(stat -c%s "$db" 2>/dev/null || echo 0)
  total=$(sqlite3 "$db" "SELECT count(*) FROM Expense;" 2>/dev/null || echo 0)
  active=$(sqlite3 "$db" "SELECT count(*) FROM Expense WHERE isVoided=0;" 2>/dev/null || echo 0)
  max_id=$(sqlite3 "$db" "SELECT coalesce(max(id),0) FROM Expense;" 2>/dev/null || echo 0)
  max_occ=$(sqlite3 "$db" "SELECT coalesce(max(occurredAt),'') FROM Expense;" 2>/dev/null || echo '')
  max_created=$(sqlite3 "$db" "SELECT coalesce(max(createdAt),'') FROM Expense;" 2>/dev/null || echo '')
  echo "size=$size total=$total active=$active maxId=$max_id maxOccurredAt=$max_occ maxCreatedAt=$max_created"
}}

print_db_summary() {{
  local label="$1"
  local db="$2"
  echo "[deploy][DATA] $label: $(db_summary "$db")"
}}

HAS_PRISMA=0
HAS_LEGACY=0
[ -f "$PRISMA_DB" ] && HAS_PRISMA=1
[ -f "$LEGACY_DB" ] && HAS_LEGACY=1

if [ "$HAS_PRISMA" = 1 ]; then
  print_db_summary "canonical(prisma/data)" "$PRISMA_DB"
fi
if [ "$HAS_LEGACY" = 1 ]; then
  print_db_summary "legacy(apps/server/data)" "$LEGACY_DB"
fi

if [ "$HAS_PRISMA" = 1 ] && [ "$HAS_LEGACY" = 1 ]; then
  S1=$(db_summary "$PRISMA_DB")
  S2=$(db_summary "$LEGACY_DB")
  if [ "$S1" != "$S2" ]; then
    echo "[deploy][FATAL] 检测到双库摘要不一致，禁止自动猜测主库。请人工确认后再部署。" >&2
    echo "[deploy][FATAL] canonical: $S1" >&2
    echo "[deploy][FATAL] legacy:    $S2" >&2
    exit 1
  fi
fi

CANONICAL_SOURCE=""
if [ "$HAS_PRISMA" = 1 ]; then
  CANONICAL_SOURCE="$PRISMA_DB"
elif [ "$HAS_LEGACY" = 1 ]; then
  CANONICAL_SOURCE="$LEGACY_DB"
  echo "[deploy][DATA] 仅发现 legacy 库，将在恢复阶段迁移到 prisma/data"
fi

if [ -n "$CANONICAL_SOURCE" ]; then
  cp -a "$CANONICAL_SOURCE" "$SAFE_DB_DIR/accounting-$DEPLOY_TS.db"
  echo "[deploy][DATA] 已写入安全备份: $SAFE_DB_DIR/accounting-$DEPLOY_TS.db"
  ls -t "$SAFE_DB_DIR"/accounting-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

if ! mkdir -p "$DATA_PRESERVE"; then
  echo "[deploy][FATAL] 创建保全目录失败" >&2
  exit 1
fi
if [ -n "$CANONICAL_SOURCE" ]; then
  mkdir -p "$DATA_PRESERVE/canonical"
  cp -a "$CANONICAL_SOURCE" "$DATA_PRESERVE/canonical/accounting.db"
  CANONICAL_SIZE=$(stat -c%s "$DATA_PRESERVE/canonical/accounting.db" 2>/dev/null || echo 0)
  if [ "$CANONICAL_SIZE" -le 0 ]; then
    echo "[deploy][FATAL] 保全库大小为 0" >&2
    exit 1
  fi
  echo "[deploy][DATA] 已保全 canonical accounting.db (${{CANONICAL_SIZE}} bytes)"
else
  echo "[deploy][DATA] 无历史 accounting.db，全新部署"
fi
"""


def shell_restore_preserved_data(deploy_dir: str) -> str:
    prisma_dir = f"{deploy_dir}/{PRODUCTION_DATA_REL}"
    legacy_db = f"{deploy_dir}/{LEGACY_DB_REL}"
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
  echo "[deploy][DATA] 已恢复 canonical accounting.db 到 prisma/data (${{RESTORE_SIZE}} bytes)"
  if [ -f "{legacy_db}" ]; then
    echo "[deploy][DATA] 提示: legacy 路径仍存在库文件，系统只使用 prisma/data/accounting.db"
  fi
else
  echo "[deploy][DATA] 无历史 accounting.db，保留空 prisma/data 目录"
fi
FINAL_SIZE=$(stat -c%s "{prisma_dir}/accounting.db" 2>/dev/null || echo 0)
if [ "$FINAL_SIZE" -gt 0 ]; then
  echo "[deploy][DATA] 部署后 canonical DB 确认: ${{FINAL_SIZE}} bytes"
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
