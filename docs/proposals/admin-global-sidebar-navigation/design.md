# OPT-011 Admin 全局侧边栏导航收敛

状态：Completed

关联：[总计划](plan.md) · [阶段 01](phases/01-sidebar-navigation.md) · [验证记录](verification-record.md)

## 背景与当前问题

用户希望把 Admin 首页左侧导航从“分组目录”收敛为一条更直接的全局业务导航，同时让桌面折叠态仍保留可读的短文字。当前实现存在四个直接可核实的问题：

1. `apps/admin/components/navigation/admin-navigation.ts` 把 Global 导航拆为“工作台 / 商业中心 / 系统治理 / 设置”四组，展开侧边栏会持续显示这些组标题；一级项仍使用“概览 / 平台 / 统一用户 / 计费管理 / 审计中心 / 安全与账户”。
2. `packages/ui/src/shadcn/sidebar.tsx` 的通用 icon collapse 宽度固定为 `3rem`，`SidebarMenuButton` 在折叠态强制为 `size-8`，因此 Admin 目前只能得到纯图标折叠体验。
3. `apps/admin/components/platform-context/platform-switcher.tsx` 的 sidebar 浮层固定 `w-80`，宽于默认 `16rem` Sidebar，并在每个平台选项中同时显示图标、状态、名称与 code，实际视觉会越过侧边栏进入内容区。
4. PlatformSwitcher 搜索图标使用绝对定位 `left-2.5`，input 只有 `pl-8`。用户提供的当前截图中，搜索图标与 placeholder 已发生视觉重叠。

这次优化只改变 Admin 前端信息架构、文案和布局，不改变现有 Global / Platform scope 路由、安全边界、业务能力或数据来源。

## 目标与范围

### Global 展开态

Global Sidebar 不再显示“工作台 / 商业中心 / 系统治理 / 设置”这类大分类标题，而是按以下固定顺序直接显示六个入口：

1. 仪表盘 → `/admin`
2. 平台中心 → `/admin/platforms`
3. 用户中心 → `/admin/accounts`
4. 业务中心 → `/admin/billing/orders`
5. 审计中心 → `/admin/audit`
6. 安全中心 → `/admin/security`

这些名称同时作为 Global 页面 breadcrumb / command menu 的业务名称，避免同一路由在侧边栏与顶部继续使用两套一级命名。

### 桌面折叠态

Admin 专用折叠态不再复用“3rem 纯图标”最终视觉，而是在不改共享 Sidebar 默认值的前提下，通过 Admin Shell 的 CSS 变量覆盖与 Admin 菜单渲染，使折叠态保留“图标 + 精简文字”。Global scope 的精简文字固定为：

- 仪表盘
- 平台
- 用户
- 业务
- 审计
- 安全

Platform scope 使用同一折叠容器，因此为现有平台资源配置对应短标签，避免“订单与计费”等长标签在收窄宽度中被不可预测裁切；展开态的 Platform 导航分组与完整名称保持不变。

### PlatformSwitcher

- Sidebar variant 的浮层宽度与当前切换器/侧边栏内容宽度一致，不再固定为 `w-80` 越过侧边栏。
- Global scope 入口仍保留“所有平台（全局透镜）”。
- 平台 option 一级视觉只显示平台名称与当前选中标记，不显示 code；名称/code 搜索能力不变，code 只是从列表视觉中降级而不是从搜索条件中删除。
- 搜索图标和输入文字建立明确的安全间距；增加稳定测试锚点，用浏览器几何信息证明文本起点不会覆盖图标。

## 当前架构

导航定义由 `admin-navigation.ts` 提供，`AdminSidebar` 根据 URL 判断 Global 或 Platform scope，并把当前导航项传给共享 `@kit/ui/sidebar`。`adminNavigation` 同时被 Command Menu 使用，`adminNavigationLabel()` 被 Topbar breadcrumb 使用，所以 Global 一级 label 变更会自然同步到这些消费者。

PlatformSwitcher 自己负责通过 Admin API 加载平台、服务端 `q` 搜索、cursor 加载更多、scope route 映射、Escape/点击外部关闭。此次不改变请求、分页或 `mapAdminScopeRoute()`。

## 目标架构

