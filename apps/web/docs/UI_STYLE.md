# 和田玉镯子记账系统 · UI 风格说明

## 设计方向

**不是**小红书风、网红笔记风、奶油风。  
**是**高端珠宝老板随身财务工作台：墨玉质感、羊脂白留白、暗金点缀、玻璃拟态、轻奢但不浮夸。

风格关键词：高端珠宝 · 墨玉 · 羊脂白 · 暗金 · 玻璃拟态 · 移动端优先 · 操作快 · 动效顺滑

---

## 颜色变量

所有颜色统一在 `apps/web/src/styles/theme.css` 的 `:root` 中定义：

| 变量 | 值 | 用途 |
|------|-----|------|
| `--color-bg` | `#F7F3EA` | 羊脂白页面背景 |
| `--color-bg-deep` | `#101614` | 墨玉黑深色区域 |
| `--color-card` | `rgba(255,255,255,0.78)` | 玻璃卡片 |
| `--color-card-dark` | `rgba(18,26,23,0.92)` | 深色卡片 |
| `--color-gold` | `#C6A15B` | 暗金点缀 |
| `--color-gold-light` | `#E6D3A3` | 金额高亮 |
| `--color-jade` | `#4E7D69` | 青玉绿 |
| `--color-jade-deep` | `#1F4D3A` | 主按钮/强调 |
| `--color-text-main` | `#1D2522` | 主文字 |
| `--color-text-sub` | `#6F7772` | 次要文字 |
| `--color-text-light` | `#F8F3E8` | 深色背景上的文字 |
| `--color-success` | `#2F7D57` | 成功/在线 |
| `--color-warning` | `#C9822B` | 警告/离线 |
| `--color-danger` | `#B94A48` | 危险（低饱和，非亮红） |
| `--color-info` | `#3E6C8C` | 信息 |

---

## 核心组件列表

| 组件 | 路径 | 说明 |
|------|------|------|
| `AppShell` | `components/AppShell.vue` | 页面壳，含导航栏、内容区、底部固定操作区 |
| `LuxuryCard` | `components/LuxuryCard.vue` | 玻璃拟态卡片，支持 dark/gold/stagger |
| `MoneyCard` | `components/MoneyCard.vue` | 金额展示卡，内置 CountUp |
| `CountUp` | `components/CountUp.vue` | 数字滚动动画 300–600ms |
| `StatusPill` | `components/StatusPill.vue` | 状态胶囊（success/warning/gold 等） |
| `ActionButton` | `components/ActionButton.vue` | 主/次/幽灵/危险按钮，点击 scale(0.97) |
| `ImageUploader` | `components/ImageUploader.vue` | 相册格子上传，含进度与 fade-in |
| `WorkerStatus` | `components/WorkerStatus.vue` | 本地电脑连接状态 |
| `ExpenseItem` | `components/ExpenseItem.vue` | 支出列表行 |
| `ExportProgress` | `components/ExportProgress.vue` | Excel 导出步骤条 |
| `BraceletCard` | `components/BraceletCard.vue` | 镯子货品卡，支持高亮边 |
| `TabBar` | `components/TabBar.vue` | 底部玻璃导航 |

---

## 页面说明

### 首页 `/`
- 墨玉渐变驾驶舱卡（`LuxuryCard dark`）展示今日/本周/本月/未报销金额
- `MoneyCard` + `CountUp` 数字滚动
- 快捷操作四宫格：记一笔、扫镯子、导出报销、销售登记
- 最近支出 + 最近操作（大白话）

### 记支出 `/expense/create`
- 顶部大金额输入区（高级收银台感）
- 支出类型：横向胶囊标签
- 付款来源：卡片选择
- 报销状态：分段控件
- `ImageUploader` 相册格子上传
- 底部固定 `ActionButton` 保存

### 报销导出 `/expense/export`
- 筛选条件 → `ExportProgress` 步骤条
- 预览列表 + 缺图温和警告（warning 色，非满屏红）
- 导出时分步动画：整理 → 读图 → 嵌入 → 生成

### 镯子查询 `/bracelets`
- 搜索框右侧 loading 环
- 查到：`BraceletCard` 暗金高亮闪 1 秒
- 未查到：`shake-soft` 微震 + Toast 大白话

### 登录 `/login`
- 墨玉品牌字 + 羊脂白背景 + 暗金边卡片

---

## 动效实现位置

| 动效 | 文件 | 实现 |
|------|------|------|
| 页面进入 | `styles/theme.css` + `App.vue` | `page-enter` keyframes + Vue Transition |
| 卡片错落 | `LuxuryCard.vue` | `card-stagger` + `animationDelay: index * 40ms` |
| 按钮点击 | `ActionButton.vue` | `:active { transform: scale(0.97) }` |
| 金额滚动 | `CountUp.vue` | requestAnimationFrame ease-out 480ms |
| 搜索 loading | `Bracelets.vue` | CSS spin ring |
| 查到高亮 | `BraceletCard.vue` | `highlight-flash` 1s |
| 未找到震动 | `Bracelets.vue` | `shake-soft` |
| 图片 fade-in | `ImageUploader.vue` | `fade-in` class |
| 上传进度 | `ImageUploader.vue` | 进度条 + 圆环 |

---

## 如何统一修改主题色

1. **改全局色板**：编辑 `apps/web/src/styles/theme.css` 中 `:root` 变量
2. **改 Vant 组件色**：同文件内 `--van-*` 变量（已映射到珠宝色系）
3. **改按钮渐变**：`ActionButton.vue` 中 `.action-btn--primary`
4. **改驾驶舱背景**：`LuxuryCard.vue` 中 `.luxury-card--dark`
5. **改底部导航**：`TabBar.vue` 中 `.luxury-tabbar`

修改后无需改各页面，组件会自动继承 CSS 变量。

---

## 字体与排版

- 中文：`PingFang SC`, `Microsoft YaHei`, `system-ui`
- 金额：`.money { font-variant-numeric: tabular-nums }`
- 留白：页面 padding 16px，卡片间距 14px，圆角 18–24px

---

## 验收对照

1. ✅ 第一眼不像小红书（无粉红、亮红、种草卡）
2. ✅ 珠宝/玉石行业质感（墨玉+暗金+青玉）
3. ✅ 首页高级驾驶舱
4. ✅ 记支出操作快（大金额区+胶囊+固定底栏）
5. ✅ 导出流程步骤清楚
6. ✅ 页面切换 220ms 渐入
7. ✅ 按钮 scale 反馈
8. ✅ 图片上传有进度
9. ✅ Worker 状态明显
10. ✅ 纯 CSS 动效，无重型动画库
