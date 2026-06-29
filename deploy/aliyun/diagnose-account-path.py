#!/usr/bin/env python3
"""诊断并修复 80 端口 /account/ 反代"""
import os
import sys

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")


def run(client, cmd: str) -> None:
    print(f"\n>>> {cmd[:200]}")
    _, o, e = client.exec_command(cmd, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    if code != 0:
        print(f"exit {code}")


def main() -> None:
    if not PASSWORD:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=PASSWORD, timeout=60)

    run(c, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4732/account/")
    run(c, "curl -sS http://127.0.0.1:4732/account/ | head -5")
    run(c, "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:4731/api/health")
    run(c, "curl -sS http://127.0.0.1/account/ | head -5")
    run(c, "grep -n 'jade-accounting\\|/account' /etc/aa_nginx/conf.d/zhubo-analysis.conf | head -30")
    run(c, "grep -n 'listen' /etc/aa_nginx/conf.d/zhubo-analysis.conf | head -10")
    run(c, "ls -la /www/wwwroot/jade-accounting/web/index.html")
    run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status | grep jade")

    c.close()


if __name__ == "__main__":
    main()
