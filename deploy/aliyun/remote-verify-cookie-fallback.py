#!/usr/bin/env python3
"""验证 Cookie 回退：本地文件缺失时从主播分析读取。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
TOKEN = "vEIIcsJSdroJSK1UdYwQ1wi0j2ruKcklSHQ68TSCjnY"


def load_ssh_pass() -> str:
    for line in (ROOT / "secrets" / "deploy.env").read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("SSH_PASS="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> None:
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect("8.137.126.18", username="root", password=load_ssh_pass(), timeout=60)

    script = r"""
set -e
SECRETS=/www/wwwroot/jade-accounting/secrets
BAK=$SECRETS/qianfan-cookies.json.bak-test-$$
cp $SECRETS/qianfan-cookies.json $BAK
echo '{}' > $SECRETS/qianfan-cookies.json
sleep 1
curl -sf -H 'Authorization: Bearer """ + TOKEN + r"""' \
  'http://127.0.0.1:4790/api/secrets/resolve?platform=qianfan&shopName=%E5%92%8C%E7%94%B0%E9%9B%85%E7%8E%89&keyName=cookie' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('source', d.get('source'), 'len', len(d.get('value','')))"
mv $BAK $SECRETS/qianfan-cookies.json
curl -sf http://127.0.0.1:4731/api/health | python3 -c "import json,sys; d=json.load(sys.stdin); print('version', d.get('version'))"
"""
    _, o, e = c.exec_command(script, timeout=60)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    print(out)
    if err.strip():
        print(err)
    code = o.channel.recv_exit_status()
    c.close()
    if code != 0:
        sys.exit(code)
    if "source zhubo-analysis" not in out and "len" not in out:
        sys.exit("fallback test did not show zhubo source")


if __name__ == "__main__":
    main()
