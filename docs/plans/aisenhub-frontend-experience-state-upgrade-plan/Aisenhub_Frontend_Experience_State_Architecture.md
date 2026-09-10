# Aisenhub Frontend Experience & State 优化架构

> FE-R1：本文件为前端架构唯一维护正文；2026-09-10按当前`main@868e069`复核，FE-D02批次边界仍以`54ff797`为产品基线。`b563a98`及更早SHA仅为研究历史，不是当前实施基线。Auth已实施，中文优先为本期要求；Local代码交付已形成，但运行验收、Hosted/Staging/生产和发布门槛仍以验证记录为准。具体合同见 [FE-R1执行合同](frontend-experience-state-upgrade/references/fe-r1-execution-contracts.md) 与 [中文UI合同](frontend-experience-state-upgrade/references/chinese-ui-contract.md)。

> 文档类型：Frontend Experience & State 专题架构基线  
> 适用仓库：`aisenhub/Aisenhubplatform`  
> 代码核对基线：`main @ 868e069c1e9631cad09021598bc6070db23a694e`（2026-09-10；FE-D02 批次边界基线：`54ff79727dd0b7ea734822d23db2c9b58d6fe4ea`）  
> 上位架构：`Aisenhub_Platform_Optimization_Architecture.md` / `docs/architecture.md`  
> 本文重点：Admin 控制台，同时统一 Consumer 的页面状态与交互基础  
> 本轮性质：架构与实现边界维护；不替代具体环境的运行验收

---

## 0. 结论摘要

Aisenhub 当前 Admin 已经具备平台、账户、计划、兑换批次、订阅、文件、删除任务、审计等真实业务入口，但前端仍然更接近“工程操作面板”：

- 页面导航是平铺链接；
- 多个页面以单个 `status: string` 同时承担加载、成功、错误、提示等状态；
- 大量资源操作集中在同一页面，缺少稳定的信息层级；
- Platform 上下文在不同页面使用方式不一致，有的下拉选择，有的要求手输 Platform ID；
- 数据读取、筛选、mutation、MFA、一次性 secret、长任务等缺少统一前端状态合同；
- Admin CSS 仍是独立手写样式，尚未真正消费仓库已经存在的 `@kit/ui` Page、Sidebar、DataTable、EmptyState、Skeleton、Dialog、Drawer、Command、Toast 等能力；
- 页面有基本响应式处理，但没有形成桌面、平板、移动端的统一交互模型。

本文建议将 Admin 重构目标冻结为：

```text
Aisenhub Admin

Global Control Plane
├── Overview
├── Platforms
├── Operations
├── Audit & Activity
├── System Health          [规划能力]
└── Admin Security

Platform Workspace
├── Overview
├── Accounts
├── Entitlements
│   ├── Plans
│   ├── Subscriptions
│   └── Redemption Batches
├── Files
└── Settings
    ├── General
    ├── Origins
    └── API Keys
```

核心交互原则：

> **资源状态要局部化，页面上下文要 URL 化，危险操作要流程化，错误要可恢复化，诊断信息要可追踪化。**

核心状态架构：

```text
Remote Data
├── loading
├── success
├── empty
├── recoverable_error
└── access_error

Mutation
├── idle
├── confirm_required
├── step_up_required
├── pending
├── accepted
├── success
├── failure
└── unknown_outcome
```

其中 `unknown_outcome`、`accepted`、`step_up_required` 不是普通 SaaS 页面常见装饰状态，而是 Aisenhub 文件、删除任务、Key、兑换批次、Admin 高风险操作真正需要表达的业务状态。

---

# 1. 范围与目标

## 1.1 本专题负责什么

Frontend Experience & State 负责：

1. Admin / Consumer 页面信息架构。
2. App Shell、导航、Platform context、页面头部、全局操作入口。
3. Loading / Empty / Error / Permission / Retry 的统一页面状态。
4. Mutation pending、局部禁用、成功、失败、未知结果。
5. 表格、筛选、搜索、分页、详情查看模式。
6. Dialog / Drawer / Sheet / Toast / Inline Alert 的使用边界。
7. MFA、Session expired、Permission denied 等认证结果在 UI 的呈现方式。
8. 高风险操作、一次性 secret、长任务的前端交互流程。
9. 响应式布局、键盘操作、可访问性与视觉一致性。
10. Admin 后续页面扩展和规划能力。

## 1.2 本专题不重新定义什么

以下仍由其他架构专题维护唯一权威：

- Authentication & Session：登录、refresh、logout、MFA session orchestration。
- API Contract：错误 envelope、错误 code、request id、DTO、idempotency contract。
- Business Workflow：Plan、Subscription、File、Redemption、Deletion 的业务状态机。
- Observability：日志字段、指标、trace、审计持久化。

Frontend 只消费这些合同，不在页面中复制业务规则。

## 1.3 不可违反的安全不变量

UI 体验优化不得通过以下方式实现：

- 缓存 authorization 结果来减少鉴权；
- 隐藏或跳过 MFA / recent MFA；
- 因为“按钮看起来更顺”而自动重放不安全 mutation；
- 客户端自行计算权益或文件配额作为授权依据；
- 直接访问 Supabase 业务表绕过 BFF / Account API；
- 将敏感 Key、MFA secret、兑换码写入日志、URL、localStorage；
- 通过前端隐藏按钮代替服务端授权。

---

# 2. 已核实的当前实现

## 2.1 当前 Admin 路由

当前 `apps/admin/app/admin` 已存在：

```text
/admin
/admin/login
/admin/mfa
/admin/platforms
/admin/entitlements
/admin/subscriptions
/admin/files
/admin/deletion-jobs
/admin/audit
```

当前导航直接把这些资源平铺为：

```text
总览
平台与账户
计划与批次
订阅
文件
删除任务
审计
```

这说明后端能力不是从零开始，Frontend 优化的主要工作是重新组织真实能力，而不是先设计一套假 Dashboard。

## 2.2 当前首页

`apps/admin/app/admin/page.tsx` 目前是若干 Panel + Link，主要作用是跳转到其他模块。

存在的问题：

- 没有真正的 Admin shell；
- 没有当前 Platform context；
- 没有异常 / pending / recent activity 摘要；
- 没有跨资源快速搜索；
- 页面展示 M2/M3/M4 等内部里程碑语言，更像工程工具而不是长期产品 UI。

因此目标首页不应只是“把这些 panel 做漂亮”，而应成为真正的控制面 Overview。

## 2.3 当前 Platform Operations

`apps/admin/app/admin/platforms/page.tsx` 已经包含：

- platform list / create / active-disable；
- origin list / create；
- platform accounts；
- platform keys；
- key deployment confirmation；
- key revoke；
- account suspend / restore / close；
- server query + client filter。

同时它把非常多的不同风险级别操作放在一个 client page 中。

主要前端问题：

