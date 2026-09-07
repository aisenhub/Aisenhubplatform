# 历史归档：Multi-Platform Backend Architecture v1.1

> 已被 [v1.2架构基线](../architecture.md) 及其专题替代。以下文字保留原样用于历史追溯，其中“唯一依据”“最终规则”等声明已失效，不得作为当前实现指令。

> **Single Source of Truth**
>
> 本文档整合并取代此前 v1.0 以及更早的 V1～V5 架构草案。
>
> 以后开发、评审、AI/Codex 执行任务、数据库设计、API 设计、Admin 开发、SDK 开发、模板开发、安全测试、部署与运维，均以本文件为唯一架构依据。
>
> 旧版本仅作为历史归档，不再具有设计优先级。

**项目类型**：Multi-Platform Identity, Account, Subscription & Configuration Backend  
**主基座**：Makerkit Lite  
**后端平台**：Supabase  
**Admin**：Next.js / Makerkit Lite  
**用户侧复用机制**：SDK + Framework Adapter + shadcn Registry  
**订阅 V1**：Redemption Code + Admin Grant  
**支付订阅**：后续独立 Billing Domain 接入 Entitlement Grant Interface  
**架构状态**：v1.1 / Production-oriented Baseline  
**架构复核日期**：2026-09-07  
**Supabase 规则**：实现时始终以当时最新官方文档为准

**架构核心原则**：

> **Global Identity, Platform-local State, Trusted Platform Context, Database-enforced Tenant Integrity, Stable Integration Contract**

---

# 0. 文档地位

本文件是当前正式架构基线，并明确取代此前所有版本。

建议仓库中使用：

```text
docs/
├── architecture.md        # 本文件：全局架构与不可轻易变更的决策
├── api.md                 # Account API / Admin API Contract
├── auth.md                # Global Identity / SSR / OAuth / MFA / Lifecycle
├── platform.md            # Platform / Platform Account / Platform Context
├── subscription.md        # Entitlement / Grant / Projection
├── redemption.md          # Batch / Code / Atomic Redeem / Idempotency
├── config-files.md        # Storage / Quota / State Machine
├── admin.md               # Control Plane / MFA / Recovery
├── sdk.md                 # Auth Core / Framework Adapter / Account Server SDK
├── templates.md           # Registry / UI Templates
├── security.md            # Threat Model / RLS / DB Invariants / Rate Limit
├── operations.md          # Environments / Backup / Restore / Rotation / Alerts
└── upstream-sources.md    # 上游来源、Commit、License、Review Date
```

本文件中的架构原则按以下优先级执行：

```text
1. 数据隔离与安全不变量
2. Identity / Platform 生命周期正确性
3. API / SDK Contract 稳定性
4. V1 简洁性
5. UI / 工程便利性
```

任何会改变下列内容的修改必须重新进行架构评审：

```text
Global Identity 边界
Platform = Tenant
Platform Context 信任模型
Tenant Integrity 数据库约束
Subscription Grant / Projection 模型
Redemption Atomic + Idempotent 模型
Admin 单一管理员与 MFA 模型
SDK Contract
```

---

# 1. 项目定位

这个项目不是一个普通 SaaS 前端。

它是一个独立部署的：

> **Multi-Platform Identity, Account & Subscription Backend**

主要服务多个业务平台。

例如：

```text
Platform A
Platform B
Platform C
Platform D
```

这些平台：

- 用户身份可以 Link
- Profile 独立
- Preferences 独立
- Subscription 独立
- Config Files 独立
- Plans 独立
- Redeem Codes 独立
- Storage 独立
- 用户前端 UI 独立

---

# 2. 项目负责什么

本项目负责：

```text
Supabase Auth
Global Identity

Platform
Platform API Key
Platform Account

Platform-local Profile
Platform-local Preferences
Platform-local Config Files

Platform-local Plans
Redemption Codes
Subscription Grants
Subscription Snapshot

Single Super Admin
Admin Console

Account API
Browser SDK
Server SDK

Reusable Product UI Templates

Audit
Security Tests
CI
```

---

# 3. 项目不负责什么

各平台自己的核心业务不属于本项目。

例如：

```text
AI 平台
├── Agent
├── Workflow
├── Chat
└── Knowledge Base

CRM
├── Leads
├── Customers
└── Opportunities

内容平台
├── Article
├── Video
└── Project
```

这些由各业务平台自己维护。

---

# 4. 最核心的架构原则

## 4.1 Global Identity

所有平台共用一套：

```text
Supabase auth.users
```

它只回答：

> 这个人是谁？

例如：

```text
auth.users.id = U001
email = user@example.com
```

---

## 4.2 Platform-local State

除身份外，其余用户状态默认属于 Platform。

```text
U001

Platform A
├── Profile A
├── Preferences A
├── Subscription A
└── Config Files A

Platform B
├── Profile B
├── Preferences B
├── Subscription B
└── Config Files B
```

即：

> **Identity 可以 Link，State 不自动 Link。**

---

## 4.3 Reusable Product UI

不同平台：

```text
UI 可以完全不同
```

但：

```text
SDK
API
Auth Contract
Subscription Contract
```

统一。

因此本项目同时维护：

```text
可复用 Login Template
Signup Template
Pricing Template
Profile Template
Redeem Template
Config Files Template
```

作为源码模板供新平台安装和修改。

---

# 5. Platform 的定义

本系统中：

```text
Platform = Tenant
```

不使用：

```text
Organization
Workspace
Team
```

作为核心模型。

例如：

```text
AisenFlow
Analytics
ContentHub
```

就是三个 Platform。

---

# 6. 是否需要 Organization

当前：

```text
不需要。
```

只有未来某个平台自身出现：

```text
企业
团队
成员
组织
```

业务时，再在该业务平台中引入。

不要提前把 Organization 塞进统一账号后端。

---

# 7. 最终部署拓扑

```text
                             ┌──────────────────────────┐
                             │        Supabase          │
                             │                          │
                             │ Auth                     │
                             │ PostgreSQL               │
                             │ Storage                  │
                             │ Edge Functions           │
                             └────────────┬─────────────┘
                                          │
                                          ▼
                                Unified Account API
                                          │
                             Trusted Account Context
                         user JWT + platform credential
                                          │
             ┌────────────────────────────┼────────────────────────────┐
             │                            │                            │
             ▼                            ▼                            ▼
      Platform A Project           Platform B Project           Platform C Project
      ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
      │ Product UI       │         │ Product UI       │         │ Product UI       │
      │ Business API     │         │ Business API     │         │ Business API     │
      │ Auth Adapter     │         │ Auth Adapter     │         │ Auth Adapter     │
      │ Account Server   │         │ Account Server   │         │ Account Server   │
      └────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
               │                            │                            │
               └──────────────── Account SDK / API ──────────────────────┘


                             ┌──────────────────────────┐
                             │      Admin Console       │
                             │     Makerkit Lite        │
                             │                          │
                             │ One Super Admin          │
                             │ MFA / AAL2 Required      │
                             └──────────────────────────┘
```

部署边界：

```text
用户产品 UI / 业务 API
属于各 Platform 项目

统一 Account API / Auth / Subscription / Redemption / Config Files
属于本项目

Admin Console
属于本项目 Control Plane
```

V1 不引入微服务拆分。Account API 先保持模块化单体边界；当负载或组织结构出现真实需求时再拆分。

---

# 8. 本项目生产部署物

本仓库真正需要生产部署：

```text
1. Supabase Project

2. Database Migrations

3. Supabase Auth Config

4. Supabase Storage

5. Edge Functions / Account API

6. Admin Console
```

---

# 9. 本项目不部署哪些普通用户前端

不部署：

```text
统一 Login Portal

统一 Signup Portal

统一 Account Center

统一 Profile Center

统一 Pricing Site

统一 Subscription Center
```

这些页面由各平台自己的项目部署。

---

# 10. 不做统一 Account Center

明确：

```text
不做 account.example.com
```

用户跨平台 Identity 可以 Link。

但用户查看：

```text
Profile
Subscription
Config Files
```

始终回到对应 Platform。

---

# 11. Admin 的定位

Admin 是：

> 后端 Control Plane。

不是：

> 普通用户入口。

只部署：

```text
/admin/login
/admin/*
```

---

# 12. Admin 不承担普通用户登录

普通用户：

```text
platform-a.com/login
platform-b.com/login
platform-c.com/login
```

各自独立。

Admin：

```text
admin.example.com/login
```

只给 Super Admin。

---

# 13. Makerkit Lite 最终定位

Makerkit Lite 是：

> **Admin / Control Plane Frontend Base**

不是普通产品前端。

我们利用 Makerkit Lite 的：

```text
Next.js
Turborepo
pnpm
TypeScript
Tailwind
shadcn/ui
React Query
TanStack Table
React Hook Form
Zod
Recharts
Playwright
Vitest
Pino
Supabase SSR/Auth
```

---

# 14. Makerkit Lite 清理原则

保留：

```text
Next.js
Turborepo
pnpm
TypeScript

Supabase Auth
Supabase SSR
Supabase local workflow

UI
Form
Query
Table
Validation

Playwright
Vitest
Pino
lint
format
typecheck
```

删除：

```text
普通用户 Home
普通用户 Dashboard
普通用户 Profile UI
普通用户 Billing UI
Demo Marketing 内容
Makerkit Branding
示例业务
```

---

# 15. 是否重命名 `apps/web`

推荐：

```text
apps/web
→
apps/admin
```

因为：

```text
整个 Web App 就是 Admin Console。
```

在项目初始化阶段一次完成。

---

# 16. 单一 Super Admin

系统应用层只允许：

```text
1 个 active Super Admin
```

V1 不实现：

```text
Platform Admin
Organization Admin
Admin RBAC
Role / Permission Matrix
```

但是“单一管理员”不等于“低安全要求”。Super Admin 必须：

```text
Supabase Auth
+
private.system_admin membership
+
MFA / AAL2
```

高风险动作还应要求近期完成的强认证上下文，例如：

```text
生成 / 轮换 Platform API Key
导出新生成的兑换码明文
Manual Subscription Grant
Admin Config File Download
替换 Super Admin
```

---

# 17. Super Admin Singleton

推荐：

```sql
create schema if not exists private;

create table private.system_admin (
  singleton_id smallint primary key default 1
    check (singleton_id = 1),

  user_id uuid not null unique
    references auth.users(id)
    on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

数据库保证：

```text
最多一个系统管理员。
```

不得通过 `user_metadata`、`app_metadata` 的普通业务字段绕过该表。

管理员替换必须走受控流程并记录 audit。

---

# 18. Admin 登录

```text
/admin/login
      ↓
Supabase Auth
      ↓
验证 JWT / claims
      ↓
MFA AAL2
      ↓
private.system_admin
      ↓
