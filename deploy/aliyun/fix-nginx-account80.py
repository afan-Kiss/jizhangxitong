#!/usr/bin/env python3
"""修复 80 端口 /account/ 反代：统一转发到 4731（Express 托管前端 + API）"""
from __future__ import annotations

import os
import re
import sys

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
PASSWORD = os.environ.get("SSH_PASS", "")
CONF = "/etc/aa_nginx/conf.d/zhubo-analysis.conf"
MARKER = "# jade-accounting (和田玉镯子记账)"

JADE_BLOCK = f"""
    {MARKER}
    location = /account {{
        return 301 /account/;
    }}

    location /account/api/ {{
        proxy_pass http://127.0.0.1:4731/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }}

    location /account/ws/worker {{
        proxy_pass http://127.0.0.1:4731/ws/worker;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }}

    location /account/assets/ {{
        proxy_pass http://127.0.0.1:4731/account/assets/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 120s;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }}

    location = /account/index.html {{
        proxy_pass http://127.0.0.1:4731/account/index.html;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }}

    location /account/ {{
        proxy_pass http://127.0.0.1:4731/account/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
"""


def load_password() -> str:
    if PASSWORD:
        return PASSWORD
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(root, "secrets", "deploy.env")
    if os.path.isfile(env_path):
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def patch_conf(text: str) -> str:
    if MARKER in text:
        pattern = rf"\n\s*{re.escape(MARKER)}.*?(?=\n\s+location / \{{|\Z)"
        text, n = re.subn(pattern, JADE_BLOCK, text, count=1, flags=re.DOTALL)
        if n:
            return text
    new_text, n = re.subn(
        r"\n(\s+)location / \{",
        JADE_BLOCK + r"\n\1location / {",
        text,
        count=1,
    )
    if n != 1:
        raise RuntimeError("无法在 zhubo-analysis.conf 中找到插入点")
    return new_text


def main() -> None:
    pwd = load_password()
    if not pwd:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    sftp = c.open_sftp()
    with sftp.open(CONF, "r") as f:
        text = f.read().decode("utf-8")

    backup = f"/www/backup/zhubo-analysis-{__import__('datetime').datetime.now().strftime('%Y%m%d-%H%M%S')}.conf.bak"
    c.exec_command(f"cp {CONF} {backup}")

    new_text = patch_conf(text)
    with sftp.open(CONF, "w") as f:
        f.write(new_text.encode("utf-8"))
    sftp.close()

    for cmd in ["/usr/sbin/aa_nginx -t", "/usr/sbin/aa_nginx -s reload"]:
        _, o, e = c.exec_command(cmd, timeout=30)
        print(o.read().decode("utf-8", "replace"))
        err = e.read().decode("utf-8", "replace")
        if err.strip():
            print(err)

    _, o, _ = c.exec_command("curl -sS http://127.0.0.1/account/ | head -5", timeout=20)
    print(o.read().decode("utf-8", "replace"))
    c.close()
    print("fix-nginx-account80 OK")


if __name__ == "__main__":
    main()