- `status` 字符串承担几乎全部操作反馈；
- Platform、Origin、Account、Key 都挤在一页；
- `window.confirm` 用于关键动作；
- Key 一次性明文直接插入 status 文本；
- Account action 共用一个 reason input；
- 当前操作粒度没有独立 row pending；
- 一个 section 出错时缺少 section-level error boundary；
- 页面既做服务端搜索，又做本地过滤，但 URL 没有成为查询状态源。

## 2.4 当前 Entitlements

`apps/admin/app/admin/entitlements/page.tsx` 已有真实 Plan 和 Redemption Batch 操作。

关键事实：

- Platform 需要手输 UUID；
- Plan 与 Batch 放在同一页；
- Batch 明文码只在创建响应显示，已有正确的“一次性 secret”安全语义；
- delivery receipt 保存在当前页面状态；
- 页面使用 `window.confirm` 确认归档和 delivery；
- `status` 同时承担读取、成功、业务拒绝等反馈。

这里不需要改变明文码只出现一次的合同，而应把交互升级成正式的一次性 Secret Delivery Flow。

## 2.5 当前 Files

`apps/admin/app/admin/files/page.tsx` 已经做了一些正确的状态区分：

- platform selector；
- file policy；
- cursor pagination；
- `unknown` / `deleting` / 写入中状态禁止危险动作；
- 删除是受控请求，而不是 UI 假设已物理删除；
- 下载有 recent MFA 约束。

问题主要在表达层：

- 依旧用一个 page-level `status`；
- policy 和 files 共用一次 load；
- row mutation 没有自己的 pending state；
- 技术状态字符串直接暴露较多；
- files list 缺少明确的 status badge、operation progress 与详情 inspect 模式。

## 2.6 当前 Audit

`apps/admin/app/admin/audit/page.tsx` 已经包含：

- 服务端分页；
- q 查询；
- 本地过滤；
- cursor；
- 明确写出“查询失败不能解释为空数据”。

这说明审计页面已经具备正确方向，但当前实现仍会在失败时 `setEntries([])`，随后 UI 同时可能显示“暂无可显示记录”。

目标架构应严格禁止：

```text
Error -> [] -> Empty State
```

正确状态应是：

```text
Error -> ErrorState(lastKnownData?)
Empty -> EmptyState
```

二者是不同状态。

## 2.7 当前视觉基础

`apps/admin/app/globals.css` 当前是独立的：

- Arial；
- hard-coded hex；
- `.shell` / `.panel` / `.data-list`；
- flat flex nav；
- 少量移动端 media query。

这与仓库 UI 包规范并不一致。

仓库 `packages/ui` 已存在并导出：

- Sidebar
- Page
- Breadcrumb
- Card
- Table / DataTable / EnhancedDataTable
- EmptyState
- ErrorBoundary
- Alert / Badge
- Skeleton / Spinner / LoadingOverlay
- Dialog / AlertDialog
- Drawer / Sheet
- Command
- Sonner Toast
- CopyToClipboard
- Tabs
- Input OTP
- Chart
- ModeToggle
- Stepper
- FileUploader

因此本次设计不需要重新发明基础组件库。

---

# 3. 外部参考研究与可借鉴模式

本文不是要求“照抄某个 Dashboard”，而是提炼成熟控制台已经证明有效的交互结构。

## 3.1 Vercel：Global scope 与 Project scope 分层

Vercel 把 Team 和 Project 明确区分；大量设置只在 Project 内出现，而 Activity/Audit 等又有更高层级的入口。

Aisenhub 对应关系非常自然：

```text
Vercel Team        -> Aisenhub Global Admin
Vercel Project     -> Aisenhub Platform
Project Settings   -> Platform Settings
Activity Log       -> Audit / Activity
```

值得借鉴：

- 用户始终知道自己当前操作的是全局还是某个 Project；
- Project 选择以后，导航内容随上下文变化；
- Project Overview 不只是 CRUD，而是该对象的“状态首页”。

不应照搬：

- Aisenhub V1 没有 Team/Organization/RBAC 产品模型；
- Platform 是业务 Tenant，不要新增 Vercel 式组织模型。

参考：
- https://vercel.com/academy/optimize-your-vercel-account/tour-the-dashboard
- https://vercel.com/docs/project-configuration/project-settings
- https://vercel.com/docs/activity-log

## 3.2 Stripe：全局搜索、快捷入口和随时可调出的诊断面板

Stripe Dashboard 有三个特别适合内部 Admin 的模式：

1. 全局资源搜索；
2. Shortcuts / 最近访问；
3. Workbench：不离开当前业务页面即可打开技术诊断工具。

Aisenhub 不需要复制 Stripe Workbench 的 API Shell，但可以借鉴其“业务操作与诊断信息并存”的思路：

- Command/Search 用于找 Platform、Account、File、Subscription、Audit target；
- Error surface 保留 `request_id`；
- Resource Inspector 可以展示安全的技术 metadata 和最近 activity；
- Operations/System Health 可以作为诊断入口，而不污染普通业务表格。

没有后端 global search API 前，只实现导航 Command Palette；不能显示假搜索结果。

参考：
- https://docs.stripe.com/dashboard/basics
- https://docs.stripe.com/dashboard/search
- https://docs.stripe.com/workbench/overview
- https://docs.stripe.com/development/dashboard/request-logs

## 3.3 Supabase：设置归属、Logs 三段式诊断与 Reports

Supabase Dashboard 最近的导航调整有一个值得直接吸收的原则：

> 数据库设置放回 Database，Storage 设置放回 Storage，而不是所有配置都堆进一个 Settings。

Aisenhub 也应如此：

- File Policy 应归 Files；
- Origin / API Key 属于 Platform Integration / Settings；
- Plan/Subscription 归 Entitlements；
- MFA 归 Admin Security；
- 不建立一个巨大“Settings 大杂烩”。

Supabase Logs 的典型交互也是很好的 Admin 诊断模式：

```text
Timeline / summary
       ↓
Filterable table
       ↓ select row
Detail panel
```

Aisenhub 的 Audit、Operations、未来 System Health 都可以采用该模式。

参考：
- https://supabase.com/changelog/37655-dashboard-navigation-updates-project-settings
- https://supabase.com/docs/guides/observability/logs
- https://supabase.com/docs/guides/observability/reports
- https://supabase.com/docs/guides/security/platform-audit-logs

## 3.4 Kiranism next-shadcn-dashboard-starter：真正可工作的 Admin 交互模式

仓库自己的 `docs/upstream-sources.md` 已经把 Kiranism 项目列为 Admin UI 参考。

值得吸收的不是视觉皮肤，而是：

- server prefetch + interactive client table；
- URL 同步搜索、filter、sort、pagination；
- 表格是真正工作的，不是静态 demo；
- Overview 的不同区域有独立 loading/error boundary；
- feature-based folder；
- command palette；
- responsive multi-panel layout。

本项目不应迁移它的 Clerk、Organization、Billing 或 RBAC。

参考：
- https://github.com/Kiranism/next-shadcn-dashboard-starter

---

# 4. 目标体验原则

## 4.1 不是“后台模板”，而是 Developer Platform Control Plane