match?
├── yes → Admin Session
└── no  → deny
```

Admin Server 每个敏感入口仍必须执行 `verifySuperAdmin()`，不能只依赖前端路由保护。

若 MFA、Auth User、邮箱或设备丢失，按正式 Recovery Runbook 离线恢复；不能为了恢复而长期增加第二个常驻管理员。

---

# 19. 不使用 `user_metadata.is_admin`

不要：

```json
{
  "is_admin": true
}
```

作为授权依据。

Admin 权限必须是：

```text
Server-side authorization
+
private.system_admin
```

---

# 20. Global Identity

全平台共享：

```text
Supabase auth.users
```

Global Identity 只回答：

> **这个人是谁？**

它不直接回答：

```text
他在 Platform A 是否激活？
他在 Platform B 是否被 suspended？
他在某个平台拥有什么 Profile / Plan / Files？
```

这些由 Platform Account 以及 Platform-local State 回答。

Global Identity 必须拥有明确生命周期：

```text
Auth Active
Global Disabled（如未来需要）
Platform Account Suspended / Closed
Global Delete Request
Controlled Purge
```

Platform 注销绝不能默认等价于删除 `auth.users`。

---

# 21. Supabase Identity Linking

认证 Provider Linking 由 Supabase Auth 处理。

业务层不自行维护：

```text
oauth_identities
provider_user_mapping
```

业务层稳定主键只认：

```text
auth.users.id
```

Identity Linking 规则必须记录在 `auth.md` 中，至少覆盖：

```text
允许哪些 Provider Linking
如何处理已经存在的 email identity
误 Link / 账户恢复流程
管理员是否允许强制操作
安全审计
```

Identity Link 不复制任何 Platform-local State。

---

# 22. Platform Account Link

跨平台“同一个人”的判断仍然是：

```text
Platform A Account.user_id = U001
Platform B Account.user_id = U001
```

因此不需要单独的 `account_links` 表。

但必须区分：

```text
Global Identity Link
≠
Platform Account Lifecycle
```

同一个 `user_id` 在不同 Platform 可分别：

```text
active
suspended
closed
```

某个平台关闭账户不影响其它平台。

---

# 23. Identity Link 不等于 SSO

即使多个 Platform 使用同一个 Supabase Project，也不代表跨域自动登录。

当前目标：

```text
Same Global Identity
```

不是：

```text
Cross-domain SSO
```

V1 不做中央 Auth Broker。

每个 Platform 的 OAuth Callback、Email Confirmation、Password Reset 等 redirect 必须属于已注册 Auth Origin / Redirect URL，并在生产环境使用精确路径配置。

---

# 24. `platforms`

```sql
create table public.platforms (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,
  name text not null,

  status text not null default 'active'
    check (status in ('active', 'disabled')),

  allow_signup boolean not null default true,
  default_locale text,
  default_plan_id uuid,

  config jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`default_plan_id` 在 `plans` 创建后通过后续 migration 增加同 Platform 一致性约束，或先允许 NULL。

不再把单一 `domain` 作为 Platform Auth 的完整来源；多环境、多子域、OAuth callback 由独立 `platform_auth_origins` 管理。

---

# 25. Platform Config

`platforms.config` 只保存弱结构、非敏感、不会破坏数据库一致性的扩展配置，例如：

```json
{
  "ui": {
    "default_theme": "system"
  },
  "features": {
    "experimental_x": false
  }
}
```

以下数据不要只放 JSONB：

```text
allow_signup
默认 Plan 关系
Auth Origins
Config File Quota
关键授权开关
Secrets
```

这些应使用 typed columns 或独立表。

敏感配置不得进入 `public.platforms.config`。

---

# 26. `platform_accounts`

```sql
create table public.platform_accounts (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  user_id uuid not null
    references auth.users(id)
    on delete restrict,

  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),

  created_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  suspended_at timestamptz,
  closed_at timestamptz,
  last_login_at timestamptz,
  updated_at timestamptz not null default now(),

  unique(platform_id, user_id),
  unique(platform_id, id)
);
```

关键修改：

```text
不使用 auth.users 删除 cascade
增加 closed 生命周期
增加 unique(platform_id, id) 供 composite FK 使用
```

Platform Account 是所有 Platform-local 数据的根。

---

# 27. 为什么业务数据都应该挂 `platform_account_id`

推荐所有 Platform-local 用户状态都绑定：

```text
platform_account_id
```

包括：

```text
profile
preferences
subscription projection
subscription grants
config files
业务授权上下文
```

但对于同时引用 `plan_id`、`platform_account_id` 等多个 tenant-sensitive 外键的表，**仅绑定 `platform_account_id` 还不够**。

必须显式携带 `platform_id` 并使用 composite foreign key，数据库直接保证：

```text
platform_id + platform_account_id 属于同一 Platform
platform_id + plan_id 属于同一 Platform
```

原则：

> **Tenant Integrity 不能只靠 API 代码验证，必须有数据库不变量。**

---

# 28. `platform_profiles`

```sql
create table public.platform_profiles (
  platform_account_id uuid primary key
    references public.platform_accounts(id)
    on delete cascade,

  display_name text,
  avatar_url text,
  bio text,

  locale text,
  timezone text,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

# 29. `platform_preferences`

```sql
create table public.platform_preferences (
  platform_account_id uuid primary key
    references public.platform_accounts(id)
    on delete cascade,

  preferences jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now()
);
```

---

# 30. Platform Account Activation

用户第一次进入某 Platform：

```text
auth user 已存在
+
platform_account 不存在
```

调用：

```text
POST /v1/account/activate
```

Account API 从受信任 Platform Context 得到 `platform_id`，从验证后的 user token 得到 `user_id`。

事务中：

```text
1. validate platform active
2. validate signup / activation policy
3. insert or return existing platform_account
4. create platform_profile if absent
5. create platform_preferences if absent
6. apply optional default free entitlement policy
7. write domain event / audit as required
```

Activation 必须天然 idempotent。

---

# 31. Activation 不复制其它平台数据

如果 U001 已经有：

```text
Platform A Profile
```

首次激活 Platform B 时：

```text
不复制 Profile A
不复制 Preferences A
不复制 Subscription A
不复制 Config Files A
```

---

# 32. 默认订阅策略

Platform 可选：

## Option A

```text
无默认 entitlement
```

## Option B

```text
激活后创建 Free Entitlement Projection
```

V1 推荐把“Free”视为 Platform Plan 的一种业务状态，但必须明确其期限语义。

建议：

```text
Free Plan
current_period_end = NULL
```

表示无时间到期，但不等于付费或 lifetime grant。

`default_plan_id` 使用 typed FK，而不是仅使用 `platform.config.default_plan = "free"`。

---

# 33. Plans

```sql
create table public.plans (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  code text not null,
  name text not null,
  description text,

  features jsonb not null default '{}'::jsonb,

  status text not null default 'active'
    check (status in ('active', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(platform_id, code),
  unique(platform_id, id)
);
```

`unique(platform_id, id)` 用于其它 tenant-sensitive 表建立 composite FK。

Plan 原则上不物理删除；进入生产使用后通过 `archived` 管理生命周期。

---

# 34. Plan 属于 Platform

例如：

```text
Platform A
├── Free
├── Pro
└── Max

Platform B
├── Basic
└── Premium
```

不做全局共用 Plan。

---

# 35. Plan Features

例如：

```json
{
  "max_projects": 10,
  "ai_enabled": true,
  "models": ["model-a", "model-b"]
}
```

V1 明确语义：

> **Plan Features 是当前实时配置；修改后立即影响所有引用该 Plan 的有效 Subscription Projection。**

这意味着 V1 不承诺历史 feature grandfathering。

未来如真实业务需要历史版本，再增加：

```text
plan_versions
```

不要提前实现。

业务平台获取 entitlement 时应以 Account API 返回的标准 Contract 为准，不直接查询 `plans`。

---

# 36. V1 订阅来源

第一版：

```text
Redemption Code
Admin Grant
```

不做支付。

---

# 37. V1 不做 Stripe

第一版不实现：

```text
Stripe Checkout
Stripe Portal
Stripe Customer
Stripe Webhook
Invoice
Refund
Tax
Coupon
```

---

# 38. Subscription Engine 的核心思想

将：

```text
当前有效 entitlement 状态
```

和：

```text
授权来源历史
```

严格分开。

采用：

```text
Subscription Projection
+
Subscription Grant Ledger
```

定义：

```text
subscription_grants
= provenance / source of truth for grant history

subscriptions
= current projection optimized for reads
```

Projection 不保存模糊的单一 `source`，因为一个当前状态可能由多个 Grant 共同组成。

未来 Payment 也只能通过统一 Entitlement Grant Interface 影响 Projection。

---

# 39. `subscriptions`

```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  platform_account_id uuid not null,
  plan_id uuid not null,

  status text not null default 'active'
    check (status in ('active', 'suspended')),

  started_at timestamptz not null,
  current_period_end timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(platform_account_id),

  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id)
    on delete restrict,

  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id)
    on delete restrict
);
```

说明：

```text
current_period_end = NULL
```

可表示没有时间到期的 Free / perpetual projection。

不建议持久化 `expired` 作为必须同步更新的状态；读取时计算：

```text
if status = suspended
  effective_status = suspended
else if current_period_end is not null and current_period_end <= now()
  effective_status = expired
else
  effective_status = active
```

`subscriptions` 是 Projection，不承担历史 provenance。

---

# 40. `subscription_grants`

```sql
create table public.subscription_grants (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  platform_account_id uuid not null,
  plan_id uuid not null,

  source text not null
    check (source in ('redemption_code', 'admin', 'payment')),

  source_id uuid,

  starts_at timestamptz not null,
  ends_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id)
    on delete restrict,

  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id)
    on delete restrict
);
```

`ends_at = NULL` 仅用于明确支持永久授权的 source；V1 兑换码通常仍产生有限时长 grant。

Grant 应视为 append-only business ledger。修正错误时优先追加 correction/reversal 语义，而不是静默修改历史记录。

---

# 41. Grant Ledger 的意义

例如：

```text
2026-01-01
兑换码 +365 天

2027-01-01
兑换码 +180 天

2027-07-01
Admin 补偿 +30 天
```

当前 entitlement 的 Projection 可能由多个 Grant 共同形成，因此：

```text
subscriptions.source
```

没有稳定意义，不应存在。

`subscription_grants` 保存：

```text
谁获得了什么 Plan
来源是什么
何时生效
何时结束
来源对象是谁
```

`subscriptions` 只保存最终读取友好的状态。

---

# 42. `subscription_events`

```sql
create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  platform_account_id uuid not null,
  subscription_id uuid,

  event_type text not null,
  source_type text,
  source_id uuid,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id)
    on delete restrict
);
```

Domain Event 和 Audit Log 分工：

```text
subscription_events
= 为什么业务 entitlement 状态发生变化

audit_logs
= 谁对什么执行了什么敏感动作
```

影响 Grant / Projection 的 Domain Event 应尽量与业务状态在同一数据库事务中写入。

---

# 43. Redemption 是独立 Domain

兑换码不是：

```text
subscriptions.code
```

而是完整业务：

```text
Batch
Code
Redeem
Event
Grant
Subscription Projection
```

---

# 44. 兑换码成熟参考来源

重点参考：

```text
quteam/license-manager
```

借鉴：

```text
Batch
HMAC-only persistent storage
Plaintext shown once
Masked code
Activation duration
Audit
```

---

# 45. Redemption Engine 参考来源

重点参考：

```text
OfferKit
```

借鉴：

```text
Atomic Redemption
Idempotency
Ledger
Validation
Audit
Typed Contract
```

---

# 46. `redemption_code_batches`

```sql
create table public.redemption_code_batches (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  plan_id uuid not null,
  name text not null,

  quantity integer not null
    check (quantity > 0),

  duration_value integer not null
    check (duration_value > 0),

  duration_unit text not null
    check (duration_unit in ('day', 'month', 'year')),

  expires_at timestamptz,

  status text not null default 'active'
    check (status in ('active', 'disabled')),

  created_by uuid not null
    references auth.users(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  unique(platform_id, id),
  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id)
    on delete restrict
);
```

数据库必须保证 Batch 的 Plan 与 Platform 一致。

---

# 47. Code Expiration 和 Subscription Duration 分离

例如：

```text
Redeem Before:
2026-12-31

