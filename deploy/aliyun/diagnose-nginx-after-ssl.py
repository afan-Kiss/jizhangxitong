#!/usr/bin/env python3
import os, sys
from pathlib import Path
import paramiko

HOST = "8.137.126.18"
pwd = os.environ.get("SSH_PASS", "")
if not pwd:
    for line in (Path(__file__).resolve().parents[2] / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            pwd = line.split("=", 1)[1].strip().strip('"').strip("'")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=pwd, timeout=60)
cmds = [
    "grep -n 'location /account' /etc/aa_nginx/conf.d/zhubo-analysis.conf",
    "curl -sS http://127.0.0.1:4731/api/health",
    "curl -sS http://127.0.0.1/account/api/health | head -c 200",
    "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/",
    "curl -sS -o /dev/null -w '%{http_code}' http://8.137.126.18/account/",
    "curl -sS http://8.137.126.18/account/api/health",
    "/usr/sbin/aa_nginx -t 2>&1",
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=30)
    print(">>>", cmd)
    print((o.read() + e.read()).decode("utf-8", "replace"))
c.close()
