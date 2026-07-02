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

# 部署时从线上 .env 原样保留（避免覆盖千帆 Cookie 令牌、千帆链接模板等）
PRESERVE_ENV_KEYS = (
    "CONTROL_SERVICE_TOKEN",
    "CONTROL_SERVER_URL",
    "XHS_COOKIE_PROJECT",
    "ZHUBO_ANALYSIS_URL",
    "QIANFAN_ORDER_DETAIL_URL_TEMPLATE",
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


def merge_preserved_env(existing: dict[str, str], backup: dict[str, str] | None = None) -> dict[str, str]:
    """当前 .env 优先；缺失时从本次部署备份的 .env 补回。"""
    merged = dict(existing)
    if backup:
        for key in PRESERVE_ENV_KEYS:
            if not merged.get(key, "").strip() and backup.get(key, "").strip():
                merged[key] = backup[key]
    return merged


def normalize_database_url(url: Optional[str], deploy_dir: str = "/www/wwwroot/jade-accounting") -> str:
    u = (url or "").strip()
    if u in ("", "file:./data/accounting.db", "file:./prisma/data/accounting.db"):
        return f"file:{deploy_dir}/apps/server/prisma/data/accounting.db"
    return u


def format_env_lines(values: dict[str, str]) -> str:
    order = [
        "NODE_ENV",
        "SERVER_PORT",
        "PORT",
        "APP_VERSION",
        "DATABASE_URL",
        "JWT_SECRET",
        "JWT_EXPIRES_IN",
        "WORKER_WS_TOKEN",
        "CORS_ORIGIN",
        "LOCAL_WORKER_REQUIRED",
        "EXPORT_DIR",
        "EXPORT_TMP_DIR",
        "TEMP_UPLOAD_DIR",
        "EXPORT_TOKEN_TTL_MINUTES",
        "WORKER_RPC_TIMEOUT_MS",
        "PUBLIC_WEB_DIR",
        "SCAN_WORKBENCH_ENABLED",
        "SCAN_BINDING_ENABLED",
        *PRESERVE_ENV_KEYS,
    ]
    seen: set[str] = set()
    lines: list[str] = []
    for key in order:
        if key in values and values[key] != "":
            lines.append(f'{key}="{values[key]}"')
            seen.add(key)
    for key, val in values.items():
        if key not in seen and val != "":
            lines.append(f'{key}="{val}"')
    return "\n".join(lines) + "\n"


def build_server_env(
    existing: dict[str, str],
    *,
    host: str,
    public_domain: str,
    app_version: str = "",
    force_rotate_worker: bool = False,
    force_rotate_jwt: bool = False,
    backup_env: dict[str, str] | None = None,
) -> tuple[str, str, str]:
    """返回 (env_content, jwt_secret, worker_ws_token)"""
    merged = merge_preserved_env(existing, backup_env)
    jwt = resolve_secret("JWT_SECRET", merged, force_rotate_jwt)
    worker = resolve_secret("WORKER_WS_TOKEN", merged, force_rotate_worker)
    origins = f"http://{host},https://{host}"
    if public_domain and public_domain != host:
        origins += f",https://{public_domain},https://www.{public_domain}"

    values: dict[str, str] = {
        "NODE_ENV": "production",
        "SERVER_PORT": "4731",
        "PORT": "4731",
        "DATABASE_URL": normalize_database_url(merged.get("DATABASE_URL")),
        "JWT_SECRET": jwt,
        "JWT_EXPIRES_IN": merged.get("JWT_EXPIRES_IN") or "7d",
        "WORKER_WS_TOKEN": worker,
        "CORS_ORIGIN": origins,
        "LOCAL_WORKER_REQUIRED": merged.get("LOCAL_WORKER_REQUIRED") or "true",
        "EXPORT_DIR": merged.get("EXPORT_DIR") or "/www/wwwroot/jade-accounting/exports",
        "EXPORT_TMP_DIR": merged.get("EXPORT_TMP_DIR") or "/www/wwwroot/jade-accounting/exports",
        "TEMP_UPLOAD_DIR": merged.get("TEMP_UPLOAD_DIR") or "/www/wwwroot/jade-accounting/apps/server/tmp-uploads",
        "EXPORT_TOKEN_TTL_MINUTES": merged.get("EXPORT_TOKEN_TTL_MINUTES") or "30",
        "WORKER_RPC_TIMEOUT_MS": merged.get("WORKER_RPC_TIMEOUT_MS") or "30000",
        "PUBLIC_WEB_DIR": merged.get("PUBLIC_WEB_DIR") or "/www/wwwroot/jade-accounting/web",
        "SCAN_WORKBENCH_ENABLED": merged.get("SCAN_WORKBENCH_ENABLED") or "true",
        "SCAN_BINDING_ENABLED": merged.get("SCAN_BINDING_ENABLED") or "true",
    }
    if app_version:
        values["APP_VERSION"] = app_version
    for key in PRESERVE_ENV_KEYS:
        val = merged.get(key, "").strip()
        if val:
            values[key] = val
    if not values.get("ZHUBO_ANALYSIS_URL"):
        values["ZHUBO_ANALYSIS_URL"] = "http://127.0.0.1:4723"

    return format_env_lines(values), jwt, worker
