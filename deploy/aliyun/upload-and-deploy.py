#!/usr/bin/env python3
"""上传并部署和田玉记账系统到阿里云。需要环境变量 SSH_PASS。"""
from __future__ import annotations

import os
import re
import sys
import tempfile
import zipfile
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent))
from env_utils import build_server_env, parse_env_text
from prod_data_guard import forbid_local_db_overwrite, shell_preserve_production_data, shell_restore_preserved_data

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("SSH_PASS", "")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
PUBLIC_PATH = os.environ.get("JADE_PUBLIC_PATH", "/account/")
# 当前推荐：HTTP + IP（自签名 HTTPS 域名不作为默认入口）
PUBLIC_SCHEME = os.environ.get("JADE_PUBLIC_SCHEME", "http")
PUBLIC_HOST = os.environ.get("JADE_PUBLIC_HOST", HOST)
PUBLIC_DOMAIN = os.environ.get("JADE_PUBLIC_DOMAIN", "xiangyuzhubao.xyz")
PUBLIC_URL = f"{PUBLIC_SCHEME}://{PUBLIC_HOST}{PUBLIC_PATH if PUBLIC_PATH.endswith('/') else PUBLIC_PATH + '/'}"
WS_URL = f"ws://{HOST}{PUBLIC_PATH.rstrip('/')}/ws/worker"
REMOTE_ENV = f"{DEPLOY_DIR}/apps/server/.env"

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


def read_remote_env(client: paramiko.SSHClient) -> dict[str, str]:
    _, stdout, _ = client.exec_command(f"cat {REMOTE_ENV} 2>/dev/null || true", timeout=30)
    return parse_env_text(stdout.read().decode("utf-8", errors="replace"))


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
    if rel_norm.endswith("accounting.db"):
        return True
    if "/.env" in rel_norm and not rel_norm.endswith(".env.example"):
        return True
    return False


def build_production_web(app_version: str) -> None:
    """生产子路径 /account/ 必须用 VITE_APP_BASE，否则 index.html 引用 /assets/ 导致白屏。"""
    import subprocess

    if os.environ.get("DEPLOY_SKIP_BUILD") == "1":
        print("[deploy] DEPLOY_SKIP_BUILD=1，跳过本地构建")
        return

    env = {**os.environ, "VITE_APP_BASE": "/account/"}
    if app_version:
        env["APP_VERSION"] = app_version
    print("[deploy] 构建前端 VITE_APP_BASE=/account/")
    workspaces = (
        "@jade-account/shared",
        "@jade-account/server",
        "@jade-account/web",
        "@jade-account/worker",
    )
    for ws in workspaces:
        cmd = f"npm run build -w {ws}"
        r = subprocess.run(cmd, cwd=str(ROOT), env=env, shell=True)
        if r.returncode != 0:
            sys.exit(r.returncode)
    index = ROOT / "apps/web/dist/index.html"
    if not index.is_file() or 'src="/account/assets/' not in index.read_text(encoding="utf-8"):
        print("[deploy][FAIL] 前端 dist 未包含 /account/assets/ 路径", file=sys.stderr)
        sys.exit(1)


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