Admin 的目标风格：

```text
Vercel 的上下文清晰
+ Stripe 的资源可发现性
+ Supabase 的诊断能力
+ Linear 类产品的流畅交互密度
+ Aisenhub 自己的安全状态语义
```

但不复制品牌外观。

### 视觉关键词

- clean
- technical
- calm
- high signal
- compact but breathable
- low decoration
- high state clarity

### 避免

- 巨大渐变 banner；
- 每个卡片都有重阴影；
- 所有操作都用 primary 蓝色按钮；
- Dashboard 首页塞满没有业务意义的图表；
- 用动画掩盖真实网络等待；
- 用漂亮 Skeleton 代替错误处理。

## 4.2 操作要“就近完成”

推荐交互分级：

| 操作 | 推荐呈现 |
|---|---|
| 快速查看 resource | Detail Drawer |
| 简单安全编辑 | Drawer / Dialog |
| 复杂编辑 | Full Page |
| destructive mutation | Confirm Dialog |
| 高风险 + recent MFA | Confirm -> Step-up -> Mutation |
| 一次性 secret | Dedicated Secret Delivery Panel/Dialog |
| 长任务 | Operation Detail / Timeline |
| 导航 | Sidebar / Command Palette |

## 4.3 少跳转，但不把所有东西塞进一页

“减少页面跳转”不等于 mega page。

判断规则：

- 同一 resource 的查看详情：Drawer；
- 需要持续上下文的配置：Tab / nested page；
- 有多个独立生命周期的资源：拆路由；
- destructive / irreversible：Dialog + 独立确认上下文。

---

# 5. Admin 信息架构

## 5.1 两层上下文

Admin 必须明确区分：

```text
Global Scope
└── 所有平台之上的控制面

Platform Scope
└── 当前选中的单个平台工作区
```

这是本次前端信息架构最重要的决定。

## 5.2 Global Navigation

建议固定：

```text
Home
├── Overview

Manage
├── Platforms

Operate
├── Operations
├── Audit & Activity
└── System Health       [规划]

Admin
└── Security
```

### Overview

展示可以真实获得的信息：

- Platform 总数 / disabled 数；
- 最近 Admin activity；
- Pending / blocked operations；
- 最近错误或需要关注的状态；
- Quick actions。

如果当前 API 不支持聚合指标，则页面规划保留，但第一版只展示真实可查询数据与快捷入口，不制作假图表。

### Platforms

全局平台目录：

- Search；
- status filter；
- name/code；
- activation policy；
- account/file/subscription 摘要（只有 API 支持时）；
- create platform；
- select/open platform。

### Operations

用于聚合“需要等待、失败恢复、异步执行”的东西。

第一阶段可真实接入：

- deletion jobs；
- file `deleting`；
- file `unknown_write_outcome`。

后续规划：

- reconciliation jobs；
- maintenance runs；
- failed scheduled tasks；
- retry history。

### Audit & Activity

保留当前 audit 的只读安全语义，升级成：

```text
Toolbar / filters
↓
Event table
↓ select
Detail Drawer
```

未来支持：

- actor；
- platform；
- target type；
- action；
- outcome；
- time range；
- request id；
- safe metadata。

### System Health `[规划能力]`

该页面属于 Frontend 规划，但需要 Observability 后端支持后才能真实上线。

规划内容：

- Account API health；
- Auth dependency health；
- DB / Storage connectivity；
- 5xx / auth failure trend；
- pending worker count；
- oldest pending job age；
- last successful reconciliation；
- recent incident/failure feed。

禁止在没有真实数据源时用绿色假状态。

### Admin Security

整合：

- 当前管理员 identity；
- session state；
- MFA factor；
- recent MFA status；
- logout；
- 未来 recovery/rotation 管理。

具体 Auth 行为仍由 Authentication & Session 架构维护。

---

# 6. Platform Workspace 架构

## 6.1 Platform 作为显式 URL Context

推荐最终路由：

```text
/admin/platforms
/admin/platforms/[platformId]
/admin/platforms/[platformId]/accounts
/admin/platforms/[platformId]/plans
/admin/platforms/[platformId]/subscriptions
/admin/platforms/[platformId]/redemption-batches
/admin/platforms/[platformId]/files
/admin/platforms/[platformId]/settings
/admin/platforms/[platformId]/settings/origins
/admin/platforms/[platformId]/settings/keys
```

`platformId` 的唯一权威来源是 URL，而不是跨页面 React state。

PlatformSwitcher 只负责导航到新 URL，不成为授权状态。

这样可以解决当前：

- Entitlements 手输 Platform UUID；
- Files 自己 select platform；
- Platforms page 自己保存 selectedId；
- 页面刷新后上下文丢失；
- 链接不可分享。

## 6.2 Platform Header

每个 Platform page 顶部稳定显示：

```text
Breadcrumb
Platform name + code
Status badge
Platform ID copy
Primary context actions
Local navigation tabs
```

如果 platform disabled，应在整个 workspace 顶部显示 persistent warning banner，但不因为 disabled 就隐藏管理员诊断入口。

## 6.3 Platform Overview

目标不是另一个 CRUD 页面，而是回答：

1. 这个 Platform 当前是否健康？
2. 有多少账户？
3. 当前默认 Plan 是什么？
4. 有无异常文件 / deletion job？
5. API Key 是否处于合理轮换状态？
6. 最近发生了什么？

只有真实 API 支持的数据才展示。

建议卡片：

```text
Status
Accounts
Entitlement / Default Plan
Files / Policy
Keys
Recent Activity
Attention Required
```

## 6.4 Accounts

从当前 Platform Operations 中拆出。

列表字段建议：

- account id；
- user id（脱敏/可复制）；
- status；
- entitlement summary（API 支持后）；
- last activity（后续）；
- actions。

行点击打开 Account Drawer：

```text
Summary
Status
Subscription
Files summary
Recent activity
Danger zone
```

动作 `suspend / restore / close` 不再共用页面顶部 reason input。

每一次操作独立 Dialog：

```text
Action
Target identity
Impact description
Reason input
Step-up requirement
Confirm
```

## 6.5 Entitlements

页面层级：

```text
Entitlements
├── Plans
├── Subscriptions
└── Redemption Batches
```

不要继续让 Plans 与 Redemption Batch 挤在同一大页。

### Plans

- Data table；
- status/kind/default filter；
- Create Plan Drawer；
- Edit/Archive Dialog；
- default free 的特殊状态使用明确 badge；
- 归档默认 Plan 的业务拒绝由 API 返回，不在前端复制全部规则。

### Subscriptions

目标列表：

- Account；
- Effective Plan；
- source；
- state；
- expiry；
- last change；
- command actions。

选择一条进入详情 Drawer/Full Page，展示 entitlement timeline。

### Redemption Batches

- Batch list；
- plan；
- quantity；
- status；
- expiry；
- delivery state；
- created time。

创建批次使用 dedicated flow，而不是普通 form + status 文本。

