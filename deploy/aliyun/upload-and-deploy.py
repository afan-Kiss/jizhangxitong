#!/usr/bin/env python3
"""上传并部署和田玉记账系统到阿里云。需要环境变量 SSH_PASS。"""
from __future__ import annotations

import os
import re
import secrets
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
PUBLIC_HTTP_PORT = os.environ.get("JADE_PUBLIC_PORT", "443")
PUBLIC_PATH = os.environ.get("JADE_PUBLIC_PATH", "/account/")
PUBLIC_SCHEME = os.environ.get("JADE_PUBLIC_SCHEME", "https")
PUBLIC_DOMAIN = os.environ.get("JADE_PUBLIC_DOMAIN", "xiangyuzhubao.xyz")
PUBLIC_HOST = os.environ.get("JADE_PUBLIC_HOST", PUBLIC_DOMAIN)
PUBLIC_URL = f"{PUBLIC_SCHEME}://{PUBLIC_HOST}{PUBLIC_PATH if PUBLIC_PATH.endswith('/') else PUBLIC_PATH + '/'}"

SKIP_DIRS = {"node_modules", ".git", "reports", "secrets", ".cursor"}
SKIP_PARTS = {"apps/worker/logs", "apps/server/exports", "apps/server/tmp-uploads"}


def load_ssh_pass() -> str:
    if PASSWORD:
        return PASSWORD
    env_file = ROOT / "secrets" / "deploy.env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def connect() -> paramiko.SSHClient:
    pwd = load_ssh_pass()
    if not pwd:
        print("缺少 SSH_PASS 环境变量或 secrets/deploy.env", file=sys.stderr)
        sys.exit(1)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=pwd, timeout=60)
    return c


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> int:
    print(f"\n>>> {cmd[:180]}...")
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    if out.strip():
        print(out.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    if err.strip():
        print(err.rstrip().encode(enc, errors="replace").decode(enc, errors="replace"))
    return code


def should_skip(rel: str) -> bool:
    parts = rel.replace("\\", "/").split("/")
    if parts[0] in SKIP_DIRS:
        return True
    rel_norm = rel.replace("\\", "/")
    for p in SKIP_PARTS:
        if p in rel_norm:
            return True
    if rel_norm.endswith(".db-journal") or rel_norm.endswith(".log"):
        return True
    if "/.env" in rel_norm and not rel_norm.endswith(".env.example"):
        return True
    return False


def build_zip(zip_path: Path) -> int:
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in ROOT.rglob("*"):
            if not path.is_file():
                continue
            rel = str(path.relative_to(ROOT))
            if should_skip(rel):
                continue
            zf.write(path, rel)
            count += 1
    print(f"Packed {count} files")
    return count


def build_env() -> str:
    jwt = secrets.token_hex(32)
    worker_token = secrets.token_hex(32)
    origins = f"https://{PUBLIC_DOMAIN},https://www.{PUBLIC_DOMAIN},https://{HOST},http://{HOST}"
    ws_scheme = "wss" if PUBLIC_SCHEME == "https" else "ws"
    return f"""NODE_ENV=production
SERVER_PORT=4731
PORT=4731
DATABASE_URL="file:./data/accounting.db"
JWT_SECRET="{jwt}"
JWT_EXPIRES_IN=7d
WORKER_WS_TOKEN="{worker_token}"
CORS_ORIGIN="{origins}"
LOCAL_WORKER_REQUIRED=true
EXPORT_DIR="/www/wwwroot/jade-accounting/exports"
EXPORT_TMP_DIR="/www/wwwroot/jade-accounting/exports"
TEMP_UPLOAD_DIR="/www/wwwroot/jade-accounting/apps/server/tmp-uploads"
EXPORT_TOKEN_TTL_MINUTES=30
WORKER_RPC_TIMEOUT_MS=30000
PUBLIC_WEB_DIR="/www/wwwroot/jade-accounting/web"
"""


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    print(f"Upload {local.name} -> {remote}")
    sftp = client.open_sftp()
    try:
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def write_worker_env_local(ws_url: str, worker_token: str) -> None:
    worker_env = ROOT / "apps/worker/.env"
    lines = []
    if worker_env.exists():
        lines = worker_env.read_text(encoding="utf-8").splitlines()
    overrides = {
        "SERVER_WS_URL": ws_url,
        "WORKER_WS_TOKEN": worker_token,
        "SCANNER_API_URL": "http://127.0.0.1:7789",
        "FILE_BASE_DIR": "D:/jewelry-account-files",
        "WORKER_ID": "local-worker-1",
        "WORKER_NAME": "本地记账Worker",
        "WORKER_LOG_DIR": "./logs",
    }
    out: list[str] = []
    seen: set[str] = set()
    key_re = re.compile(r"^([A-Z0-9_]+)=")
    for line in lines:
        m = key_re.match(line.strip())
        if m and m.group(1) in overrides:
            out.append(f"{m.group(1)}={overrides[m.group(1)]}")
            seen.add(m.group(1))
        else:
            out.append(line)
    for k, v in overrides.items():
        if k not in seen:
            out.append(f"{k}={v}")
    worker_env.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"Updated local worker .env -> {ws_url}")


