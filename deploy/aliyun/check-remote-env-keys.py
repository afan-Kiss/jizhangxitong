#!/usr/bin/env python3
"""检查远程 server.env 中的千帆/Cookie 相关配置（不打印完整 token）。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import parse_env_text

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
REMOTE_ENV = "/www/wwwroot/jade-accounting/apps/server/.env"
KEYS = (
    "CONTROL_SERVICE_TOKEN",
    "CONTROL_SERVER_URL",
    "XHS_COOKIE_PROJECT",
    "QIANFAN_ORDER_DETAIL_URL_TEMPLATE",
)


def load_ssh_pass() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if pwd:
        return pwd
    env_file = Path(__file__).resolve().parents[2] / "secrets" / "deploy.env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def mask(val: str) -> str:
    v = val.strip()
    if not v:
        return "(empty)"
    if len(v) <= 8:
        return "***"
    return f"{v[:4]}...{v[-4:]} (len={len(v)})"


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        sys.exit("缺少 SSH_PASS")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=pwd, timeout=60)
    try:
        _, stdout, _ = c.exec_command(f"cat {REMOTE_ENV} 2>/dev/null || true", timeout=30)
        env = parse_env_text(stdout.read().decode("utf-8", errors="replace"))
        print(f"Remote: {REMOTE_ENV}\n")
        for key in KEYS:
            print(f"  {key}: {mask(env.get(key, ''))}")

        _, stdout2, _ = c.exec_command(
            "ls -dt /www/backup/jade-accounting-* 2>/dev/null | head -5",
            timeout=30,
        )
        backups = [b for b in stdout2.read().decode().strip().splitlines() if b.strip()]
        print("\nRecent backups with CONTROL_SERVICE_TOKEN:")
        for bp in backups:
            _, stdout3, _ = c.exec_command(f"cat {bp}/apps/server/.env 2>/dev/null || true", timeout=30)
            be = parse_env_text(stdout3.read().decode("utf-8", errors="replace"))
            tok = be.get("CONTROL_SERVICE_TOKEN", "")
            print(f"  {bp}: {mask(tok)}")
    finally:
        c.close()


if __name__ == "__main__":
    main()
