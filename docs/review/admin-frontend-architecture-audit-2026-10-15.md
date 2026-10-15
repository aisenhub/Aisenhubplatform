# Aisenhub Admin 前端技术架构全面审计

- 审计日期：2026-10-15
- 审计范围：`apps/admin`、`packages/ui`、`packages/domain`、根工作区工程化配置、Admin 相关测试与部署配置
- 审计目标：盘点当前 Admin 前端真实技术架构、开发依赖、UI/UX 组件技术、工程化体系、安全边界与主要技术债
- 审计性质：基于当前仓库实际代码与配置的静态架构审计，不将“工作区已安装”误判为“Admin 已实际采用”

## 1. 执行摘要

当前 Admin 本质上是一个 **Next.js 16 App Router + React 19 + TypeScript + Client-heavy 管理工作台 + 同源 BFF + Supabase Auth + 自研安全会话层 + `@kit/ui` 共享设计系统**。

它并不是典型的 React Query / React Hook Form / TanStack Table 驱动型后台。当前实现选择把基础 UI 能力建立在 Base UI、shadcn-style 组件、Tailwind CSS 和共享 `@kit/ui` 上，而把管理系统最关键的会话恢复、MFA、请求重放策略、并发过期保护、幂等、未知结果、错误语义和平台范围控制放在自研控制层中。

总体判断：

- 前端基础技术栈现代且稳定，不需要为了“升级架构”而替换 Next.js、React、Base UI、shadcn 或 Tailwind。
- Admin 的安全边界、Mutation 语义、错误状态语义和平台范围模型明显强于一般 CRUD 后台。
- 主要技术债不在底层框架，而在 **Client Component 偏重、超大 Feature 文件、自研异步状态重复、CSS/组件规范双轨、表单与 Data Table 能力尚未标准化**。
- 下一阶段最有价值的工作应是架构收敛和组件/数据层工程化，而不是引入更多框架。

## 2. 核心技术栈

| 领域 | 当前技术 | 审计结论 |
| --- | --- | --- |
| Web Framework | Next.js 16.3.8 | App Router |
| UI Runtime | React 19.2.8 | React 19 |
| DOM Renderer | React DOM 19.2.8 | 与 React 同版本 |
| 开发语言 | TypeScript | 根工作区 catalog 当前为 7.0.2 |
| 模块体系 | ESM | `type: module` |
| Node.js | Node 24.x | CI 使用 24.19.0 |
| 包管理 | pnpm 11.18.0 | 固定版本 |
| Monorepo | pnpm workspace + Turborepo | apps/packages/tooling 统一管理 |
| CSS | Tailwind CSS 4.3.3 + 原生 CSS | 两套方式并行 |
| CSS 构建 | `@tailwindcss/postcss` | Tailwind v4 |
| Production Build | `next build --webpack` | 明确使用 Webpack |
| TypeScript 策略 | strict + `noUncheckedIndexedAccess` | 类型安全级别较高 |
| RSC | 使用 | 多数 `page.tsx` 是 Server wrapper |
| Client Components | 大量使用 | 审计时约 44 个 Client 文件 |
| Server Actions | 未发现使用 | 当前不依赖 Server Actions |
| Next Cache | 基本未使用 | Admin 数据强调 `no-store` |
| 数据请求 | Client fetch + 自研 Session Manager | 非 React Query 架构 |

审计时 Admin 规模约为：

- 129 个受 Git 管理的 Admin 文件；
- 45 个 `.ts` 文件；
- 72 个 `.tsx` 文件；
- 27 个页面路由；
- 9 个 Next API Route；
- 14 个 Admin Unit Test 文件；
- 约 2.6 万行 Admin TS/TSX/CSS/配置相关代码。

27 个页面中，大多数页面文件本身是 Server Component 壳，但主要数据加载和复杂交互仍落在 Client Feature Component 中，因此当前整体仍属于 Client-heavy Admin。

## 3. 应用分层架构

当前代码已经形成较明确的层次：

```text
Browser
  │
  ├─ Next.js App Router
  │
  ├─ AdminShell
  │   ├─ Security Gate
  │   ├─ Sidebar
  │   ├─ Topbar
  │   ├─ Command Menu
  │   └─ Platform Context
  │
  ├─ Feature Workspaces
  │   ├─ Accounts
  │   ├─ Audit
  │   ├─ Billing
  │   ├─ Feedback
  │   ├─ Files / Config Resources
  │   ├─ Origins
  │   ├─ Overview
  │   ├─ Plans
  │   ├─ Platform Integration
  │   ├─ Platform Keys
  │   ├─ Platform Settings
  │   ├─ Platforms
  │   ├─ Redemption
  │   ├─ Security
  │   └─ Subscriptions
  │
  └─ adminAuthSession
        │
        ▼
Next.js BFF
/api/v1/[...path]
        │
        ▼
Account API / Admin API
        │
        ▼
Domain / DB / Supabase
```