Duration:
12 months
```

用户：

```text
2026-12-30
```

兑换，仍获得：

```text
12 months
```

---

# 48. `redemption_codes`

```sql
create table public.redemption_codes (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  batch_id uuid not null,
  plan_id uuid not null,

  code_hmac text not null,
  hmac_key_version smallint not null,

  code_prefix text,
  code_suffix text,

  status text not null default 'unused'
    check (status in ('unused', 'redeemed', 'disabled', 'expired')),

  expires_at timestamptz,

  redeemed_by_platform_account_id uuid,
  redeemed_at timestamptz,

  created_at timestamptz not null default now(),

  unique(hmac_key_version, code_hmac),

  foreign key (platform_id, batch_id)
    references public.redemption_code_batches(platform_id, id)
    on delete restrict,

  foreign key (platform_id, plan_id)
    references public.plans(platform_id, id)
    on delete restrict,

  foreign key (platform_id, redeemed_by_platform_account_id)
    references public.platform_accounts(platform_id, id)
    on delete restrict
);
```

核心原则：

```text
batch_id / plan_id / redeemed account
必须全部属于同一 platform_id
```

这些一致性由数据库约束直接保证。

---

# 49. 不存兑换码明文

流程：

```text
Generate cryptographically secure code
    ↓
Return plaintext once
    ↓
Optional one-time secure export
    ↓
DB stores versioned HMAC only
```

数据库保存：

```text
code_hmac
hmac_key_version
prefix
suffix
```

Admin 后续只看到 mask，例如：

```text
AISEN-7KM9-****-****-****-****-MZ
```

禁止：

```text
数据库保存明文
日志记录完整 code
Audit metadata 保存完整 code
后续通过 Admin 再次恢复明文
```

如果用户丢失兑换码，只能重新发放新的 Code，不能从数据库“解密找回”。

---

# 50. Code HMAC

推荐：

```text
HMAC-SHA256(normalized_code, REDEMPTION_HMAC_KEY[version])
```

而不是普通：

```text
SHA256(code)
```

必须实现 HMAC key rotation：

```text
hmac_key_version
```

验证时根据 code row 的版本或候选 key 版本计算 HMAC。

轮换策略：

```text
新生成 Code → 只使用当前 key version
旧 Code → 旧 key 保持 verify-only 直到全部失效或迁移完成
```

HMAC Secret 与 Platform API Key、Supabase Secret Key 必须完全分离。

---

# 51. Code 生成

必须使用：

```text
cryptographically secure random
```

禁止：

```text
Math.random()
timestamp
auto increment
predictable UUID slicing
```

目标：

```text
随机部分 >= 128 bit entropy
```

前缀、分隔符、产品名都不计入 entropy。

生成后明文只在受控创建流程中返回一次；持久化层只保存 HMAC 和少量 mask 信息。

---

# 52. Code 字符集

建议使用接近 32 字符的人工友好字符集，并排除易混淆字符：

```text
0/O
1/I/L
```

例如：

```text
ABCDEFGHJKMNPQRSTUVWXYZ
23456789
```

该字符集每个随机字符约提供 5 bit entropy。

因此若目标为 128 bit，随机部分应至少约 26 个字符。

示例格式：

```text
AISEN-7KM9-2XQ8-F3DP-V7RW-K6CY-MZ
```

`AISEN-` 和 `-` 不计入 entropy。

---

# 53. V1 兑换规则

## Rule 1

兑换码只属于一个 Platform。

## Rule 2

默认一次性兑换。

## Rule 3

无订阅时从 `now()` 开始。

## Rule 4

相同 Plan 可续期叠加。

## Rule 5

过期订阅从 `now()` 重新计算。

## Rule 6

不同 Plan 暂不自动升级/降级。

返回：

```text
PLAN_CONFLICT
```

---

# 54. Redeem 必须原子

兑换必须在一个 DB Transaction 中完成。

不能：

```text
SELECT unused
UPDATE subscription
UPDATE code
```

分散执行。

---

# 55. 推荐 Redeem RPC

推荐：

```text
private.redeem_subscription_code(...)
```

必须在单一 DB transaction 中完成：

```text
1. resolve idempotency scope
2. lock idempotency record / create pending claim
3. HMAC lookup code
4. lock code row
5. validate code status / expiration
6. validate trusted platform
7. validate active platform_account
8. validate tenant integrity
9. validate target plan
10. lock current subscription projection
11. enforce plan conflict rule
12. create subscription_grant
13. upsert / recompute subscription projection
14. mark code redeemed
15. insert redemption_event
16. insert subscription_event
17. finalize idempotency response
```

任何一步失败必须整体 rollback。

RPC 若使用 `SECURITY DEFINER`：

```text
private schema
fixed search_path
restricted execute
no direct browser access
```

---

# 56. `redemption_events`

```sql
create table public.redemption_events (
  id uuid primary key default gen_random_uuid(),

  redemption_code_id uuid
    references public.redemption_codes(id),

  platform_account_id uuid
    references public.platform_accounts(id),

  result text not null,

  error_code text,

  ip inet,
  user_agent text,

  created_at timestamptz not null default now()
);
```

---

# 57. Redeem Idempotency

支持：

```text
Idempotency-Key
```

避免：

```text
网络重试
重复点击
平台重试
```

导致重复延长订阅。

---

# 58. Idempotency Table

使用：

```text
private.idempotency_keys
```

推荐字段：

```text
platform_id
platform_account_id
operation
idempotency_key
request_hash
state
response_status
response_body
created_at
expires_at
```

唯一键：

```text
(platform_id, platform_account_id, operation, idempotency_key)
```

同一个 key + 相同 request hash：

```text
返回原结果
```

同一个 key + 不同 request hash：

```text
409 IDEMPOTENCY_CONFLICT
```

不得仅使用 `(platform_id, key)`，避免同平台不同用户互相占用 key 空间或错误复用响应。

---

# 59. Redeem API

```text
POST /v1/subscription/redeem
```

Headers：

```text
Authorization: Bearer <user access token>
Platform credential: server-side only
Idempotency-Key: <unique request key>
```

Body：

```json
{
  "code": "AISEN-7KM9-2XQ8-F3DP-V7RW-K6CY-MZ"
}
```

不能让客户端指定：

```text
user_id
trusted platform_id
platform_account_id
plan_id
duration
```

这些全部由 Account Principal、Code 与数据库关系决定。

错误 Contract 至少包括：

```text
INVALID_CODE
CODE_EXPIRED
CODE_DISABLED
CODE_ALREADY_REDEEMED
PLAN_CONFLICT
ACCOUNT_SUSPENDED
ACCOUNT_CLOSED
RATE_LIMITED
IDEMPOTENCY_CONFLICT
```

---

# 60. Subscription API

```text
GET /v1/subscription
```

返回标准 Entitlement Projection：

```text
effective_status
plan
features
started_at
current_period_end
```

示例：

```json
{
  "effective_status": "active",
  "plan": {
    "code": "pro",
    "name": "Pro"
  },
  "features": {
    "max_projects": 10
  },
  "started_at": "2026-09-01T00:00:00Z",
  "current_period_end": "2027-09-01T00:00:00Z"
}
```

Free / perpetual projection 可以：

```text
current_period_end = null
```

客户端不要自己根据 Grant Ledger 重算当前 entitlement。

---

# 61. Admin Manual Grant

Super Admin 可以执行：

```text
Grant Subscription
Extend Subscription
Compensation Grant
```

但必须产生 append-only：

```text
subscription_grant
source = admin
```

然后通过同一 Projection 逻辑更新 `subscriptions`。

禁止直接“偷偷修改”：

```text
subscriptions.current_period_end
subscriptions.plan_id
```

而不留下 Grant / Event / Audit。

高风险 Manual Grant 需要：

```text
verifySuperAdmin
MFA / AAL2
explicit reason
Audit
```

---

# 62. 未来支付如何接入

未来支付**不直接改写 Subscription Projection**。

正确结构：

```text
Billing Provider
      ↓
Billing Domain
      ↓
Verified Provider Event
      ↓
Entitlement Grant Interface
      ↓
subscription_grant
      ↓
subscription projection
```

因此 V1 的 Entitlement Core 可以复用，但未来仍会新增独立 Billing Domain，包括：

```text
billing_customer
provider_subscription
checkout_session
webhook_event
invoice / payment state
refund / chargeback
cancel_at_period_end
trial
payment failure
```

准确表述应是：

> **Payment 不改变 Entitlement Core，但会新增独立 Billing Domain。**

---

# 63. Config Files 模块

每个用户在每个平台：

```text
可以存 1 份或多份小型配置文件。
```

类型：

```text
不限
```

但：

```text
大小
数量
总容量
```

必须受限。

---

# 64. Config Files 属于 Platform Account

关系：

```text
platform_account
├── profile
├── preferences
├── subscription
└── config_files
```

同一个用户在不同 Platform 的文件完全隔离。

---

# 65. 文件实际存储

实际对象：

```text
Supabase Storage
```

PostgreSQL 只存：

```text
metadata
ownership
quota
status
storage_path
```

---

# 66. Storage Bucket

推荐单私有 Bucket：

```text
platform-config-files
```

不要：

```text
每 Platform 一个 bucket
每用户一个 bucket
```

---

# 67. 文件类型

V1：

```text
不限制扩展名
不限制 MIME
```

但系统只提供：

```text
Upload
Download
List
Delete
Replace
```

不做：

```text
Execute
Parse
Render
Preview
Deserialize
Unzip
```

---

# 68. Config File Quota

推荐默认：

```text
max_file_bytes = 1 MiB
max_files = 10
max_total_bytes = 10 MiB
```

建议独立 typed policy：

```text
platform_file_policies
----------------------
platform_id PK
enabled
max_file_bytes
max_files
max_total_bytes
updated_at
```

Quota 计算必须包括：

```text
active files
+
尚未过期的 pending reservations
```

不能只检查 active，否则并发 `upload-intent` 可以绕过 quota。

---

# 69. Storage Path

不要使用用户原始文件名。

使用：

```text
{platform_id}/{platform_account_id}/{file_id}
```

原始文件名只作为 metadata。

---

# 70. `platform_config_files`

```sql
create table public.platform_config_files (
  id uuid primary key default gen_random_uuid(),

  platform_id uuid not null
    references public.platforms(id)
    on delete restrict,

  platform_account_id uuid not null,

  original_name text not null,

  storage_bucket text not null
    default 'platform-config-files',

  storage_path text not null unique,

  mime_type text,
  requested_size_bytes bigint not null
    check (requested_size_bytes >= 0),
  actual_size_bytes bigint
    check (actual_size_bytes is null or actual_size_bytes >= 0),

  purpose text,
  metadata jsonb not null default '{}'::jsonb,

  status text not null default 'pending'
    check (status in (
      'pending',
      'active',
      'deleting',
      'deleted',
      'failed',
      'expired'
    )),

  upload_expires_at timestamptz,
  uploaded_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (platform_id, platform_account_id)
    references public.platform_accounts(platform_id, id)
    on delete restrict
);
```

`requested_size_bytes` 用于 quota reservation；`actual_size_bytes` 在 complete 后以 Storage 实际对象为准。

---

# 71. 文件对象 Immutable

推荐：

```text
Replace
=
Upload New
+
Delete Old
```

而不是：

```text
upsert same path
```

---

# 72. Config File Upload Flow

```text
Browser
   ↓
