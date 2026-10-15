# Admin 控制台需求

来源包括当前 Admin 产品背景、已接受的安全边界、现行 Global/Platform 工作方式和已落地 UX 约束。实现细节见 `architecture/modules/admin-console.md`。

## REQ-ADM-001 — 系统管理员统一控制面

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional
- **Source**: `apps/admin/PRODUCT.md`
- **Architecture**: `architecture/modules/admin-console.md`

**Statement**

Admin 必须为系统管理员提供管理平台、账户、商业化、订阅权益、配置资源、反馈、安全、审计与运维异常的中央控制面。

**Acceptance**

- Global 范围可完成跨平台治理和调查。
- Platform 范围可完成单平台运营和资源治理。
- 核心对象能从摘要下钻到对应工作区或详情。

## REQ-ADM-002 — Global / Platform 作用域必须始终明确

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: UX

**Statement**

管理员在任何页面都必须能够判断当前是 Global 还是某个 Platform scope，且切换 Platform 时不得携带其他平台的实体 ID 或错误作用域。

**Acceptance**

- Platform URL 以 `platformId` 作为作用域权威。
- 切换平台时 detail route 映射回目标平台对应 collection。
- Global 与 Platform 导航职责不混淆。

## REQ-ADM-003 — 管理员高频任务优先、桌面高密度但窄屏可用

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: UX
- **Source**: `apps/admin/PRODUCT.md`

**Statement**

Admin 必须优先支持平台与账户等高频管理任务；桌面端允许高信息密度，窄屏仍必须能够导航、查看详情、处理错误和完成关键操作。

**Acceptance**

- Sidebar/Topbar/工作区在桌面保持高效信息密度。
- 窄屏关键操作不因布局折叠而不可访问。
- 表格横向区域和 Dialog/Sheet 保持键盘/触控可用。

## REQ-ADM-004 — 高风险操作必须说明影响并支持恢复

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

高风险 Admin mutation 必须展示 target、影响、reason/确认要求和可恢复语义，并由服务端 recent MFA/权限再次授权。

**Acceptance**

- UI hiding 不作为授权边界。
- recent MFA requirement 来自服务端判断。
- unknown outcome 提示管理员先重读权威状态，不静默重复。

## REQ-ADM-005 — 数据源失败必须可见

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: UX

**Statement**

Admin 的加载、读取失败、无权限、真实空数据、后台刷新失败和 mutation unknown outcome 必须是不同状态。

**Acceptance**

- read error 不显示 empty state。
- refresh error 不抹掉最后一次可信数据。
- 技术 request/error ID 可供排障但不压过用户可理解说明。

## REQ-ADM-006 — Admin 浏览器不得直连业务数据库权限面

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Admin 浏览器业务请求必须通过同源 BFF 和中央 Admin API；Supabase browser/SSR 能力主要用于 Auth/session/MFA，不得成为绕过服务端业务授权的数据库通道。

## REQ-ADM-007 — 管理导航必须支持快速定位

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: UX

**Statement**

Admin 必须提供稳定的信息架构和快速导航方式，使管理员能够在 Global 六类治理入口与当前 Platform 工作区之间快速切换。

**Acceptance**

- Global 导航包含仪表盘、平台、用户、业务、审计、安全六类入口。
- PlatformSwitcher 支持平台搜索、选择和返回 Global。
- Command Palette 提供键盘快速导航。

## REQ-ADM-008 — 可访问状态不得仅依赖颜色

- **Status**: Active
- **Delivery**: Partial
- **Priority**: P1
- **Type**: UX

**Statement**

状态、错误、选中和危险操作必须具有文字/结构/ARIA 等非颜色信息；核心导航、Dialog、表格滚动和命令入口必须键盘可访问。

**Acceptance**

- 状态组件具有文本语义。
- focus-visible、skip link、reduced motion 等基础能力存在。
- PlatformSwitcher 完整方向键 listbox 行为仍属于待补齐项，因此 Delivery 保持 Partial。

**Current Gap**

PlatformSwitcher 已有 dialog/listbox/option/aria-selected、Tab、Escape 和点击外部关闭，但当前源码没有 ArrowUp/ArrowDown/Home/End、roving focus 或 aria-activedescendant，因此尚未满足完整键盘 listbox 行为。

## REQ-ADM-009 — Admin 安全状态与错误语义必须统一

- **Status**: Active
- **Delivery**: Partial
- **Priority**: P0
- **Type**: Security

**Statement**

所有 Admin 页面必须消费同一个服务端权威安全状态和稳定错误分类，明确区分 session 失效、`MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`、真实策略拒绝、冲突、限流和服务故障；页面不得各自按 HTTP 403 猜原因。

**Acceptance**

- Admin Shell 在业务数据前解析服务端 security status。
- 共享分类器统一处理稳定机器错误码。
- Step-up 成功不会自动重放原高风险 mutation。

**Current Gap**

Shell 与共享错误分类器已经存在，AuthSessionManager 也能识别 `MFA_REQUIRED/RECENT_MFA_REQUIRED`；但部分页面仍以 HTTP 401/403 自己决定 `access` load-state bucket。正式升级为 Implemented 前，需要证明所有关键工作区的控制流不会因局部 status 分支重新混淆稳定机器语义。

## REQ-ADM-010 — Admin Web 必须具备受控浏览器安全头

- **Status**: Active
- **Delivery**: Planned
- **Priority**: P1
- **Type**: Security

**Statement**

Admin Web 响应必须在不破坏 Supabase Auth/MFA/必要资源加载的前提下配置明确的浏览器安全头与 CSP，并通过真实浏览器回归验证登录、MFA、BFF 和核心工作区仍可用。

**Current Gap**

当前 `next.config.mjs` 没有应用级 security headers/CSP。Feedback binary proxy 的 sandbox CSP 只保护下载响应，不能满足本 Requirement，因此 Delivery 保持 Planned。

## Domain Verification

当前 Implemented/Partial 基线来自 `apps/admin` App Router/BFF/Auth/feature source、`packages/ui` primitives/semantic components、Admin Vitest、Local browser/E2E，以及 `apps/admin/DESIGN.md` / `PRODUCT.md`。2026-10-15 Admin 架构审查保留技术债和评分；历史 2026-10-13 UI/UX 报告只作为静态 Review，不作为当前事实权威。

## 非目标 / 未接受项

- 完整 Dark Mode 当前不是 Active Requirement。
- 仅因为 workspace 安装 React Query/TanStack/RHF/Zod，不构成采用这些库的需求。
- 无痕管理员 impersonation 不是当前需求。
