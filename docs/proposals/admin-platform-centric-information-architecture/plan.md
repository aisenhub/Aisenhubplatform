# Admin 平台中心化与双轨透镜信息架构重构实施计划

状态：In Progress

文档性质：实施跟踪计划。第一阶段在进行中。

关联：[优化设计](design.md) · [系统概览](../../architecture/overview.md) · [Admin 2.0 计划](../admin-2-navigation-ia/plan.md) · [Admin 前端架构](../../architecture/modules/frontends.md)

---

## 总体范围与边界

落实 [Admin 平台中心化与双轨透镜信息架构设计](design.md)，解决原方案中“全平台与平台管理两极割裂”、“系统治理被矮化为设置”、“模式硬切换迷航”的核心痛点。通过双轨透镜模型（全景透镜 Global Scope vs 聚焦透镜 Platform Scope）重构 Admin 的导航结构、上下文切换与操作工作流。

- 任务标识：`admin-platform-centric-ia-phase-1`
- 基线 Commit：`5214375` (origin/main)
- 工作分支：`codex/admin-platform-centric-ia-phase-1`
- 实施分级：**阶段 1 统一按 R1 执行（纯前端 UI / 导航重构）**
- 受影响消费者：`apps/admin`。对外部 Consumer、Contract、Supabase 数据库无影响。
- 冻结底线：
  1. 现有所有 `/admin/**` 与 `/admin/platforms/:platformId/**` 路由保持 100% 兼容。
  2. URL 中的 `platformId` 继续作为单平台上下文的唯一真理来源。
  3. 服务端权限、MFA Step-up、BFF 同源代理、CSRF、Cookie 安全协议完全不改变。
  4. 绝不在前端虚构未由后端权威保证的大盘统计指标。

---

## 阶段规划与状态

| 阶段 | 阶段目标 | 分级 | 状态 | 交付内容 |
| :--- | :--- | :---: | :---: | :--- |
| **Phase 01** | **导航收敛与上下文切换体验重构** | **R1** | **Completed** | 1. 导航分组重构（系统治理正名，拒绝伪降级）<br/>2. 上下文切换器（PlatformSwitcher）支持全局与平台双向切换<br/>3. Topbar 面包屑透镜模型对齐<br/>4. Command Menu 与键盘交互同步<br/>5. 全量静态检查与单元测试验证（PR #10 合入 main） |
| **Phase 02** | **单平台商业化闭环与通用订单工作台** | **R1/R2** | **Completed** | 1. 新增 `/admin/platforms/:platformId/billing` 路由与页面<br/>2. 提取共享计费类型与工具模块 `billing-types.ts`<br/>3. 单平台工作区锁定 `platform_id` 过滤与专属工作区视图<br/>4. 商业化导航分组增加“订单与计费”入口<br/>5. 单元测试与全量本地质量检查 |
| **Phase 03** | **全局待办分诊台与跨平台身份检索** | **R2/R3** | Planned | 1. Overview 异常与待办优先（Triage-First）面板优化<br/>2. 新增 `/admin/accounts` 跨平台身份搜索与状态透视<br/>3. 为未来用户反馈等平台业务建立标准入驻模式 |

---

## Phase 02 详细实施清单（本轮执行）

### 1. 商业化导航更新
- [x] 在 `apps/admin/components/navigation/admin-navigation.ts` 的 `platformNavigationDefinitions` 中，商业化分组新增 `订单与计费` (`suffix: '/billing'`)。
- [x] 更新 `admin-navigation.test.ts` 覆盖平台 `/billing` 路由标签判定。

### 2. 提取共享数据模型与格式化工具
- [x] 创建 `apps/admin/features/billing/billing-types.ts`，共享 `BillingOrder`, `BillingOrderDetail`, `BillingTimelineEvent`, `tone`, `timelineSummary`, `timelineSourceLabel`。

### 3. 实现单平台订单与计费工作区
- [x] 创建 `apps/admin/features/billing/platform-billing-page.tsx`：
  - 自动读取并锁定当前 `platform.platform_id`；
  - 呈现当前平台的订单队列、Provider 状态、金额与决策标记；
  - 右侧面板展示详细元数据与完整的证据时间线（Evidence Timeline）；
  - 保留订单重查（Requery Provider）与受控结案（Resolve）安全动作；
  - 筛选器省去手动填写平台 ID，专注当前平台业务。
- [x] 创建路由入口 `apps/admin/app/admin/platforms/[platformId]/billing/page.tsx`。

### 4. 本地质量与发布验证
- [x] `pnpm docs:check` / `pnpm contracts:check`
- [x] `pnpm format:check` / `pnpm lint`
- [x] `pnpm --filter admin test:unit`
- [x] `pnpm --filter admin typecheck`
- [x] `pnpm --filter admin build`

---

## 历史阶段记录

### Phase 01 实施清单（已完成）

### 1. 导航结构与核心域定义更新
- [x] 更新 `apps/admin/components/navigation/admin-navigation.ts`：
  - **Global Mode**：
    - `工作台`：概览 (`/admin`)、平台目录 (`/admin/platforms`)
    - `商业中心`：计费管理 (`/admin/billing`)
    - `系统治理`：运维中心 (`/admin/operations`)、审计记录 (`/admin/audit`)、Consumer Lab (`/admin/consumer-lab`)
    - `设置`：安全与账户 (`/admin/security`)
  - **Platform Mode**：
    - `平台运营`：概览、账户
    - `商业化`：套餐、订阅、兑换码
    - `资源与接入`：文件、接入地址、接入密钥
    - `平台设置`：基本设置
    - `全局管理`（底部直通）：运维中心、审计记录、计费管理（保留快速排障链路）

### 2. 上下文切换器（PlatformSwitcher）体验增强
- [x] 优化 `apps/admin/components/platform-context/platform-switcher.tsx`：
  - 增加固定项：`🌐 所有平台（全局视口）`；
  - 在平台模式下选中“所有平台”可无缝切回全局（`/admin` 或 `/admin/platforms`）；
  - 保持现有切换目标平台的路由后缀记忆机制；
  - 确保无额外依赖，轻量可靠。

### 3. Topbar 与 Sidebar 上下文联动
- [x] 优化 `apps/admin/components/shell/admin-topbar.tsx` 与 `admin-sidebar.tsx`：
  - 顶栏面包屑与当前透镜对齐（全局：`Aisenhub / 页面名`；平台：`Aisenhub / [平台名] / 页面名`）；
  - 保持窄屏抽屉与键盘焦点可访问性。

### 4. Command Menu 对齐
- [x] 确保 `apps/admin/components/navigation/admin-command-menu.tsx` 正确聚合新的导航分组，并支持快速跳转至“所有平台”与各治理模块。

### 5. 质量与发布前验证
- [x] `pnpm docs:check` 通过
- [x] `pnpm contracts:check` 通过
- [x] `pnpm --filter @apps/admin typecheck` / lint / test 通过
- [x] 审查代码 diff，确保无敏感信息泄漏、无无意义依赖引入。
