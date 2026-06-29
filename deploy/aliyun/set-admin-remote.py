#!/usr/bin/env python3
"""远程重置 admin 密码"""
import os
import sys
import tempfile
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
REMOTE_SCRIPT = "/tmp/jade-set-admin.js"


def load_ssh() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if pwd:
        return pwd
    p = Path(__file__).resolve().parents[2] / "secrets" / "deploy.env"
    if p.is_file():
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> None:
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        print("缺少 ADMIN_PASSWORD", file=sys.stderr)
        sys.exit(1)

    ssh = load_ssh()
    if not ssh:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    js = f"""
const bcrypt = require('bcryptjs');
const {{ PrismaClient }} = require('@prisma/client');
const p = new PrismaClient();
(async () => {{
  const hash = await bcrypt.hash('{password.replace("\\\\", "\\\\\\\\").replace("'", "\\\\'")}', 10);
  await p.user.update({{ where: {{ username: 'admin' }}, data: {{ password: hash }} }});
  console.log('admin password updated');
  await p.$disconnect();
}})().catch((e) => {{ console.error(e); process.exit(1); }});
"""

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=ssh, timeout=60)

    sftp = c.open_sftp()
    with sftp.file(REMOTE_SCRIPT, "w") as f:
        f.write(js)
    sftp.close()

    cmd = f"cd {DEPLOY_DIR}/apps/server && NODE_PATH={DEPLOY_DIR}/node_modules node {REMOTE_SCRIPT}"
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print(err)
    code = o.channel.recv_exit_status()
    c.exec_command(f"rm -f {REMOTE_SCRIPT}")
    c.close()
    if code != 0:
        sys.exit(code)
    print("set-admin-remote OK")


if __name__ == "__main__":
    main()