## 6.6 Files

建议页面结构：

```text
Files
├── Usage / Policy Summary
├── Filters
├── File Table
└── File Inspector Drawer
```

File row 必须有明确状态：

```text
Active
Receiving
Storing
Deleting
Deleted
Unknown outcome
Failed / blocked（若合同存在）
```

UI 文案把内部技术状态转换成人类可理解的主文案，同时保留原始 status 在 detail metadata。

例如：

```text
主文案：正在确认上传结果
技术状态：write_outcome=unknown
说明：当前配额仍被保留，暂不能再次上传或清除
```

File Policy 属于 Files 自己，不建议移动到全局 Settings。

## 6.7 Platform Settings

只放 Platform 自己的配置：

### General

- name/code；
- active/disabled；
- activation policy。

### Origins

- environment；
- origin；
- callback URLs；
- status。

### API Keys

Key 生命周期建议做成独立页面，因为它具有明显安全流程：

```text
Create new key
↓
Show one-time secret
↓
Operator deploys key
↓
Confirm deployment
↓
Old key becomes revocable
↓
Revoke old key
```

这比把 create/confirm/revoke 三个按钮塞在 Platform 页内更容易避免误操作。

---

# 7. Admin Shell

## 7.1 Desktop Layout

建议：

```text
┌─────────────────────────────────────────────────────────┐
│ Sidebar │ Topbar                                        │
│         ├───────────────────────────────────────────────┤
│         │ PageHeader                                    │
│         │ Breadcrumb / title / actions                  │
│         ├───────────────────────────────────────────────┤
│         │ Content                                       │
│         │                                               │
└─────────────────────────────────────────────────────────┘
```

推荐尺寸语义：

- expanded sidebar：约 240–260px；
- collapsed sidebar：icon rail；
- topbar：约 52–60px；
- content 最大宽度不是固定 70rem，数据页允许更宽；
- 表格页优先使用 viewport 宽度；
- form/detail 页保持合理阅读宽度。

## 7.2 Sidebar

Sidebar 包含：

```text
Logo / Admin
Platform Switcher
Global nav
Platform nav (if selected)
Footer: Admin identity / Security / Logout
```

规则：

- active route 清晰；
- nested group 可折叠；
- 不根据客户端权限过滤来实现安全；
- mobile 变 Sheet；
- collapsed 状态可保留在 cookie/local preference，但不包含安全信息。

## 7.3 Topbar

建议：

```text
Breadcrumb / Context
Global Search / Command
Operational alerts entry [规划]
Theme
Admin account menu
```

## 7.4 Command Palette

第一阶段：

- 页面导航；
- 最近访问；
- 打开当前 Platform 常用页面；
- 创建 Platform 等明确快捷动作。

后续有 Global Search API 后：

- Platform；
- Account ID；
- User ID；
- File ID；
- Subscription；
- Request ID / Audit target。

**没有后端搜索能力前禁止做假全局资源搜索。**

---

# 8. 页面状态模型

## 8.1 Remote Data 五态

上位架构确定的五态继续作为唯一基础：

```ts
type RemoteDataState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'recoverable_error'; error: PresentedError }
  | { status: 'access_error'; error: AccessError };
```

实现不要求一定真的用这个 union 类型，但页面行为必须等价。

## 8.2 Loading 再细分

视觉上必须区分：

### Initial loading

没有内容：Skeleton / Page loading。

### Section loading

页面已经可用，一个 section 正在加载。

### Background refresh

已有数据继续显示：

```text
Last known data
+ subtle refreshing indicator
```

禁止把整个页面清空回 Skeleton。

### Mutation pending

只禁用当前 action scope。

例如删除 File A：

- File A 删除按钮 pending；
- File B 下载仍然可用；
- page refresh 按钮是否可用取决于冲突关系；
- 不使用 global `busy=true` 锁全页。

## 8.3 Empty 的四种含义

EmptyState 至少区分：

```text
True Empty
Filter Empty
Context Missing
No Permission
```

其中 No Permission 不是 Empty。

例：

### True Empty

> 当前平台还没有配置文件。  
> 上传或等待 Consumer 创建第一个文件。

### Filter Empty

> 没有符合 “unknown” 的文件。  
> [清除筛选]

### Context Missing

> 先选择一个 Platform 查看账户。

### Error

绝不能显示“暂无数据”。

## 8.4 Access Error

统一映射：

```text
Unauthenticated
→ session orchestration / login

Session expired
→ expired session recovery

Recent MFA required
→ step-up flow

Forbidden
→ Permission State

Platform disabled / account suspended
→ Domain access state
```

普通页面不能把这些都翻译为：

> 请确认管理员会话。

## 8.5 Recoverable Error

例如：

- network error；
- Account API 503；
- temporary authorization dependency outage；
- timeout；
- rate limit。

ErrorState 需要：

- 人类可读 title；
- 简短说明；
- Retry（安全时）；
- request id / support id；
- 技术 code 可折叠展示。

## 8.6 背景刷新错误

如果已有数据：

```text
Data remains visible
+ Inline warning
+ Retry
```

不要因为 refresh 失败而把表格清空。

---

# 9. Mutation 状态模型

## 9.1 统一状态

```ts
type MutationState =
  | 'idle'
  | 'confirm_required'
  | 'step_up_required'
  | 'pending'
  | 'accepted'
  | 'success'
  | 'failure'
  | 'unknown_outcome';
```

## 9.2 confirm_required

用于：

- archive plan；
- revoke key；
- close account；
- delete file；
- start global deletion；
- confirm redemption delivery。

使用项目 ConfirmDialog，不再使用 `window.confirm`。

## 9.3 step_up_required

UI 不自己判断“5 分钟是不是过期”。

流程：

```text
Mutation intent
↓
API / Auth layer indicates recent MFA required
↓
Open Step-up flow
↓ success
Retry original intent under permitted replay contract
```

是否自动继续 mutation 必须遵守 Auth/API 架构冻结的 replay 规则。

## 9.4 pending

按钮行为：

- 保持原 label 语义，例如 `Revoking…`；
- spinner 不替代文字；
- 防止重复提交；
- 只锁冲突资源。

## 9.5 accepted

HTTP 202 / 长任务不能显示“删除成功”。

应显示：

> 删除请求已接受，后台正在处理。

并提供：

- operation/job link；
- current status；
- refresh/poll；
- 失败时恢复入口。

## 9.6 unknown_outcome

这是高风险系统必须保留的状态。

适用：

- 网络断开但服务端可能已经提交；
- Storage write outcome unknown；
- mutation response 丢失且不可确认。

UI 行为：

```text
Unknown outcome
→ 禁止立即创建第二个相同高风险操作
→ 先刷新/查询 authoritative state
→ 可确认后再决定 retry
```

不能把它映射成普通红色 “Failed”。

---

# 10. Data Table 架构

## 10.1 URL 是查询状态权威来源

列表查询建议使用 URL：

```text
?q=
&status=
&kind=
&sort=
&cursor=
```

