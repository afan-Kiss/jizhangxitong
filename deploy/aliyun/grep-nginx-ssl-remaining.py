#!/usr/bin/env python3
import os
from pathlib import Path
import paramiko

pwd = ""
for line in (Path(__file__).resolve().parents[2] / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
    if line.strip().startswith("SSH_PASS="):
        pwd = line.split("=", 1)[1].strip().strip('"').strip("'")
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
_, o, _ = c.exec_command(
    "grep -rnH 'ssl_certificate\\|listen 443\\|jade-accounting-ssl' /etc/aa_nginx/conf.d /www/server/panel/vhost/nginx 2>/dev/null || echo '(none)'",
    timeout=30,
)
print(o.read().decode("utf-8", "replace"))
c.close()