def main() -> None:
    env_content = build_env()
    worker_token = re.search(r'WORKER_WS_TOKEN="([^"]+)"', env_content).group(1)
    ws_url = f"{ws_scheme}://{PUBLIC_HOST}{PUBLIC_PATH.rstrip('/')}/ws/worker"

    client = connect()
    try:
        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "jade-accounting.zip"
            env_path = Path(td) / "server.env"
            build_zip(zip_path)
            env_path.write_text(env_content, encoding="utf-8")

            run(client, f"mkdir -p {DEPLOY_DIR} /www/backup /tmp/jade-upload")
            if run(client, f"test -d {DEPLOY_DIR} && ls -A {DEPLOY_DIR} | head -1") == 0:
                ts = __import__("datetime").datetime.now().strftime("%Y%m%d-%H%M%S")
                run(client, f"cp -a {DEPLOY_DIR} /www/backup/jade-accounting-{ts}")

            sftp_put(client, zip_path, "/tmp/jade-upload/jade-accounting.zip")
            sftp_put(client, env_path, "/tmp/jade-upload/server.env")

            db = ROOT / "apps/server/prisma/data/accounting.db"
            skip_seed = "1" if db.exists() else "0"
            if db.exists():
                sftp_put(client, db, "/tmp/jade-upload/accounting.db")

            pwd_file = ROOT / "secrets/initial-admin-password.txt"
            if pwd_file.exists():
                sftp_put(client, pwd_file, "/tmp/jade-upload/admin-password.txt")

        run(
            client,
            f"""
set -e
rm -rf {DEPLOY_DIR}
mkdir -p {DEPLOY_DIR}
unzip -q /tmp/jade-upload/jade-accounting.zip -d {DEPLOY_DIR}
mkdir -p {DEPLOY_DIR}/apps/server/prisma/data {DEPLOY_DIR}/logs {DEPLOY_DIR}/exports {DEPLOY_DIR}/web
cp /tmp/jade-upload/server.env {DEPLOY_DIR}/apps/server/.env
if [ -f /tmp/jade-upload/accounting.db ]; then cp /tmp/jade-upload/accounting.db {DEPLOY_DIR}/apps/server/prisma/data/accounting.db; fi
sed -i 's/\\r$//' {DEPLOY_DIR}/deploy/aliyun/deploy.sh 2>/dev/null || true
chmod +x {DEPLOY_DIR}/deploy/aliyun/*.sh 2>/dev/null || true
""",
        )

        code = run(client, f"cd {DEPLOY_DIR} && SKIP_SEED={skip_seed} bash deploy/aliyun/deploy.sh", timeout=3600)
        if code != 0:
            sys.exit(code)

        run(client, f"curl -fsS http://127.0.0.1:4731/api/health")
        run(client, f"curl -fsS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:4732/account/")
        run(client, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status")

        # 80 端口 /account 反代（不影响主播分析系统根路径）
        apply_py = ROOT / "deploy/aliyun/fix-nginx-account80.py"
        if apply_py.exists():
            import subprocess
            subprocess.run([sys.executable, str(apply_py)], check=False, env={**os.environ, **{"SSH_PASS": load_ssh_pass()}})
        https_py = ROOT / "deploy/aliyun/enable-https-selfsigned.py"
        if https_py.exists() and PUBLIC_SCHEME == "https":
            subprocess.run([sys.executable, str(https_py)], check=False, env={**os.environ, **{"SSH_PASS": load_ssh_pass()}})

        run(client, f"curl -fsS -o /dev/null -w '%{{http_code}}' http://127.0.0.1{PUBLIC_PATH}")

    finally:
        client.close()

    write_worker_env_local(ws_url, worker_token)

    # 保存部署信息供验收
    info = ROOT / "deploy/aliyun/last-deploy-info.json"
    info.write_text(
        f'{{"url":"{PUBLIC_URL}","ws":"{ws_url}","host":"{HOST}","port":"{PUBLIC_HTTP_PORT}","path":"{PUBLIC_PATH}"}}',
        encoding="utf-8",
    )
    print(f"\n=== 部署完成 ===\n手机访问: {PUBLIC_URL}\nWorker WS: {ws_url}\n")


if __name__ == "__main__":
    main()
