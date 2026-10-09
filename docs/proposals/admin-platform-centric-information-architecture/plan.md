# Admin 平台中心化与双轨透镜信息架构重构实施计划

状态：Completed

文档性质：实施跟踪计划。原 Phase 01–03 形成基础骨架，2026-10-09 架构审查确认的身份聚合、安全阶梯、共享工作台、双透镜路由和行为验收缺口已由 Phase 04–11 收口，并通过最终 Local R3 gate。

关联：[优化设计](design.md) · [系统概览](../../architecture/overview.md) · [Admin 2.0 计划](../admin-2-navigation-ia/plan.md) · [Admin 前端架构](../../architecture/modules/frontends.md)

---

## 总体范围与边界

落实 [Admin 平台中心化与双轨透镜信息架构设计](design.md)，解决原方案中“全平台与平台管理两极割裂”、“系统治理被矮化为设置”、“模式硬切换迷航”的核心痛点。通过双轨透镜模型（全景透镜 Global Scope vs 聚焦透镜 Platform Scope）重构 Admin 的导航结构、上下文切换与操作工作流。

- 当前收口任务标识：`admin-platform-centric-ia-hardening`
- 当前收口基线 Commit：`9dd9adc5b380cb999b05c8d74842959e4b132276` (`origin/main`)
- 当前工作分支：`codex/admin-platform-centric-ia-hardening`
- 当前实施分级：**R3**。原因：本轮会修改 Admin canonical OpenAPI、Account/Admin Edge 路由、PostgreSQL private Admin 查询、近期 MFA 权限边界以及 Billing 管理动作。
- 受影响消费者：`supabase/functions/account-api`、`apps/admin` 同源 BFF/UI、`contracts/admin/v1`、Admin executor/database tests；公共 Consumer `/v1` contract 不新增能力。
- 冻结底线：
  1. 现有所有 `/admin/**` 与 `/admin/platforms/:platformId/**` 路由保持 100% 兼容。
  2. URL 中的 `platformId` 继续作为单平台上下文的唯一真理来源。
  3. 服务端权限、MFA Step-up、BFF 同源代理、CSRF、Cookie 安全协议不降级；本轮允许在既有 step-up 协议上扩大敏感动作覆盖面。
  4. 绝不在前端虚构未由后端权威保证的大盘统计指标。

---

## 阶段规划与状态

| 阶段 | 阶段目标 | 分级 | 状态 | 交付内容 |
| :--- | :--- | :---: | :---: | :--- |
| **Phase 01** | **导航收敛与上下文切换体验重构** | **R1** | **Completed** | 1. 导航分组重构（系统治理正名，拒绝伪降级）<br/>2. 上下文切换器（PlatformSwitcher）支持全局与平台双向切换<br/>3. Topbar 面包屑透镜模型对齐<br/>4. Command Menu 与键盘交互同步<br/>5. 全量静态检查与单元测试验证（PR #10 合入 main） |
| **Phase 02** | **单平台商业化闭环与通用订单工作台** | **R1/R2** | **Completed** | 1. 新增 `/admin/platforms/:platformId/billing` 路由与页面<br/>2. 提取共享计费类型与工具模块 `billing-types.ts`<br/>3. 单平台工作区锁定 `platform_id` 过滤与专属工作区视图<br/>4. 商业化导航分组增加“订单与计费”入口<br/>5. 单元测试与全量本地质量检查（PR #11 合入 main） |
| **Phase 03** | **全局待办分诊台与跨平台身份检索** | **R1/R2** | **Completed** | 1. Overview 异常与待办优先（Triage-First）面板优化与直通跳转<br/>2. 新增 `/admin/accounts` 统一用户与身份透视工作台<br/>3. 提取共享账户模型与工具模块 `account-types.ts`<br/>4. 侧边栏“平台中枢”增加“统一用户”入口<br/>5. 单元测试与全量本地质量检查 |
| **Phase 04** | **全局 Identity API 与真实统一用户工作台** | **R3** | **Completed** | Supabase Auth Identity 经 server-only Auth Admin boundary 读取，private SQL 聚合平台账户；`/admin/accounts` 单请求展示跨平台关联。详见 [Phase 04](phases/04-global-identity-api.md)。 |
| **Phase 05** | **近期 MFA 安全边界收敛** | **R3** | **Completed** | 账户状态变更与 Billing 人工动作统一依赖服务端 recent-MFA；OpenAPI 明示 step-up；统一当前 30 分钟 Admin policy 文档。详见 [Phase 05](phases/05-recent-mfa-boundary.md)。 |
| **Phase 06** | **Accounts 请求与失败状态收敛** | **R2/R3** | **Completed** | 消除按键请求、重复提交、刷新状态悬挂与 partial failure 隐藏；URL 作为已提交查询唯一来源。详见 [Phase 06](phases/06-accounts-request-state.md)。 |
| **Phase 07** | **共享 Billing Workspace** | **R3** | **Completed** | 唯一订单列表/详情/Timeline/requery/resolve 实现；Global/Platform 页面只提供 scope 与附加观测。详见 [Phase 07](phases/07-shared-billing-workspace.md)。 |
| **Phase 08** | **Sidebar / Switcher 双透镜语义修复** | **R2** | **Completed** | 恢复平台视角系统治理直通、同等路由映射、平台搜索与状态表达；URL 仍是 scope SSOT。详见 [Phase 08](phases/08-dual-lens-navigation.md)。 |
| **Phase 09** | **Billing URL 与平台上下文闭环** | **R2/R3** | **Completed** | 全局 Billing 读取 URL filter、显示真实/未关联平台信息、使用平台选择器，补 `/admin/billing/orders` canonical 入口与兼容旧路由。详见 [Phase 09](phases/09-billing-url-platform-context.md)。 |
| **Phase 10** | **行为 / Local E2E 与 R3 验收** | **R3** | **Completed** | Identity UID 深链、Billing 刷新/双向 scope、治理一跳、recent-MFA 与响应式/可访问性已进入真实 Local Admin E2E；最终 20-gate R3 验收 PASS。详见 [Phase 10](phases/10-behavior-local-e2e.md)。 |
| **Phase 11** | **架构与 Proposal 收口** | **R0（随整次 R3 候选验收）** | **Completed** | architecture/ADR/Proposal/verification record 已与实现和最终 Local 证据同步。详见 [Phase 11](phases/11-documentation-closeout.md)。 |

