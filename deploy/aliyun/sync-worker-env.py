#!/usr/bin/env python3
"""从远程同步 WORKER_WS_TOKEN 到本地 worker .env（不轮换）"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
WS_URL = f"ws://{HOST}/account/ws/worker"
REMOTE_ENV = "/www/wwwroot/jade-accounting/apps/server/.env"


def load_ssh_pass() -> str:
    if os.environ.get("SSH_PASS"):
        return os.environ["SSH_PASS"]
    env_file = ROOT / "secrets" / "deploy.env"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        print("缺少 SSH_PASS", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pwd, timeout=60)
    try:
        _, stdout, _ = client.exec_command(f"grep WORKER_WS_TOKEN {REMOTE_ENV}", timeout=30)
        line = stdout.read().decode().strip()
        m = re.search(r'WORKER_WS_TOKEN="([^"]+)"', line)
        if not m:
            print("远程 WORKER_WS_TOKEN 未找到", file=sys.stderr)
            sys.exit(1)
        token = m.group(1)
    finally:
        client.close()

    worker_env = ROOT / "apps/worker/.env"
    lines = worker_env.read_text(encoding="utf-8").splitlines() if worker_env.exists() else []
    overrides = {"SERVER_WS_URL": WS_URL, "WORKER_WS_TOKEN": token}
    out, seen = [], set()
    key_re = re.compile(r"^([A-Z0-9_]+)=")
    for ln in lines:
        km = key_re.match(ln.strip())
        if km and km.group(1) in overrides:
            out.append(f"{km.group(1)}={overrides[km.group(1)]}")
            seen.add(km.group(1))
        else:
            out.append(ln)
    for k, v in overrides.items():
        if k not in seen:
            out.append(f"{k}={v}")
    worker_env.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"已同步 Worker -> {WS_URL}")


if __name__ == "__main__":
    main()