1. `AdminNavigationItem` 增加可选 `compactLabel`，由同一导航事实源同时提供展开名和折叠短名。
2. Global 导航改为一个无标题 group，保留现有 `adminNavigationGroups` / `adminNavigation` 公共形状，避免为 Command Menu 和路由匹配建立第二套数据。
3. `AdminSidebar` 对空 group label 不渲染 `SidebarGroupLabel`；菜单项根据 Sidebar collapse data attribute切换 full / compact label。
4. 仅在 `AdminShell` 覆盖 `--sidebar-width-icon`，并通过 Admin 局部样式放开共享 `size-8` 的 icon-only按钮约束；不修改 `packages/ui` 的全局默认，避免影响其他产品消费者。
5. PlatformSwitcher sidebar dropdown 使用父容器宽度；平台 option 只展示 name；搜索输入增加足够左内边距并对图标暴露测试锚点。

## 接口、数据与配置

- API / OpenAPI：不变。
- 数据库 / migration / RLS / Storage / Auth：不变。
- Supabase Edge Function / 项目配置：不变。
- 路由：不变。
- 共享 UI 包：不修改实现，只消费其现有 CSS 变量与 data attribute。
- 受影响消费者：Admin Sidebar、Admin Topbar breadcrumb、Admin Command Menu、PlatformSwitcher、Admin navigation unit tests、Admin browser E2E、`apps/admin/DESIGN.md`。

因此 Supabase 部署与远端 Supabase 验证均为 **NOT_RUN（不适用：无 Supabase 变更）**。

## 变更分级与验证边界

按 `docs/guides/development-release-workflow.md` 分级为 **R2**：本项修改共享 Admin 导航交互、Sidebar 折叠行为与响应式浮层，不属于纯静态文案 R1；同时不涉及数据库、Auth、权限、支付领域规则、API/Contract、Secret 或 Worker，因此不升 R3。

本地验证至少覆盖：

- 导航模型单测：Global 顺序、完整 label、compact label、路由标签。
- Admin typecheck / build / lint / format。
- 桌面浏览器：展开态无旧分组标题；六项顺序正确；折叠态仍显示图标与短名；再次展开恢复完整名。
- Platform scope：展开分组保持不变，折叠短名可读，不泄露 Global 常驻入口。
- PlatformSwitcher：浮层不宽于 sidebar trigger；名称和 code 都可搜索；option 不显示 code；搜索图标与文字不重叠；Escape/窄屏仍正常。
- 文档与 diff 检查。

R2 流程要求 Local Supabase。浏览器 R2 验证使用仓库既有本地 Admin E2E / 合成 fixture；若本地 Supabase 环境不可用则记录 BLOCKED，不能用远端环境替代。

## 风险与取舍

- **Breadcrumb / Command Menu 命名同步：** Global label 是共享事实源；本次有意让 Topbar 和 Command Menu 一起使用“仪表盘 / 平台中心 / 用户中心 / 业务中心 / 审计中心 / 安全中心”，防止侧边栏与顶部继续出现旧名字。
- **共享 Sidebar 回归：** 不直接修改 `packages/ui` 默认宽度与按钮 variant，所有折叠宽度/按钮覆盖限定在 Admin，降低其他消费者回归风险。
- **折叠宽度：** 目标是“图标 + 2～3 个中文短词”可读，而不是尽可能窄；宽度以浏览器实际可见性为验收标准。
- **平台 code 可发现性：** code 从 dropdown 一级视觉移除，但搜索仍支持 code；平台目录和平台详情仍保留 code，不丢失管理能力。

## 验收条件

- Global 展开侧边栏只出现六个目标一级入口，不出现旧四个分组标题。
- Global 折叠侧边栏六项分别可见“仪表盘、平台、用户、业务、审计、安全”，且图标仍可见、可点击、active state 正确。
- 再次展开恢复“仪表盘、平台中心、用户中心、业务中心、审计中心、安全中心”。
- Platform scope 的完整菜单和 scope 隔离不被破坏；折叠后平台资源使用可读短名。
- PlatformSwitcher sidebar 浮层不超过触发器/侧边栏内容宽度；平台 option 不显示 code，但通过 code 搜索仍能找到正确平台。
- 搜索图标右边界与 input 文本起始位置不重叠。
- 适用 R2 本地检查通过；无 Supabase 变更且不进行任何远端部署。

## 待确认项

无。用户已经明确了 Global 展开名、折叠短名、移除分组标题、切换器宽度和列表展示原则，可直接实施。