Platform Server / BFF
   ↓
account-server
   ↓
Account API
   │
   ├── verify user
   ├── verify platform credential
   ├── verify platform_account active
   ├── lock quota scope
   ├── calculate active + pending reserved usage
   ├── reserve requested size/count
   ├── create pending row
   └── create signed upload URL
          │
          ▼
Browser ───────→ Private Supabase Storage
```

Upload Intent 的 quota reservation 必须在数据库事务中完成。

Signed Upload URL 生命周期以 Supabase 当前官方实现为准；数据库的 `upload_expires_at` 必须与实际 signed upload token 生命周期一致。

---

# 73. Upload Intent API

```text
POST /v1/config-files/upload-intent
```

Body：

```json
{
  "name": "settings.yaml",
  "size": 18204,
  "content_type": "application/octet-stream",
  "purpose": "main"
}
```

请求中的 `size` 只作为 reservation 上限声明，不能被视为最终真实大小。

API 必须：

```text
拒绝 size <= 0 或超过 max_file_bytes
原子预留 quota
生成不可猜测 storage_path
返回 file id + signed upload information
```

---

# 74. Upload Complete API

```text
POST /v1/config-files/:id/complete
```

事务 / 流程：

```text
1. validate owner + platform context
2. lock file row / quota scope
3. verify pending and not expired
4. verify storage object exists
5. read actual object size
6. verify actual size <= max_file_bytes
7. verify final active + pending quota
8. set actual_size_bytes
9. set status = active
10. set uploaded_at
11. consume reservation
12. write audit / event
```

若对象不存在、超限或校验失败：

```text
status = failed / expired
release reservation
schedule object cleanup if necessary
```

---

# 75. Config File List

```text
GET /v1/config-files
```

---

# 76. Config File Download

```text
POST /v1/config-files/:id/download-url
```

返回：

```text
短时 Signed URL
```

不提供永久公开 URL。

---

# 77. Config File Delete

```text
DELETE /v1/config-files/:id
```

Storage 与 PostgreSQL 不能共享同一个原子事务，因此采用状态机：

```text
active
  ↓
mark deleting
  ↓
Storage API remove
  ↓
deleted
```

如果 Storage 删除失败：

```text
status 保持 deleting
后台任务 / reconciliation 重试
```

不得使用：

```text
先删 Storage
然后假设 DB 一定能成功更新
```

删除必须记录 audit。

---

# 78. Config File Pending Cleanup

定时任务处理：

```text
pending + expired
failed with orphan object
deleting too long
```

清理动作包括：

```text
释放 quota reservation
删除 orphan Storage object
更新状态 expired / deleted / failed
记录必要日志
```

Cleanup job 必须支持重复运行，且本身 idempotent。

---

# 79. Storage Reconciliation

低频 reconciliation 至少检查：

```text
DB active, object missing
object exists, DB missing
pending expired
failed object still exists
deleting object still exists
deleted row object still exists
quota reservation drift
```

Reconciliation 只修复可安全自动修复的问题；涉及用户数据归属不明确时进入人工审计队列，不自动猜测 ownership。

---

# 80. Platform Context 安全模型

这是整个架构最关键的安全边界之一。

绝对不能信任：

```text
Browser 提交的 platform_id
Browser 提交的 platform_account_id
Browser 提交的 user_id
```

Platform Context 只能由受信任 Platform Server Credential 映射得到。

User Context 只能由经过验证的 Supabase access token 得到。

最终 Account Principal：

```text
user_id
platform_id
platform_account_id
platform_status
platform_account_status
```

所有 Account Domain 操作都基于 Principal，而不是散落地重复解析请求参数。

---

# 81. Platform API Key

每个平台可以拥有多个 Platform API Key，用于零停机轮换。

只允许存在于：

```text
Platform Server / BFF
Server Environment / Secret Manager
```

绝不能进入 Browser、前端 bundle、公开 Registry 源码。

生命周期：

```text
create
→ active
→ rotate overlap
→ revoke
→ expired / revoked
```

Platform API Key 是本系统自己的 consumer-platform credential，不能和 Supabase Publishable / Secret Key 混淆。

---

# 82. Account Authorization Context

完整上下文：

```text
Verified User Access Token
+
Verified Platform API Key
```

得到：

```text
Account Principal
---------------
user_id
platform_id
platform_account_id
platform_status
account_status
```

推荐统一 helper：

```text
buildAccountPrincipal(request)
```

业务平台自己的 protected API 也应通过 `account-server` 检查 Platform Account 状态。

原则：

> **Auth valid ≠ Product Authorization valid.**

一个有效的 Global Identity，如果某 Platform Account 已 suspended / closed，不应继续调用该 Platform 的受保护业务能力。

---

# 83. `private.platform_api_keys`

推荐：

```text
private.platform_api_keys
-------------------------
id
platform_id
name
key_hmac
hmac_key_version
key_prefix
key_suffix
status
created_by
created_at
expires_at
revoked_at
revoked_by
last_used_at
last_used_ip
```

数据库只存 HMAC，不存明文。

允许同一 Platform 有多个 active key，以支持：

```text
Old Key active
→ Generate New Key
→ Deploy New Key
→ Confirm usage
→ Revoke Old Key
```

Platform key HMAC secret 同样应支持 key version / rotation。

---

# 84. Platform API Key 不能在前端

禁止：

```text
NEXT_PUBLIC_PLATFORM_API_KEY
```

正确：

```text
Server Environment
```

---

# 85. Central Account API

V1：

```text
POST /v1/account/activate
GET  /v1/account/principal

GET   /v1/profile
PATCH /v1/profile

GET   /v1/preferences
PATCH /v1/preferences

GET   /v1/plans
GET   /v1/subscription
POST  /v1/subscription/redeem

POST   /v1/config-files/upload-intent
POST   /v1/config-files/:id/complete
GET    /v1/config-files
POST   /v1/config-files/:id/download-url
DELETE /v1/config-files/:id
```

统一规则：

```text
客户端不能指定 user_id
客户端不能指定 trusted platform_id
客户端不能指定 platform_account_id
```

API 统一返回：

```text
request_id
stable error code
human-safe message
```

API contract 在 `docs/api.md` 使用 OpenAPI 或等价 typed schema 管理，SDK 由同一 contract 生成或校验。

---

# 86. Account API Runtime

V1 优先：

```text
Supabase Edge Functions
```

因为当前核心业务仍属于轻量 Account Domain：

```text
Auth Context
Platform Context
Profile
Preferences
Entitlement
Redeem
Config Files
```

但架构上不要把 Domain Logic 写死在 Edge Function entrypoint 中。

结构应为：

```text
HTTP Adapter
→ Auth / Platform Middleware
→ Domain Service
→ Repository / RPC
```

未来若迁到独立 runtime，稳定 Domain Contract 不需要重写。

---

# 87. Edge Functions 结构

推荐：

```text
supabase/
├── functions/
│   ├── account-api/
│   │   └── index.ts
│   │
│   └── _shared/
│       ├── user-auth.ts
│       ├── platform-auth.ts
│       ├── account-principal.ts
│       ├── authorization.ts
│       ├── errors.ts
│       ├── response.ts
│       ├── database.ts
│       ├── idempotency.ts
│       ├── rate-limit.ts
│       ├── storage.ts
│       └── logging.ts
│
├── migrations/
├── tests/
└── seed.sql
```

Supabase 资源建议放仓库根 `supabase/`，不要概念上依附于 `apps/admin`，因为数据库和 Edge Functions 是独立 backend runtime，不属于 Admin UI。

---

# 88. RLS 策略总原则

所有 exposed tables：

```text
ENABLE RLS
```

V1 核心业务表：

```text
Browser 默认不直接 CRUD
```

主要通过 Central Account API 访问。

必须明确两个安全边界：

```text
Boundary A
Browser → Supabase Data API
Grants + RLS 防御

Boundary B
Account API → Privileged DB Client
Application Authorization + DB Invariants 防御
```

Privileged Supabase Secret Key / service role 等价能力会 bypass RLS，因此 Account API 的 Platform Context 验证和数据库 composite constraints 是真正的核心防线。

---

# 89. 为什么不用复杂浏览器 RLS 表达 Platform Context

Auth JWT 天然主要证明：

```text
user_id
```

而完整产品授权还需要：

```text
trusted platform_id
platform_account status
```

V1 通过 Account API 统一构造 Principal，可以更清晰地执行：

```text
user + trusted platform + platform account lifecycle
```

这不是放弃 RLS，而是把 RLS 定位为：

```text
Data API 防线
Defense in Depth
Negative Security Tests
```

而不是强行让 Browser JWT 承载所有 Platform Context。

---

# 90. Data API 默认 Deny

普通 Browser 对以下核心表默认不获得宽泛 CRUD：

```text
platform_accounts
platform_profiles
platform_preferences
subscriptions
subscription_grants
redemption_codes
platform_config_files
private.*
audit_logs
```

除非某个未来场景经过单独架构评审，否则不开放浏览器直接写入。

RLS 测试不能替代 Account API Authorization Test。

---

# 91. Privileged Functions

例如：

```text
private.redeem_subscription_code
```

若使用 `SECURITY DEFINER`，必须：

```text
private schema
fixed search_path
minimal owner privileges
restricted execute
explicit input validation
no untrusted dynamic SQL
```

Privileged Function 不负责信任 Browser 传来的 platform/user context；Account API 先建立 Principal，再传入经过约束的内部参数。

---

# 92. Admin Server Security

Admin：

```text
Browser
   ↓
Next.js Server Action / Route
   ↓
verifySuperAdmin()
   ↓
verify AAL2
   ↓
Server-only privileged client
```

Admin Secret 永远不进入浏览器。

Supabase key 命名采用当前新体系：

```text
Browser / public client
SUPABASE_PUBLISHABLE_KEY

Trusted backend
SUPABASE_SECRET_KEY
```

不得在新代码中继续把 legacy `anon` / `service_role` 当作长期命名基线。

Admin privileged client 必须独立于 SSR user client，避免用户 session 覆盖 server credential。

---

# 93. Audit Log

重要敏感操作必须审计。

---

# 94. Audit Events

至少包括：

```text
platform.created
platform.updated
platform.disabled

platform_account.activated
platform_account.suspended

profile.updated
preferences.updated

redemption_batch.created
redemption_batch.disabled
redemption_code.redeemed

subscription.granted
subscription.extended

config_file.uploaded
config_file.downloaded
config_file.deleted