这意味着 Admin 并不是浏览器直接访问数据库或直接把业务数据放到 Supabase Data API 上，而是通过同源 BFF 对外部 Admin API 做统一访问控制。

## 4. 路由与 Scope 模型

### 4.1 Global Scope

主要入口包括：

```text
/admin
/admin/platforms
/admin/accounts
/admin/accounts/[userId]
/admin/accounts/deletion-jobs
/admin/billing/orders
/admin/audit
/admin/security
```

全局一级导航目前为：

```text
仪表盘
平台中心
用户中心
业务中心
审计中心
安全中心
```

### 4.2 Platform Scope

平台工作区使用 URL 中的 `platformId` 作为唯一权威上下文：

```text
/admin/platforms/[platformId]
```

其下主要包含：

```text
账户
订单与计费
套餐
订阅
兑换码
配置资源
用户反馈
接入配置
基本设置
```

这个设计非常重要：**平台 Context 由 URL 唯一决定，不从缓存或其他客户端状态猜测当前平台**。这能显著降低跨平台后台误操作风险。

## 5. 状态管理技术

当前 Admin 没有使用以下全局状态管理库：

- Redux；
- Zustand；
- MobX；
- Jotai；
- Recoil；
- XState。

Admin 也没有直接采用 React Query 或 SWR 作为数据状态层。

当前状态主要由以下技术组成：

```text
React useState
React useEffect
React useMemo
React useCallback
React useRef
React Context
URLSearchParams
Next.js Router
```

典型上下文包括：

- `AdminShellContext`；
- `PlatformWorkspaceContext`；
- `AuthSessionManager` 自身维护的 Session Snapshot。

该体系特点是可控、透明，但当 Feature 增长时容易在页面内重复实现加载、错误、刷新、游标与并发保护逻辑。

## 6. 数据请求架构

Admin 当前并不是 React Query 架构。业务页面主要通过：

```ts
adminAuthSession.request(...)
```

统一请求同源 API。

大量页面自己维护：

```text
loading
success
error
refreshing
refreshError
cursor
generation
AbortController
```

为了防止“旧请求晚返回覆盖新上下文”，项目同时使用：

- generation ref；
- session epoch；
- scope ref；
- AbortController；
- `beginScopedLoad()`；
- `isScopedLoadCurrent()`。

这是 Admin 中非常关键的并发安全能力，尤其适合平台切换、账户切换、查询过滤和 Session 刷新场景。

## 7. BFF / API 架构

Admin 的核心浏览器 API 入口为：

```text
apps/admin/app/api/v1/[...path]/route.ts
```

请求链为：

```text
Browser
  ↓
/api/v1/admin/api/v1/...
  ↓
Next.js BFF
  ↓
ACCOUNT_API_URL
```

当前 BFF 负责：

- Admin API path allowlist；
- HTTP method allowlist；
- JWT 注入；
- Recent MFA Proof 注入；
- CSRF 验证；
- Origin 验证；
- Query 字节大小限制；
- Query 参数数量限制；
- Request body 大小限制；
- Request timeout；
- ETag 转发；
- `If-Match` / `If-None-Match` 转发；
- `Idempotency-Key` 转发；
- Binary download 安全响应头；
- CSP；
- `X-Content-Type-Options: nosniff`；
- Request ID；
- `Cache-Control: no-store`。

BFF 当前统一不开放通用 `DELETE`。高风险动作采用明确的 command endpoint，而不是把所有业务删除都映射成 HTTP DELETE。这一选择对管理后台是稳健的。

## 8. Supabase 的真实用途

Admin 使用：

- `@supabase/ssr`；
- `@supabase/supabase-js`。

但其主要用途是 Authentication：

```text
登录
Refresh Token
MFA
Session
Cookie
Auth Callback
```

Accounts、Billing、Audit、Platform 等主要业务数据并不是浏览器直接访问 Supabase Database，而是：

```text
Browser → Admin BFF → Account/Admin API
```

因此当前 Supabase 更准确的角色是 **身份认证基础设施**，而不是 Admin 业务数据前端 SDK。

## 9. 自研 Auth Session 技术

项目有一套独立的 `AuthSessionManager`，而不是简单依赖 Supabase `getSession()`。

它负责的 Session 状态包括：

```text
unauthenticated
authenticating
authenticated
refreshing
mfa_required
expired
```

### 9.1 Request Replay Policy

默认策略为：

```text
GET / HEAD / OPTIONS
→ Session refresh 后允许安全读取重放
```

而：

```text
POST / PATCH / PUT
→ Session refresh 后默认不自动重放
```

这能避免高风险 Mutation 因 401 → refresh → 自动重试而执行两次。

只有明确满足安全条件的 Mutation 才可按幂等策略重放，例如具备：

