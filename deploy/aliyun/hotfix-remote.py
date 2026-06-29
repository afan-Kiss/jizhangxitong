#!/usr/bin/env python3
"""热修复远程服务：上传 server dist 并重启 PM2 + Nginx"""
import os
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"


def main() -> None:
    if not PASSWORD:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=PASSWORD, timeout=60)

    dist = ROOT / "apps/server/dist"
    eco = ROOT / "deploy/aliyun/ecosystem.config.cjs"
    nginx = ROOT / "deploy/aliyun/nginx-jade-accounting.conf"

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
        zip_path = Path(tf.name)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in dist.rglob("*"):
                if p.is_file():
                    rel = p.relative_to(dist).as_posix()
                    zf.write(p, f"dist/{rel}")
            zf.write(eco, "ecosystem.config.cjs")
            zf.write(nginx, "nginx-jade-accounting.conf")

    sftp = client.open_sftp()
    sftp.put(str(zip_path), "/tmp/jade-hotfix.zip")
    sftp.close()
    zip_path.unlink(missing_ok=True)

    cmds = [
        f"cd {DEPLOY_DIR}/apps/server && unzip -o /tmp/jade-hotfix.zip",
        f"cp {DEPLOY_DIR}/apps/server/ecosystem.config.cjs {DEPLOY_DIR}/ecosystem.config.cjs",
        f"mkdir -p {DEPLOY_DIR}/deploy/aliyun && cp {DEPLOY_DIR}/apps/server/nginx-jade-accounting.conf {DEPLOY_DIR}/deploy/aliyun/nginx-jade-accounting.conf",
        "which pm2 && pm2 delete jade-accounting-server 2>/dev/null || true",
        f"cd {DEPLOY_DIR} && pm2 start ecosystem.config.cjs",
        "pm2 save",
        "sleep 3",
        "curl -fsS http://127.0.0.1:4731/api/health",
        f"mkdir -p /www/server/panel/vhost/nginx /www/backup /www/wwwlogs",
        f"cp {DEPLOY_DIR}/deploy/aliyun/nginx-jade-accounting.conf /www/server/panel/vhost/nginx/jade-accounting.conf",
        "nginx -t && nginx -s reload || (nginx -t; exit 1)",
        "curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4732/",
        "iptables -I INPUT -p tcp --dport 4732 -j ACCEPT 2>/dev/null || true",
        "firewall-cmd --permanent --add-port=4732/tcp 2>/dev/null && firewall-cmd --reload 2>/dev/null || true",
    ]

    for cmd in cmds:
        print(">>>", cmd[:100])
        _, o, e = client.exec_command(cmd, timeout=120)
        out = o.read().decode("utf-8", "replace")
        err = e.read().decode("utf-8", "replace")
        code = o.channel.recv_exit_status()
        if out.strip():
            print(out.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
        if err.strip():
            print(err.rstrip().encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
        if code != 0:
            print(f"exit {code}")
            client.close()
            sys.exit(code)

    client.close()
    print("Hotfix OK")


if __name__ == "__main__":
    main()
