#!/usr/bin/env python3
"""从部署备份恢复 DYF 用户（若不存在）。"""
from __future__ import annotations

import sys
from pathlib import Path

import paramiko

HOST = "8.137.126.18"
BACKUP = "/www/backup/jade-accounting-20260701-124725/apps/server/prisma/data/accounting.db"
CURRENT = "/www/wwwroot/jade-accounting/apps/server/prisma/data/accounting.db"


def load_password() -> str:
    for line in (Path(__file__).resolve().parents[2] / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c: paramiko.SSHClient, cmd: str) -> tuple[int, str]:
    print(f">>> {cmd[:160]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    out = (o.read() + e.read()).decode("utf-8", errors="replace").strip()
    code = o.channel.recv_exit_status()
    if out:
        print(out)
    return code, out


SQL = f"""
ATTACH DATABASE '{BACKUP}' AS src;
INSERT INTO User (username, password, name, phone, status, isActive, approvedAt, approvedByUserId, rejectedAt, rejectedByUserId, lastLoginAt, createdAt, updatedAt)
SELECT username, password, name, phone, status, isActive, approvedAt, approvedByUserId, rejectedAt, rejectedByUserId, lastLoginAt, createdAt, updatedAt
FROM src.User WHERE username = 'DYF'
AND NOT EXISTS (SELECT 1 FROM User WHERE username = 'DYF');
INSERT INTO UserRole (userId, roleId)
SELECT u.id, ur.roleId
FROM User u
JOIN src.User su ON su.username = 'DYF'
JOIN src.UserRole ur ON ur.userId = su.id
WHERE u.username = 'DYF'
AND NOT EXISTS (
  SELECT 1 FROM UserRole x WHERE x.userId = u.id AND x.roleId = ur.roleId
);
DETACH src;
"""


def main() -> None:
    pwd = load_password()
    if not pwd:
        sys.exit("Missing SSH_PASS")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    code, before = run(c, f'sqlite3 "{CURRENT}" "SELECT id,username,status FROM User;"')
    if code != 0:
        sys.exit(code)
    if "DYF" in before.upper():
        print("DYF already exists, skip")
        c.close()
        return

    if run(c, f'test -f "{BACKUP}"')[0] != 0:
        sys.exit(f"backup missing: {BACKUP}")

    sql_escaped = SQL.replace('"', '\\"')
    code, _ = run(c, f'sqlite3 "{CURRENT}" "{sql_escaped}"')
    if code != 0:
        sys.exit(code)

    run(c, f'sqlite3 "{CURRENT}" "SELECT id,username,name,status FROM User ORDER BY id;"')
    run(c, f'sqlite3 "{CURRENT}" "SELECT * FROM UserRole;"')
    run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 restart jade-accounting-server")
    c.close()
    print("restore-dyf OK")


if __name__ == "__main__":
    main()