- `Idempotency-Key`；
- 可安全重放的 request body；
- 明确的 `idempotent-mutation` 策略。

这是当前架构最成熟的部分之一。

## 10. 跨 Tab Session 同步

Admin 自研 Session Layer 使用 `BroadcastChannel`，频道为：

```text
aisenhub-auth-session-v1
```

用于同步：

```text
logged_out
session_expired
```

因此管理员在一个标签页退出或会话失效时，其他 Admin 标签页可以感知 Session 终止。这比单纯依赖每个页面下一次请求才发现 401 更可靠。

## 11. MFA / Step-Up Authentication

Admin 安全模型明确区分：

```text
AAL1
AAL2
Recent MFA
```

总体流程为：

```text
登录
 ↓
检查 Security Status
 ↓
AAL1
 ↓
MFA
 ↓
AAL2
 ↓
进入 Admin
```

高风险操作还可能返回：

```text
RECENT_MFA_REQUIRED
```

即使当前 Session 已是 AAL2，也可能要求近期重新验证。这种 Step-Up 模型已经同时体现在 API、Session Manager 和确认操作 UI 中。

## 12. UI 基础技术栈

当前 UI 技术链可概括为：

```text
Tailwind CSS 4
        ↓
Base UI
        ↓
shadcn-style source components
        ↓
@kit/ui
        ↓
Aisenhub Admin Components
        ↓
Feature UI
```

### 12.1 Base UI

核心无样式/可访问性 primitive 来自：

```text
@base-ui/react 1.6.0
```

共享 UI 包中使用 Base UI 构建 Button、Dialog、Sheet、Popover、Menu、Tooltip、Select、Tabs、Checkbox、Switch、Navigation Menu、Accordion 等基础组件。

当前技术栈并不是 Radix UI。

### 12.2 shadcn-style 组件治理

`packages/ui/components.json` 当前使用：

```text
style: base-nova
rsc: true
tsx: true
cssVariables: true
iconLibrary: lucide
```

共享 UI 代码分为两类：

```text
packages/ui/src/shadcn/
```

用于保留尽量接近 upstream、可由 shadcn CLI 替换的 primitive；以及：

```text
packages/ui/src/makerkit/
```

用于保存经过项目适配和新增的 Aisenhub 业务 UI 行为。

这种“上游 primitive 与项目语义组件分离”的治理方向是正确的。

## 13. Tailwind CSS 与样式层

Admin 使用 Tailwind CSS 4.3.3，并通过 `@tailwindcss/postcss` 构建。

同时还存在：

```text
apps/admin/app/globals.css
```

审计时约 838 行。

所以实际样式体系为三层并行：

```text
Tailwind utility classes
+
CSS Variables / Design Tokens
+
Admin 专用 CSS class
```

这带来较强的灵活性，也形成后续样式治理的主要复杂度来源。

## 14. Class Variant 与 Class Merge 技术

共享 UI 使用：

- `class-variance-authority`；
- `clsx`；
- `tailwind-merge`；
- 项目 `cn()` helper。

例如 Button 使用 CVA 管理：

```text
default
outline
secondary
ghost
destructive
link
```

并提供多种 size，包括普通按钮与 icon button。这是一套标准且成熟的 Tailwind Component Architecture。

## 15. 图标体系

图标统一采用：

```text
lucide-react
```

Admin 没有混入 Heroicons、FontAwesome 或 Material Icons 等第二套图标体系。当前常见图标包括 Dashboard、Users、Boxes、CreditCard、ScrollText、ShieldCheck、Search、Refresh、Keyboard 等。

统一图标库有利于视觉一致性和 bundle 管理。

## 16. Command Palette

Admin 提供：

```text
Ctrl / Command + K
```

快速跳转，底层使用：

```text
cmdk
```

并由 `@kit/ui/command` 封装为：

- `CommandDialog`；
- `CommandInput`；
- `CommandList`；
- `CommandGroup`；
- `CommandItem`；
- `CommandShortcut`。

Command Palette 同时支持当前 Platform Scope 和 Global Scope，是较成熟的高频管理员导航能力。

## 17. 通知系统

项目使用 Sonner 作为 Toast 系统：

```text
@kit/ui/sonner
```

Root Layout 中固定挂载底部右侧 Toaster。适合复制成功、Mutation 反馈和其他非阻塞通知。

## 18. Admin 当前实际使用的 UI Component

按本次静态 import 审计，Admin 真正使用最频繁的共享 UI 为：

