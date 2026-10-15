# OPT-011 Admin 全局侧边栏导航收敛总计划

状态：Completed

关联：[优化设计](design.md) · [阶段 01](phases/01-sidebar-navigation.md) · [Agent 交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

本项在 `codex/optimization-batch-20261015` 批次分支实施，起始项目基线为 `3b82c1d483879877e0716bc65578d3d85a4c19a8`，同时保留本批次已存在的 `optimization-intake` 修改。

发布分级：**R2**。原因是导航结构、Sidebar collapse 交互和响应式浮层均属于共享 Admin UI 行为；没有数据库、Auth、权限、支付规则、API/Contract、Secret、Worker 或 Supabase 配置变化。

受影响消费者：

- `apps/admin/components/navigation/admin-navigation.ts`
- `apps/admin/components/shell/admin-sidebar.tsx`
- `apps/admin/components/shell/admin-shell.tsx`
- `apps/admin/components/navigation/admin-command-menu.tsx`（消费同一 Global label，无需单独复制配置）
- `apps/admin/components/shell/admin-topbar.tsx`（消费 `adminNavigationLabel()`）
- `apps/admin/components/platform-context/platform-switcher.tsx`
- `apps/admin/app/globals.css`
- navigation unit test、Admin browser E2E、Admin DESIGN 文档

明确非目标：改路由、重做 Platform scope 信息架构、修改 API 查询协议、修改业务权限、修改 Supabase。

## 冻结契约

1. Global 路由保持 `/admin`、`/admin/platforms`、`/admin/accounts`、`/admin/billing/orders`、`/admin/audit`、`/admin/security`。
2. Global full label 固定为：仪表盘、平台中心、用户中心、业务中心、审计中心、安全中心。
3. Global compact label 固定为：仪表盘、平台、用户、业务、审计、安全。
4. Platform 展开态分组与 full label 保持现状；只为同一 Sidebar 折叠态增加短 label。
5. PlatformSwitcher 的名称/code 搜索、cursor、scope route、错误恢复、Escape/外部关闭语义不变。
6. Platform option 一级只显示平台名称；code 不再显示但仍参与搜索。
7. 不修改共享 `packages/ui` Sidebar 默认行为，Admin 通过局部变量和样式覆盖实现带文字折叠态。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | 完成 Global 导航扁平化、Admin 折叠短名、PlatformSwitcher 收窄与回归验证 | 用户需求、当前 Admin 导航/Sidebar/PlatformSwitcher 代码已核实 | 已完成 | [阶段 01](phases/01-sidebar-navigation.md) |

本项没有需要拆成多个迁移阶段的数据或合同依赖，使用一个可独立验收的 UI 阶段，避免人为拆分。

## 总体验收

- [x] Global Sidebar 展开态六项命名与顺序符合冻结契约，旧 group label 不再渲染。
- [x] 桌面折叠态可见图标 + compact label，再次展开可恢复 full label。
- [x] Platform scope 展开结构不变，折叠短名可读，Global scope 隔离不回退。
- [x] PlatformSwitcher 浮层宽度、平台 option、名称/code 搜索、search icon 间距、Escape 与窄屏均通过浏览器断言。
- [x] Navigation unit test、Admin typecheck/build、lint/format、适用 Local Admin E2E、docs/contracts 检查通过；最终 diff hygiene 在批次提交前再次执行。
- [x] `apps/admin/DESIGN.md` 同步最终导航规则。
- [x] Supabase：NOT_RUN（不适用，无 schema/API/Edge/Storage/Auth/配置变化）。
- [x] GitHub：用户已明确要求结束本优化批次并统一提交、合并 `main`、删除已合并分支；远端交付作为本次批次收口步骤执行。

## 风险与阻塞

- 浏览器 R2 依赖本地 Supabase、Chrome 和 Admin 服务。缺少 Local 环境时必须记为 BLOCKED，不使用 Production 或远端 Provider 替代。
- 折叠宽度如果只靠共享组件默认 `3rem` 无法满足需求，因此必须验证 Admin 局部覆盖确实同时改变 gap 和 fixed sidebar container 宽度。
- `adminNavigation` 被 Command Menu 消费，full label 改名会改变命令面板可搜索文字；这是本项预期行为，单测需固定。

## 验证与交付

实际结果记录到 [verification-record.md](verification-record.md)。本项本地实现与 R2 验证已完成；2026-10-15 用户明确要求结束本优化批次，因此随后执行统一 GitHub 提交、`main` 合并与分支清理。