admin.user.viewed
admin.subscription.granted
admin.config_file.downloaded
admin.config_file.deleted
```

---

# 95. Audit Schema

```text
audit_logs
----------
id

actor_type
actor_user_id

platform_id
platform_account_id

event_type

target_type
target_id

ip
user_agent

metadata jsonb

created_at
```

---

# 96. Audit Append-only

普通业务：

```text
不能 UPDATE
不能 DELETE
```

---

# 97. Admin Console 路由

```text
/admin
├── dashboard
├── platforms
├── users
├── platform-accounts
├── plans
├── redemption
│   ├── batches
│   ├── codes
│   └── events
├── subscriptions
├── subscription-grants
├── audit-logs
└── system
```

---

# 98. Admin User Detail

例如：

```text
User U001
├── Global Identity
│
├── Platform A
│   ├── Account
│   ├── Profile
│   ├── Preferences
│   ├── Subscription
│   ├── Grants
│   └── Config Files
│
└── Platform B
    ├── Account
    ├── Profile
    ├── Preferences
    ├── Subscription
    ├── Grants
    └── Config Files
```

---

# 99. Admin Dashboard

可展示：

```text
总 Global Users

总 Platform Accounts

各平台用户数

Active Subscriptions

兑换码：
├── generated
├── redeemed
└── unused

Config Files：
├── count
└── storage usage

最近事件
```

---

# 100. Admin Platform 页面

支持：

```text
Create
Edit
Enable
Disable

Auth Origins / Redirect URLs
Signup Policy
Default Plan
File Policy
Plans
Platform API Keys
API Key Rotation / Revoke
Recent Platform Events
```

Platform Disable 后：

```text
Account API 拒绝该 Platform 的普通用户请求
现有 Platform API Keys 不再获得有效 Principal
Admin 仍可查看历史和恢复
```

---

# 101. Admin Redemption

支持：

```text
Create Batch

Generate Codes

Download Plaintext Once

Masked Code List

Disable Batch

Search

Redeem Events
```

---

# 102. Admin Subscription

支持：

```text
List
Detail
Grant History
Manual Grant
Event History
```

---

# 103. Admin Config Files

支持：

```text
Metadata
Download
Delete
Quota Usage
```

Admin Download 必须：

```text
Audit
```

---

# 104. SDK 分层

发布建议从两层升级为三层：

```text
@yourorg/account-auth
@yourorg/account-auth-nextjs
@yourorg/account-server
```

可选继续保留兼容名称：

```text
@yourorg/account-browser
```

但职责必须明确：

```text
account-auth
= framework-neutral Auth Contract

account-auth-nextjs
= Supabase SSR / Cookie / PKCE / Callback Adapter

account-server
= trusted Platform Server → Central Account API
```

这样 Supabase SSR adapter 变化不会扩散到所有业务 UI 模板。

---

# 105. `account-browser` / `account-auth`

Framework-neutral Auth Core 负责：

```text
login
signup
logout
session intent
oauth intent
identity linking
password reset intent
```

不包含：

```text
Platform API Key
Supabase Secret Key
Admin Secret
Redemption HMAC Secret
```

浏览器只允许使用 Supabase Publishable Key。

Auth Core 不应该直接假设 Next.js cookie / middleware / callback 实现。

---

# 106. `account-auth-nextjs` 与 `account-server`

`account-auth-nextjs` 负责：

```text
createBrowserClient
createServerClient
cookie adapter
PKCE callback
OAuth callback
email confirmation callback
password reset callback
session refresh / proxy integration
server identity verification helper
```

服务端授权规则：

```text
需要验证身份 → getClaims / validated token path
需要最新 Auth User → getUser
只需要转发 token → getSession 可用于取得 raw access token
```

不得把共享 cookie 中未经重新验证的 session user object 直接作为授权依据。

`account-server` 负责：

```text
activate
principal
profile
preferences
plans
subscription
redeem
configFiles
```

---

# 107. Server SDK 初始化

```ts
const account = createAccountClient({
  platformCode: process.env.PLATFORM_CODE!,
  platformKey: process.env.PLATFORM_API_KEY!,
  apiUrl: process.env.ACCOUNT_API_URL!,
});
```

Platform API Key 只存在于 Server Environment。

SDK 应支持：

```text
request timeout
request_id propagation
idempotency key
structured error
retry policy（仅 safe/idempotent operation）
```

不要对所有 POST 自动重试。

---

# 108. Server SDK API

例如：

```ts
await account.activate(userToken);

const principal = await account.principal.get(userToken);

await account.profile.get(userToken);
await account.profile.update(userToken, data);

await account.preferences.get(userToken);
await account.preferences.update(userToken, data);

await account.plans.list(userToken);
await account.subscription.get(userToken);

await account.subscription.redeem(userToken, {
  code,
  idempotencyKey,
});

await account.configFiles.list(userToken);
```

业务平台自己的 protected backend route 推荐先：

```ts
const principal = await account.principal.get(userToken);

if (principal.accountStatus !== 'active') {
  deny();
}
```

这样 Platform suspension 才真正影响业务 API，而不只是 Account API。

---

# 109. Product UI Templates

本项目额外维护：

> 与后端完全对接好的用户前端源码模板。

它们不部署在本后端生产环境中。

---

# 110. 为什么不是 examples

不能只是：

```text
examples/login
```

而应该是正式：

```text
Registry
```

因为需要：

```text
版本
依赖
安装
CI
兼容关系
```

---

# 111. 推荐 shadcn Registry

使用：

```text
shadcn Registry
```

原因：

```text
源码安装
可直接修改
自动依赖
适合 shadcn
适合多个品牌项目
```

---

# 112. Product UI Template 三层

## Layer 1

```text
Headless SDK
```

## Layer 2

```text
Reusable UI Blocks
```

## Layer 3

```text
Full Page Templates
```

---

# 113. V1 UI Blocks

```text
LoginForm
OAuthButtons
SignupForm
PasswordResetForm
PricingCards
ProfileForm
PreferencesForm
RedeemCodeForm
SubscriptionCard
ConfigFilesManager
UserMenu
```

---

# 114. V1 Page Templates

```text
Login

Signup

Forgot Password

Reset Password

OAuth Callback

Pricing

Profile

Preferences

Subscription Status

Redeem

Config Files
```

---

# 115. Template 不复制业务逻辑

例如：

```text
Redeem UI
```

不应该：

```text
query redemption_codes
calculate expiration
update subscription
```

只能：

```text
UI
→ SDK
→ Account API
```

---

# 116. Auth Template

也不要每个模板各写：

```text
createBrowserClient()
```

统一调用：

```text
account-browser
```

---

# 117. UI Template 可以被修改

安装后：

```text
source belongs to target project
```

可以改：

```text
Logo
Colors
Typography
Layout
Copy
Animation
Interaction
```

---

# 118. Branding Config

模板不要硬编码产品名。

推荐：

```ts
export const productConfig = {
  name: 'Your Product',
  logo: '/logo.svg',
  routes: {
    login: '/login',
    signup: '/signup',
    pricing: '/pricing',
    profile: '/settings/profile',
    subscription: '/settings/subscription',
  },
};
```

---

# 119. Pricing Template V1

因为当前不做支付：

```text
Pricing Page
```

主要展示：

```text
Plans
Features
Current Plan
Redeem CTA
Contact to Purchase
```

不做：

```text
Buy Now
Checkout
Billing Portal
```

---

# 120. Config Files Template

提供：

```text
Upload
List
Download
Delete
Replace
Quota
```

默认：

```text
不限制 extension
```

---

# 121. Template Preview App

仓库增加：

```text
apps/template-preview
```

用途：

```text
Template Development

Local Supabase Integration

E2E

Visual Validation

Registry Smoke Test
```

不生产部署。

---

# 122. Registry 目录

```text
registry/
├── registry.json
├── auth-login/
├── auth-signup/
├── auth-forgot-password/
├── auth-reset-password/
├── pricing-page/
├── profile-settings/
├── preferences-settings/
├── subscription-status/
├── subscription-redeem/
├── config-files-manager/
└── user-menu/
```

---

# 123. Registry Install

未来新平台：

```bash
pnpm add @yourorg/account-browser @yourorg/account-server
```

然后：

```bash
pnpm dlx shadcn@latest add @account/auth-login

pnpm dlx shadcn@latest add @account/auth-signup

pnpm dlx shadcn@latest add @account/pricing-page

pnpm dlx shadcn@latest add @account/subscription-redeem

pnpm dlx shadcn@latest add @account/profile-settings

pnpm dlx shadcn@latest add @account/config-files-manager
```

---

# 124. Template Variants

以后可以提供：

```text
auth-login-simple
auth-login-split
auth-login-card

pricing-cards
pricing-comparison

redeem-card
redeem-dialog
```

底层 SDK Contract 不变。

---

# 125. Admin UI 成熟参考

推荐：

```text
Kiranism/next-shadcn-dashboard-starter
```

迁：

```text
Admin Layout
Sidebar
Header
Table
Search
Filter
Pagination
Charts
CRUD UX
```

不迁：

```text
Clerk
Organization
Clerk Billing
```

---

# 126. RLS / Security Test 参考

推荐：

```text
Cinderblock
```

主要参考：

```text
pgTAP
hostile fixture
negative tests
cross-tenant attack tests
```

不继承：

```text
Workspace Domain
```

---

# 127. Super Admin API 语义参考

推荐：

```text
JDIZM/supabase-express-api
```

参考：

```text
Admin list/filter
Account status
Audit query
Pagination
Error contract
```

不迁：

```text
Express
Drizzle
Workspace
RBAC
```

---

# 128. Redemption 安全参考

推荐：

```text
quteam/license-manager
```

参考：

```text
Batch
HMAC
one-time plaintext
masked code
lifecycle
audit
```

---

# 129. Redemption Engine 参考

推荐：

```text
OfferKit
```

参考：

```text
atomic redeem
idempotency
ledger
validation
audit
typed contract
```

---

# 130. 官方优先级

以下内容必须始终以官方最新文档为最终标准：

```text
Supabase Auth
SSR
JWT verification
MFA / AAL
API Keys
RLS
Storage
Admin API
Edge Functions
Management API
未来 Payment Provider
```

截至 v1.1 架构复核时，必须特别注意：

```text
Supabase 新 API Key 体系：Publishable / Secret
legacy anon / service_role 不应作为新项目长期基线

@supabase/ssr 仍属于需要 Adapter 隔离的变化面

生产 Auth Redirect URL 应精确配置
```

开源项目只参考：

```text
pattern
module boundary
UX
test strategy
```

不让 Starter 的抽象覆盖本项目 Domain。

---

# 131. 不“拼项目”

明确不做：

```text
把 Makerkit
Kiranism
Cinderblock
OfferKit
license-manager
```

整个仓库合并。

只做：

```text
模块级移植
```

---

# 132. 每次移植标准流程

```text
1. 固定 upstream commit

2. 检查 license

3. 列依赖

4. 只迁最小功能

5. 删除无关 Domain

6. 替换 Auth / UI / Query

7. 增加测试

