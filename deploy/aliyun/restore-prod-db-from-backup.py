#!/usr/bin/env python3
"""从 /www/backup 恢复生产 accounting.db（仅运维恢复，非日常部署）。"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prod_data_guard import assert_restore_backup_allowed, require_destructive_confirmation

HOST = "8.137.126.18"
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
CURRENT = f"{DEPLOY_DIR}/apps/server/prisma/data/accounting.db"


def usage() -> None:
    print(
        "用法: python deploy/aliyun/restore-prod-db-from-backup.py "
        "/www/backup/jade-accounting-YYYYMMDD-HHMMSS/apps/server/prisma/data/accounting.db",
        file=sys.stderr,
    )
    sys.exit(1)


def load_password() -> str:
    for line in (Path(__file__).resolve().parents[2] / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 180) -> tuple[int, str]:
    print(f">>> {cmd[:200]}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = (o.read() + e.read()).decode("utf-8", errors="replace").strip()
    code = o.channel.recv_exit_status()
    if out:
        enc = getattr(sys.stdout, "encoding", None) or "utf-8"
        print(out.encode(enc, errors="replace").decode(enc, errors="replace"))
    return code, out


def stat_db(c: paramiko.SSHClient, path: str) -> tuple[int, str]:
    code, out = run(c, f'stat -c "%s %y" "{path}" 2>/dev/null || echo "MISSING"')
    if code != 0 or out.endswith("MISSING"):
        return 0, "missing"
    parts = out.split(" ", 1)
    try:
        return int(parts[0]), parts[1] if len(parts) > 1 else ""
    except ValueError:
        return 0, out


def main() -> None:
    if len(sys.argv) < 2:
        usage()
    backup = sys.argv[1].strip()
    if not backup:
        usage()

    assert_restore_backup_allowed(backup)
    require_destructive_confirmation(f"从备份恢复生产库: {backup}")

    pwd = load_password()
    if not pwd:
        sys.exit("Missing SSH_PASS")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    code, _ = run(c, f'test -f "{backup}"')
    if code != 0:
        sys.exit(f"backup missing: {backup}")

    backup_size, backup_mtime = stat_db(c, backup)
    current_size, current_mtime = stat_db(c, CURRENT)
    print(f"\n=== 备份库: {backup_size} bytes, mtime={backup_mtime} ===")
    print(f"=== 当前库: {current_size} bytes, mtime={current_mtime} ===")

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    pre_restore = f"/www/backup/jade-accounting-pre-restore-{ts}"
    pre_db = f"{pre_restore}/apps/server/prisma/data/accounting.db"

    run(c, f'mkdir -p "{pre_restore}/apps/server/prisma/data"')
    if current_size > 0:
        code, _ = run(c, f'cp -a "{CURRENT}" "{pre_db}"')
        if code != 0:
            sys.exit("创建 pre-restore 快照失败")
        snap_size, snap_mtime = stat_db(c, pre_db)
        if snap_size <= 0:
            sys.exit("pre-restore 快照 accounting.db 无效")
        print(f"[restore] pre-restore 快照: {pre_db} ({snap_size} bytes, {snap_mtime})")
    else:
        print("[restore] 当前库不存在，跳过 pre-restore 快照")

    run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 stop jade-accounting-server")
    code, _ = run(c, f'cp -a "{backup}" "{CURRENT}"')
    if code != 0:
        sys.exit("覆盖生产库失败")
    run(c, f'rm -f "{CURRENT}-wal" "{CURRENT}-shm"')
    run(c, f'sqlite3 "{CURRENT}" "PRAGMA wal_checkpoint(FULL);"')

    restored_size, restored_mtime = stat_db(c, CURRENT)
    if restored_size <= 0:
        sys.exit("恢复后 accounting.db 无效")
    print(f"[restore] 已恢复: {CURRENT} ({restored_size} bytes, {restored_mtime})")

    run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 restart jade-accounting-server")
    run(c, "sleep 2 && curl -fsS http://127.0.0.1:4731/api/health")

    c.close()
    print(f"\nrestore OK from {backup}")


if __name__ == "__main__":
    main()
