#!/usr/bin/env python3
"""部署后同步千帆 Cookie resolver（含主播分析回退）并重启相关服务。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
SECRETS_DIR = f"{DEPLOY_DIR}/secrets"
REMOTE_ENV = f"{DEPLOY_DIR}/apps/server/.env"
PM2_NAME = "qianfan-cookie-resolver"


def load_ssh_pass() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if pwd:
        return pwd
    env_file = ROOT / "secrets" / "deploy.env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c: paramiko.SSHClient, cmd: str) -> tuple[int, str]:
    print(f">>> {cmd[:160]}")
    _, o, e = c.exec_command(cmd, timeout=120)
    out = (o.read() + e.read()).decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        try:
            print(out.rstrip())
        except UnicodeEncodeError:
            print(out.encode("ascii", errors="replace").decode("ascii"))
    return code, out


def upsert_env(text: str, key: str, value: str) -> str:
    lines, seen = text.splitlines(), False
    out: list[str] = []
    for line in lines:
        if line.startswith(key + "="):
            out.append(f'{key}="{value}"')
            seen = True
        else:
            out.append(line)
    if not seen:
        out.append(f'{key}="{value}"')
    return "\n".join(out) + ("\n" if out else "")


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        sys.exit("缺少 SSH_PASS")

    resolver_src = Path(__file__).with_name("qianfan-cookie-resolver.mjs").read_text(encoding="utf-8")
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    run(c, f"mkdir -p {SECRETS_DIR} && chmod 700 {SECRETS_DIR}")
    sftp = c.open_sftp()
    with sftp.file(f"{SECRETS_DIR}/qianfan-cookie-resolver.mjs", "w") as f:
        f.write(resolver_src)
    sftp.close()
    run(c, f"chmod 600 {SECRETS_DIR}/qianfan-cookie-resolver.mjs")

    _, env_text = run(c, f"cat {REMOTE_ENV} 2>/dev/null || true")
    token = ""
    for line in env_text.splitlines():
        if line.startswith("CONTROL_SERVICE_TOKEN="):
            token = line.split("=", 1)[1].strip().strip('"')
    if not token:
        sys.exit("远程 .env 缺少 CONTROL_SERVICE_TOKEN")

    new_env = upsert_env(env_text, "ZHUBO_ANALYSIS_URL", "http://127.0.0.1:4723")
    with c.open_sftp().file(REMOTE_ENV, "w") as f:
        f.write(new_env)

    pm2_env = (
        f"PORT=4790 COOKIES_PATH={SECRETS_DIR}/qianfan-cookies.json "
        f"ZHUBO_ANALYSIS_URL=http://127.0.0.1:4723 SERVICE_TOKEN={token}"
    )
    run(
        c,
        "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; "
        f"pm2 delete {PM2_NAME} 2>/dev/null || true; "
        f"cd {SECRETS_DIR} && {pm2_env} pm2 start qianfan-cookie-resolver.mjs --name {PM2_NAME} && pm2 save",
    )
    run(c, "sleep 2 && curl -sf http://127.0.0.1:4790/api/health")
    run(
        c,
        "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; "
        "pm2 restart jade-accounting-server && pm2 save",
    )
    run(c, "sleep 2 && curl -sf http://127.0.0.1:4731/api/health")
    c.close()
    print("\nCookie resolver 已同步（含主播分析回退），记账服务已重启。")


if __name__ == "__main__":
    main()