8. 记录来源
```

---

# 133. `upstream-sources.md`

记录：

```text
Module
Source
Repository
Commit
License
Copied Files
Adapted Files
Removed Dependencies
Reason
Last Reviewed
```

---

# 134. `THIRD_PARTY_NOTICES.md`

记录实际复制/改造代码来源。

例如：

```text
Makerkit
Kiranism
Cinderblock
license-manager
OfferKit
```

---

# 135. 技术栈统一规则

项目已有：

```text
TanStack Query
```

则不再引入：

```text
SWR
```

已有：

```text
React Hook Form
```

则不再引入：

```text
Formik
TanStack Form
```

已有：

```text
Zod
```

则不再引入：

```text
Yup
```

已有：

```text
shadcn / Makerkit
```

则不引入：

```text
Material UI Admin Framework
Ant Design 全套
```

---

# 136. 不采用 React Admin

虽然成熟，但会引入：

```text
Material UI
新的 resource abstraction
新的 data provider layer
```

和 Makerkit 重复。

---

# 137. 不采用 Refine 作为主 Admin

因为当前已经有：

```text
Next.js
Query
Form
Router
Supabase
UI
```

再增加 Refine abstraction 收益有限。

---

# 138. 推荐仓库结构

```text
repo/
│
├── apps/
│   ├── admin/
│   │   ├── app/
│   │   ├── components/
│   │   └── config/
│   │
│   └── template-preview/
│
├── packages/
│   ├── ui/
│   │
│   ├── account-auth/
│   ├── account-auth-nextjs/
│   ├── account-server/
│   │
│   └── features/
│       ├── admin/
│       ├── platform/
│       ├── profile/
│       ├── preferences/
│       ├── subscription/
│       ├── redemption/
│       ├── config-files/
│       └── audit/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── account-api/
│   │   └── _shared/
│   ├── tests/
│   ├── config.toml
│   └── seed.sql
│
├── registry/
│   ├── registry.json
│   ├── auth-login/
│   ├── auth-signup/
│   ├── auth-forgot-password/
│   ├── auth-reset-password/
│   ├── pricing-page/
│   ├── profile-settings/
│   ├── preferences-settings/
│   ├── subscription-status/
│   ├── subscription-redeem/
│   ├── config-files-manager/
│   └── user-menu/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── auth.md
│   ├── platform.md
│   ├── subscription.md
│   ├── redemption.md
│   ├── config-files.md
│   ├── admin.md
│   ├── sdk.md
│   ├── templates.md
│   ├── security.md
│   ├── operations.md
│   └── upstream-sources.md
│
├── THIRD_PARTY_NOTICES.md
└── package.json
```

关键调整：

```text
Supabase backend resources 不再放在 apps/admin 下
新增 account-auth-nextjs adapter
新增 operations.md
```

---

# 139. Migration 推荐顺序

推荐按 dependency 建立，而不是仅按 UI 开发顺序：

```text
0001_private_schema
0002_platforms
0003_platform_auth_origins
0004_platform_accounts
0005_platform_profiles
0006_platform_preferences
0007_plans
0008_platform_default_plan_fk
0009_platform_file_policies
0010_redemption_code_batches
0011_redemption_codes
0012_redemption_events
0013_subscriptions
0014_subscription_grants
0015_subscription_events
0016_platform_config_files
0017_private_system_admin
0018_private_platform_api_keys
0019_private_idempotency
0020_audit_logs
0021_indexes
0022_updated_at_triggers
0023_rls_base
0024_privileged_functions
0025_redeem_function
0026_storage_policies
0027_scheduled_job_support
```

真实 migration 文件由 Supabase CLI 创建时间戳命名。

每个 migration 必须：

```text
可在空库重建
通过本地 reset
有关键 constraint 测试
不依赖手工 Dashboard 修改
```

---

# 140. Seed

本地 Seed 建议：

```text
1 Super Admin

3 Platforms

每个平台若干 Plans

5 Test Users

Platform Account Matrix

Test Redemption Batches

Test Config File Metadata
```

生产不 Seed：

```text
真实兑换码
真实 API Key
```

---

# 141. Security Test Fixture

例如：

```text
Users:
U001
U002
U003

Platforms:
A
B
C

Accounts:
A/U001 active
B/U001 active
A/U002 suspended
C/U003 closed

Plans:
A/Free
A/Pro
B/Pro
C/Basic
```

Fixture 必须故意包含相同名称 / 相同 code 的跨 Platform 数据，以验证 API 和数据库不会因为业务名称相同而越界。

---

# 142. 必测跨用户

```text
A/U001
不能读 A/U002
```

---

# 143. 必测跨平台

```text
A/U001
不能读 B/U001 Profile

A/U001
不能读 B/U001 Subscription

Platform A API Key
不能操作 Platform B

A platform_account_id
不能绑定 B plan_id

A redemption batch
不能绑定 B plan_id

A code
不能 redeemed_by B account
```

不仅测试 API deny，还要测试 composite FK 在数据库层拒绝非法 tenant combination。

---

# 144. 必测 Redemption

```text
A Code
不能在 B 使用

同一个 Code 并发 10 次
只有 1 个成功

同 Idempotency-Key + 同 Request
返回同一结果

同 Idempotency-Key + 不同 Request
IDEMPOTENCY_CONFLICT

不同用户使用相同 Idempotency-Key
互不冲突

不同 Plan
PLAN_CONFLICT

expired / disabled code
拒绝

suspended / closed platform account
拒绝

在线暴力猜码
触发 rate limit
```

---

# 145. 必测 Config Files

```text
A/U001
不能列 B/U001 Files

A/U001
不能下载 A/U002 File

超过 max_files
拒绝

超过 max_file_bytes
拒绝

超过 max_total_bytes
拒绝

并发 20 个 upload-intent
quota reservation 不能被绕过

pending 超时
reservation 被释放

complete actual size > requested / limit
拒绝并 cleanup

删除 Storage 失败
row 保持 deleting 并可重试

DB active, object missing
reconciliation 能发现

任意扩展名
允许，但只作为 opaque object 管理
```

---

# 146. Admin E2E

```text
Admin Login
MFA / AAL2 Challenge

Create Platform
Register Auth Origin
Create Plan
Set File Policy
Generate Platform API Key
Rotate Platform API Key
Revoke Old Key

Create Redemption Batch
Download Codes Once
Disable Batch

View User
View Platform Account
Suspend / Restore Platform Account
View Subscription
Manual Grant

View / Download / Delete Config File
Verify Audit Events
```

必须测试非 Admin user 和仅 AAL1 Admin session 均无法执行敏感操作。

---

# 147. Platform Integration E2E

至少使用一个真实测试 Consumer App 验证：

```text
Login
Signup
OAuth Callback
Password Reset Callback
Account Activation
Account Principal
Profile
Preferences
Plans
Subscription
Redeem
Config File Upload
Download
Delete
```

还必须验证：

```text
Platform Account suspended 后，Consumer App protected business route 被拒绝
Platform API Key revoked 后，Server SDK 请求被拒绝
错误 Platform credential 不能切换 tenant
```

---

# 148. Template Tests

每个模板要测试：

```text
install
typecheck
build
basic interaction
```

---

# 149. Registry Install Smoke Test

CI 创建临时：

```text
Next.js app
```

然后安装：

```text
Registry Item
```

执行：

```text
typecheck
build
```

---

# 150. CI Pipeline

推荐：

```text
Install
  ↓
Format Check
  ↓
Lint
  ↓
Typecheck
  ↓
Unit Tests
  ↓
Supabase Start
  ↓
DB Reset
  ↓
Migration Integrity
  ↓
pgTAP / DB Constraints
  ↓
Auth Contract Tests
  ↓
Account API Security Tests
  ↓
Concurrent Redeem
  ↓
Config Quota Concurrency
  ↓
Build Admin
  ↓
Build Template Preview
  ↓
Registry Validate
  ↓
Registry Install Smoke Test
  ↓
Playwright
```

Production migration 另有预发布 gate，不由普通 merge 自动执行。

---

# 151. Merge Gate

以下必须通过：

```text
Format
Lint
Typecheck
Unit
DB Migration Reset
DB Tenant Integrity
pgTAP
Cross User
Cross Platform
Platform Credential
Account Status Authorization
Concurrent Redeem
Idempotency Conflict
Config File Quota Concurrency
Config Files Security
Build
Registry Smoke
E2E
```

安全回归测试失败禁止 merge。

---

# 152. Logging

统一结构：

```text
request_id
trace_id (optional)
platform_id
user_id
platform_account_id
event
operation
duration_ms
result
error_code
http_status
```

生产日志中的 user / platform 标识用于运维定位，但不得把敏感 payload、token 或文件下载签名放入日志。

所有跨服务 / SDK 调用尽量传播 `request_id`。

---

# 153. 禁止 Log 的内容

禁止记录：

```text
password
access_token
refresh_token
Supabase Secret Key
Platform API Key
Platform API Key raw HMAC material
Redemption HMAC Secret
完整 Redemption Code
Signed Storage URL
OAuth authorization code
MFA TOTP secret
敏感 Config File 内容
```

必要时只记录：

```text
key prefix / suffix
code mask
object id
hash / request fingerprint
```

所有日志 helper 应具备统一 redaction。

---

# 154. Secret 分类

至少区分：

```text
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
PLATFORM_API_KEY
PLATFORM_API_KEY_HMAC_SECRET
REDEMPTION_CODE_HMAC_SECRET
```

不同用途必须使用不同 Secret。

规则：

```text
Publishable Key 可进入 Browser
Secret Key 只进入 trusted backend
Platform API Key 只进入具体 Platform Server
HMAC Secrets 只进入统一 Account Backend
Admin runtime secret 与普通 Platform runtime 分离
```

所有长期 secret 必须有 rotation runbook。

---

# 155. V1 明确不做

```text
Account Center

Cross-domain SSO

Organization

Workspace

Team

RBAC

Platform Admin

Stripe

Payment

Invoice

Refund

Usage Billing

Seat Billing

Notification Center

User API Keys

Complex Entitlement Engine

在线 Config File Preview
```

---

# 156. V1 必须完成

```text
✓ Makerkit Admin-only Base
✓ One Super Admin
✓ Admin MFA / AAL2
✓ Super Admin Recovery Runbook

✓ Supabase Auth
✓ Global Identity
✓ Identity Linking
✓ Identity Lifecycle Rules
✓ Auth Origin / Redirect Registry

✓ Platforms
✓ Platform API Keys
✓ Platform Key Rotation
✓ Platform Accounts
✓ Account Principal / Authorization
✓ Profiles
✓ Preferences
✓ Account Activation

✓ Plans
✓ Tenant Composite Constraints
✓ Subscription Projection
✓ Subscription Grants
✓ Subscription Events

✓ Redemption Batches
✓ Redemption Codes
✓ >=128 bit random code payload
✓ HMAC Versioning
✓ Atomic Redeem
✓ User-scoped Idempotency
✓ Redeem Rate Limit

✓ Platform Config Files
✓ Private Storage
✓ Quota Reservation
✓ Signed Upload
✓ Signed Download
✓ File State Machine
✓ Cleanup / Reconciliation

✓ Account Auth Core
✓ Next.js Auth Adapter
✓ Account Server SDK
✓ Product UI Registry
✓ Template Preview

✓ Audit
✓ Structured Logging
✓ Error Tracking
✓ pgTAP / DB Constraint Tests
✓ Playwright
✓ CI

