#!/usr/bin/env python3
"""清理服务器上记账系统（jade-accounting）的备份与临时垃圾，不影响主播分析/祥钰系统。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
HOST = os.environ.get("DEPLOY_HOST", "8.137.126.18")
USER = os.environ.get("DEPLOY_USER", "root")
DEPLOY_DIR = "/www/wwwroot/jade-accounting"

CLEANUP_SCRIPT = r"""
set -e
echo "=== 清理前磁盘 ==="
df -h / /www 2>/dev/null || df -h /

echo ""
echo "=== 清理 /www/backup 下 jade-accounting 相关（保留最近 5 份）==="
ls -d /www/backup/jade-accounting-* 2>/dev/null | wc -l | xargs -I{} echo "jade-accounting 备份目录数: {}"
ls -dt /www/backup/jade-accounting-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
rm -f /www/backup/nginx-jade-accounting*.bak
echo "已清理旧 jade-accounting 备份（保留最近 5 份）"

echo ""
echo "=== 清理 /tmp 下 jade 临时文件 ==="
rm -rf /tmp/jade-upload /tmp/jade-data-preserve-* /tmp/jade-web-dist-hotfix
rm -f /tmp/jade-*.zip /tmp/jade-db-backup-*
echo "已清理 /tmp/jade*"

echo ""
echo "=== 清理记账系统内临时导出（保留数据库与 secrets）==="
rm -rf "$DEPLOY_DIR/apps/server/tmp-uploads"/*
rm -rf "$DEPLOY_DIR/apps/server/exports"/*
mkdir -p "$DEPLOY_DIR/apps/server/tmp-uploads" "$DEPLOY_DIR/apps/server/exports"
echo "已清空 tmp-uploads 与 exports"

echo ""
echo "=== 保留项检查（不应删除）==="
for p in /www/wwwroot/zhubo-analysis /www/wwwroot/jade-accounting; do
  test -d "$p" && echo "OK 保留: $p" || echo "WARN 缺失: $p"
done
ls /www/backup/zhubo-analysis* 2>/dev/null | head -3 || echo "zhubo backup conf 文件仍在（未删）"
ls -d /www/wwwroot/zhubo-analysis-backup-* 2>/dev/null | head -3 || echo "wwwroot zhubo backup 仍在（未删）"

echo ""
echo "=== 清理后 /www/backup 剩余 ==="
ls -lah /www/backup | head -30

echo ""
echo "=== 清理后磁盘 ==="
df -h / /www 2>/dev/null || df -h /

echo ""
echo "=== 记账系统健康检查 ==="
curl -sf http://127.0.0.1:4731/api/health || curl -sf http://127.0.0.1/account/api/health
echo ""
""".replace("$DEPLOY_DIR", DEPLOY_DIR)


def load_ssh_pass() -> str:
    pwd = os.environ.get("SSH_PASS", "")
    if pwd:
        return pwd
    env_file = ROOT / "secrets" / "deploy.env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("SSH_PASS="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> None:
    pwd = load_ssh_pass()
    if not pwd:
        sys.exit("缺少 SSH_PASS")

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=pwd, timeout=60)

    print(f"连接 {HOST}，开始清理记账系统备份/临时文件…")
    _, stdout, stderr = c.exec_command(CLEANUP_SCRIPT, timeout=600)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    print(out)
    if err.strip():
        print("STDERR:", err)
    c.close()
    if code != 0:
        sys.exit(f"清理失败 exit={code}")
    print("\n清理完成。")


if __name__ == "__main__":
    main()
