#!/usr/bin/env python3
"""SSH 到生产服务器：只清业务数据，不删不改用户。"""
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
SCRIPT_LOCAL = ROOT / "apps/server/scripts/reset-business-data-only.ts"
SCRIPT_REMOTE = f"{DEPLOY_DIR}/apps/server/scripts/reset-business-data-only.ts"


def main() -> int:
    require_destructive_confirmation("remote-reset-business-data（清空生产业务数据）")
    client = mod.connect()
    try:
        sftp = client.open_sftp()
        try:
            sftp.put(str(SCRIPT_LOCAL), SCRIPT_REMOTE)
        finally:
            sftp.close()
        code = mod.run(
            client,
            f"cd {DEPLOY_DIR}/apps/server && npx tsx scripts/reset-business-data-only.ts",
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
