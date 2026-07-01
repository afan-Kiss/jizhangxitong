#!/usr/bin/env python3
"""Upload server dist and pm2 restart (aaPanel nginx)."""
from pathlib import Path
import paramiko
import zipfile
import tempfile

HOST = "8.137.126.18"
ROOT = Path(__file__).resolve().parents[2]
DEPLOY_DIR = "/www/wwwroot/jade-accounting"


def load_password() -> str:
    for line in (ROOT / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c, cmd, timeout=120):
    print(f">>> {cmd[:120]}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = (o.read() + e.read()).decode("utf-8", errors="replace").strip()
    code = o.channel.recv_exit_status()
    if out:
        try:
            print(out)
        except UnicodeEncodeError:
            print(out.encode("ascii", errors="replace").decode("ascii"))
    return code


pwd = load_password()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=pwd, timeout=60)

dist = ROOT / "apps/server/dist"
with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tf:
    zip_path = Path(tf.name)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in dist.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(dist).as_posix())

sftp = c.open_sftp()
sftp.put(str(zip_path), "/tmp/jade-server-dist.zip")
sftp.close()
zip_path.unlink(missing_ok=True)

run(c, f"cd {DEPLOY_DIR}/apps/server && unzip -o /tmp/jade-server-dist.zip -d dist")
code = run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 restart jade-accounting-server")
if code != 0:
    run(c, f"cd {DEPLOY_DIR} && export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 start ecosystem.config.cjs")
run(c, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 save")
run(c, "sleep 3 && curl -fsS http://127.0.0.1:4731/api/health")
c.close()
print("server hotfix OK")
