#!/usr/bin/env python3
"""修复生产 DATABASE_URL 并同步本地数据库、重启 PM2"""
import os
import sys
from pathlib import Path

import paramiko

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
    if not PASSWORD:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=60)

    try:
        run(client, f"mkdir -p {DEPLOY_DIR}/apps/server/prisma/data")
        if DB_LOCAL.exists():
            sftp = client.open_sftp()
            sftp.put(str(DB_LOCAL), DB_REMOTE)
            sftp.close()
            print(f"Uploaded {DB_LOCAL.name} -> {DB_REMOTE}")

        run(
            client,
            f"sed -i 's|file:./prisma/data/accounting.db|file:./data/accounting.db|g' {ENV_PATH}",
        )
        run(
            client,
            f"grep DATABASE_URL {ENV_PATH} || true",
        )

        run(
            client,
            f"cd {DEPLOY_DIR} && npm run db:push -w @jade-account/server",
            timeout=600,
        )

        run(client, f"cp -f {DEPLOY_DIR}/deploy/aliyun/ecosystem.config.cjs {DEPLOY_DIR}/ecosystem.config.cjs")
        run(
            client,
            "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; "
            f"cd {DEPLOY_DIR} && pm2 delete jade-accounting-server 2>/dev/null || true; "
            "pm2 start ecosystem.config.cjs && pm2 save",
        )
        run(client, "sleep 3 && curl -fsS http://127.0.0.1:4731/api/health")

        pwd_file = ROOT / "secrets/initial-admin-password.txt"
        if pwd_file.exists():
            text = pwd_file.read_text(encoding="utf-8")
            import re

            m = re.search(r"密码:\s*(.+)", text)
            if m:
                pwd = m.group(1).strip().replace("'", "'\\''")
                login_cmd = (
                    f"curl -sS -X POST http://127.0.0.1:4731/api/auth/login "
                    f"-H 'Content-Type: application/json' "
                    f"-d '{{\"username\":\"admin\",\"password\":\"{pwd}\"}}'"
                )
                run(client, login_cmd)
    finally:
        client.close()

    print("fix-db-remote OK")


if __name__ == "__main__":
    main()
