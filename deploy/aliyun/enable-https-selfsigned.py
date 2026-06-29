#!/usr/bin/env python3
"""启用 HTTPS（自签名证书，含域名与 IP SAN）"""
import os
import re
import sys
from pathlib import Path

import paramiko

HOST = "8.137.126.18"
DOMAIN = "xiangyuzhubao.xyz"
CONF = "/etc/aa_nginx/conf.d/zhubo-analysis.conf"
SSL_DIR = "/www/wwwroot/jade-accounting/ssl"
MARKER_SSL = "# jade-accounting-ssl-listen"


def load_ssh() -> str:
    p = Path(__file__).resolve().parents[2] / "secrets" / "deploy.env"
    if p.is_file():
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("SSH_PASS", "")


def run(c, cmd, timeout=120):
    print(f">>> {cmd[:140]}")
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    code = o.channel.recv_exit_status()
    if out.strip():
        print(out.rstrip())
    if err.strip():
        print(err.rstrip())
    return code


def main() -> None:
    ssh = load_ssh()
    if not ssh:
        sys.exit("Missing SSH_PASS")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=ssh, timeout=60)

    run(c, f"mkdir -p {SSL_DIR}")
    openssl_cmd = (
        f"openssl req -x509 -nodes -days 825 -newkey rsa:2048 "
        f"-keyout {SSL_DIR}/privkey.pem -out {SSL_DIR}/fullchain.pem "
        f"-subj '/CN={DOMAIN}' "
        f"-addext 'subjectAltName=DNS:{DOMAIN},DNS:www.{DOMAIN},IP:8.137.126.18' 2>&1 "
        f"|| openssl req -x509 -nodes -days 825 -newkey rsa:2048 "
        f"-keyout {SSL_DIR}/privkey.pem -out {SSL_DIR}/fullchain.pem "
        f"-subj '/CN={DOMAIN}'"
    )
    run(c, openssl_cmd)
    run(c, "iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true")
    run(c, "firewall-cmd --permanent --add-port=443/tcp 2>/dev/null && firewall-cmd --reload 2>/dev/null || true")

    sftp = c.open_sftp()
    with sftp.open(CONF, "r") as f:
        text = f.read().decode("utf-8")

    if MARKER_SSL not in text:
        text, n = re.subn(
            r"(\nserver \{\n)(\s+listen 80;)",
            rf"\1\2\n    listen 443 ssl;\n    {MARKER_SSL}\n    ssl_certificate {SSL_DIR}/fullchain.pem;\n    ssl_certificate_key {SSL_DIR}/privkey.pem;\n    ssl_session_timeout 1d;\n    ssl_protocols TLSv1.2 TLSv1.3;",
            text,
            count=1,
        )
        if n != 1:
            sys.exit("ssl listen patch failed")
        backup = f"/www/backup/zhubo-analysis-ssl-{__import__('datetime').datetime.now().strftime('%Y%m%d-%H%M%S')}.conf.bak"
        c.exec_command(f"cp {CONF} {backup}")
        with sftp.open(CONF, "w") as f:
            f.write(text.encode("utf-8"))
    sftp.close()

    run(c, "/usr/sbin/aa_nginx -t")
    run(c, "/usr/sbin/aa_nginx -s reload")
    run(c, "curl -sS -o /dev/null -w '%{http_code}' https://127.0.0.1/account/ -k")
    run(c, "curl -sS https://127.0.0.1/account/api/health -k")
    c.close()
    print("enable-https-selfsigned OK")


if __name__ == "__main__":
    main()
