# Admin 控制台前端与 BFF 架构

Admin 是系统管理员的控制面 Web 应用。当前核心架构是：**Next.js App Router + React 19 + Client-heavy feature workspaces + same-origin Next BFF + Supabase Auth + custom browser session manager + `@kit/ui` design system**。

本文只描述当前实现事实。重构建议、评分和技术债优先级继续属于 review，不混入“当前架构”定义。

## Requirements

本模块主要承担 [Admin 控制台需求](../../spec/admin-console.md) `REQ-ADM-001` ～ `REQ-ADM-010`，并共同满足系统级 `REQ-SYS-002`、`REQ-SYS-003`、`REQ-SYS-004`、`REQ-SYS-006`、`REQ-SYS-009`。若 spec 与当前实现不一致，以 spec 标记的 Delivery 作为缺口状态，不把 `REQ-ADM-008/009/010` 等 Partial/Planned 缺口写成“架构要求已经满足”。

## 1. 技术基线

当前 Admin 直接技术：Next.js 16.3.8、React/React DOM 19.2.8、TypeScript 7.0.2 catalog、Tailwind CSS 4.3.3、Supabase JS/SSR、`@kit/ui`、`@kit/domain`、Lucide React、Vitest。

构建使用 `next build --webpack`。`reactStrictMode=true`，TypeScript build error 不忽略。

Root Layout 固定 `<html lang="zh-CN">`，全局 Sonner Toaster 位于右下角。Admin 不加载远程 Webfont，也没有全局 ThemeProvider。

Admin 并未直接采用 Redux、Zustand、MobX、Jotai、XState、React Query、SWR、TanStack Table、React Hook Form 或 Zod 作为业务层架构；其中部分库存在于 workspace/shared UI，仅代表可用能力。

## 2. 目录和渲染模型

```text
apps/admin/app                 App Router pages / API
apps/admin/components          Shell / navigation / platform context
apps/admin/features            业务工作区
apps/admin/app/_lib/auth       server/browser auth
apps/admin/app/api             same-origin BFF/Auth endpoints
```

多数 `page.tsx` 是 Server Component wrapper，真正的高交互 feature 是 Client Component。当前 RSC 主要承担路由/边界，而不是业务数据 fetching 权威。

Admin 没有使用 Server Actions 作为业务 mutation 层。

## 3. 总体调用链

```text
Admin Browser
 -> Next.js App Router
 -> AdminShell / Feature Workspace
 -> adminAuthSession.request()
 -> /api/v1/** same-origin BFF
 -> central /admin/api/v1/**
 -> private SQL domain functions
```

Supabase 浏览器/SSR 能力主要服务 Auth/session/MFA。Admin 浏览器不直接读取业务数据库。

## 4. Global / Platform 双作用域

Global Sidebar 固定六个入口：仪表盘、平台中心、用户中心、业务中心、审计中心、安全中心。

折叠态仍保留 icon + compact label：仪表盘/平台/用户/业务/审计/安全。

Platform workspace 导航：

- 平台运营：概览、账户；
- 商业化：订单与计费、套餐、订阅、兑换码；
- 资源与接入：配置资源、用户反馈；
- 平台设置：接入配置、基本设置。

URL `platformId` 是平台上下文权威。Platform Sidebar 不常驻 Global 治理入口；返回 Global 通过 PlatformSwitcher。

## 5. PlatformSwitcher

自研 PlatformSwitcher 当前具备：Global “所有平台”、current platform、server-side name/code search、250ms debounce、cursor pagination/load more、AbortController、generation + auth epoch stale-response protection、Escape/click-outside、scope route mapping。

Sidebar 下拉宽度不超过 sidebar content；列表一级视觉突出平台名称和选择态，code 仍参与搜索。

切换平台时，实体 detail 回到目标平台对应 collection，不把旧平台 entity ID 带过去。

它以 `role=dialog` 包裹搜索与 `role=listbox/option + aria-selected` 平台列表，并使用稳定 option id + `aria-activedescendant` 管理 active option。搜索框可 Tab 聚焦并用 ArrowUp/ArrowDown/Home/End 把焦点移入列表；listbox 支持方向键循环、Home/End 和 Enter/Space 选择，Escape/click-outside 关闭。active option 在搜索、分页追加和当前平台变化时保持合法，并在键盘移动时滚入可视区。

## 6. AdminShell 安全 Gate

普通管理内容渲染前读取服务端 `security/status`：

- anonymous -> login；
- active admin AAL1 -> MFA；
- active admin AAL2 -> ordinary Admin；
- pending admin -> 只允许 onboarding/security 最小面；
- non-admin -> blocked；
- status service unavailable -> fail closed。

页面按钮和 route hiding 都不是权限边界。BFF 不复制 membership/AAL 算法。

## 7. Browser AuthSessionManager

`app/_lib/auth/browser-session.ts` 是自研核心安全基础设施，负责 session state、admin scope、refresh single-flight、epoch invalidation、terminal session hints、cross-tab `BroadcastChannel('aisenhub-auth-session-v1')`、same-origin enforcement、mutation CSRF、401 recovery、MFA/recent-MFA state。

