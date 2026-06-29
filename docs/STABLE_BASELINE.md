# 和田玉记账系统 — 稳定基线

## 当前稳定 commit

| 项 | 值 |
|---|---|
| Commit | `87ce427`（加固基线；功能基线 `003e73c`） |
| Message | `chore: harden deploy pipeline against test hangs` |
| 分支 | `main` |
| 生产入口 | http://8.137.126.18/account/ |

基线 `003e73c` 引入响应式布局与 Playwright 超时；后续「部署链路防回退加固」提交仅改脚本/文档/部署链路，**不改业务 UI**。

加固后新增：`scripts/lib/script-timeout.mjs`、`scripts/guard-no-networkidle.mjs`、`npm run cleanup:stuck-tests`、`npm run guard:no-networkidle`。

## 必须保留的本地端口

| 端口 | 服务 | 说明 |
|------|------|------|
| **3001** | 本地记账 Server | 开发/Worker 联调，**禁止 cleanup 误杀** |
| **7789** | 扫码枪 API | 镯子同步，**禁止 cleanup 误杀** |

临时测试端口（可清理）：

| 端口 | 服务 |
|------|------|
| 4173 / 5173 | vite preview（验收用，测完应关闭） |
| 4731 | 远程 PM2 内网 API（仅阿里云） |

## 本地验收命令

```bash
# 防回退检查（禁止 networkidle）
node scripts/guard-no-networkidle.mjs

# 清理卡住的 test/deploy/preview（不杀 Worker/扫码枪/第三方）
npm run cleanup:stuck-tests

# 浏览器与 API 专项
npm run test:white-screen      # 单页 30s，脚本 120s
npm run test:responsive        # 四 viewport，单 viewport 30s
npm run test:login
npm run test:subpath
npm run test:worker-online

# 全链路
npm run acceptance:full
npm run acceptance:cleanup
npm run build
```

环境变量（可选）：

- `ACCEPTANCE_SERVER=http://8.137.126.18/account` — 对远程跑浏览器测试
- `PW_PAGE_TIMEOUT_MS=30000` — 单页超时
- `PW_SCRIPT_TIMEOUT_MS=120000` — Playwright 脚本总超时

## 远程验收命令

```bash
set ACCEPTANCE_SERVER=http://8.137.126.18/account
npm run acceptance:remote
npm run test:assets
npm run test:white-screen
npm run test:responsive
```

部署：

```bash
npm run deploy:aliyun
```

部署脚本内置各步骤 exec 硬超时；Playwright 步骤另有脚本级超时。deploy 中浏览器测试 exec 缓冲为「脚本超时 + 120s」，避免 Windows 下 npm 包装层导致误杀。

## 遇到 “Waiting 5m+ for shell” 的处理流程

1. **不要手动关 Cursor 窗口**，先运行：
   ```bash
   npm run cleanup:stuck-tests
   ```
2. 检查端口：`netstat -ano | findstr "4173 5173 3001 7789"`
   - 4173/5173 有残留 → cleanup 会关 vite preview
   - 3001/7789 必须保留
3. 确认 Worker：`npm run worker:status`（或看设置页「本地助手已连接」）
4. 快速远程健康：
   ```bash
   npm run test:assets
   curl http://8.137.126.18/account/api/health
   ```
5. 重跑验收（带超时，不会无限挂起）：
   ```bash
   npm run test:white-screen
   npm run test:responsive
   ```
6. 若 deploy 卡住：cleanup 后单独重跑 `npm run deploy:aliyun`；勿并行启动多个 deploy。

## 为什么不能使用 `networkidle`

记账系统页面存在 **Worker WebSocket 长连接** 与 **轮询**，浏览器网络始终有活动。

Playwright 的 `waitUntil: 'networkidle'` 要求 500ms 内零网络请求，在此场景下 **永远等不到**，导致：

- `test:white-screen` 挂起 5 分钟+
- `deploy:aliyun` 卡在部署后验收
- 多个 Playwright 实例叠加后更难恢复

**正确做法：**

- `waitUntil: 'domcontentloaded'`
- `page.waitForSelector('#app', { timeout: 10000 })`
- 需要登录态时用明确 API 或 UI 元素等待
- 脚本级 `installScriptTimeout` + 单步 `withTimeout`
- deploy 中 `execSync({ timeout })` 硬上限

## 相关脚本

| 脚本 | 作用 |
|------|------|
| `scripts/lib/script-timeout.mjs` | 通用脚本硬超时 |
| `scripts/lib/playwright-utils.mjs` | Playwright 页面/浏览器超时 |
| `scripts/cleanup-stuck-tests.mjs` | 清理卡住进程 |
| `scripts/guard-no-networkidle.mjs` | 防回退：禁止 networkidle |
| `scripts/deploy-aliyun.mjs` | 部署 + 分步 exec 超时 |