✓ Dev / Staging / Production Isolation
✓ Backup / Restore Procedure
✓ Secret Rotation Procedure
✓ Scheduled Cleanup Jobs
```

---

# 157. 开发阶段

## Phase 0：Freeze Architecture v1.1

```text
确认本文件
确认 Supabase 当前官方 Auth / API Key / SSR 规范
固定 Makerkit upstream commit + license
建立 ADR / upstream records
```

## Phase 1：Repository / Admin-only Cleanup

```text
apps/web → apps/admin
Supabase backend 迁到 repo/supabase
删除普通用户 Demo UI
```

## Phase 2：Supabase Auth Conformance

实现并验证：

```text
Publishable / Secret Key
SSR Cookie model
PKCE
OAuth
Password Reset
Identity Linking
getClaims / getUser authorization rules
MFA / AAL2 for Admin
Auth Origins / Redirect URLs
```

## Phase 3：Platform Core + Tenant Integrity

```text
platforms
platform_auth_origins
platform_api_keys
platform_accounts
profiles
preferences
composite FK pattern
account principal
```

## Phase 4：SDK / Framework Adapter

```text
account-auth
account-auth-nextjs
account-server
接入一个真实测试 Platform
```

## Phase 5：Admin Base

```text
Shell
Sidebar
Table
Filter
Pagination
Charts
MFA gate
Recovery documentation
```

## Phase 6：Plans / File Policy

```text
plans
default plan
plan feature contract
platform_file_policies
```

## Phase 7：Redemption + Entitlement Core

```text
Batch
Code
128-bit entropy
HMAC version
Atomic Redeem
Rate limit
Idempotency
Grant Ledger
Projection
Events
```

## Phase 8：Redemption Admin

```text
Batch CRUD
Generate
Download plaintext once
Mask
Disable
Search
Events
Key rotation-aware generation
```

## Phase 9：Subscription Admin

```text
List
Detail
Grant History
Manual Grant
Event History
```

## Phase 10：Config Files

```text
Private bucket
Metadata
Quota Reservation
Upload Intent
Signed Upload
Complete
Signed Download
Delete State Machine
Cleanup
Reconciliation
```

## Phase 11：Product UI Registry

```text
Auth
Pricing
Profile
Preferences
Subscription
Redeem
Config Files
User Menu
```

## Phase 12：Template Preview / Consumer App

真实连接 Local Supabase，覆盖 SSR Callback 与 Account API。

## Phase 13：Security / Concurrency Tests

```text
Cross User
Cross Platform
DB Tenant Integrity
RLS
Account API Authorization
Platform Key
Redeem Concurrency
Idempotency
Rate Limit
Storage
Quota Concurrency
```

## Phase 14：Audit / Observability / Operations

```text
Audit
Pino
Error Tracking
Alerts
Scheduled Jobs
Secret Rotation Docs
Backup / Restore Drill
```

## Phase 15：Staging Hardening

```text
独立 Staging Supabase Project
Production-like migrations
E2E
restore rehearsal
key rotation rehearsal
```

## Phase 16：Production

只有安全、恢复、迁移和运维 gate 全部通过后发布。

---

# 158. 新 Platform 接入流程

以后新增 Platform D：

```text
1. Admin 创建 Platform
2. 注册 production / staging Auth Origins 与 Redirect URLs
3. 生成 Platform API Key
4. 配置 Platform Server Secret
5. 配置 File Policy
6. 创建 Plans
7. 设置 optional default plan
8. 生成 Redemption Codes（如需要）
9. 新平台安装 account-auth
10. 新平台安装 account-auth-nextjs
11. 新平台安装 account-server
12. 安装 Login Template
13. 安装 Signup Template
14. 安装 Pricing Template
15. 安装 Profile Template
16. 安装 Redeem Template
17. 安装 Config Files Template
18. 修改 Logo / Theme / Copy
19. 实现业务 API 前的 Account Principal 校验
20. 运行 Platform Integration E2E
21. 上线
```

不应要求修改统一 Account Backend Domain 代码。

若接入一个普通新 Platform 必须新增 if/else 或 hardcode platform code，说明抽象失败。

---

# 159. 判断基座是否真正成功

新 Platform：

```text
不修改统一后端核心 Domain 代码
```

只通过：

```text
Admin 配置 Platform
注册 Auth Origins
生成 / 配置 Platform API Key
创建 Plan / File Policy
安装 SDK / Adapter
安装模板
修改 UI
```

即可拥有：

```text
Auth
Account Principal
Platform Account Lifecycle
Profile
Preferences
Subscription / Entitlement
Redeem
Config Files
```

同时：

```text
数据库能拒绝 cross-tenant invalid relation
Platform suspension 能阻断业务授权
SDK contract 不暴露 Platform Secret 到 Browser
```

达到这些标准，才说明抽象真正完成。

---

# 160. 后续支付订阅

支付订阅属于后续独立阶段。

届时新增 Billing Domain：

```text
Billing Provider
Billing Customer
Provider Subscription
Checkout
Portal
Webhook Event
Invoice / Payment State
Refund / Chargeback
Trial
Cancel / Resume
```

Billing Domain 通过统一 Entitlement Grant Interface 产生 grant，不直接让 Provider Webhook 任意修改 `subscriptions`。

---

# 161. Payment 不改变 Entitlement Core

未来：

```text
Stripe / Payment Provider Webhook
      ↓
verify + idempotent Billing Event
      ↓
Billing Domain State
      ↓
Entitlement Grant Interface
      ↓
subscription_grant
      ↓
subscription projection
```

因此：

```text
Redemption
Admin Grant
Payment
```

都是不同的 Grant Source。

准确原则：

> **Payment 不改变 Grant / Projection 核心语义，但 Payment 会引入自己的 Billing State Machine。**

---

# 162. 未来可能增加但现在不做

未来按真实需求增加：

```text
Platform Admin
Organization / Workspace
Cross-domain SSO
Usage Billing
Seat Billing
Notification
Advanced Feature Entitlements
Client-side encrypted config files
Plan Versioning / Grandfathering
Short-lived Platform Context Token
Event Bus / Outbox
Multi-region architecture
```

V1 不提前实现。

但是当前设计必须避免把这些能力“堵死”，尤其不能让 Subscription Projection 直接绑定某一个支付 Provider。

---

# 163. 上游参考项目定位

## Makerkit Lite

```text
BASE
```

用于：

```text
Admin Engineering
UI
Query
Form
Test Infrastructure
Supabase Integration
```

---

## Supabase Official

```text
SOURCE OF TRUTH
```

用于：

```text
Auth
SSR
RLS
Storage
Admin API
Edge Functions
Security
```

---

## Kiranism

```text
ADMIN UI PATTERNS
```

---

## Cinderblock

```text
RLS / SECURITY TEST PATTERNS
```

---

## quteam/license-manager

```text
REDEMPTION CODE SECURITY
```

---

## OfferKit

```text
ATOMIC REDEMPTION / LEDGER
```

---

## JDIZM

```text
SUPER ADMIN API SEMANTICS
```

---

# 164. 模块复用优先级

```text
Level 0
Official Docs / SDK

Level 1
Mature OSS Module Pattern

Level 2
Starter Glue Code

Level 3
Custom Implementation
```

---

# 165. 什么必须自己实现

真正属于这个系统独特 Domain 的：

```text
Platform
Platform Auth Origin Registry
Platform Context
Platform API Key Lifecycle
Platform Account
Platform Account Lifecycle
Account Activation
Account Principal / Authorization Contract
Tenant Integrity Pattern
Single Super Admin Rule
Super Admin Recovery Rules
Platform SDK Contract
Cross-platform identity relationship
Subscription Grant / Projection integration rules
Config File quota reservation semantics
```

这些应该自己实现并用测试固化。

不要让某个 Starter、Admin Framework 或 Billing Provider 定义这些核心 Domain。

---

# 166. 什么尽量不要自己造

优先成熟方案：

```text
Auth

Admin Table

Form

Charts

Storage Signed URL

Redemption Code Security

Atomic Redemption Pattern

RLS Test Pattern

UI Templates
```

---

# 167. 最终架构摘要

```text
                           Global Identity
                         Supabase auth.users
                                 │
                    Controlled Identity Lifecycle
                                 │
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
       Platform A Account  Platform B Account  Platform C Account
             │                   │                   │
      active/suspended      active/suspended      active/closed
             │
      ┌──────┼───────────────┬─────────────────┐
      ▼      ▼               ▼                 ▼
   Profile  Pref     Subscription Projection  Config Files
                              │
                              ▼
                      Subscription Grants
                       ▲       ▲       ▲
                       │       │       │
                  Redemption  Admin  Future Billing


 Platform Server
      │
      ├── Verified User JWT
      └── Platform API Key
               │
               ▼
      ┌─────────────────────────┐
      │   Account Principal     │
      │                         │
      │ user_id                 │
      │ platform_id             │
      │ platform_account_id     │
      │ platform/account status │
      └───────────┬─────────────┘
                  │
                  ▼
             Account Domains
                  │
        DB Tenant Integrity Constraints


                    Backend Control Plane
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        Account API                Admin Console
      Supabase Functions          Makerkit Lite
                                        │
                                  One Super Admin
                                     MFA / AAL2


                    Product Integration Kit
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     Auth Core       Next.js Adapter     Server SDK
                           │
                           ▼
                      UI Registry
```

---

# 168. 最终不可变核心原则

开发过程中，以下原则除非明确重新做架构评审，否则不要改变：

```text
1. Global Identity 使用统一 Supabase auth.users。

2. Global Identity 只代表“这个人是谁”；Platform-local State 不自动 Link。

3. Platform = Tenant。

4. Tenant Integrity 必须由数据库 composite constraints 直接保证，不能只靠 API 验证。

5. Platform Account 是 Platform-local 用户状态根，并拥有 active / suspended / closed 生命周期。

6. Platform 注销不默认删除 Global Identity。

7. 一个 active Super Admin；Admin 必须使用 MFA / AAL2。

8. Admin 不承担普通用户登录，不做统一 Account Center。

9. 各平台 Login UI 独立；底层 Auth Contract 统一。

10. Auth Redirect / OAuth Callback 必须按 Platform Origin 注册和校验。

11. Platform Context 由 Server Credential 确认，浏览器不能决定 trusted platform_id。

12. 浏览器不能持有 Platform API Key、Supabase Secret Key 或任何 HMAC Secret。

13. Auth valid 不等于 Platform Product Authorization valid；业务 API 必须尊重 Platform Account 状态。

14. Subscription = Projection + Grant Ledger。

15. Projection 不保存模糊的单一 source；Grant Ledger 保存 provenance。

16. V1 Grant Source = Redemption + Admin；Payment 未来通过 Billing Domain 接入 Grant Interface。

17. Redemption 必须 Atomic + Idempotent + Rate Limited。

18. Idempotency scope 至少包含 platform + platform_account + operation。

19. Redemption Code 随机部分 >= 128 bit entropy。

20. Redemption Code 明文只显示一次；持久化只存 versioned HMAC + mask。

21. Config Files 属于 Platform Account，使用 Private Supabase Storage。

22. Config Files 对象不解析、不执行；只做 opaque object 管理。

23. Config File Quota 使用 reservation 防止并发绕过。

