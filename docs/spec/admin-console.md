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
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: UX

**Statement**

状态、错误、选中和危险操作必须具有文字/结构/ARIA 等非颜色信息；核心导航、Dialog、表格滚动和命令入口必须键盘可访问。

**Acceptance**

- 状态组件具有文本语义。
- focus-visible、skip link、reduced motion 等基础能力存在。
- PlatformSwitcher 支持 ArrowUp/ArrowDown/Home/End、`aria-activedescendant` 与 Enter/Space 选择，并已在当前候选 Local browser 回归中通过键盘、分页、窄屏与鼠标兼容验证。

**Current state**

PlatformSwitcher 当前已有 dialog/listbox/option/aria-selected、Tab、Escape、点击外部关闭，并通过 `aria-activedescendant` 管理 active option；搜索框/触发按钮可用方向键进入列表，列表支持 ArrowUp/ArrowDown/Home/End 与 Enter/Space 选择。模型单测覆盖 wrap/Home/End；当前候选 `verify:task:0801` 的真实浏览器路径验证了平台分页/切换、键盘语义、5 个 viewport 与 95 条 Admin 路由无回退，因此本 Requirement 已满足。

## REQ-ADM-009 — Admin 安全状态与错误语义必须统一

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

所有 Admin 页面必须消费同一个服务端权威安全状态和稳定错误分类，明确区分 session 失效、`MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`、真实策略拒绝、冲突、限流和服务故障；页面不得各自按 HTTP 403 猜原因。

**Acceptance**

- Admin Shell 在业务数据前解析服务端 security status。
- 共享分类器统一处理稳定机器错误码。
- Step-up 成功不会自动重放原高风险 mutation。

**Current implementation**

Shell 与共享错误分类器统一消费服务端 security status / machine code；当前已清理 Security、Platform workspace、Audit、Platform directory 中最后几处裸 `401 || 403` load-state 分桶。`isResourceAccessError()` 只把 401 以及 `MFA_REQUIRED / RECENT_MFA_REQUIRED / ADMIN_REQUIRED / FORBIDDEN` 归为 access，`AUTHORIZATION_UNAVAILABLE`/5xx 保持服务故障；Step-up 完成仍不会自动重放原高风险 mutation。MFA 页面与服务端 recent-proof 窗口也统一为最长 30 分钟。

## REQ-ADM-010 — Admin Web 必须具备受控浏览器安全头

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Security

**Statement**

Admin Web 响应必须在不破坏 Supabase Auth/MFA/必要资源加载的前提下配置明确的浏览器安全头与 CSP，并通过真实浏览器回归验证登录、MFA、BFF 和核心工作区仍可用。

**Current state**

`next.config.mjs` 已统一配置 `X-Frame-Options: DENY`、`nosniff`、Referrer-Policy、Permissions-Policy，并对全部页面输出强制 `Content-Security-Policy`（允许当前 same-origin、TOTP `data:` QR、必要 blob）。Feedback binary proxy 继续使用更严格的 sandbox CSP。当前候选 Local browser 在强制 CSP 下通过登录、MFA、BFF、核心工作区、95 路由与 5 个 viewport，并通过 `securitypolicyviolation` 监听断言整个流程 0 violation，因此本 Requirement 已满足。HSTS 仍属于正式 HTTPS/域名发布边界的独立生产硬化，不作为本 Requirement 的完成条件。

## REQ-ADM-011 — Admin 必须提供统一的全局主题与外观切换

- **Status**: Active
- **Delivery**: Planned
- **Priority**: P1
- **Type**: UX
- **Source**: 2026-10-17 用户确认的 Admin UI/UX 重构要求

**Statement**

Admin 必须通过统一 Appearance / Theme 设置控制整个产品的视觉主题，而不是由页面或 Feature 分别维护颜色。首批设计至少覆盖 Light、Dark、System 模式，以及多套经过设计和对比度验证的 Accent / Surface 组合；切换后 Shell、标准组件、浮层、选择、focus、链接和产品强调关系必须作为同一套语义主题一起变化。

**Acceptance**

- Appearance 设置至少支持 Light、Dark、System，并提供多套受控 Accent / Surface 主题预设；具体数量和值由新 `apps/admin/DESIGN.md` 冻结。
- 主题通过唯一 Theme owner 和语义 token 驱动，不允许 Feature 自己维护第二套主题状态或局部色板。
- success、warning、danger/destructive、info、unknown 等状态语义保持独立，不因为 Accent 切换而失去含义。
- 主题切换覆盖 Sidebar、Page/Surface、Button/Input/Table/Dialog/Popover 等标准 UI，并在刷新、Portal/Overlay、窄屏和键盘状态下保持一致。
- 用户选择按产品设计的持久化范围恢复；System 模式跟随系统明暗变化，但不得通过整页 filter/opacity 改写业务图片或数据内容。

## REQ-ADM-012 — Admin 必须优化实际与感知加载性能

- **Status**: Active
- **Delivery**: Planned
- **Priority**: P1
- **Type**: UX
- **Source**: 2026-10-17 用户确认的 Admin UI/UX 重构要求

**Statement**

Admin 的页面切换、查询、刷新和 mutation 必须让用户尽快获得可感知反馈，并在真实等待期间保持结构、上下文和可信数据稳定；不能因为加载表现让可接受的后端等待被感知为页面卡死或反复重载。

**Acceptance**

- Shell、Navigation、Toolbar 和已存在的可信内容在可保留时保持稳定，不因局部查询反复整页清空或大面积闪烁。
- 近乎即时操作避免短暂 loading/skeleton 闪烁；长等待使用与真实任务匹配的 busy、skeleton 或 progress，不伪造百分比或 ETA。
- 后台刷新优先保留最后可信数据，并明确呈现 refreshing / refresh error；不得把 refresh error 伪装为空数据。
- 用户触发 mutation 后立即得到“操作已接收/正在处理”等适用反馈，同时继续遵守幂等、unknown outcome 和服务端权威状态。
- 首屏与页面切换优先稳定布局、渐进填充内容，并对关键资源、请求取消、stale response、重复渲染和大列表成本进行真实测量。

## Domain Verification

当前 Implemented 基线来自 `apps/admin` App Router/BFF/Auth/feature source、`packages/ui` primitives/semantic components、Admin Vitest、Local browser/E2E 与 `apps/admin/PRODUCT.md`。旧 `apps/admin/DESIGN.md` 已退出当前设计来源；新的 Admin Design Direction 尚未建立，按 [`admin-design-system-uiux-rebuild`](../plans/admin-design-system-uiux-rebuild/plan.md) 计划从零重建，在落地前不得把计划目标写成当前实现。2026-10-15 Admin 架构审查保留技术债和评分；历史 2026-10-13 UI/UX 报告只作为静态 Review，不作为当前事实权威。

## 非目标 / 未接受项

- 不要求开放任意自由取色器；首批主题采用经过设计和可访问性验证的受控预设，避免用户组合出不可读主题。
- 仅因为 workspace 安装 React Query/TanStack/RHF/Zod，不构成采用这些库的需求。
- 无痕管理员 impersonation 不是当前需求。