| UI Component | 约引用次数 | 主要用途 |
| --- | ---: | --- |
| Button | 39 | 操作入口 |
| Alert | 32 | Error / Warning |
| StatusBadge | 31 | 状态表达 |
| Input | 21 | 查询 / 表单 |
| AsyncState | 20 | Loading / Error |
| SupportErrorId | 20 | 技术错误详情 |
| Label | 15 | 表单 |
| ResourceId | 15 | ID 展示 / 复制 |
| ConfirmActionDialog | 13 | 高风险确认 |
| MutationState | 13 | Mutation 状态机 |
| Table | 8 | 数据列表 |
| Dialog | 4 | Modal |
| ResourceInspector | 4 | 侧滑详情 |
| EmptyState | 3 | 空数据 |
| Sidebar | 3 | Shell |
| Textarea | 3 | 文本输入 |
| OneTimeSecretPanel | 2 | Secret 一次性展示 |
| Command | 1 | Command Palette |
| Kbd | 1 | 快捷键提示 |
| Sheet | 直接及间接使用 | Drawer / Inspector |
| Skeleton | 直接及间接使用 | Loading |
| Sonner | Root 全局挂载 | Toast |

这说明 Admin 已经形成了一套自己的“管理系统语义组件层”，并非只使用基础 Button/Input primitive。

## 19. 关键业务 UI 语义组件

### 19.1 AsyncState

统一处理：

```text
Loading
Access Denied
Recoverable Error
```

Loading 使用 Skeleton；Error 使用 Alert、Retry、Request ID 和 Technical Detail。

其核心产品原则是：**数据读取失败不能伪装成“暂无数据”**。

### 19.2 StatusBadge

状态模型包括：

```text
neutral
success
warning
danger
info
unknown
```

视觉表达同时使用文字、圆点和色调，不依赖单纯颜色区分状态，有利于可访问性。

### 19.3 ResourceId

用于统一展示后台 UUID / Platform ID / Account ID，提供：

- monospace；
- break-all；
- copy-to-clipboard；
- tooltip；
- toast。

避免每个 Feature 重复实现资源标识 UI。

### 19.4 SupportErrorId

默认显示业务级错误描述，技术详情通过折叠区域展示：

```text
Request ID
Server status / error code
```

这是适合运维型 Admin 的信息架构：普通管理员先看可行动的业务说明，需要排障时再展开技术细节。

### 19.5 ConfirmActionDialog

高风险确认不是简单“确定吗？”，而是明确展示：

```text
目标是谁
影响是什么
是否可撤销
是否异步
是否保留历史
操作原因
是否需要 Recent MFA
```

Mutation State 进一步区分：

```text
confirm_required
step_up_required
pending
accepted
success
failure
unknown_outcome
```

其中 `unknown_outcome` 尤其重要：请求超时并不等于业务失败，UI 应先检查真实服务端状态，而不是自动重放敏感操作。

### 19.6 ResourceInspector

大量资源详情采用右侧 Sheet / Inspector，而不是每次切换整页。其典型模式为：

```text
Table/List
   ↓ select
Right-side Sheet
```

桌面使用受控最大宽度，移动端接近全宽。这适合 Audit、Feedback、Config 等管理工作台。

## 20. Table 技术

虽然工作区已经安装：

```text
@tanstack/react-table 8.x
```

但当前 Admin 页面没有直接采用 TanStack Table。

实际使用的是：

```text
@kit/ui/table
```

底层保持原生语义化 HTML Table，并增强：

- 横向滚动；
- 可聚焦 scroll region；
- aria-label；
- hover state；
- selected state。

因此当前表格属于 **Native Table + Custom UI**，而不是完整 Data Grid Architecture。

## 21. Form 技术

工作区具备：

- `react-hook-form`；
- `zod`；
- `@hookform/resolvers`。

但当前 Admin 没有直接采用这些库作为统一 Form Architecture。

当前多数表单使用：

```text
useState
onChange
onSubmit
manual validation
```

简单后台表单问题不大，但复杂设置页继续增长后，dirty state、schema validation、field dependency、reset、server error mapping 等逻辑容易重复。

## 22. React Query 的真实状态

工作区/UI package 中存在：

```text
@tanstack/react-query
```

但当前 Admin 业务代码没有直接 import。因此准确结论是：

> 工作区具备 React Query 能力，但 Admin 当前业务数据层没有采用 React Query。

不能将“依赖可用”写成“Admin 已使用”。

## 23. 已安装但 Admin 当前未直接使用的主要库

| Library | 工作区 / UI 包 | Admin 当前 |
| --- | --- | --- |
| React Query | 有 | 未直接使用 |
| TanStack Table | 有 | 未直接使用 |
| React Hook Form | 有 | 未直接使用 |
| Zod | 有 | 未直接使用 |
| Recharts | 有 | 未直接使用 |
| next-themes | 有 | 未直接使用 |
| next-intl | UI 包有 | Admin 未直接使用 |
| next-safe-action | catalog 有 | 未使用 |
| Vaul | 有 | Admin 未直接使用 |
| Embla Carousel | 有 | 未使用 |
| react-day-picker | 有 | 未使用 |
| react-dropzone | UI 包有 | Admin 未直接使用 |
| react-resizable-panels | UI 包有 | Admin 未直接使用 |

