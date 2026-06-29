# 和田玉镯子记账系统

团队日常支出记账、销售毛利、员工垫付报销、Excel 报销导出。图片通过本地 Worker 中转存储，不长期占用阿里云空间。

## 项目结构

```
记账系统/
├── apps/
│   ├── server/          # 阿里云服务端 (Express + Prisma + WebSocket)
│   ├── web/             # 移动端前端 (Vue 3 + Vite + Vant)
│   └── worker/          # 本地电脑 Worker (WebSocket RPC + 本地文件)
├── packages/
│   └── shared/          # 共享常量与 RPC 协议
├── package.json         # Monorepo 根配置
└── README.md
```

## 快速启动

### 1. 安装依赖

```bash
cd 记账系统
npm install
```

### 2. 初始化数据库

```bash
cp apps/server/.env.example apps/server/.env
npm run db:push
npm run db:seed
```

默认账号：`admin` / `admin123` — **仅开发环境首次 seed 临时账号，生产部署会自动生成强密码，切勿在线上使用默认密码。**

### 3. 启动阿里云服务端 + 前端

```bash
npm run dev
```

- 服务端: http://localhost:3001
- 前端: http://localhost:5173

### 4. 启动本地 Worker（在本地电脑上）

```bash
cp apps/worker/.env.example apps/worker/.env
npm run dev:worker
```

Worker 环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| SERVER_WS_URL | 记账服务端 WebSocket | 生产: ws://8.137.126.18/account/ws/worker |
| SCANNER_API_URL | 扫码枪系统地址（Worker 本地 fallback） | http://127.0.0.1:7789 |
| FILE_BASE_DIR | 本地图片存储目录 | D:/jewelry-account-files |

## 扫码枪系统对接配置

后台设置页（我的 → 扫码枪系统对接）可配置：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| scanner_api_base_url | 扫码枪系统本地 API 地址 | http://127.0.0.1:7789 |
| local_worker_enabled | 是否启用本地 Worker | true |
| scanner_sync_timeout | 扫码枪查询超时（秒） | 8 |

**重要：** 阿里云服务器不能直接访问用户本地 127.0.0.1。正式流程：

```
记账系统前端/后端 → 阿里云服务端 → 本地 Worker → 扫码枪 API → 返回镯子数据
```

### 查询镯子

1. 先查记账系统 `bracelets` 表（精确匹配编号）
2. 不存在则通过 Worker 请求 `GET {scanner_api_base_url}/api/bracelets/:code`
3. 查到后保存镜像；查不到提示「扫码枪系统未找到该镯子，请确认编号是否正确。」

### 模糊搜索

`GET /api/bracelets/search?q=关键词` → Worker → `GET {scanner_api_base_url}/api/bracelets/search?q=关键词`

### 镯子图片

- 数据库只保存 `sourceImagePath` 元数据，不暴露给前端
- 前端通过 `GET /api/bracelets/detail/:id/image` 查看
- 服务端经 Worker 读取本地图片路径后流式返回
- Worker 离线时提示「本地电脑未连接，暂时无法查看镯子图片。」

## 扫码枪系统接口规范

Worker 优先调用标准接口：

```
GET /api/bracelets/:code
GET /api/bracelets/search?q=关键词
```

精确查询返回格式：

```json
{
  "success": true,
  "data": {
    "scannerProductId": "uuid",
    "braceletCode": "F00055",
    "certificateNo": "F00055",
    "imagePath": "D:/xxx/F00055.jpg",
    "inboundAt": "2026-06-29 12:00:00",
    "inboundCost": 2800,
    "status": "in_stock"
  }
}
```

搜索返回格式：

```json
{
  "success": true,
  "data": [
    { "braceletCode": "F00055", "inboundCost": 2800, "status": "in_stock" }
  ]
}
```

兼容旧版接口（Worker 自动 fallback）：

1. `GET /api/bracelets/by-cert/:code`
2. `GET /api/v1/inventory/by-cert/:code`

现有扫码枪系统 `certNo` 字段即业务编号 `bracelet_code`，Worker 已做字段映射。

## 数据库 Schema

使用 Prisma，schema 位于 `apps/server/prisma/schema.prisma`。

主要表：

| 表名 | 说明 |
|------|------|
| bracelets | 镯子镜像（从扫码枪同步） |
| expenses | 支出流水 |
| expense_attachments | 支出凭证关联 |
| files | 图片元数据（真实文件在本地） |
| sales | 销售记录（含成本快照） |
| refunds | 退款记录 |
| cost_adjustments | 成本调整留痕 |
| system_settings | 系统配置（证书费/包装盒/快递费） |
| operation_logs | 操作日志 |
| local_worker_connections | Worker 连接状态 |
| export_tasks | Excel 导出任务 |
| users / roles / permissions | 权限系统 |

## 后端 API 列表

### 认证
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 当前用户与权限

### 本地 Worker
- `GET /api/local-worker/status` - Worker 在线状态

### 镯子
- `GET /api/bracelets/search?q=` - 模糊搜索
- `GET /api/bracelets/:code` - 查询/自动同步
- `POST /api/bracelets/:code/sync` - 强制同步
- `GET /api/bracelets/detail/:id` - 详情（支出/销售/成本调整）
- `POST /api/bracelets/:id/cost-adjustment` - 成本调整

### 支出
- `POST /api/expenses` - 新增
- `GET /api/expenses` - 列表
- `GET /api/expenses/:id` - 详情
- `PATCH /api/expenses/:id` - 修改
- `POST /api/expenses/:id/void` - 作废
- `POST /api/expenses/:id/attachments` - 补充凭证
- `PATCH /api/expenses/:id/reimbursement-status` - 修改报销状态
- `GET /api/expenses/summary` - 支出统计
- `GET /api/expenses/pending-reimbursements` - 未报销列表
- `POST /api/expenses/export/reimbursement-excel` - 导出 Excel
- `POST /api/expenses/export/reimbursement-excel/preview` - 导出预览

