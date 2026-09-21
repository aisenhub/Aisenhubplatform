# Admin 2.0 导航与桌面工作区设计

状态：已实现

关联：[总计划](plan.md) · [当前 Admin 架构](../../architecture/modules/frontends.md)

## 背景与当前问题

当前 Admin 的后端边界基本合理：浏览器通过同源 Admin BFF 访问中央 API，平台上下文由 URL 中的 `platformId` 决定，敏感操作继续由服务端授权和近期 MFA 控制。主要问题集中在前端信息架构和操作流。

当前体验负担：

- Global Sidebar 以“工作台 / 运维与安全”混合业务、运维和管理员个人安全，分组不稳定。
- 进入平台后又出现一套横向 9 项导航；Global Sidebar 仍只高亮“平台”，导致上下文分散在 Sidebar、Topbar、PlatformHeader 三处。
- `设置 / Origins / Keys` 在路由上是父子关系，在 UI 中却被展平成同级；`计划 / 订阅 / 兑换批次` 缺少“商业化”分组。
- `/admin/mfa` 是认证流程，却被当成一级“安全设置”入口；进入后 Admin Shell 消失。
- Ctrl/Cmd+K 只镜像 Global Sidebar，无法表达平台资源。
- PlatformHeader 同时承担 breadcrumb、平台元数据、Switcher、warning 和一级导航，过重。
- 管理员跨账户、订阅、文件、审计查看时，需要重复搜索和跳页。

## 目标与范围

Admin 2.0 定义为“运行在浏览器中的桌面级管理应用”。

核心原则：

1. **Context first**：始终明确 Global Admin / Platform Workspace。
2. **Stay in flow**：能通过 Inspector / Split View 完成的查看和低复杂度操作，不强迫跳页。
3. **Dense but calm**：高信息密度，但导航和技术信息不抢任务焦点。
4. **Safe by construction**：现有权限、MFA、幂等、unknown outcome、审计语义不因 UI 重构改变。
5. **URL is state**：平台、资源和可分享的对象选择尽量进入 URL。

本次范围：

- Global / Platform 两种 Sidebar。
- 取消平台顶部横向一级导航。
- 简化 Topbar 和 PlatformHeader。
- 统一 Workspace Header / Toolbar / Table 的布局规则。
- 提升现有 ResourceInspector 为标准对象流。
- 升级 Command Menu，使其理解当前平台。
- 保留现有路由兼容。
- 覆盖桌面、窄屏、键盘、加载、空、错误和恢复状态。

非目标：

- 不修改 Admin API、Account API、OpenAPI、共享 DTO、PostgreSQL。
- 不修改登录、刷新、Cookie、CSRF、MFA / recent-auth 安全协议。
- 不修改 Billing、订阅、权益、兑换业务含义。
- 不新增第三方 UI 框架或依赖。
- 不做营销式视觉改版。
- 不做假全局搜索、假对象详情或假运维能力。

## 本任务发布规则例外

用户已明确要求：**本 Admin 2.0 优化任务中的前端改动统一按 R1 执行，不再按 R2/R3 升级。**

该例外只覆盖本次 Admin 2.0 前端实现与验收分级，不扩大到 Auth、API、SQL、支付、权限、Secret、生产部署或破坏性操作。若后续实现必须触碰这些边界，应单独说明并停止该部分，而不是借本例外扩大修改范围。

## 当前架构

主要入口：

- `apps/admin/components/shell/admin-shell.tsx`
- `apps/admin/components/shell/admin-sidebar.tsx`
- `apps/admin/components/shell/admin-topbar.tsx`
- `apps/admin/components/navigation/admin-navigation.ts`
- `apps/admin/components/navigation/admin-command-menu.tsx`
- `apps/admin/components/platform-context/platform-workspace.tsx`
- `apps/admin/components/platform-context/platform-header.tsx`
- `apps/admin/components/platform-context/platform-navigation.tsx`
- `apps/admin/features/*`

现有路由继续保留：

```text
/admin
/admin/platforms
/admin/billing
/admin/operations
/admin/audit
/admin/security

/admin/platforms/:platformId
/admin/platforms/:platformId/accounts
/admin/platforms/:platformId/plans
/admin/platforms/:platformId/subscriptions
/admin/platforms/:platformId/redemption-batches
/admin/platforms/:platformId/files
/admin/platforms/:platformId/settings
/admin/platforms/:platformId/settings/origins
/admin/platforms/:platformId/settings/keys
```

## 目标信息架构

### Global Mode

```text
Aisenhub Admin
│
├── 工作台
│   └── 概览
├── 业务管理
│   ├── 平台
│   └── Billing
├── 系统管理
│   ├── Operations
│   └── Audit
└── 管理员
    └── 安全与账户
```

`/admin/mfa` 不再作为 Sidebar 导航项，而是 Security 页面或敏感操作触发的 Authentication Flow。

### Platform Mode

```text
← 所有平台

AisenFlow ▾
● Active

平台
  概览
  账户

商业化
  套餐
  订阅
  兑换码

资源
  文件

配置
  基本设置
  Origins
  Platform Keys

────────────
全局管理
  Billing
  Operations
  Audit
```

### 页面结构

```text
App Shell
├── Sidebar
├── Topbar
└── Workspace
    ├── Workspace Header
    ├── Resource Toolbar
    ├── Resource View
    └── Optional Inspector
```

## 桌面交互基线

- Sidebar 展开约 240px，收起继续使用 icon rail。
- Topbar 约 56px，只承担 Sidebar 控制、上下文、Command 和 Admin 账户入口。
- 数据 Workspace 充分使用可用宽度，不强制内容站式小 max-width。
- Inspector 桌面约 360–420px；窄屏转 overlay/sheet。
- 表格第一列允许主信息 + 次信息，技术 ID 默认降级。
- 后台刷新保留旧数据并显示 refreshing。
- Toast 只用于轻量反馈；mutation 失败、unknown outcome、异步任务使用持续可见状态。

## 对象与 Inspector

对象查看优先采用“列表 + Inspector”：

```text
Accounts                  Inspector
Alice                     Bob
Bob ←                     Suspended
Charlie                   Subscription: Free
                          Files: 3
                          Recent activity
                          [Restore]
```

可分享 selection 逐步进入 URL，例如：

```text
/admin/platforms/:platformId/accounts?selected=:accountId
```

## 命名规则

- 管理员总览 → 概览
- 中央 Billing → Billing
- 运维任务 → Operations
- 审计记录 → Audit
- 安全设置 + 安全总览 → 安全与账户
- 计划 → 套餐
- 兑换批次 → 兑换码
- 设置 → 基本设置
- Keys → Platform Keys

## 冻结约束

- Platform Workspace 的唯一平台上下文仍来自 URL `platformId`。
- Browser 不新增直连 SQL、Storage 或 Secret 路径。
- Admin 写操作继续走既有同源 BFF 和服务端权限。
- MFA / recent-auth / AAL2 语义保持服务端权威。
- Billing / Subscription / Entitlement 状态含义不变。
- existing routes remain valid。

## 验收条件

- Global 页面显示 Global Sidebar，平台工作区显示 Platform Sidebar。
- 平台横向主导航退出，不出现两套同级导航并存。
- Global / Platform active state 在现有路由上正确。
- `/admin/mfa` 不再作为常规 Sidebar 项，Security 仍能进入 MFA 管理。
- Topbar 能表达 Global 或 Platform / Resource 上下文。
- 桌面和窄屏可完成导航，Sidebar 折叠和 Command Palette 可用。
- 所有现有 API 请求、敏感操作和服务端授权语义不变。