Admin 自身 direct dependencies 相对克制，依赖复杂度主要被封装在 workspace packages 内。

## 24. Design System

Admin 有正式设计系统记录：

```text
apps/admin/DESIGN.md
apps/admin/.impeccable/design.json
```

设计 North Star 为：

> **Operations Ledger / 操作账簿**

整体视觉方向强调：

```text
高密度
运维型
信息层级清晰
低装饰
强状态
强错误语义
强操作保护
```

这与系统管理员、平台运营、账户管理和审计任务的产品定位一致。

## 25. 色彩体系

核心色：

```text
Primary          #087b76
Primary Dark     #05635f
Primary Soft     #e7f3f1
Background       #f4f6f8
Foreground       #18232f
Card             #ffffff
Border           #dce3e9
```

状态色：

```text
Success          #157047
Warning          #93601a
Danger           #b53342
Info             #2866a3
```

Sidebar 使用深蓝灰体系，整体形成“深色管理范围 + 浅色数据工作区 + Teal 操作焦点”的视觉语言。

## 26. Typography

Admin 不依赖远程字体，采用系统字体：

```text
system-ui
PingFang SC
Microsoft YaHei
```

资源 ID、Code 和技术标识使用系统 monospace 字体。

优点包括：

- 中文渲染可靠；
- 首屏加载快；
- 减少字体 CLS；
- 符合高密度 Admin 场景。

## 27. Layout 系统

Desktop 采用：

```text
Sidebar
+
Sticky Topbar
+
Content
```

共享 Sidebar expanded 宽度为 16rem。Admin 当前折叠态特化为约 5.75rem，用来同时容纳 icon 和 compact label，而不是只留下 3rem 纯图标列。

Mobile Sidebar 通过 Sheet/Drawer 实现，宽度约 18rem。

Topbar 固定 sticky，内容区采用 full-width 管理工作区布局。

## 28. 响应式 UX

产品目标明确为“桌面高密度操作为主，窄屏仍须可导航、查看详情和处理错误”。

主要 breakpoint 包括：

```text
64rem
40rem
```

在较窄屏幕下：

- 页面 padding 收紧；
- panel padding 收紧；
- summary grid 转为单列；
- action 区可扩展为整行；
- 按钮最小高度提升到 2.75rem；
- logout error 独占一行。

这说明当前 Responsive 不是简单缩小桌面布局，而是做了明确的触摸与信息流调整。

## 29. Sidebar UX

Global Sidebar 当前平铺六个一级入口，不再使用多组标题。

折叠态仍显示 compact label，例如：

```text
平台中心 → 平台
用户中心 → 用户
业务中心 → 业务
审计中心 → 审计
安全中心 → 安全
```

同时保留 Tooltip 完整业务名称。

相比纯图标 Sidebar，这更适合复杂 Admin，降低记忆成本。

## 30. Platform Switcher UX

Platform Switcher 是当前项目自研交互组件，而不是 Base UI Select。

它目前支持：

- 当前平台展示；
- Global “所有平台” Scope；
- 按 name / code 搜索；
- 250ms debounce；
- server-side search；
- cursor pagination；
- load more；
- AbortController；
- generation/epoch 过期请求保护；
- Esc 关闭；
- Click outside 关闭；
- 平台状态显示；
- Scope route mapping。

功能完整度较高，但完整键盘 Listbox/Combobox 语义仍是后续可增强点。

## 31. Command Navigation

Admin 同时提供：

```text
Sidebar
+
Ctrl/Cmd + K Command Palette
```

Command Palette 按“当前平台”和“全局导航”组织目标，对高频系统管理员属于合理的 Power User UX。

## 32. Accessibility

当前可见的主动设计包括：

- Skip to content；
- `aria-current`；
- `aria-expanded`；
- `aria-haspopup`；
- `aria-selected`；
- `aria-busy`；
- `role="alert"`；
- `role="status"`；
- `sr-only`；
- Dialog / Sheet 基于 Base UI；
- `focus-visible`；
- Table scroll region 可聚焦；
- 状态不只依赖颜色；
- `prefers-reduced-motion`；
- Mobile button touch target 增大；
- Sidebar / Command keyboard shortcut。

整体可访问性基础处于较好水平。

## 33. Dark Mode

Admin CSS 已定义 `:root` 和 `.dark` token，shared UI 中也具备 `next-themes` 与 mode-toggle 能力。

但当前 Admin 没有 ThemeProvider、没有直接使用 `next-themes`、也没有对用户暴露 Mode Toggle。

因此准确结论是：

> Admin 当前产品形态基本为 Light-only，但保留 Dark token 基础。

这属于“预留能力”，尚不能视为完整 Dark Mode 功能。

## 34. 测试技术

### 34.1 Unit Test

Admin 使用：