24. Storage 删除使用状态机 + reconciliation，不假设 Storage 与 DB 跨系统原子事务。

25. SDK 是稳定业务 Contract；Supabase SSR 变化面隔离在 Framework Adapter。

26. Supabase Browser 使用 Publishable Key，Trusted Backend 使用 Secret Key；legacy key 命名不作为新基线。

27. RLS 是 Browser Data API 防线；Privileged Account API 主要依赖 Application Authorization + DB Invariants。

28. UI Template 复制源码，业务逻辑不复制。

29. Makerkit Lite 是 Admin Base。

30. 官方当前文档优先于任何 Starter / OSS。

31. 不整仓拼接开源项目；移植模块记录 Commit + License。

32. Dev / Staging / Production 使用独立 Supabase Project。

33. 所有长期 Secret 必须有 rotation runbook。

34. Backup / Restore 必须有可验证流程，而不是只依赖“已开启备份”。

35. 新 Platform 不应要求修改统一后端核心 Domain 代码。
```

---

# 169. V1 最终名称建议

整个项目建议定义为：

> **Multi-Platform Account Backend**

完整描述：

> **Multi-Platform Identity, Account, Entitlement, Subscription & Configuration Backend with Admin Control Plane and Reusable Product Integration Kit**

其中：

```text
Backend Runtime
+
Database Tenant Integrity
+
Admin Control Plane
+
Auth / Account SDK
+
Framework Adapter
+
Product UI Registry
+
Operational Runbooks
```

共同组成完整基座。

---

# 170. 最终验收标准

V1 完成时，应能做到：

```text
创建一个全新的业务平台项目

不修改统一后端核心 Domain 代码

只通过 Admin / 配置：
- 创建 Platform
- 注册 Auth Origins / Redirect URLs
- 创建 Plan
- 设置 default plan（可选）
- 生成 Platform API Key
- 设置文件配额
- 生成兑换码

在新平台：
- 安装 account-auth
- 安装 account-auth-nextjs
- 安装 account-server
- 安装 Login / Signup Template
- 安装 Pricing Template
- 安装 Profile / Preferences Template
- 安装 Redeem Template
- 安装 Config Files Template
- 修改品牌
- 在业务 API 接入 Account Principal 校验

即可完成：
- 登录 / 注册
- OAuth / Password Reset Callback
- Identity Link
- Platform Account Activation
- Platform Account Suspend / Close enforcement
- Profile
- Preferences
- 兑换码订阅
- Subscription / Entitlement
- 配置文件上传下载
```

同时必须证明：

```text
Cross-user attack 被拒绝
Cross-platform attack 被拒绝
非法 cross-tenant FK 在数据库层被拒绝
同一兑换码并发只成功一次
Idempotency 正确处理 retry 与 conflict
Quota 并发无法绕过
Storage failure 可以通过状态机 / reconciliation 恢复
Super Admin 必须 AAL2
Platform API Key 可以无停机轮换
生产环境具备 backup / restore / secret rotation runbook
```

达到这一点，才说明：

> **这个项目已经真正成为可复用、可运营、可长期演进的多平台后端基座。**

---

---

# 171. Global Identity Lifecycle

必须正式定义以下操作语义：

```text
Platform Suspend
Platform Close
Global Disable（未来可选）
Global Delete Request
Controlled Global Purge
```

## 171.1 Platform Suspend

```text
platform_account.status = suspended
```

效果：

```text
保留数据
禁止 Account mutation
业务 Platform protected API 应拒绝授权
允许 Admin 查看 / 恢复
```

## 171.2 Platform Close

```text
platform_account.status = closed
```

效果：

```text
该 Platform 不再作为 active account
不影响其它 Platform Account
保留必要历史 / audit
按 retention policy 删除或归档 Profile / Config Files
```

## 171.3 Global Delete

Global Delete 不能依赖 FK cascade 随机决定结果。

必须由受控服务 / RPC：

```text
1. verify deletion authorization
2. enumerate platform accounts
3. apply legal / audit retention policy
4. remove / tombstone config files
5. detach or anonymize historical actor references where allowed
6. close platform accounts
7. delete auth user only when dependencies are resolved
8. audit operation
```

默认 `auth.users` 外键使用 `on delete restrict` 或显式 `set null`，避免无意 cascade。

---

# 172. Platform Auth Origins

新增：

```sql
create table public.platform_auth_origins (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null
    references public.platforms(id)
    on delete cascade,

  environment text not null
    check (environment in ('local', 'preview', 'staging', 'production')),

  origin text not null,
  oauth_callback_url text,
  password_reset_url text,
  email_confirmation_url text,

  status text not null default 'active'
    check (status in ('active', 'disabled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(platform_id, environment, origin)
);
```

用途：

```text
明确每个平台合法的用户前端 origin
构造 OAuth / Reset redirectTo
Admin 展示配置状态
自动化检查 Supabase Auth redirect allowlist 是否已同步
```

注意：Supabase Auth Dashboard / config 中真正的 redirect allowlist 仍必须同步配置；数据库表不是 Supabase Auth 自身 allowlist 的替代品。

---

# 173. Tenant Integrity Pattern

所有 tenant-sensitive relation 统一遵循：

```text
父表：unique(platform_id, id)
子表：显式 platform_id
子表：foreign key (platform_id, foreign_id)
```

示例：

```text
subscription
├── platform_id
├── platform_account_id
└── plan_id

FK(platform_id, platform_account_id)
FK(platform_id, plan_id)
```

此模式优先于：

```text
只在 API 中先 select 再判断 platform_id
```

DB tests 必须 hostile insert 验证非法组合无法落库。

---

# 174. Account Principal Contract

Central Account API 内部统一 Principal：

```ts
type AccountPrincipal = {
  userId: string;
  platformId: string;
  platformAccountId: string | null;
  platformStatus: 'active' | 'disabled';
  accountStatus: 'active' | 'suspended' | 'closed' | 'not_activated';
};
```

所有普通用户 Domain handler 接收 Principal，不直接重新解析：

```text
Authorization header
platform key header
body platform_id
```

推荐错误：

```text
PLATFORM_DISABLED
ACCOUNT_NOT_ACTIVATED
ACCOUNT_SUSPENDED
ACCOUNT_CLOSED
UNAUTHORIZED
PLATFORM_CREDENTIAL_INVALID
```

---

# 175. Rate Limiting

至少对以下操作限流：

```text
login / signup（主要由 Auth Provider + edge 防护）
subscription redeem
upload-intent
password reset trigger
identity linking sensitive flows
Admin login attempts
```

Redeem 建议组合维度：

```text
IP
platform_id
platform_account_id
```

Rate Limit 与 Idempotency 是不同机制：

```text
Idempotency
= 防止合法 retry 重复副作用

Rate Limit
= 防止高频滥用 / brute force
```

V1 可使用平台边缘能力或轻量数据库/缓存实现，但 Contract 和测试必须先定义。

---

# 176. Super Admin Recovery Runbook

必须形成可执行文档，至少覆盖：

```text
MFA device lost
Auth email lost
Auth user accidentally deleted / disabled
system_admin mapping damaged
Admin deployment inaccessible
Supabase Auth outage
```

原则：

```text
正常运行只有一个 active Super Admin
恢复通过受控离线 privileged procedure
恢复后立即 rotation / audit
```

不得把“再加一个永远存在的隐藏管理员”作为 Recovery 方案。

---

# 177. Environment Isolation

必须使用独立：

```text
Local Supabase
Staging Supabase Project
Production Supabase Project
```

不共享：

```text
Auth Users
Database
Storage
Supabase Secret Keys
Platform API Keys
Redemption HMAC Secrets
Redemption Codes
```

可以共享：

```text
migration source
SDK source
registry source
test fixtures definition
```

Production 数据不得作为 Staging seed。

---

# 178. Operational Architecture

Production 前必须完成：

```text
Backup policy
Point-in-time / snapshot strategy（按实际 Supabase plan 能力）
Restore procedure
Restore drill
DB migration rollback / forward-fix policy
Secret rotation
Platform API Key rotation
HMAC key rotation
Scheduled cleanup jobs
Storage reconciliation
Error tracking
Alerting
Capacity / quota monitoring
Incident runbook
Data retention
```

关键原则：

> **“有备份”不等于“能恢复”。必须实际验证 Restore。**

---

# 179. Index / Trigger 基线

所有高频关系键建立索引，至少包括：

```text
platform_accounts(platform_id, user_id)
platform_accounts(user_id)
plans(platform_id, code)
subscriptions(platform_id, platform_account_id)
subscription_grants(platform_id, platform_account_id, created_at desc)
redemption_codes(platform_id, status)
redemption_codes(batch_id)
redemption_events(platform_id, created_at desc)
platform_config_files(platform_id, platform_account_id, status)
audit_logs(platform_id, created_at desc)
```

所有拥有 `updated_at` 的表使用统一 trigger 更新，不依赖每个应用调用方记得写时间。

索引最终以实际 query plan / production telemetry 调整，不提前无限加索引。

---

# 180. v1.1 架构变更摘要

相对 v1.0，本版本的核心修正：

```text
1. 数据库 Tenant Integrity 升级为 composite FK。
2. auth.users 删除从隐式 cascade 改为受控 Identity Lifecycle。
3. Platform 增加 Auth Origins / Redirect Registry。
4. Admin 强制 MFA / AAL2，并新增 Recovery Runbook。
5. Supabase Key 基线升级为 Publishable / Secret。
6. SDK 增加 Next.js / SSR Framework Adapter。
7. Account API 增加统一 Account Principal。
8. Platform suspension 明确成为业务 API 授权条件。
9. Subscription 删除 Snapshot 单一 source，明确 Projection + Grant Ledger。
10. Future Payment 改为独立 Billing Domain → Grant Interface。
11. Idempotency scope 增加 account + operation。
12. Redemption Code 实际满足 >=128 bit entropy，并支持 HMAC key version。
13. Redemption 增加 Rate Limit 要求。
14. Config File Quota 改为 transaction reservation。
15. Config File Delete 改为 deleting state + reconciliation。
16. Supabase backend 从 apps/admin 目录边界中解耦。
17. 增加 Environment Isolation / Backup / Restore / Rotation / Operations。
18. Security Test 增加 DB constraint、quota concurrency、account-status authorization。
```

本版本继续保留 v1.0 中正确的核心方向：

```text
Global Identity
Platform-local State
Platform = Tenant
No Organization in V1
No Central Account Center
One Super Admin
Central Account API
Redemption Domain
SDK + Registry
Makerkit Admin Base
V1 No Payment
```

---

# 181. 实施时的最终规则

当文档、Starter、AI 建议、开源代码与实际官方能力冲突时，执行优先级为：

```text
1. 当前官方 Supabase / Provider 安全规范
2. 本文档的 Domain / Security Invariant
3. docs/*.md 中更细的已评审 Contract
4. 自动化测试
5. Starter / OSS 实现细节
```

如果官方平台出现 breaking change：

```text
先修改 Adapter / Infrastructure 层
尽量不改变 Domain Contract
```

如果业务出现新需求：

```text
先验证是否属于 Platform-local Domain
再决定是否进入统一 Account Backend
```

统一后端只承担真正跨多个 Platform 有复用价值且边界稳定的能力。
