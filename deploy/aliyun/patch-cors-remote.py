#!/usr/bin/env python3
import paramiko
from pathlib import Path

pwd = Path("secrets/deploy.env").read_text(encoding="utf-8").split("SSH_PASS=")[1].strip().split()[0]
origins = "https://xiangyuzhubao.xyz,https://www.xiangyuzhubao.xyz,https://8.137.126.18,http://8.137.126.18"
env_path = "/www/wwwroot/jade-accounting/apps/server/.env"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("8.137.126.18", username="root", password=pwd, timeout=60)
for cmd in [
    f"grep CORS_ORIGIN {env_path}",
    f"sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN=\"{origins}\"|' {env_path}",
    f"grep CORS_ORIGIN {env_path}",
    "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 restart jade-accounting-server",
]:
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err)
c.close()