```text
Vitest 4.1.11
```

当前约 14 个 Admin Unit Test 文件，主要覆盖：

- Auth API；
- BFF route；
- Navigation；
- Account model；
- Audit model；
- Billing model；
- Feedback model；
- Overview model；
- Platform Integration model；
- Platform Overview model；
- Resource Utils；
- Scoped Load Guard；
- Security Status。

测试重点偏状态机、模型、安全与 contract，而不是大量 snapshot UI test，方向合理。

### 34.2 Browser / E2E

浏览器级验证位于仓库独立测试区域，例如：

```text
tests/spikes/e2e/t12-r2-admin.mjs
tests/spikes/e2e/admin-ux-local.mjs
```

覆盖：

- Admin Auth；
- MFA；
- Navigation；
- Responsive；
- Accessibility；
- Platform Switch；
- Workbench；
- UX Geometry。

并与 Local Supabase / Local API / Local Admin 组合，属于集成型浏览器验收层。

## 35. 工程化与代码质量

### 35.1 Lint

当前使用：

```text
Oxlint
```

启用 React、Next.js、Import 相关插件。

### 35.2 Formatter

当前使用：

```text
Oxfmt
```

主要格式规则包括：

```text
singleQuote: true
printWidth: 80
semi: true
tabWidth: 2
```

当前工程化不是 ESLint + Prettier，而是 Oxlint + Oxfmt 的现代化组合。

### 35.3 TypeScript

根 TypeScript 配置启用：

- `strict: true`；
- `noUncheckedIndexedAccess: true`；
- `isolatedModules: true`；
- bundler module resolution；
- noEmit。

类型安全强度较高。

## 36. Monorepo 技术

仓库大致结构：

```text
apps/
  admin/

packages/
  ui/
  domain/
  shared/
  ...

tooling/
supabase/
contracts/
tests/
```

关键共享包：

### `@kit/ui`

提供基础 primitive、项目语义 UI、样式和 hooks。

### `@kit/domain`

提供：

- Shared DTO；
- Stable error codes；
- Validation helpers；
- bounded upload/body reader；
- redemption contracts；
- admin MFA attestation。

该包明确不包含 SQL client 或 server secret，因此不会把数据库层直接泄漏到 Admin UI。

## 37. CI/CD 与部署

GitHub Actions 针对 `main` push 和 PR 执行质量检查。

CI 环境包括：

```text
Ubuntu
Node 24.19.0
pnpm 11.18.0
Deno 2.9.6
```

主要质量步骤包括：

```text
pnpm install --frozen-lockfile
format check
toolchain check
TASK-0801 full verification
```

Admin 通过独立 Vercel Project 构建，构建命令为从 monorepo root 安装依赖，再执行：

```text
pnpm --filter admin build
```

当前 Production 与 GitHub `main` 存在自动部署绑定，因此仓库合并本身需要视为 Production 发布链的一部分管理。

## 38. 当前架构主要强项

### 38.1 安全模型边界清晰

权限不是通过“是否显示按钮”决定，而是由 BFF、Account API、MFA、Origin、CSRF、Session 等多层执行。

### 38.2 Mutation 语义成熟

明确区分：

```text
accepted
success
failure
unknown_outcome
```

避免把“请求发送成功”误当成“业务最终成功”。

### 38.3 Platform Scope 清晰

URL `platformId` 是平台 Context 权威来源，减少跨平台误操作。

### 38.4 错误 UX 成熟

明确区分：

```text
Empty
Loading
Read Error
Access Error
Background Refresh Error
Unknown Mutation Outcome
```

不会把失败伪装为空列表或成功。

### 38.5 UI Primitive 与业务语义组件分层合理

```text
Base UI
↓
shadcn primitives
↓
@kit/ui Aisenhub components
↓
Admin Features
```

这条分层方向正确，并为后续统一组件治理提供了基础。

## 39. 主要技术债与风险

### P1：Client Component 偏重

当前约 44 个 Client Component 文件，大量业务数据由：

```text
useEffect
+
useState
+
client request
```

完成。虽然很多 `page.tsx` 是 Server Component，但大部分只是 Feature 的 Server wrapper，RSC 当前对数据层的实际贡献有限。

**建议：** 不宜为了追求 RSC 比例而强行迁移所有页面；应优先识别适合服务端读取的只读首屏数据，并保留高交互工作区在 Client Side。

### P1：超大 Feature 文件

审计时最大的文件包括：

| 文件 | 约行数 |
| --- | ---: |
| `feedback-center-page.tsx` | 1100 |
| `admin-audit-page.tsx` | 971 |
| `config-resource-center.tsx` | 901 |
| `platform-redemption-batches-page.tsx` | 863 |
| `account-workbench-page.tsx` | 859 |
| `platform-plans-page.tsx` | 778 |
| `billing-order-workspace.tsx` | 747 |
| `platform-subscription-page.tsx` | 704 |
| `platform-directory.tsx` | 696 |
| `admin-overview-page.tsx` | 684 |
| `platform-accounts-page.tsx` | 676 |
| `platform-keys-page.tsx` | 659 |