好处：

- 刷新不丢；
- browser back 正确；
- 可复制链接；
- 页面之间行为一致。

不要把 Platform context 或 table filter 只放在 `useState`。

## 10.2 Server 与 Client filter

原则：

- 数据量相关过滤交给 server；
- 已加载数据的即时小过滤可以 client；
- UI 必须知道自己展示的是“当前页过滤”还是“服务器结果”；
- 不应让相同输入同时产生两个语义不清晰的 filter。

推荐：输入 debounce 后更新 URL/server query；必要时保留显式 Submit。

## 10.3 Table Toolbar

统一结构：

```text
Search
Filters
Active filter chips
Reset
View options
Primary action
```

只有真实支持的 filter 才显示。

## 10.4 Row action

- 常用安全动作直接按钮；
- 次要动作放 `...` menu；
- destructive action 最后一组；
- pending 只影响当前 row/action；
- row click 打开 inspect，不与 checkbox/action 冲突。

## 10.5 Pagination

当前 API 已经大量使用 cursor，因此 UI 继续以 cursor 为基础。

第一版：

```text
Previous（如果 API 支持）
Next
Page size（合同支持后）
```

不要为了 UI 好看强行计算不存在的总页数。

## 10.6 Mobile

技术数据表不能简单压成 320px 宽。

推荐：

- 最重要 2–3 列保留；
- secondary fields 移到 row details；
- row actions 使用 menu；
- 对审计/日志这种高密度表格允许横向滚动，但 header 固定；
- 手机查看详情优先 full-screen Sheet。

---

# 11. Detail Drawer / Inspector

Admin 大量资源适合统一 Detail Inspector。

结构：

```text
Header
├── Resource name / ID
├── Status
└── actions

Overview
Metadata
Related resources
Activity
Technical
Danger zone
```

## 11.1 技术字段

Admin 是工程运营工具，可以展示：

- request id；
- resource id；
- timestamps；
- raw stable status；
- version / ETag（适用时）。

但：

- 不直接展示 secret；
- 不展示 token；
- 不展示 MFA secret；
- metadata 默认经过脱敏。

## 11.2 Copy behavior

ID 使用 copy button，而不是要求用户手动拖选 UUID。

现有 `@kit/ui/copy-to-clipboard` 可以复用。

---

# 12. 高风险操作 UX

## 12.1 标准流程

```text
Click destructive action
↓
Confirm Dialog
  Resource identity
  Consequence
  Reason if required
↓
Recent MFA if required
↓
Pending
↓
Result
↓
Audit / request id
```

## 12.2 Confirm Dialog 规则

必须说明：

- 操作对象；
- 影响；
- 是否可逆；
- 是否异步；
- 是否保留历史数据；
- reason 要求。

例如 Plan archive：

> 归档后不能再用于新的授权，但历史权益不会被删除。

而不是：

> Are you sure?

## 12.3 Danger Zone

不可逆操作放到资源详情底部 `Danger Zone`，减少误触。

不要把 `Disable Platform`、`Revoke Key`、普通 Edit 都设计成相同视觉权重。

---

# 13. One-time Secret UX

Platform Key、Redemption Codes 都需要特殊组件，而不是 Toast。

## 13.1 状态

```text
not_generated
↓
generating
↓
presented_once
↓
acknowledged
```

浏览器刷新 / 离开后不能假装可以恢复 secret。

## 13.2 Secret Panel

应该包含：

- 明确的“一次性显示”警告；
- monospace secret；
- Copy；
- 安全保存提示；
- acknowledge/confirm action；
- 不把 secret 放 URL；
- 不放 toast；
- 不放普通 status 字符串；
- 不记录 analytics payload。

Redemption Batch 在 acknowledged 后清除页面内明文和 receipt，继续沿用当前安全合同。

---

# 14. Operations Center

这是建议扩展的一级 Admin 能力。

## 14.1 为什么需要

当前已经存在：

- deletion jobs；
- file deleting；
- file unknown write outcome；
- 后续 maintenance/reconciliation。

这些不适合永远分散在每个业务页里。

## 14.2 页面结构

```text
Operations Overview
├── Needs attention
├── Running
├── Recently completed
└── Failed / blocked

Operation List
└── Detail Timeline
```

## 14.3 Operation Detail

```text
Operation ID
Type
Target
Platform
State
Created
Last update
Request ID
Checkpoint / timeline
Safe retry action（只有合同允许）
```

## 14.4 实现成熟度

### 可先实现

- deletion job list/details；
- 从 file API 派生的 deleting/unknown entries。

### 需要后端扩展

- 统一 operation feed；
- cross-domain retry command；
- background worker metrics；
- incident correlation。

Frontend 文档规划这些页面，但第一期不能造假数据。

---

# 15. System Health / Diagnostics `[规划]`

这部分建议纳入长期 Admin，但不属于本次前端第一期真实功能。

## 15.1 页面目标

回答运营人员：

> “系统现在是否正常？哪里出问题？我应该去哪里继续查？”

## 15.2 信息层级

```text
Overall status
↓
Services
  Auth
  Account API
  Database
  Storage
  Maintenance
↓
Signals
  Error rate
  401/403/429/5xx
  Worker backlog
  Oldest pending job
↓
Recent incidents
↓
Logs / Audit / Request inspector
```

## 15.3 依赖

依赖 Category 05 Observability。

如果没有 metrics API，只保留 route/design，不上线绿色状态卡。

---

# 16. Search / Command 架构

## 16.1 Command

无需后端即可真实实现：

- Navigation；
- Actions；
- Current platform shortcuts；
- Recent route history。

## 16.2 Global Resource Search `[后端依赖]`

未来搜索实体：

```text
Platform
Account
User ID
Plan
Subscription
Redemption Batch
File
Operation
Request ID / Audit
```

结果按类型分组。

点击结果：

- Platform -> workspace；
- resource -> Detail Inspector / route；
- request ID -> diagnostics / audit。

建议借鉴 Stripe 搜索“输入 ID 直接到对象”的体验。

---

# 17. Visual System

## 17.1 组件基础

保持：

- Next.js；
- TypeScript；
- Tailwind；
- Base UI / shadcn；
- `@kit/ui`。

不要求视觉必须像 Makerkit。

Makerkit 只作为当前 UI 工程基础，不作为视觉风格约束。

## 17.2 Semantic Tokens

Feature 层禁止继续大量 hard-coded hex。

至少建立：

```text
background
surface
surface-subtle
border
text
text-muted
primary
success
warning
danger
info
focus
```

StatusBadge 只通过语义 variant 使用颜色。

## 17.3 状态颜色

建议语义：

- neutral：inactive / archived；
- success：active / confirmed；
- warning：pending / expiring / attention；
- danger：failed / revoked / destructive；
- info：processing / running；
- unknown：unknown outcome 使用 warning + explicit icon，不与 failed 混淆。

颜色不能是唯一信息来源，必须有 text/icon。

## 17.4 Typography

不再用全局 Arial 作为产品设计目标。