### 2026-10-09 审查问题到阶段映射

| 审查问题 | 严重度 | 收口阶段 | 完成判定 |
| --- | --- | --- | --- |
| `/admin/accounts` 实际是浏览器按平台 fan-out，不是 Auth Identity 工作台 | P1 | 04 | 存在 canonical `GET /admin/api/v1/accounts`；一条 identity 聚合多个平台账户；邮箱/Auth UID 可搜索 |
| Accounts 输入即请求、最多 100 平台并发、重复 submit、refreshing 不复位、部分失败静默 | P1 | 06 | 页面只按 URL/提交值请求一次；无 N 平台 fan-out；后台刷新必复位；失败不伪装成功 |
| 账户封停/关闭与 Billing 人工动作未统一 recent-MFA | P1 | 05 | Edge 服务端调用统一 `adminStepUp`；缺失/过期 proof 返回 `RECENT_MFA_REQUIRED`；合同和负向测试覆盖 |
| Global/Platform Billing 复制订单工作台 | P1/P2 | 07 | 列表、详情、Timeline、If-Match、operation_id、Unknown Outcome 逻辑只有一个实现 |
| Global Billing 缺平台字段/平台选择器/目标订单入口 | P2 | 09 | 类型保留 `platform_id/platform_account_id`；全局队列展示平台；平台筛选不要求手输 UUID；旧 `/admin/billing` 兼容 |
| Overview `?status=manual_review` 深链不生效 | P2 | 09 | Billing 首次状态来自 URL，Apply/Clear 反写 URL，刷新/后退/复制链接确定 |
| 平台 Sidebar 最新视觉重构移除全局治理直通 | P2 | 08 | Platform Scope 一跳可达 Operations/Audit/Consumer Lab/全局 Billing，不破坏主导航收敛 |
| PlatformSwitcher 不支持同等路由、搜索和完整状态表达 | P2 | 08 | scope route mapper 有纯函数测试；Accounts/Billing 双向同等映射；可本地筛选平台；状态点语义完整 |
| 静态绿但缺行为/Local Supabase/R3 证据 | P2/P3 | 10 | 新行为测试实际执行；Local Supabase、权限、实际 HTTP、Admin E2E 适用项有 PASS 或明确 BLOCKED |
| Proposal/architecture/ADR 与当前代码、风险等级、验证命令不一致 | P3 | 11 | 状态、30 分钟 Admin recent-MFA、真实命令、当前架构与验证记录一致 |

---

## Phase 03 详细实施清单（本轮执行）

### 1. 提取共享账户数据模型与状态工具
- [x] 创建 `apps/admin/features/accounts/account-types.ts`：
  - 提取 `Account`, `AccountIntent`, `accountTone`, `accountActionLabel` 等类型与格式化工具；
  - 提供统一的数据结构支持跨平台账户透视与单平台账户管理。

### 2. 实现全局统一用户与身份检索台 (`/admin/accounts`)
- [x] 创建 `apps/admin/features/accounts/central-accounts-page.tsx`：
  - 支持平台选择器（包含“全部平台”与指定单平台）；
  - 支持按 User ID / 邮箱 / 关键词搜索；
  - 当时实现为按平台 fan-out；该历史实现已被 Phase 04 的单请求 Global Identity API 完整替换，不再作为当前架构；
  - 表格清晰展示：所属平台、Platform Account ID、Auth User ID、状态、激活时间、更新时间；
  - 提供深链穿透跳转：一键直达对应平台的单平台账户工作区 (`/admin/platforms/:id/accounts?selected=:id`)；
- [x] 创建路由入口 `apps/admin/app/admin/accounts/page.tsx`。

### 3. 全局 Overview 待办分诊台（Triage-First）优化
- [x] 在 `apps/admin/features/overview/admin-overview-page.tsx` 强化分诊能力：
  - 优化待办卡片与异常展示，区分“阻断与严重异常”与“待复核业务”；
  - 增加“跨平台快捷直通”工作台入口（统一用户 `/admin/accounts`、全网订单 `/admin/billing`、运维任务 `/admin/operations`）；
  - 支持带过滤参数的深链直通（Drill-Down）。

### 4. 导航配置与单元测试
- [x] 更新 `apps/admin/components/navigation/admin-navigation.ts`：在“平台中枢”增加 `{ key: 'accounts', label: '统一用户', href: '/admin/accounts' }`；
- [x] 更新 `apps/admin/components/navigation/admin-navigation.test.ts` 补充对 `/admin/accounts` 路由与分组的测试断言；
- [x] 编写 `apps/admin/features/accounts/account-types.test.ts` 验证账户模型判定与格式化工具。

### 5. 本地质量与发布验证
- [x] `pnpm docs:check` / `pnpm contracts:check`
- [x] `pnpm format:check` / `pnpm lint`
- [x] `pnpm --filter admin test:unit`
- [x] `pnpm --filter admin typecheck`
- [x] `pnpm --filter admin build`

---

## 历史阶段记录

### Phase 02 实施清单（已完成）

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