这些文件同时承担 API、state、filter、pagination、mutation、dialog、table、error mapping 和 render，多责任集中已经成为可维护性风险。

**建议：** 按“Query/Mutation Controller、model、filter state、table/list、inspector/dialog”拆分，而不是只按 JSX 块机械拆组件。

### P1：异步数据层重复

由于没有统一 Query abstraction，很多页面反复实现：

```text
loading
error
refreshing
refreshError
generation
AbortController
epoch
cursor
retry
```

当前安全性不错，但重复度高。

**建议：** 建立 Admin 专用的数据层 abstraction，例如：

```text
useAdminResource
useScopedAdminResource
useCursorResource
useAdminMutation
AdminQueryController
```

这些抽象必须继续复用现有 `adminAuthSession`，不能用通用 React Query 配置绕开 Session replay / MFA / epoch 规则。

### P1：AuthSessionManager 自研程度高

这是强项也是核心风险。该模块负责 refresh、replay、BroadcastChannel、epoch、CSRF、MFA 和跨 Tab 状态，属于安全基础设施。

**建议：** 为 `browser-session` 建立独立、完整的状态机 Unit Test Suite，覆盖：

- 并发 refresh；
- 401 safe-read replay；
- Mutation never replay；
- idempotent replay；
- MFA / Recent MFA；
- logout pending；
- BroadcastChannel logout/expired；
- stale epoch；
- binary/non-replayable body。

### P2：CSS 双轨/三轨复杂度

当前同时维护：

```text
Tailwind utility
+
Admin globals.css
+
@kit/ui shared style
```

容易形成 Token、CSS class 与 Component variant 三方漂移。

**建议：** 保留 Admin CSS 用于真正的页面级 layout/token override，把按钮、表单、状态、表格、浮层等可复用视觉规则逐步回收到 `@kit/ui`。

### P2：Form Architecture 尚未统一

Admin 已具备 RHF/Zod 依赖，但当前多数表单仍手写 state 和 validation。

**建议：** 不要求所有简单查询框都迁移 RHF；优先把复杂设置、创建/编辑、多个 field dependency 的表单迁移到共享表单模式。

### P2：Data Table 能力偏基础

当前原生 Table 对现阶段足够，但未来如果出现：

- column configuration；
- sorting；
- visibility；
- complex selection；
- server pagination；
- sticky columns；
- large dataset；
- virtualization；

现有组件可能需要升级。

**建议：** 不必立即全量引入 TanStack Table；先定义 `AdminDataTable` 需求边界，复杂表格再采用 TanStack Table，简单列表继续保留原生 Table。

### P2：PlatformSwitcher 为自研交互 primitive

目前鼠标、Tab、Esc、Click Outside 等场景已经覆盖，但完整 Listbox/Combobox keyboard semantics 仍可继续增强，例如：

- ArrowUp / ArrowDown；
- Home / End；
- active option；
- roving focus 或 `aria-activedescendant`。

**建议：** 后续可选择基于 Base UI Combobox/Select 重构，或为当前自研组件补齐完整键盘交互状态机。

### P2：Theme 能力处于中间态

代码存在 Dark token 和 shared theme 能力，但 Admin 当前没有真正启用 Dark Mode。

**建议：** 做出明确产品决策：

- 如果 Admin 明确 Light-only，则减少不必要的 Dark token 维护；
- 如果正式支持 Dark Mode，则接入 ThemeProvider、Mode Toggle 和 E2E。

### P2：时间显示规范不完全统一

部分代码使用浏览器本地时区，Audit 页面明确使用 `Asia/Shanghai`。

这可能造成同一个 timestamp 在不同页面显示不同时间。

**建议：** 冻结统一策略：UTC、Asia/Shanghai 或用户设置时区三选一，并由共享 formatter 统一处理。

### P3：Design Document 与最终实现存在漂移风险

Shared Sidebar 基础规格、Admin 特化 collapsed width、设计文档描述等已经出现多个来源。

**建议：** 逐步把关键布局值和视觉语义收敛为统一 Design Token / Component API，文档只描述规则，不重复维护易漂移的实现常量。

## 40. 技术成熟度评价

| 领域 | 评价 |
| --- | --- |
| 前端基础技术 | A |
| TypeScript / 工程化 | A |
| 安全架构 | A+ |
| Auth / MFA | A+ |
| BFF 边界 | A+ |
| Mutation 安全 | A+ |
| UI Design System | A |
| UX 状态语义 | A+ |
| Accessibility | A- |
| 响应式 | A- |
| 组件一致性 | B+ |
| 数据请求抽象 | B |
| Client / Server 边界 | B |
| 页面模块化 | B- |
| CSS 可维护性 | B |
| Form 架构 | B |
| Data Grid 能力 | B |