优先沿用项目现有 Web font/系统字体方案；技术 ID / code 使用 monospace token。

层级：

```text
Page title
Section title
Body
Label
Metadata
Code/ID
```

## 17.5 Density

Admin 可比 Consumer 更紧凑：

- table row 40–48px；
- card padding 16–24px；
- toolbar 保持单行优先；
- metadata 不需要巨型文字。

Overview 可以更舒展，但资源页优先信息效率。

## 17.6 Motion

只允许功能性 motion：

- Drawer / Sheet；
- Toast；
- row insertion/removal；
- loading transition。

遵守 `prefers-reduced-motion`。

---

# 18. Shared Frontend Components

## 18.1 优先复用现有能力

现有 `@kit/ui` 已有大量基础组件，不能复制另一套 Button/Table/Dialog。

## 18.2 建议新增的通用组合组件

放置位置应在实施计划时根据复用范围确定；跨 Admin/Consumer 的通用组件可进入 `packages/ui/src/makerkit`，Admin 特有组件留在 `apps/admin`。

建议组合：

```text
AsyncState
PageLoading
SectionLoading
ErrorState
PermissionState
EmptyStatePreset
RetryButton
MutationButton
StatusBadge
SupportErrorId
ConfirmActionDialog
OneTimeSecretPanel
ResourceId
ResourceInspector
DataTableToolbar
FilterChips
```

注意：

- 不修改 upstream-owned `packages/ui/src/shadcn/*` 加项目逻辑；
- 新组合必须走 `@kit/ui/<name>` export；
- interactive element 按仓库规则增加 `data-test`。

## 18.3 Admin-only 组件

建议：

```text
apps/admin/components/
├── admin-shell
├── admin-sidebar
├── admin-topbar
├── admin-page-header
├── platform-switcher
├── command-menu
├── admin-security-indicator
└── operation-indicator
```

---

# 19. State Ownership

这是防止以后每个 Agent 各自发明 state store 的关键合同。

## 19.1 URL State

权威来源：URL。

包含：

- platform id；
- resource id route；
- q；
- filters；
- sort；
- pagination cursor；
- active tab（需要 deep-link 时）。

## 19.2 Server Data

权威来源：API。

页面不能把本地 store 当业务事实。

可以使用 framework/query cache 改善体验，但必须：

- 不缓存 authorization 判断作为授权依据；
- Admin sensitive data 在 logout 时清理；
- mutation 后 authoritative refetch/invalidation；
- no-store/security contract 仍由 API 层决定。

## 19.3 Ephemeral UI State

放本地 component/state：

- drawer open；
- dialog open；
- current draft；
- selected table rows；
- hover/expanded；
- sidebar collapsed。

不要为这些引入全局 store。

## 19.4 Session State

唯一来源：Authentication & Session 模块。

Frontend 只能消费：

```text
unauthenticated
authenticated
refreshing
mfa_required
expired
```

不自行再造一套 `isLoggedIn`。

## 19.5 Mutation Intent State

高风险 mutation 的 operation/idempotency 生命周期由 API Client / business flow 维护。

UI 只保存当前 intent context，不自行改变幂等语义。

---

# 20. Error Presentation Contract

## 20.1 Error Presenter

```text
ApiError
↓
ErrorClassifier
↓
PresentedError
↓
UI Surface
```

PresentedError：

```ts
type PresentedError = {
  title: string;
  description?: string;
  severity: 'info' | 'warning' | 'error';
  recoverability: 'retryable' | 'action_required' | 'not_retryable';
  action?: 'retry' | 'login' | 'mfa' | 'refresh' | 'contact_support';
  requestId?: string;
  technicalCode?: string;
};
```

## 20.2 常见映射

| 类别 | UI |
|---|---|
| 401 / expired | Session recovery |
| recent MFA required | MFA prompt |
| 403 | PermissionState |
| 404 | ResourceNotFound |
| 409 | Conflict inline/dialog |
| 412 | Stale version / reload conflict |
| 429 | Rate limit + retry timing |
| 5xx | Recoverable Error |
| dependency unavailable | Service unavailable |
| unknown mutation result | UnknownOutcome state |

## 20.3 技术 code

主文案不显示：

```text
AUTHORIZATION_UNAVAILABLE
PRECONDITION_FAILED
```

但可以在：

```text
Technical details
Code
Request ID
```

中显示，便于支持。

---

# 21. Toast / Alert / Inline Error 使用规则

## Toast

用于：

- mutation completed；
- copy succeeded；
- background operation notification。

不用于：

- 表单字段错误；
- 页面首次 load failure；
- one-time secret；
- destructive confirmation。

## Inline Alert

用于：

- platform disabled；
- policy warning；
- unknown write outcome；
- background refresh failed；
- partial service degradation。

## Field Error

直接在字段下显示，并与输入关联。

## Page Error

页面主体无法使用时显示 ErrorState。

---

# 22. Form Architecture

## 22.1 Form 形态

- 2–4 个简单字段：Dialog/Drawer；
- 较复杂设置：Full Page；
- destructive：Confirm Dialog，不复用普通编辑 form；
- secret generation：Dedicated flow。

## 22.2 Validation

客户端：快速反馈。  
服务端：最终权威。

不能因客户端校验通过就认为服务器必成功。

## 22.3 Dirty State

复杂设置页：

- dirty indicator；
- Save / Cancel；
- route leave warning 仅在确有丢失风险时使用。

简单 Dialog 关闭时如果有 draft，可二次确认。

---

# 23. Responsive Architecture

## 23.1 Desktop

主要目标：1280–1600+ 宽度的高效运维。

## 23.2 Tablet

- sidebar collapsed；
- two-column detail 降成 single column；
- toolbar wrap；
- drawer width适配。

## 23.3 Mobile

最低审查：

```text
320
375
390
768
```

策略：

- sidebar -> Sheet；
- topbar 保留 context + search；
- table -> condensed rows / cards；
- high-risk dialog -> full-screen / large Sheet；
- IDs 必须 break/copy；
- primary action 可 sticky，但不能覆盖内容；
- OTP 输入确保软键盘/自动填充正常。

Admin 不需要为手机追求桌面相同信息密度，但不能完全不可用。

---

# 24. Accessibility

目标：WCAG 2.2 AA 作为产品级方向。

必须覆盖：

- keyboard navigation；
- visible focus；
- semantic `<table>` 优先；
- Dialog focus trap；
- Drawer focus restoration；
- `aria-live` pending/result；
- `role=alert` 关键失败；
- label / description / error association；
- icon button accessible name；
- disabled 与 pending 可被辅助技术理解；
- color 不作为唯一状态信号；
- reduced motion。

---

# 25. Consumer Experience

Frontend Experience & State 不是只改 Admin。

Consumer 应复用相同状态语义，但视觉更轻。

## 25.1 Consumer 信息架构

当前 template-preview 已有：

```text
login
signup
forgot-password
update-password
pricing
account
subscription
files
```

建议 Consumer protected shell：