def write_worker_env_local(worker_token: str) -> None:
    worker_env = ROOT / "apps/worker/.env"
    lines = worker_env.read_text(encoding="utf-8").splitlines() if worker_env.exists() else []
    overrides = {
        "SERVER_WS_URL": WS_URL,
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
    print(f"本地 Worker 已同步 -> {WS_URL}")


def sync_local_token_from_remote(client: paramiko.SSHClient) -> str:
    remote = read_remote_env(client)
    token = remote.get("WORKER_WS_TOKEN", "")
    local_env = ROOT / "apps/worker/.env"
    local_token = ""
    if local_env.exists():
        local = parse_env_text(local_env.read_text(encoding="utf-8"))
        local_token = local.get("WORKER_WS_TOKEN", "")
    if token and token != local_token:
        print(f"[token] 检测到本地与远程不一致，已从远程同步（未轮换）")
        write_worker_env_local(token)
    elif token:
        write_worker_env_local(token)
    else:
        print("[token] 警告: 远程 WORKER_WS_TOKEN 为空，请执行 npm run rotate:worker-token", file=sys.stderr)
    return token


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    print(f"Upload {local.name} -> {remote}")
    sftp = client.open_sftp()
    try:
        sftp.put(str(local), remote)
    finally:
        sftp.close()


def main() -> None:
    forbid_local_db_overwrite()
    client = connect()
    try:
        existing = read_remote_env(client)
        app_version = os.environ.get("DEPLOY_APP_VERSION", "").strip()
        if not app_version:
            try:
                app_version = __import__("subprocess").check_output(
                    ["git", "rev-parse", "--short", "HEAD"],
                    cwd=str(ROOT),
                    text=True,
                ).strip()
            except Exception:
                app_version = ""
        if app_version:
            print(f"[deploy] APP_VERSION={app_version}")
        build_production_web(app_version)
        env_content, _, worker_token = build_server_env(
            existing,
            host=HOST,
            public_domain=PUBLIC_DOMAIN,
            app_version=app_version,
            force_rotate_worker=False,
            force_rotate_jwt=False,
        )
        if existing.get("WORKER_WS_TOKEN") and existing["WORKER_WS_TOKEN"] == worker_token:
            print("[deploy] 保留现有 WORKER_WS_TOKEN（未轮换）")
        else:
            print("[deploy] 使用新生成的 WORKER_WS_TOKEN（原 token 缺失或过弱）")

        with tempfile.TemporaryDirectory() as td:
            zip_path = Path(td) / "jade-accounting.zip"
            env_path = Path(td) / "server.env"
            build_zip(zip_path)
            env_path.write_text(env_content, encoding="utf-8")

            run(client, f"mkdir -p {DEPLOY_DIR} /www/backup /tmp/jade-upload")
            server_had_content = run(
                client,
                f"test -d {DEPLOY_DIR} && ls -A {DEPLOY_DIR} 2>/dev/null | head -1",
            ) == 0
            if server_had_content:
                ts = __import__("datetime").datetime.now().strftime("%Y%m%d-%H%M%S")
                run(client, f"cp -a {DEPLOY_DIR} /www/backup/jade-accounting-{ts}")
                print("[deploy] 服务器已有部署目录，已备份旧版本")
            else:
                print("[deploy] 服务器部署目录为空或不存在，将全新部署")

            sftp_put(client, zip_path, "/tmp/jade-upload/jade-accounting.zip")
            sftp_put(client, env_path, "/tmp/jade-upload/server.env")
            print("[deploy] 生产环境禁止上传/覆盖 accounting.db（数据优先）")

            pwd_file = ROOT / "secrets/initial-admin-password.txt"
            if pwd_file.exists():
                sftp_put(client, pwd_file, "/tmp/jade-upload/admin-password.txt")

        run(
            client,
            f"""
set -e
SSL_BACKUP=/tmp/jade-ssl-backup-$$
{shell_preserve_production_data(DEPLOY_DIR)}
if [ -d {DEPLOY_DIR}/ssl ]; then cp -a {DEPLOY_DIR}/ssl "$SSL_BACKUP"; fi
rm -rf {DEPLOY_DIR}
mkdir -p {DEPLOY_DIR}
unzip -q /tmp/jade-upload/jade-accounting.zip -d {DEPLOY_DIR}
if [ -d "$SSL_BACKUP" ]; then mkdir -p {DEPLOY_DIR}/ssl && cp -a "$SSL_BACKUP/." {DEPLOY_DIR}/ssl/; rm -rf "$SSL_BACKUP"; fi
mkdir -p {DEPLOY_DIR}/logs {DEPLOY_DIR}/exports {DEPLOY_DIR}/web
{shell_restore_preserved_data(DEPLOY_DIR)}
cp /tmp/jade-upload/server.env {DEPLOY_DIR}/apps/server/.env
sed -i 's/\\r$//' {DEPLOY_DIR}/deploy/aliyun/deploy.sh 2>/dev/null || true
chmod +x {DEPLOY_DIR}/deploy/aliyun/*.sh 2>/dev/null || true
""",
        )

        skip_seed = "1"
        code = run(client, f"cd {DEPLOY_DIR} && SKIP_SEED={skip_seed} bash deploy/aliyun/deploy.sh", timeout=3600)
        if code != 0:
            sys.exit(code)

        health_out = run(client, "curl -fsS http://127.0.0.1:4731/api/health")
        if app_version and health_out == 0:
            ver_check = run(
                client,
                f"curl -fsS http://127.0.0.1:4731/api/health | grep -q '{app_version}'",
            )
            if ver_check != 0:
                print(f"[deploy][WARN] /api/health.version 与 APP_VERSION={app_version} 不一致", file=sys.stderr)
            else:
                print(f"[deploy] /api/health.version OK: {app_version}")
        run(client, "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 status")

        apply_py = ROOT / "deploy/aliyun/fix-nginx-account80.py"
        if apply_py.exists():
            import subprocess
            subprocess.run([sys.executable, str(apply_py)], check=False, env={**os.environ, **{"SSH_PASS": load_ssh_pass()}})

        ssl_py = ROOT / "deploy/aliyun/enable-https-selfsigned.py"
        if ssl_py.exists():
            import subprocess
            r = subprocess.run([sys.executable, str(ssl_py)], env={**os.environ, **{"SSH_PASS": load_ssh_pass()}})
            if r.returncode != 0:
                print("[deploy][WARN] 自签名 HTTPS 恢复失败，HTTP 仍可用", file=sys.stderr)

        run(client, f"curl -fsS -o /dev/null -w '%{{http_code}}' http://127.0.0.1{PUBLIC_PATH}")

        sync_local_token_from_remote(client)

    finally:
        client.close()

    info = ROOT / "deploy/aliyun/last-deploy-info.json"
    info.write_text(
        f'{{"url":"{PUBLIC_URL}","ws":"{WS_URL}","host":"{HOST}","recommended":"http://{HOST}/account/","domainNote":"xiangyuzhubao.xyz 待备案/正式证书完成后启用"}}',
        encoding="utf-8",
    )
    print(f"\n=== 部署完成 ===")
    print(f"推荐手机访问: http://{HOST}/account/")
    print(f"HTTPS（自签名）: https://{HOST}/account/  （浏览器需点一次继续访问）")
    print(f"Worker WS: {WS_URL}")
    print(f"域名 HTTPS: 需先 ICP 备案，再用阿里云免费 DV 证书\n")


if __name__ == "__main__":
    main()