### 销售
- `POST /api/sales` - 登记销售
- `GET /api/sales` - 列表
- `GET /api/sales/:id` - 详情
- `GET /api/sales/cost-preview/:braceletId` - 成本预览
- `POST /api/sales/:id/refund` - 退款

### 文件
- `POST /api/files/upload` - 上传（转发到 Worker）
- `GET /api/files/:id/view` - 查看原图
- `GET /api/files/:id/thumb` - 查看缩略图

### 导出
- `GET /api/exports/:id/status` - 导出状态
- `GET /api/exports/:id/download?token=` - 下载 Excel

### 设置与权限
- `GET /api/settings` - 系统配置
- `PATCH /api/settings/:key` - 修改配置
- `GET /api/operation-logs` - 操作日志
- `GET /api/permissions/*` - 权限管理

## 前端页面

| 路径 | 页面 |
|------|------|
| / | 首页 |
| /expense/create | 记支出 |
| /expense/:id | 支出详情 |
| /expense/stats | 支出统计 |
| /expense/export | 报销导出 |
| /reimbursements | 未报销列表 |
| /sales | 销售列表 |
| /sales/create | 销售登记 |
| /sales/:id | 销售详情 |
| /bracelets | 镯子查询 |
| /bracelets/:code | 镯子详情 |
| /settings | 我的/设置 |
| /logs | 操作日志 |

## 验收测试指南

### 测试 Worker 是否在线

1. 启动服务端和 Worker
2. 打开首页，查看「本地电脑已连接」
3. 或调用 `GET /api/local-worker/status`

### 测试扫码同步镯子

1. 确保扫码枪系统有编号 F00055
2. 在镯子页输入 F00055 并查询
3. 系统应自动通过 Worker 同步并保存镜像

### 测试上传图片到本地

1. 记支出页上传付款截图
2. 检查 `D:/jewelry-account-files/expenses/` 下是否有新文件

### 测试新增支出

1. 记支出 → 填写金额、类型、付款来源
2. 绑定镯子编号，上传凭证
3. 保存后在首页「最近支出」可见

### 测试销售毛利

1. 销售登记 → 输入镯子编号并同步
2. 输入销售金额，查看自动计算：
   - 入库成本 + 证书费(3) + 包装盒(10) + 快递(18) = 总成本
   - 销售毛利 = 销售金额 - 总成本

### 测试员工垫付报销

1. 新增支出，付款来源选「员工垫付」，填写报销人
2. 首页显示未报销金额
3. 标记已报销后从未报销列表消失

### 测试权限控制

1. 创建无 `expense:attachment:view` 权限的角色
2. 该用户无法查看凭证图片

### 测试操作日志

1. 执行新增支出、登记销售等操作
2. 在操作日志页查看记录

### 测试 Excel 报销导出

1. Worker 必须在线
2. 报销导出页选择日期范围
3. 预览 → 导出 Excel → 下载
4. 用 Excel/WPS 打开，确认 G 列图片已嵌入

### 测试 Worker 离线

1. 关闭 Worker
2. 查询图片或导出 Excel
3. 应提示「本地电脑未连接」，系统不崩溃

## 成本规则

```
销售时总成本 = 入库成本 + 证书费(默认3) + 包装盒(默认10) + 快递费(默认18) + 成本调整
销售毛利 = 销售金额 - 销售时总成本
最终到手利润 = 销售毛利 - 客户补偿金额
```

所有默认值在 `system_settings` 表配置，不写死在代码中。销售记录保存成本快照，历史数据不受后续配置变更影响。

## 本地 Worker RPC 协议

Worker 通过 WebSocket 连接 `ws://服务端/ws/worker`，支持：

- `scanner.getBraceletByCode` - 查询扫码枪系统
- `file.saveUpload` - 保存上传图片
- `file.read` / `file.readThumb` - 读取图片
- `file.exists` - 检查文件
- `file.readManyForExport` - 批量读取用于 Excel 导出

## 部署说明（阿里云）

**当前推荐手机访问：** http://8.137.126.18/account/

**Worker 连接：** `ws://8.137.126.18/account/ws/worker`（写入 `apps/worker/.env` 的 `SERVER_WS_URL`）

**域名 HTTPS：** `xiangyuzhubao.xyz` 待备案/正式证书完成后启用，当前不推荐自签名 HTTPS 入口。

### 一键部署

```bash
npm run deploy:aliyun
```

普通部署**不会**轮换 `WORKER_WS_TOKEN`。仅在 token 缺失或过弱时自动生成。

### 运维命令

| 命令 | 说明 |
|------|------|
| `npm run deploy:aliyun` | 构建并部署到阿里云 |
| `npm run rotate:worker-token` | 显式轮换 Worker 连接令牌 |
| `npm run rotate:admin-password` | 轮换 admin 密码（写入 secrets/，控制台不显示明文） |
| `npm run acceptance:remote` | 远程验收 |
| `npm run acceptance:cleanup` | 清理 test_auto_check 测试数据 |

### 部署步骤概要

1. 将 `apps/server` 部署到阿里云服务器（`npm run deploy:aliyun` 自动完成）
2. 配置 `DATABASE_URL`（当前 SQLite，可后续迁移 MySQL）
3. 本地 Worker 的 `SERVER_WS_URL` 指向 `ws://8.137.126.18/account/ws/worker`
4. 前端生产构建使用 `VITE_APP_BASE=/account/`