```text
Account Overview
Subscription
Files
Profile / Preferences
Security
```

不使用 Admin 那种高密度运维 sidebar，优先更简单的 task-oriented navigation。

## 25.2 统一状态

Consumer 和 Admin 共用：

- Loading；
- Empty；
- Error；
- Retry；
- Mutation pending；
- Session expired；
- MFA/reauth；
- Support request id。

但文案不同。

例如 Admin 可以说：

> Account API 暂时不可用 · Request ID ...

Consumer 应优先说：

> 暂时无法加载账户信息，请稍后重试。

Technical details 默认折叠。

---

# 26. 推荐页面清单与成熟度

| 页面/能力 | 当前后端基础 | Frontend 建议 |
|---|---|---|
| Admin Overview | 部分 | 重做真实控制面 |
| Platforms | 已有 | 重构列表 + workspace |
| Platform Overview | 部分 | 新页面 |
| Accounts | 已有 | 从 platform mega-page 拆出 |
| Plans | 已有 | 拆独立页 |
| Subscriptions | 已有 | 重构 table + detail |
| Redemption Batches | 已有 | 拆独立页 + secret flow |
| Files | 已有 | 重构 state + inspector |
| File Policy | 已有 | 保留在 Files 范围 |
| Origins | 已有 | 拆到 Platform Settings |
| API Keys | 已有 | 独立生命周期 UI |
| Deletion Jobs | 已有 | 合入 Operations |
| Audit | 已有 | table + detail drawer |
| Operations Center | 部分 | 可逐步真实实现 |
| System Health | 不完整 | 页面规划，等 Observability |
| Global resource search | 不完整 | 先 Command，后 Search API |
| Notifications/Alerts | 不完整 | 后续规划，不做假 badge |
| Request Inspector | request_id 基础 | 后续 diagnostics |

---

# 27. 不建议现在增加的功能

即便允许扩展资源范围，本次仍不建议为了“像成熟 SaaS”而增加：

- Organization / Team 管理；
- 通用 RBAC 编辑器；
- 支付 Checkout / Invoice；
- Chat；
- CRM；
- Kanban；
- 用户消息中心；
- 任意 SQL console；
- 任意 API Shell；
- 任意数据库 CRUD 浏览器。

这些与当前 Aisenhub Central Account Control Plane 没有直接必要性。

---

# 28. 推荐前端目录架构

实施时可逐步迁移为 feature-based，而不是继续所有 page 自己定义 DTO/fetch/state。

建议目标：

```text
apps/admin/
├── app/
│   └── admin/
│       ├── layout.tsx
│       ├── page.tsx
│       ├── platforms/
│       ├── operations/
│       ├── audit/
│       ├── system/
│       └── security/
│
├── components/
│   ├── shell/
│   ├── navigation/
│   └── platform-context/
│
└── features/
    ├── overview/
    ├── platforms/
    ├── accounts/
    ├── plans/
    ├── subscriptions/
    ├── redemption/
    ├── files/
    ├── operations/
    ├── audit/
    └── system-health/
```

每个 feature 内：

```text
components/
queries or loaders/
mutations/
state presentation/
columns/
schemas/
```

但不要在本专题单独建立第二套 API error/client；等待 Category 04 公共 API client。

---

# 29. Server / Client Component 边界

建议页面默认保持 Server Component 能力，交互表面再切 Client Component。

示意：

```text
Page (server)
├── metadata / route context
├── initial data when appropriate
└── FeatureSurface (client)
    ├── filter
    ├── table
    ├── drawer
    └── mutation
```

不要把整个 Admin 因为一个按钮就全部变成 `'use client'`。

但是否引入 server prefetch + TanStack Query 应在实施计划中基于当前 app dependency 再核对；架构不要求为了状态管理额外引入新库。

现有 `@kit/ui` 已经有 TanStack table 相关基础，因此优先复用现有能力。

---

# 30. React Query / Cache 的架构边界

Kiranism 的 React Query 模式值得参考，但 Aisenhub 必须遵守安全边界。

允许：

- 页面内 server data cache；
- mutation 后 invalidation；
- background refetch；
- previous data during pagination；
- session 生命周期内的短期内存状态。

禁止：

- authorization result 当长期 cache；
- MFA valid / permission result 作为客户端授权依据；
- logout 后保留敏感 Admin query cache；
- mutation optimistic update 覆盖安全关键事实，除非该业务明确安全。

对高风险 Admin mutation 默认：

```text
Server result first
→ then update UI
```

而不是 optimistic success。

---

# 31. Overview 的指标规则

Dashboard 图表很容易变成“看起来高级但没有意义”。

指标只有满足以下条件才上首页：

1. 有真实数据源；
2. 定义清晰；
3. 时间范围清晰；
4. 对管理员操作有意义；
5. 失败时不显示旧值冒充当前状态。

优先指标：

- disabled platform；
- suspended account；
- pending/failed operation；
- unknown file outcome；
- expiring/disabled key（若有真实语义）；
- recent admin failures。

不优先：

- “总点击数”；
- 无时间窗口的随机 chart；
- 纯装饰同比箭头。

---

# 32. Resource Activity

成熟 Admin 的 resource detail 应逐渐带 Activity Timeline。

例如 Platform：

```text
created
origin added
key created
key deployment confirmed
old key revoked
platform disabled
```

Account：

```text
activated
suspended
restored
plan changed
closed
```

这可以逐步从 Audit 数据派生。

如果当前 audit endpoint filter 不支持精确 target，则先保留入口规划，不做前端全量拉取再搜索历史。

---

# 33. 旧页面退出策略

不要长期维护“新 Admin + 旧 Admin”两套操作入口。

迁移原则：

1. 新 Shell 先落地；
2. 现有路由可暂时映射/redirect 到新资源页；
3. Platform context 统一后，删除手输 Platform ID 的主路径；
4. 拆分 Plans/Batch 后，旧 Entitlements mega page 退出；
5. Operations 接管 deletion-jobs 后保留 redirect；
6. 旧 `.panel/.data-list` 风格不再扩展；
7. `window.confirm` 完成迁移后删除；
8. 页面内重复 csrf/fetch helper 由 Category 04 API client 接管。

避免同时维护两套真实 mutation UI。

---

# 34. 分阶段架构落地建议

这不是执行计划，只定义合理的架构演进顺序。

## Phase A — Experience Foundation

- semantic design tokens；
- AdminShell；
- Sidebar / Topbar；
- PageHeader；
- RemoteData state components；
- Error/Empty/Loading；
- Toast / Dialog 使用规则；
- StatusBadge。

## Phase B — Platform Context

- Platform list；
- PlatformSwitcher；
- URL-based `[platformId]`；
- Platform Overview；
- remove manual platform ID primary UX。

## Phase C — Core Resource Pages

推荐：

```text
Accounts
→ Plans
→ Subscriptions
→ Redemption Batches
→ Files
→ Platform Settings
```

## Phase D — High-risk Interaction

