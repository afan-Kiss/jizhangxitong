#!/usr/bin/env python3
"""更新四店千帆 Cookie、恢复 secrets 服务、配置记账系统 env，不覆盖 DB/用户。"""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = "8.137.126.18"
DEPLOY_DIR = "/www/wwwroot/jade-accounting"
SECRETS_DIR = f"{DEPLOY_DIR}/secrets"
REMOTE_ENV = f"{DEPLOY_DIR}/apps/server/.env"
PM2_NAME = "qianfan-cookie-resolver"
SERVICE_TOKEN = "vEIIcsJSdroJSK1UdYwQ1wi0j2ruKcklSHQ68TSCjnY"

COOKIES_FILE = ROOT / "secrets" / "qianfan-cookies-update.json"
REQUIRED_SHOPS = ("和田雅玉", "拾玉居和田玉", "XY祥钰珠宝", "祥钰珠宝")


def load_shops() -> dict[str, str]:
    if not COOKIES_FILE.is_file():
        print(f"缺少 {COOKIES_FILE}", file=sys.stderr)
        sys.exit(1)
    data = json.loads(COOKIES_FILE.read_text(encoding="utf-8"))
    missing = [s for s in REQUIRED_SHOPS if not str(data.get(s, "")).strip()]
    if missing:
        print(f"Cookie 文件缺少店铺: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    return {shop: str(data[shop]).strip() for shop in REQUIRED_SHOPS}


def load_ssh_pass() -> str:
    for line in (ROOT / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str]:
    print(f">>> {cmd[:160]}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = (o.read() + e.read()).decode("utf-8", "replace")
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
        if out and out[-1].strip():
            out.append("")
        out.append(f'{key}="{value}"')
    return "\n".join(out) + ("\n" if out else "")


def build_cookies_json(shops: dict[str, str]) -> str:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = {shop: {"value": cookie, "updatedAt": now} for shop, cookie in shops.items()}
    return json.dumps(payload, ensure_ascii=False, indent=2)


def self_check(c: paramiko.SSHClient) -> None:
    print("\n=== 自查 ===")
    checks: list[tuple[str, bool, str]] = []

    _, out = run(c, "curl -sf http://127.0.0.1:4790/api/health")
    checks.append(("cookie-resolver health", '"ok":true' in out, out[:120]))

    _, out = run(c, "curl -sf http://8.137.126.18/control/api/health")
    checks.append(("public /control health", '"ok":true' in out, out[:120]))

    for shop in REQUIRED_SHOPS:
        q = urllib.parse.quote(shop)
        cmd = (
            f"curl -sf -H 'Authorization: Bearer {SERVICE_TOKEN}' "
            f"'http://127.0.0.1:4790/api/secrets/resolve?platform=qianfan&shopName={q}&keyName=cookie'"
        )
        _, out = run(c, cmd)
        ok = '"ok":true' in out and '"value"' in out
        checks.append((f"resolve {shop}", ok, out[:80]))

    _, out = run(c, "curl -sf http://127.0.0.1:4731/api/health")
    checks.append(("jade-accounting health", '"success":true' in out or '"ok":true' in out, out[:120]))

    _, out = run(
        c,
        f"grep -E '^(CONTROL_SERVICE_TOKEN|CONTROL_SERVER_URL)=' {REMOTE_ENV}",
    )
    checks.append(("CONTROL env configured", "CONTROL_SERVICE_TOKEN" in out, out.strip()))

    db_cmd = (
        f"python3 - <<'PY'\n"
        f"import sqlite3\n"
        f"db='{DEPLOY_DIR}/apps/server/prisma/data/accounting.db'\n"
        f"con=sqlite3.connect(db)\n"
        f"users=con.execute('select count(*) from User').fetchone()[0]\n"
        f"print('user_count', users)\n"
        f"PY"
    )
    _, out = run(c, db_cmd)
    checks.append(("users preserved", "user_count" in out and int(out.split()[-1]) >= 1, out.strip()))

    _, out = run(
        c,
        "export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; "
        "pm2 logs jade-accounting-server --lines 30 --nostream 2>&1 | tail -15",
        timeout=60,
    )
    bug_hits = [x for x in ["SHARED_BUSINESS_PERMISSIONS is not iterable", "ENOENT", "ECONNREFUSED"] if x in out]
    checks.append(("server logs clean", not bug_hits, ", ".join(bug_hits) or "ok"))

    failed = [name for name, ok, _ in checks if not ok]
    for name, ok, detail in checks:
        mark = "OK" if ok else "FAIL"
        print(f"[{mark}] {name}: {detail}")
    if failed:
        print(f"\n自查未通过: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    print("\n自查全部通过")


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        print("缺少 secrets/deploy.env SSH_PASS", file=sys.stderr)
        sys.exit(1)

    shops = load_shops()
    resolver_src = Path(__file__).with_name("qianfan-cookie-resolver.mjs").read_text(encoding="utf-8")
    cookies_json = build_cookies_json(shops)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    run(c, f"mkdir -p {SECRETS_DIR} && chmod 700 {SECRETS_DIR}")

    sftp = c.open_sftp()
    with sftp.file(f"{SECRETS_DIR}/qianfan-cookie-resolver.mjs", "w") as f:
        f.write(resolver_src)
    with sftp.file(f"{SECRETS_DIR}/qianfan-cookies.json", "w") as f:
        f.write(cookies_json)
    sftp.close()
    run(c, f"chmod 600 {SECRETS_DIR}/qianfan-cookies.json {SECRETS_DIR}/qianfan-cookie-resolver.mjs")

    _, env_text = run(c, f"cat {REMOTE_ENV} 2>/dev/null || true")
    new_env = upsert_env(env_text, "CONTROL_SERVICE_TOKEN", SERVICE_TOKEN)
    new_env = upsert_env(new_env, "CONTROL_SERVER_URL", "http://127.0.0.1:4790")
    new_env = upsert_env(new_env, "ZHUBO_ANALYSIS_URL", "http://127.0.0.1:4723")
    with c.open_sftp().file(REMOTE_ENV, "w") as f:
        f.write(new_env)

    pm2_env = (
        f"PORT=4790 COOKIES_PATH={SECRETS_DIR}/qianfan-cookies.json "
        f"ZHUBO_ANALYSIS_URL=http://127.0.0.1:4723 "
        f"SERVICE_TOKEN={SERVICE_TOKEN}"
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
    run(c, "sleep 3 && curl -sf http://127.0.0.1:4731/api/health")

    self_check(c)
    c.close()
    print("\n四店 Cookie 已更新，secrets 服务已恢复，记账系统已重启（未动 DB/用户）。")


if __name__ == "__main__":
    main()
