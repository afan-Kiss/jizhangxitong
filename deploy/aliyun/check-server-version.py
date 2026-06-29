#!/usr/bin/env python3
"""检查服务器部署版本与 assets 文件"""
import os
import sys
from pathlib import Path
import paramiko

HOST = "8.137.126.18"
DEPLOY_DIR = "/www/wwwroot/jade-accounting"


def load_ssh():
    p = Path(__file__).resolve().parents[2] / "secrets" / "deploy.env"
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("SSH_PASS", "")


def run(c, cmd):
    _, o, e = c.exec_command(cmd, timeout=60)
    return (o.read() + e.read()).decode("utf-8", "replace").strip()


def main():
    pwd = load_ssh()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)
    print("=== 服务器部署信息 ===")
    print(run(c, f"stat -c '%y %n' {DEPLOY_DIR}/web/index.html 2>/dev/null || echo missing"))
    print(run(c, f"ls -lt {DEPLOY_DIR}/web/assets/*.js 2>/dev/null | head -5"))
    print(run(c, f"grep -o 'src=\"[^\"]*\"' {DEPLOY_DIR}/web/index.html"))
    print(run(c, f"stat -c '%y' {DEPLOY_DIR}/apps/server/dist/index.js 2>/dev/null"))
    print(run(c, "pm2 describe jade-accounting-server 2>/dev/null | grep -E 'status|uptime|created at' | head -5"))
    c.close()


if __name__ == "__main__":
    main()
