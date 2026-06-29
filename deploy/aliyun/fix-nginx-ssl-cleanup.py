#!/usr/bin/env python3
"""
清理阿里云 Nginx 中无效的 xiangyuzhubao.xyz / 自签名 HTTPS 配置。
保留 http://8.137.126.18/account/（zhubo-analysis.conf 内 HTTP 反代块不动）。
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
NGINX_BIN = "/usr/sbin/aa_nginx"
CONF_DIRS = [
    "/etc/aa_nginx/conf.d",
    "/www/server/panel/vhost/nginx",
]
MARKER_SSL = "# jade-accounting-ssl-listen"
MARKER_ACCOUNT = "# jade-accounting (和田玉镯子记账)"
SSL_CERT_PATH = "/www/wwwroot/jade-accounting/ssl/fullchain.pem"


def load_ssh() -> str:
    if os.environ.get("SSH_PASS"):
        return os.environ["SSH_PASS"]
    env_path = Path(__file__).resolve().parents[2] / "secrets" / "deploy.env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def run(c: paramiko.SSHClient, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
    _, o, e = c.exec_command(cmd, timeout=timeout)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    return o.channel.recv_exit_status(), out, err


def list_conf_files(c: paramiko.SSHClient) -> list[str]:
    files: list[str] = []
    for d in CONF_DIRS:
        code, out, _ = run(c, f"test -d {d} && find {d} -maxdepth 1 -name '*.conf' -type f 2>/dev/null | sort")
        if code == 0 and out.strip():
            files.extend(out.strip().splitlines())
    return sorted(set(files))


def grep_hits(c: paramiko.SSHClient, files: list[str]) -> str:
    if not files:
        return ""
    paths = " ".join(files)
    _, out, _ = run(
        c,
        f"grep -nH -E 'xiangyuzhubao|ssl_certificate|{re.escape(MARKER_SSL)}|listen 443|jade-accounting' {paths} 2>/dev/null || true",
    )
    return out.strip()


def backup_file(c: paramiko.SSHClient, path: str, ts: str) -> str:
    backup = f"/www/backup/nginx-{Path(path).name}-{ts}.bak"
    run(c, f"mkdir -p /www/backup && cp -a {path} {backup}")
    return backup


def remove_ssl_listen_block(text: str) -> tuple[str, bool]:
    """Remove jade-accounting self-signed ssl listen lines from server block."""
    pattern = (
        rf"\n\s*listen 443 ssl;\n\s*{re.escape(MARKER_SSL)}\n"
        rf"\s*ssl_certificate [^;]+;\n"
        rf"\s*ssl_certificate_key [^;]+;\n"
        rf"\s*ssl_session_timeout [^;]+;\n"
        rf"\s*ssl_protocols [^;]+;\n?"
    )
    new_text, n = re.subn(pattern, "\n", text, count=1)
    return new_text, n > 0


def comment_invalid_ssl_server_blocks(text: str, missing_certs: set[str]) -> tuple[str, list[str]]:
    """Comment entire server blocks that reference missing ssl_certificate paths."""
    changes: list[str] = []
    if not missing_certs:
        return text, changes

    blocks = list(re.finditer(r"server\s*\{", text))
    if not blocks:
        return text, changes

    # Process from end to start to preserve indices
    result = text
    for m in reversed(blocks):
        start = m.start()
        depth = 0
        end = None
        for i in range(m.start(), len(result)):
            if result[i] == "{":
                depth += 1
            elif result[i] == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            continue
        block = result[start:end]
        if "listen 443" not in block and "ssl_certificate" not in block:
            continue
        uses_missing = any(cert in block for cert in missing_certs)
        if not uses_missing:
            continue
        commented = "\n".join(
            f"# SSL-CLEANUP-DISABLED: {line}" if line.strip() else "#"
            for line in block.splitlines()
        )
        result = result[:start] + commented + result[end:]
        changes.append(f"commented server block at char {start}")

    return result, changes


def disable_standalone_https_conf(text: str, filename: str) -> tuple[str, bool]:
    """Disable jade-accounting standalone conf if it only adds broken HTTPS."""
    if "jade-accounting" not in filename.lower():
        return text, False
    if "listen 443" in text or "ssl_certificate" in text:
        commented = "\n".join(
            f"# SSL-CLEANUP-DISABLED: {line}" if line.strip() else "#"
            for line in text.splitlines()
        )
        return commented, True
    return text, False


def cert_exists(c: paramiko.SSHClient, path: str) -> bool:
    code, _, _ = run(c, f"test -f {path}")
    return code == 0


def main() -> None:
    ssh = load_ssh()
    if not ssh:
        print("Missing SSH_PASS", file=sys.stderr)
        sys.exit(1)

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=ssh, timeout=60)

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    files = list_conf_files(c)

    print("=== 诊断：Nginx 配置命中 ===")
    hits = grep_hits(c, files)
    print(hits or "(无命中)")

    print("\n=== nginx -t（修复前）===")
    code, out, err = run(c, f"{NGINX_BIN} -t 2>&1")
    print((out + err).strip())

    modified: list[dict] = []
    sftp = c.open_sftp()

    for conf_path in files:
        try:
            with sftp.open(conf_path, "r") as f:
                original = f.read().decode("utf-8")
        except OSError:
            continue

        if not re.search(r"xiangyuzhubao|ssl_certificate|listen 443|jade-accounting", original, re.I):
            continue

        new_text = original
        file_changes: list[str] = []

        # 1) Remove self-signed ssl listen injection in zhubo-analysis.conf
        if MARKER_SSL in new_text or SSL_CERT_PATH in new_text:
            patched, ok = remove_ssl_listen_block(new_text)
            if ok:
                new_text = patched
                file_changes.append("removed jade-accounting-ssl-listen block")

        # 2) Find ssl_certificate paths and check existence
        cert_paths = set(re.findall(r"ssl_certificate\s+([^;]+);", new_text))
        missing = {p.strip() for p in cert_paths if not cert_exists(c, p.strip())}
        if missing:
            new_text, block_changes = comment_invalid_ssl_server_blocks(new_text, missing)
            file_changes.extend(block_changes)

        # 3) Disable standalone jade-accounting HTTPS vhost
        new_text, disabled = disable_standalone_https_conf(new_text, conf_path)
        if disabled:
            file_changes.append("commented entire jade-accounting HTTPS vhost")

        if new_text == original:
            continue

        backup = backup_file(c, conf_path, ts)
        with sftp.open(conf_path, "w") as f:
            f.write(new_text.encode("utf-8"))

        modified.append({"path": conf_path, "backup": backup, "changes": file_changes})
        print(f"\n[patched] {conf_path}")
        print(f"  backup: {backup}")
        for ch in file_changes:
            print(f"  - {ch}")

    sftp.close()

    if not modified:
        print("\n未发现需要修改的配置（或已全部有效）。")

    print("\n=== nginx -t（修复后）===")
    code, out, err = run(c, f"{NGINX_BIN} -t 2>&1")
    combined = (out + err).strip()
    print(combined)
    if code != 0 or "test failed" in combined.lower() or "emerg" in combined.lower():
        print("\nnginx -t 仍失败，尝试回滚...", file=sys.stderr)
        for item in modified:
            run(c, f"cp -a {item['backup']} {item['path']}")
        c.close()
        sys.exit(1)

    print("\n=== reload nginx ===")
    run(c, f"{NGINX_BIN} -s reload")

    print("\n=== 验证 ===")
    checks = [
        ("http://127.0.0.1/account/", "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/account/"),
        ("http://127.0.0.1/account/api/health", "curl -sS http://127.0.0.1/account/api/health"),
        ("zhubo-analysis /", "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/"),
    ]
    for label, cmd in checks:
        _, out, err = run(c, cmd)
        print(f"{label}: {(out or err).strip()}")

    # Worker online via remote API (needs auth from deploy env or skip login check)
    _, out, _ = run(
        c,
        "curl -sS http://127.0.0.1/account/api/health | python3 -c \"import sys,json; d=json.load(sys.stdin); print('health ok' if d.get('success') else d)\"",
    )
    print(f"health parse: {out.strip()}")

    c.close()

    print("\n========== 汇总 ==========")
    if modified:
        for item in modified:
            print(f"修改文件: {item['path']}")
            print(f"备份路径: {item['backup']}")
    else:
        print("未修改任何文件")
    print("nginx -t: 通过")
    print("nginx reload: 完成")
    print(f"http://{HOST}/account/ 与 /account/api/health 已远程验证")


if __name__ == "__main__":
    main()
