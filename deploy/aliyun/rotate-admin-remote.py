#!/usr/bin/env python3
"""远程更新 admin 密码（ADMIN_PASSWORD 环境变量，不打印明文）"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")


def load_ssh_pass() -> str:
    if os.environ.get("SSH_PASS"):
        return os.environ["SSH_PASS"]
    env_file = ROOT / "secrets" / "deploy.env"
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> None:
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        print("缺少 ADMIN_PASSWORD", file=sys.stderr)
        sys.exit(1)

    pwd = load_ssh_pass()
    if not pwd:
        print("缺少 SSH_PASS", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pwd, timeout=60)
    remote_tmp = "/tmp/jade-admin-rotate.env"
    try:
        sftp = client.open_sftp()
        with sftp.file(remote_tmp, "w") as f:
            f.write(f"ADMIN_PASSWORD={password}\n")
        sftp.close()

        cmd = (
            f"cd {DEPLOY_DIR} && set -a && . {remote_tmp} && set +a && "
            f"npx tsx apps/server/scripts/set-admin-password.ts && rm -f {remote_tmp}"
        )
        _, stdout, stderr = client.exec_command(cmd, timeout=180)
        out = stdout.read().decode()
        err = stderr.read().decode()
        code = stdout.channel.recv_exit_status()
        if out.strip():
            print(out.strip())
        if code != 0:
            print(err or "remote admin update failed", file=sys.stderr)
            sys.exit(code)
    finally:
        client.close()


if __name__ == "__main__":
    main()
