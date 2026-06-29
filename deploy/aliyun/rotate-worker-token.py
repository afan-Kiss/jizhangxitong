#!/usr/bin/env python3
"""显式轮换远程 WORKER_WS_TOKEN 并同步本地 worker .env"""
from __future__ import annotations

import os
import re
import secrets
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
WS_URL = f"ws://{HOST}/account/ws/worker"
REMOTE_ENV = f"{DEPLOY_DIR}/apps/server/.env"


def load_ssh_pass() -> str:
    if os.environ.get("SSH_PASS"):
        return os.environ["SSH_PASS"]
    env_file = ROOT / "secrets" / "deploy.env"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def write_worker_env_local(token: str) -> None:
    worker_env = ROOT / "apps/worker/.env"
    lines = worker_env.read_text(encoding="utf-8").splitlines() if worker_env.exists() else []
    overrides = {
        "SERVER_WS_URL": WS_URL,
        "WORKER_WS_TOKEN": token,
    }
    out: list[str] = []
    seen: set[str] = set()
    key_re = re.compile(r"^([A-Z0-9_]+)=")
    for line in lines:
        m = key_re.match(line.strip())
        if m and m.group(1) in overrides:
            out.append(f"{m.group(1)}={overrides[m.group(1)]}")
            seen.add(m.group(1))
        else:
            out.append(line)
    for k, v in overrides.items():
        if k not in seen:
            out.append(f"{k}={v}")
    worker_env.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"本地 worker .env 已更新 -> {WS_URL}")


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        print("缺少 SSH_PASS", file=sys.stderr)
        sys.exit(1)

    new_token = secrets.token_hex(32)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pwd, timeout=60)
    try:
        cmd = (
            f"sed -i 's/^WORKER_WS_TOKEN=.*/WORKER_WS_TOKEN=\"{new_token}\"/' {REMOTE_ENV} && "
            f"grep WORKER_WS_TOKEN {REMOTE_ENV} | head -1"
        )
        _, stdout, stderr = client.exec_command(cmd, timeout=60)
        line = stdout.read().decode().strip()
        code = stdout.channel.recv_exit_status()
        if code != 0:
            print(stderr.read().decode(), file=sys.stderr)
            sys.exit(code)
        print(f"远程 WORKER_WS_TOKEN 已轮换 ({line[:40]}...)")
        run_cmd = (
            "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; "
            "pm2 restart jade-accounting-server"
        )
        client.exec_command(run_cmd, timeout=60)
    finally:
        client.close()

    write_worker_env_local(new_token)
    print("请等待 Worker 重连（约 10-30 秒）")


if __name__ == "__main__":
    main()