Replay 规则：

- GET/HEAD/OPTIONS safe-read 默认可在 refresh 后 replay；
- mutation 默认 never replay；
- 只有显式 `idempotent-mutation`、存在 Idempotency-Key、body 可 clone/replay 且非 binary 时才允许安全恢复策略；
- 不可安全 replay 的 mutation 在 session refresh 场景抛出明确 retry-required，而不是静默重复副作用。

## 8. Server Auth

Admin server auth 负责 Supabase SSR/request-scoped client、access/refresh/CSRF/logout-fence/login-ack/auth-flow/recent-proof cookies、session ID/expiry 解析、login acknowledgement 与 logout fence、fail-closed session gate、cookie write/clear、MFA attestation。

Admin BFF 在官方 MFA 验证后签发短寿命 HMAC attestation，中央 API 再换成最长 30 分钟、绑定 user/session/factor 的 recent proof。浏览器布尔值不构成 proof。

## 9. Same-origin BFF

`app/api/v1/[...path]/route.ts` 是显式 allowlist 代理：

- `force-dynamic`；
- method/path allowlist；
- UUID 路径规范化；
- query 最大 8192 bytes / 64 params；
- mutation exact `ADMIN_ORIGIN`；
- CSRF cookie = `x-csrf-token`；
- server auth/access token；
- recent proof forwarding；
- mutation body 最大 65,536 bytes；
- bounded read timeout；
- upstream timeout；
- forwards `If-Match`、`If-None-Match`、`Idempotency-Key`；
- JSON `private,no-store`；
- request ID 透传；
- 通用 `/api/v1/**` 代理当前无 DELETE allowlist；verified MFA factor 删除走独立 same-origin `/api/auth/mfa/factors/{factorId}` Auth route，并在中央 API 使用 prepare/finalize 两阶段合同。

Feedback attachment binary proxy 额外设置 `nosniff`、restrictive CSP、safe disposition 和 private no-store。

## 10. 客户端数据状态

业务状态主要使用 React Hooks、Context、Next router/search params、AbortController、request generation/scope guard、auth session epoch。

PlatformWorkspace 以 URL ID 加载当前平台，并拒绝 stale/other-platform fallback。

资源页普遍显式区分 loading、read error、success、refreshing、refresh error、access error、empty、mutation unknown outcome。

共享 `admin-resource-utils` 按稳定机器码区分 `MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`、`FORBIDDEN`、`RATE_LIMITED`、幂等冲突、precondition 和授权/Storage 服务不可用；`isResourceAccessError()` 只把 401 与明确 access machine code 归入 access bucket，5xx/`AUTHORIZATION_UNAVAILABLE` 保持服务故障。Security、Platform workspace、Audit、Platform directory 已统一使用该分类器，不再根据裸 403 猜测 MFA/权限；AuthSessionManager 继续从响应机器码进入 MFA/recent-MFA step-up，Step-up 后不自动重放副作用。

## 11. UI 技术栈

共享 UI 是：

```text
Base UI
 -> shadcn-style source primitives (base-nova)
 -> @kit/ui project semantic components
 -> Admin feature UI
```

不是 Radix UI 架构。

基础技术：`@base-ui/react`、Tailwind 4、class-variance-authority、clsx、tailwind-merge、Lucide、cmdk、Sonner。

`packages/ui/src/shadcn` 尽量保持 upstream-replaceable primitive；`src/makerkit` 保存项目适配/语义组件，目录名仅是历史来源追踪，不代表当前产品品牌。

## 12. 关键语义组件

### AsyncState
读取失败与空数据严格分离，支持 loading/access/error/retry/request ID。

### StatusBadge
`neutral/success/warning/danger/info/unknown`，文字 + dot + 色调，不仅靠颜色。

### ResourceId
统一 ID monospace、折行、copy、toast。

### SupportErrorId
业务说明优先，request ID/server code 放在可展开技术详情。

### ConfirmActionDialog
高风险动作展示 target、impact、reversibility、async/history、reason、recent MFA，并和 mutation state 联动。

### MutationState
`idle -> confirm_required -> step_up_required -> pending -> accepted/success/failure/unknown_outcome`。unknown outcome 不自动当失败或重放。

### ResourceInspector
Table/List -> right-side Sheet，用于 Audit、Feedback、Config 等详情流；移动端接近全宽。

### OneTimeSecretPanel
用于 Platform Key/一次性 secret，避免普通文本组件意外长期保留敏感值。

## 13. Table / Form / Query 的真实状态

当前 Admin 表格主要是原生 semantic table + `@kit/ui/table`，不是 TanStack Data Grid。

当前复杂表单没有统一采用 React Hook Form/Zod；多数仍是 controlled state/manual validation。

当前业务数据层没有直接采用 React Query。不能把 workspace 中“已安装”描述成 Admin“已使用”。

## 14. Design System

North Star：**Operations Ledger / 操作账簿**。

视觉原则：高密度、低装饰、强状态、强错误语义、强操作保护。

核心 token：

