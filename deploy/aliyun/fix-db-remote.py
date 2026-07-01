#!/usr/bin/env python3
"""修复生产 DATABASE_URL 并同步本地数据库、重启 PM2"""
import os
import sys
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prod_data_guard import ProductionDataGuardError

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
ENV_PATH = f"{DEPLOY_DIR}/apps/server/.env"
DB_LOCAL = ROOT / "apps/server/prisma/data/accounting.db"
DB_REMOTE = f"{DEPLOY_DIR}/apps/server/prisma/data/accounting.db"


def run(client, cmd: str, timeout: int = 300) -> int:
    print(f">>> {cmd[:160]}")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    return code


def main() -> None:
    print(
        "[prod-data-guard] fix-db-remote.py 已禁用：禁止用本地 accounting.db 覆盖生产库。",
        file=sys.stderr,
    )
    print(
        "[prod-data-guard] 如需恢复数据请使用 deploy/aliyun/restore-prod-db-from-backup.py",
        file=sys.stderr,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
