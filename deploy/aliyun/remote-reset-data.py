#!/usr/bin/env python3
"""SSH 到生产服务器执行 data:reset-keep-fanfan，只保留 fanfan 管理员。"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy" / "aliyun" / "upload-and-deploy.py"

sys.path.insert(0, str(ROOT / "deploy" / "aliyun"))
from prod_data_guard import require_destructive_confirmation

spec = importlib.util.spec_from_file_location("upload_and_deploy", DEPLOY)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

DEPLOY_DIR = mod.DEPLOY_DIR


def main() -> int:
    require_destructive_confirmation("remote-reset-data（清空生产业务数据，仅保留 fanfan）")
    client = mod.connect()
    try:
        code = mod.run(
            client,
            f"cd {DEPLOY_DIR} && npm run data:reset-keep-fanfan",
            timeout=300,
        )
        if code != 0:
            return code
        return mod.run(
            client,
            f"cd {DEPLOY_DIR} && export NVM_DIR=/root/.nvm && . /root/.nvm/nvm.sh 2>/dev/null; pm2 restart jade-accounting-server",
            timeout=120,
        )
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
