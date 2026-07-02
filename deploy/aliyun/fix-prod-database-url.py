#!/usr/bin/env python3
"""修正生产 DATABASE_URL 并重启服务（统一使用 prisma/data/accounting.db）。"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import paramiko

HOST = "8.137.126.18"
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
ENV_FILE = f"{DEPLOY_DIR}/apps/server/.env"
TARGET_URL = "file:./prisma/data/accounting.db"


def load_password() -> str:
    for line in (Path(__file__).resolve().parents[2] / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c, cmd: str) -> tuple[int, str]:
    _, o, e = c.exec_command(cmd, timeout=120)
    out = (o.read() + e.read()).decode("utf-8", "replace").strip()
    return o.channel.recv_exit_status(), out


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=load_password(), timeout=60)

    code, env_text = run(c, f"cat {ENV_FILE} 2>/dev/null || true")
    if code != 0:
        sys.exit(code)

    new_lines: list[str] = []
    seen = False
    for line in env_text.splitlines():
        if line.strip().startswith("DATABASE_URL="):
            new_lines.append(f'DATABASE_URL="{TARGET_URL}"')
            seen = True
        else:
            new_lines.append(line)
    if not seen:
        new_lines.insert(0, f'DATABASE_URL="{TARGET_URL}"')
    new_env = "\n".join(new_lines) + "\n"

    escaped = new_env.replace("'", "'\"'\"'")
    code, _ = run(c, f"printf '%s' '{escaped}' > {ENV_FILE}")
    if code != 0:
        sys.exit(code)

    script = f"""
set -e
grep DATABASE_URL {ENV_FILE}
export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null
pm2 restart jade-accounting-server --update-env
pm2 save
sleep 2
curl -sf http://127.0.0.1:4731/api/health
lsof -p $(pm2 pid jade-accounting-server) 2>/dev/null | grep accounting.db || true
"""
    code, out = run(c, script)
    print(out)
    c.close()
    if code != 0:
        sys.exit(code)
    if TARGET_URL.replace("file:", "") not in out and "prisma/data/accounting.db" not in out:
        print("WARN: 请确认进程已打开 prisma/data/accounting.db")


if __name__ == "__main__":
    main()