- primary `#087b76`；primary-dark `#05635f`；primary-soft `#e7f3f1`；
- background `#f4f6f8`；foreground `#18232f`；card `#ffffff`；border `#dce3e9`；
- success `#157047`；warning `#93601a`；danger `#b53342`；info `#2866a3`。

字体使用 system-ui / PingFang SC / Microsoft YaHei；技术 ID 使用 monospace，不加载远程 Webfont。

Admin 当前实际产品形态基本 Light-only；虽然 CSS/shared UI 存在 dark token 和 next-themes 能力，但没有 ThemeProvider/Mode Toggle，因此不能宣称已支持完整 Dark Mode。

## 15. Layout 与 Responsive

Desktop：Sidebar + Sticky Topbar + full-width content。

- expanded sidebar 16rem；
- Admin compact collapse 约 5.75rem，保留文字；
- mobile sidebar Sheet 约 18rem；
- 主要 breakpoints 64rem / 40rem；
- 窄屏缩小 panel/page padding、summary 单列、action 可整行、button 最小高度 2.75rem。

共享 Sidebar 的 expanded/mobile/base-icon 宽度分别为 16rem / 18rem / 3rem；Admin 为了保留折叠文字将 compact 宽度覆盖到约 5.75rem。Sidebar 展开状态写入 `sidebar_state` cookie，最长 7 天；Cmd/Ctrl+B 切换 Sidebar。

Topbar 使用 `Aisenhub / platform / page` 上下文层级，并在窄屏压缩展示。Cmd/Ctrl+K 打开 Command Palette：处于 Platform workspace 时先显示“当前平台”路由组，再显示“全局导航”；Global scope 只显示全局入口。

## 16. Accessibility

当前稳定基础：skip-to-content、aria-current/expanded/haspopup/selected/busy、role alert/status、sr-only、Base UI Dialog/Sheet、focus-visible、focusable table scroll region、状态非纯颜色、reduced motion、mobile touch target、Cmd/Ctrl+B Sidebar、Cmd/Ctrl+K Command Palette。

PlatformSwitcher 支持 Tab/Escape/click-outside、ArrowUp/Down/Home/End、`aria-activedescendant` active-option 与 Enter/Space 选择；当前候选 Local E2E 已实际覆盖平台 scale pagination/切换、键盘语义、5 个 viewport 与 95 条 Admin 路由，`REQ-ADM-008` 已验收为 Implemented。

Admin Web 在 `next.config.mjs` 统一返回 `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、Referrer-Policy、Permissions-Policy，并配置全局强制 `Content-Security-Policy`。策略允许 same-origin、必要 inline style/script、TOTP `data:` QR 与 blob worker/image；当前候选 Local browser 已在该强制策略下完成登录/MFA/BFF/核心工作区、95 路由与 5 个 viewport 回归，并通过 `securitypolicyviolation` 监听断言 0 violation。Feedback 二进制下载继续使用更严格的 sandbox CSP。`REQ-ADM-010` 因此已验收为 Implemented；HSTS 仍是正式 HTTPS/域名发布边界的独立生产硬化。

## 17. 页面业务语义

- Global Overview 只展示权威摘要/待办，不用 Audit 最近事件推导健康或平台变化。
- Platform Overview 的 KPI 使用服务端全量聚合，支持 7/30/90 天及上一周期；源失败显示 unknown，不显示假 0。
- Account 360 保持 Global Identity / Platform Account 分层。
- Global Audit 缺失 outcome 显示“未记录”。
- Billing Global/Platform 复用同一个 `BillingOrderWorkspace`。
- Config、Feedback 都通过独立平台工作区和 Inspector 管理。

当前时间显示还没有统一的用户时区策略：Audit 明确使用 `Asia/Shanghai`，部分公共 resource formatter 和 Billing 仍使用浏览器 `zh-CN` locale / 本地时区。这个事实不会影响服务端时间戳权威，但 UI 跨页面时间解释可能不一致；统一策略属于 review/后续 plan，而不是把现状伪写为已统一。

## 18. 测试与质量

Admin Unit Test 使用 Vitest，重点覆盖 Auth/BFF/navigation/model/security/scoped load 等。

浏览器集成测试：`tests/spikes/e2e/t12-r2-admin.mjs`、`tests/spikes/e2e/admin-ux-local.mjs`，覆盖 Auth/MFA、导航、Platform Switch、responsive、a11y、workbench 和关键 UX geometry，并连接 Local Supabase/API/Admin。

Lint/Format：Oxlint + Oxfmt，不是 ESLint + Prettier。

## 19. 文档边界

`apps/admin/DESIGN.md` 是视觉/交互设计源；`PRODUCT.md` 是产品背景；本文描述架构实现。Admin 前端架构审查中的技术债、评分和改进顺序保留在 `review`，不能反过来写成已经实施的架构事实。

历史 2026-10-13 UI/UX 审查自身已经标注为静态快照，其中不少问题后来被修复或未复现；它只作为历史 Review 输入。当前实现事实以源码、当前测试、2026-10-15 架构审查和本文 parity 为准。
