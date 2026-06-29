#!/usr/bin/env python3
"""为 xiangyuzhubao.xyz 申请 Let's Encrypt 并启用 HTTPS /account/"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
DOMAIN = os.environ.get("JADE_PUBLIC_DOMAIN", "xiangyuzhubao.xyz")
CONF = "/etc/aa_nginx/conf.d/zhubo-analysis.conf"
ACME_ROOT = "/var/www/acme-challenge"
CERT_DIR = f"/etc/letsencrypt/live/{DOMAIN}"
MARKER_ACME = "# jade-acme-challenge"
MARKER_SSL = "# jade-accounting-ssl-listen"


def load_password() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if pwd:
        return pwd
    root = Path(__file__).resolve().parents[2]
    env_path = root / "secrets" / "deploy.env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 300) -> tuple[int, str]:
    print(f">>> {cmd[:160]}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    return code, out + err


def patch_conf(text: str) -> str:
    if MARKER_ACME not in text:
        acme = f"""
    {MARKER_ACME}
    location ^~ /.well-known/acme-challenge/ {{
        root {ACME_ROOT};
        default_type "text/plain";
        allow all;
    }}
"""
        text, n = re.subn(
            r"\n(\s+)# jade-accounting \(和田玉镯子记账\)",
            acme + r"\n\1# jade-accounting (和田玉镯子记账)",
            text,
            count=1,
        )
        if n != 1:
            raise RuntimeError("acme insert failed")

    if MARKER_SSL not in text:
        text, n = re.subn(
            r"(\nserver \{\n)(\s+listen 80;)",
            rf"\1\2\n    listen 443 ssl;\n    {MARKER_SSL}\n    ssl_certificate {CERT_DIR}/fullchain.pem;\n    ssl_certificate_key {CERT_DIR}/privkey.pem;\n    ssl_session_timeout 1d;\n    ssl_protocols TLSv1.2 TLSv1.3;",
            text,
            count=1,
        )
        if n != 1:
            raise RuntimeError("ssl listen insert failed")
    return text


def main() -> None:
    pwd = load_password()
    if not pwd:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pwd, timeout=60)

    run(c, f"mkdir -p {ACME_ROOT}")
    run(c, f"iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true")
    run(c, "firewall-cmd --permanent --add-port=443/tcp 2>/dev/null && firewall-cmd --reload 2>/dev/null || true")

    sftp = c.open_sftp()
    with sftp.open(CONF, "r") as f:
        text = f.read().decode("utf-8")

    # First pass: only acme if no cert yet
    if MARKER_ACME not in text:
        acme_only = re.sub(
            r"\n(\s+)# jade-accounting \(和田玉镯子记账\)",
            f"""
    {MARKER_ACME}
    location ^~ /.well-known/acme-challenge/ {{
        root {ACME_ROOT};
        default_type "text/plain";
        allow all;
    }}
\n\\1# jade-accounting (和田玉镯子记账)""",
            text,
            count=1,
        )
        backup = f"/www/backup/zhubo-analysis-pre-ssl-{__import__('datetime').datetime.now().strftime('%Y%m%d-%H%M%S')}.conf.bak"
        c.exec_command(f"cp {CONF} {backup}")
        with sftp.open(CONF, "w") as f:
            f.write(acme_only.encode("utf-8"))
        run(c, "/usr/sbin/aa_nginx -t && /usr/sbin/aa_nginx -s reload")

    cert_cmd = (
        f"certbot certonly --webroot -w {ACME_ROOT} "
        f"-d {DOMAIN} -d www.{DOMAIN} "
        "--non-interactive --agree-tos --register-unsafely-without-email "
        "--cert-name {DOMAIN} 2>&1 || certbot certonly --webroot -w {ACME_ROOT} "
        f"-d {DOMAIN} -d www.{DOMAIN} --non-interactive --agree-tos "
        f"-m admin@{DOMAIN} --cert-name {DOMAIN} 2>&1"
    )
    code, _ = run(c, cert_cmd, timeout=600)
    if code != 0:
        print("certbot failed", file=sys.stderr)
        c.close()
        sys.exit(code)

    with sftp.open(CONF, "r") as f:
        text = f.read().decode("utf-8")
    new_text = patch_conf(text)
    with sftp.open(CONF, "w") as f:
        f.write(new_text.encode("utf-8"))
    sftp.close()

    code, _ = run(c, "/usr/sbin/aa_nginx -t")
    if code != 0:
        sys.exit(code)
    run(c, "/usr/sbin/aa_nginx -s reload")

    run(c, f"curl -sS -o /dev/null -w '%{{http_code}}' https://127.0.0.1/account/ -k")
    run(c, f"curl -sS https://127.0.0.1/account/api/health -k")
    c.close()
    print("enable-https OK")


if __name__ == "__main__":
    main()
