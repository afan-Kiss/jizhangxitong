#!/usr/bin/env python3
"""从 /www/backup 恢复生产 accounting.db（仅运维恢复，非日常部署）。"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prod_data_guard import assert_restore_backup_allowed

HOST = "8.137.126.18"
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
CURRENT = f"{DEPLOY_DIR}/apps/server/prisma/data/accounting.db"
DEFAULT_BACKUP = "/www/backup/jade-accounting-20260701-185208/apps/server/prisma/data/accounting.db"


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


def main() -> None:
    backup = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BACKUP
    assert_restore_backup_allowed(backup)

    pwd = load_password()
    if not pwd:
        sys.exit("Missing SSH_PASS")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    pre_restore = f"/www/backup/jade-accounting-pre-restore-{ts}"

    code, _ = run(c, f'test -f "{backup}"')
    if code != 0:
        sys.exit(f"backup missing: {backup}")

    print("\n=== before restore ===")
    run(c, f'sqlite3 -header -column "{CURRENT}" "SELECT id, expenseNo, amount, paySource, expenseType, remark FROM Expense ORDER BY id;"')
    run(c, f'sqlite3 -header -column "{CURRENT}" "SELECT id, username, name FROM User ORDER BY id;"')

    run(c, f'mkdir -p "{pre_restore}/apps/server/prisma/data"')
    run(c, f'cp -a "{CURRENT}" "{pre_restore}/apps/server/prisma/data/accounting.db" 2>/dev/null || true')
    run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 stop jade-accounting-server")
    run(c, f'cp -a "{backup}" "{CURRENT}"')
    run(c, f'rm -f "{CURRENT}-wal" "{CURRENT}-shm"')
    run(c, f'sqlite3 "{CURRENT}" "PRAGMA wal_checkpoint(FULL);"')

    print("\n=== after restore ===")
    run(c, f'sqlite3 -header -column "{CURRENT}" "SELECT id, expenseNo, amount, paySource, expenseType, remark, datetime(createdAt/1000,\'unixepoch\',\'localtime\') as created FROM Expense ORDER BY id;"')
    run(c, f'sqlite3 -header -column "{CURRENT}" "SELECT id, username, name FROM User ORDER BY id;"')

    run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 restart jade-accounting-server")
    run(c, "sleep 2 && curl -fsS http://127.0.0.1:4731/api/health")

    c.close()
    print(f"\nrestore OK from {backup}")
    print(f"pre-restore snapshot: {pre_restore}/apps/server/prisma/data/accounting.db")


if __name__ == "__main__":
    main()