## 41. 推荐的后续架构优先级

建议按以下顺序推进，不建议同时大规模重构所有模块。

### 第一优先级：拆大 Feature，但保持业务行为不变

优先处理超过 700~800 行的页面，把业务模型、请求控制器、Inspector、Dialog、Table/List 拆开。

目标不是“文件更小”，而是降低一次改动跨越查询、Mutation、UI 和错误处理多个层面的风险。

### 第二优先级：建立 Admin Query / Mutation 公共层

把已经验证成熟的：

```text
Session epoch
Scope generation
AbortController
Background refresh
ResourceError
Cursor
Unknown outcome
Recent MFA
```

抽成受控公共能力。

不要简单用 React Query 替代现有安全语义；如引入 React Query，也必须让其成为 `adminAuthSession` 上层缓存/生命周期工具，而不是新的请求权威层。

### 第三优先级：统一复杂表单与复杂表格模式

- 简单搜索、筛选继续保持轻量；
- 复杂管理表单采用统一 Schema/Form 模式；
- 复杂 Data Grid 再按需求引入 TanStack Table。

### 第四优先级：收敛 UI/CSS Ownership

逐步明确：

```text
Design Token → @kit/ui primitive/semantic component → Admin page layout
```

减少 feature 页面直接发明新的视觉 pattern。

### 第五优先级：补强可访问性与基础设施测试

优先补：

- `AuthSessionManager` 状态机测试；
- PlatformSwitcher 全键盘操作；
- 高风险 Dialog focus/keyboard；
- 关键 Table/Inspector focus restoration；
- Dark Mode 若启用后的浏览器验证。

## 42. 最终技术地图

```text
Aisenhub Admin
│
├── Runtime
│   ├── Next.js 16
│   ├── React 19
│   └── TypeScript
│
├── Architecture
│   ├── App Router
│   ├── RSC Page Wrappers
│   ├── Client Feature Workspaces
│   ├── Global Scope
│   └── Platform URL Scope
│
├── State
│   ├── React Hooks
│   ├── Context
│   ├── URL Search Params
│   ├── AbortController
│   └── Custom Scope/Epoch Guards
│
├── Auth
│   ├── Supabase Auth
│   ├── SSR Auth Helpers
│   ├── Custom AuthSessionManager
│   ├── BroadcastChannel
│   ├── AAL1 / AAL2
│   └── Recent MFA
│
├── Network
│   ├── Same-origin Admin BFF
│   ├── Path Allowlist
│   ├── Origin
│   ├── CSRF
│   ├── Idempotency
│   ├── ETag
│   └── no-store
│
├── UI
│   ├── Tailwind CSS 4
│   ├── Base UI
│   ├── shadcn base-nova
│   ├── CVA
│   ├── clsx / tailwind-merge
│   ├── Lucide
│   ├── cmdk
│   └── Sonner
│
├── Aisenhub UI Semantics
│   ├── AsyncState
│   ├── StatusBadge
│   ├── ResourceId
│   ├── SupportErrorId
│   ├── ConfirmActionDialog
│   ├── MutationState
│   ├── ResourceInspector
│   └── OneTimeSecretPanel
│
├── Quality
│   ├── Vitest
│   ├── Local Browser E2E
│   ├── Oxlint
│   ├── Oxfmt
│   ├── TypeScript Strict
│   └── TASK-0801 Verification
│
├── Monorepo
│   ├── pnpm workspace
│   ├── Turborepo
│   ├── @kit/ui
│   └── @kit/domain
│
└── Delivery
    ├── GitHub
    ├── GitHub Actions
    └── Vercel
```

## 43. 最终结论

当前 Admin 的核心底座已经足够现代且适合长期维护：Next.js 16、React 19、TypeScript、Base UI、shadcn-style source components、Tailwind CSS 4、Supabase Auth、同源 BFF 以及共享 `@kit/ui` / `@kit/domain` 均没有明显的“必须换技术”问题。

当前系统真正值得继续投入的方向不是替换框架，而是把已经验证成熟的安全与业务语义进一步工程化：

1. 拆分超大 Feature；
2. 统一 Admin Query / Mutation 抽象；
3. 补强 AuthSessionManager 独立测试；
4. 统一复杂 Form / Data Table 技术模式；
5. 收敛 Tailwind、Admin CSS 与共享 UI 的职责边界；
6. 补齐 PlatformSwitcher 等自研交互组件的完整键盘可访问性；
7. 统一时间与 Theme 产品策略。

如果以上几项逐步完成，Admin 可以从当前“安全性强、业务语义成熟、但页面组件偏重”的状态，进一步演进成一套更稳定、可复用、可测试、可长期扩展的管理前端架构。