- recent MFA presentation；
- ConfirmActionDialog；
- one-time secrets；
- accepted / unknown outcome；
- operation state。

## Phase E — Operations & Audit

- Operations Center；
- Audit Inspector；
- resource activity；
- request-id UX。

## Phase F — Consumer Adoption

将统一状态组件、错误呈现、pending/retry 模型迁到 template-preview / registry 消费者模板。

## Phase G — Planned Diagnostics

依赖 Observability：

- System Health；
- alert center；
- global resource search；
- diagnostics inspector。

---

# 35. 测试与验收架构

## 35.1 每个数据页必须覆盖

```text
initial loading
success
true empty
filter empty
recoverable error
permission error
background refresh
```

## 35.2 每个 mutation 必须覆盖

```text
idle
pending
double click
success
business rejection
auth/session failure
recent MFA required
network error
unknown result（适用）
```

## 35.3 Admin 高风险

- confirm dialog focus；
- reason required；
- MFA transition；
- button double click；
- mutation result；
- request id；
- refresh after success；
- page reload behavior。

## 35.4 Responsive

至少：

```text
Desktop Chromium
Mobile Chromium 390px
320px smoke
768px tablet
```

## 35.5 Accessibility

- keyboard-only；
- focus restore；
- screen reader labels；
- alert/live region；
- dialog/sheet；
- table semantics。

---

# 36. 完成标准

Frontend Experience & State 架构真正落地后，应满足：

1. Admin 不再依赖一排平铺导航链接。
2. Admin 明确区分 Global 与 Platform scope。
3. Platform context 不再由各页面各自保存或手输。
4. 页面不再用一个 `status` 字符串代表全部状态。
5. Error 永远不会被展示为 Empty。
6. mutation pending 是 row/action-level，而不是默认锁整页。
7. destructive 操作不再使用 `window.confirm`。
8. recent MFA 是正式状态，不是失败文案。
9. 一次性 secret 有独立安全 UI。
10. 202/异步任务显示 accepted/running，而不是 success。
11. unknown outcome 有独立恢复逻辑。
12. 列表 filter/pagination 可 deep-link。
13. Admin 页面复用 `@kit/ui`，不再继续扩张独立 hard-coded UI 系统。
14. 桌面、平板、移动端都有明确 layout。
15. Consumer 与 Admin 共享基础状态语义。
16. 没有后端支持的 System Health / Global Search 等能力明确标为规划，而不是假功能。

---

# 37. 最终目标架构

```text
                         Aisenhub Frontend
                                │
             ┌──────────────────┴──────────────────┐
             │                                     │
        Admin Control Plane                   Consumer UI
             │                                     │
     ┌───────┴────────┐                   Task-oriented Shell
     │                │                            │
 Global Scope   Platform Workspace                 │
     │                │                            │
 Overview         Overview                     Account
 Platforms        Accounts                     Subscription
 Operations       Entitlements                 Files
 Audit             ├ Plans                     Security
 System*           ├ Subscriptions                 │
 Security          └ Redemption                    │
                   Files                           │
                   Settings                        │
     │                │                            │
     └────────────────┴──────────────┬─────────────┘
                                    │
                           Shared Experience Layer
                                    │
              Loading / Empty / Error / Permission
              Mutation / Retry / Pending / Unknown
              Dialog / Drawer / Toast / Inspector
              Responsive / Accessibility / Tokens
                                    │
                           API / Session Contracts
```

`System*` 为依赖 Observability 的规划能力。

最终产品目标：

> **Aisenhub Admin 不再是“能调用 API 的页面集合”，而成为一个围绕 Platform、资源状态、风险操作和系统诊断组织起来的现代 Control Plane。**

同时：

> **页面更好看不是独立目标；视觉层级、状态反馈、上下文稳定、操作可恢复和诊断可追踪共同构成“流畅”。**

---

# 38. 研究来源

## 本项目

- `AGENTS.md`
- `docs/architecture.md`
- `docs/development/contracts.md`
- `docs/upstream-sources.md`
- `apps/admin/app/admin/*`
- `apps/admin/app/globals.css`
- `packages/ui/AGENTS.md`
- `packages/ui/package.json`
- `packages/ui/src/makerkit/*`
- `apps/template-preview/app/*`
- `Aisenhub_Platform_Optimization_Architecture.md`

## 外部产品 / 官方资料

### Vercel

- https://vercel.com/academy/optimize-your-vercel-account/tour-the-dashboard
- https://vercel.com/docs/project-configuration/project-settings
- https://vercel.com/docs/activity-log
- https://vercel.com/docs/logs

### Stripe

- https://docs.stripe.com/dashboard/basics
- https://docs.stripe.com/dashboard/search
- https://docs.stripe.com/workbench/overview
- https://docs.stripe.com/development/dashboard/request-logs

### Supabase

- https://supabase.com/changelog/37655-dashboard-navigation-updates-project-settings
- https://supabase.com/docs/guides/observability/logs
- https://supabase.com/docs/guides/observability/reports
- https://supabase.com/docs/guides/security/platform-audit-logs

### GitHub OSS

- https://github.com/Kiranism/next-shadcn-dashboard-starter
- https://github.com/supabase/supabase/tree/master/apps/studio

---

# 39. 后续建议专题拆分

在本文确认后，建议不要立刻把整个 Frontend 一次性实施，可拆成以下后续分析 / 执行计划：

```text
02a-admin-shell-navigation.md
02b-frontend-state-contract.md
02c-admin-platform-workspace.md
02d-admin-resource-tables.md
02e-admin-high-risk-interactions.md
02f-operations-audit-diagnostics.md
02g-consumer-experience.md
02h-responsive-accessibility.md
```

其中最先值得进入执行计划的是：

```text
02a Admin Shell + Navigation
        ↓
02b Frontend State Contract
        ↓
02c Platform Workspace
```

因为这三项一旦稳定，后面的 Accounts / Entitlements / Files / Audit 页面就不需要每个 Agent 再重新决定导航、状态和交互规则。

# 40. FE-R1 修订后的架构决定

File Policy唯一归属平台Files范围；前文菜单是历史研究表达，Settings不再列第二入口。Auth状态直接消费现有state/resolved/stepUp，保留epoch与退出终态防回写。RemoteData数据结果与刷新维度分开，旧数据仅同平台/账户/会话上下文保留；平台URL不是授权依据。

平台Files依赖精确服务端过滤，不能全局分页后客户端筛选。订阅采用单账户详情；Operations先交删除任务有界列表，不造全量统计或精确Activity。高风险操作同页MFA、固定intent/key/payload，关闭Dialog不取消服务端任务；各操作恢复按执行合同矩阵。Consumer共享UI必须具备独立分发/安装证据。

默认简体中文覆盖Admin、Consumer、公开认证/套餐和Registry，保留必要英文技术标识与原始数据。中文术语、错误说明、无障碍文案、字体/日期/单位和五档排版作为本期验收，不延期到国际化专题。全量英语切换、翻译平台与语言路由不是本期目标。
