# 生产部署指南

## 环境要求

- Node.js 20+
- MySQL 8+ 或 PostgreSQL 14+（生产）
- Nginx（反向代理 + 静态前端）
- PM2（进程守护）
- 本地 Windows 电脑运行 Worker + 扫码枪 API（127.0.0.1:7789）

## 配置

复制并编辑 `apps/server/.env`：

```env
NODE_ENV=production
SERVER_PORT=3001
DATABASE_URL="mysql://user:pass@127.0.0.1:3306/jade_accounting"
JWT_SECRET="至少32位强随机密钥"
WORKER_WS_TOKEN="至少32位强随机密钥"
CORS_ORIGIN="https://your-domain.com"
LOCAL_WORKER_REQUIRED=true
EXPORT_TMP_DIR="/var/jade-account/exports"
```

Worker 本地 `.env`（`apps/worker/.env`）：

```env
# 当前推荐（HTTP IP）
SERVER_WS_URL=ws://8.137.126.18/account/ws/worker
WORKER_WS_TOKEN="与服务端相同"
SCANNER_API_URL=http://127.0.0.1:7789
FILE_BASE_DIR=D:/jewelry-account-files
```

域名 `xiangyuzhubao.xyz` HTTPS 待备案/正式证书完成后启用。

## 构建与启动

```bash
npm install
npm run db:generate
npm run build
npm run db:push    # 首次部署
npm run db:seed    # 首次部署（生产请立即修改 admin 密码）
npm run start:prod # 或 pm2 start ecosystem.config.cjs
```

## 生产启动检查

服务端启动时会检查：

- `JWT_SECRET` 不能为默认值
- `WORKER_WS_TOKEN` 必须存在
- 生产环境不能使用 `admin/admin123`
- 不建议使用 SQLite `file:` 数据库

## Nginx 示例

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    root /var/www/jade-account/web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/worker {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## 架构说明

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| 前端 | 阿里云/Nginx 静态 | 不暴露本地路径 |
| API + WS | 阿里云 Node | Worker 通过 WSS 连接 |
| Worker | 本地 Windows | 存图、调扫码枪 |
| 扫码枪 API | 本地 127.0.0.1:7789 | 禁止公网暴露 |

## 本地 Windows 自启

```powershell
.\scripts\windows\install-worker-autostart.ps1
.\scripts\windows\install-scanner-autostart.ps1
.\scripts\windows\status-local-services.ps1
```

## 备份

```powershell
.\scripts\windows\backup-local-files.ps1
```

默认备份 `D:/jewelry-account-files` 到 `D:/jewelry-account-backups/yyyy-MM-dd/`，保留 30 天。

## 验收

```bash
npm run acceptance        # 基础联调
npm run acceptance:full   # 含多图 Excel、权限等
npm run acceptance:cleanup # 清理 test_auto_check 数据
```

报告输出：`reports/acceptance-*.md`
