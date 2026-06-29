"""部署环境变量：保留已有密钥，仅在缺失或弱值时生成新值。"""
from __future__ import annotations

import re
import secrets
from typing import Optional

WEAK_TOKEN_PATTERNS = (
    "",
    "change-this-in-production",
    "your-worker-token",
    "worker-token",
)


def parse_env_text(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^([A-Z0-9_]+)="?([^"]*)"?$', line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def token_is_weak(value: Optional[str]) -> bool:
    if not value:
        return True
    v = value.strip()
    if v.lower() in WEAK_TOKEN_PATTERNS:
        return True
    if len(v) < 16:
        return True
    return False


def resolve_secret(key: str, existing: dict[str, str], force_rotate: bool = False) -> str:
    current = existing.get(key, "")
    if not force_rotate and not token_is_weak(current):
        return current
    return secrets.token_hex(32)


def build_server_env(
    existing: dict[str, str],
    *,
    host: str,
    public_domain: str,
    force_rotate_worker: bool = False,
    force_rotate_jwt: bool = False,
) -> tuple[str, str, str]:
    """返回 (env_content, jwt_secret, worker_ws_token)"""
    jwt = resolve_secret("JWT_SECRET", existing, force_rotate_jwt)
    worker = resolve_secret("WORKER_WS_TOKEN", existing, force_rotate_worker)
    origins = f"http://{host},https://{host}"
    if public_domain and public_domain != host:
        origins += f",https://{public_domain},https://www.{public_domain}"

    env = f"""NODE_ENV=production
SERVER_PORT=4731
PORT=4731
DATABASE_URL="file:./data/accounting.db"
JWT_SECRET="{jwt}"
JWT_EXPIRES_IN=7d
WORKER_WS_TOKEN="{worker}"
CORS_ORIGIN="{origins}"
LOCAL_WORKER_REQUIRED=true
EXPORT_DIR="/www/wwwroot/jade-accounting/exports"
EXPORT_TMP_DIR="/www/wwwroot/jade-accounting/exports"
TEMP_UPLOAD_DIR="/www/wwwroot/jade-accounting/apps/server/tmp-uploads"
EXPORT_TOKEN_TTL_MINUTES=30
WORKER_RPC_TIMEOUT_MS=30000
PUBLIC_WEB_DIR="/www/wwwroot/jade-accounting/web"
"""
    return env, jwt, worker
