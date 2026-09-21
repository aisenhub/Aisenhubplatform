# Admin 2.0 导航与桌面工作区总计划

状态：已完成

关联：[优化设计](design.md) · [Agent 交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

把现有 Admin 从“Global Sidebar + Platform 横向 tabs + 重 Header”的页面集合，分阶段收敛为 Global / Platform 两种明确上下文的桌面级工作区。

- 任务：Admin 2.0 Navigation IA
- 起始基线：`447e7bebf10a57c8dc65d3e3f029937858abeb56`
- 工作分支：`codex/admin-2-navigation-ia`
- 用户指定分级：**统一按 R1 执行**
- 受影响消费者：`apps/admin`
- 后端、Consumer、SDK、Registry 不应发生运行语义变化

## 已冻结的跨阶段契约

1. 现有 `/admin/**` 与 `/admin/platforms/:platformId/**` 路由继续有效。
2. 平台上下文只来自 URL `platformId`。
3. 网络请求、BFF、Auth、recent-MFA、安全写操作协议保持原样。
4. 不新增依赖或第二套 UI 框架。
5. Platform 横向一级导航退出后，不再双轨维护。
6. Inspector 只展示 API 权威结果，不复制后端业务计算。
7. unknown outcome、request ID、MFA、审计语义不得为了视觉简化删除。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | Context-aware Shell：Global/Platform Sidebar、Topbar 上下文、移除平台横向一级导航 | 无 | 已完成 | [01 Navigation Shell](phases/01-navigation-shell.md) |
| 02 | 标准 Workspace：简化 PlatformHeader、统一 Header/Toolbar/Table，以 Accounts 为样板 | 01 | 已完成 | [02 Resource Workspace](phases/02-resource-workspace.md) |
| 03 | 桌面对象流：Inspector、URL selection、Command Palette 平台上下文 | 02 | 已完成 | [03 Inspector & Command](phases/03-inspector-command.md) |
| 04 | 跨页面推广：Billing/Operations/Audit/Security/其他平台页收敛与最终验证 | 03 | 已完成（浏览器人工验收 NOT_RUN） | [04 Rollout & Validation](phases/04-rollout-validation.md) |

## 当前代码证据与关键缺口

- `admin-navigation.ts` 当前只有“工作台 / 运维与安全”两组。
- `admin-sidebar.tsx` 只理解 Global navigation。
- `platform-navigation.tsx` 维护 9 个横向一级入口。
- `platform-header.tsx` 职责过重。
- `admin-topbar.tsx` 对平台子页面只能得到“平台”。
- `admin-command-menu.tsx` 只遍历 Global navigation。
- 已有 `ResourceInspector`、`ConfirmActionDialog`、`AsyncState` 可复用。

## Phase 01

- 单一导航模型定义 global groups、platform groups 和 global utilities。
- AdminSidebar 根据 pathname 自动进入 Global / Platform mode。
- Platform Mode 显示“所有平台”返回、当前平台上下文和 Switcher。
- PlatformNavigation 退出一级导航。
- Topbar 表达平台与资源上下文。
- Sidebar 只保留“安全与账户”，MFA 不再作为一级导航。
- Command Menu 至少理解平台资源导航。

## Phase 02

- PlatformHeader 去除重复一级导航和重元数据。
- 建立稳定 WorkspaceHeader / ResourceToolbar 规则。
- Accounts 验证高密度列表、搜索、刷新、状态层级。
- CSS 从内容站 max-width 思路调整为管理工作区宽度策略。

## Phase 03

- ResourceInspector 成为标准桌面对象流。
- Accounts selection 进入 URL，可 Back/refresh/deep-link。
- Command Palette 理解当前平台并支持资源跳转。
- Inspector 窄屏行为和焦点恢复可验证。

## Phase 04

- Plans / Subscriptions / Redemption / Files / Settings / Billing / Operations / Audit / Security 对齐工作区规范。
- 删除退出的重复导航代码和样式。
- 同步 `docs/architecture/modules/frontends.md`。
- 完成最终静态、构建、Admin 单测和本地浏览器验证。

## 总体验收

- [x] Global / Platform 两种上下文稳定，无双轨一级导航。
- [x] 现有 Admin 路由兼容且 active state 正确。
- [x] Security / MFA 符合“设置页 + Action Flow”模型。
- [x] Accounts 样板完成桌面工作区和对象流。
- [x] Command Palette 不再只是 Global Sidebar 镜像。
- [x] Loading / empty / error / refresh / unknown outcome 语义保持。
- [x] `pnpm docs:check`、`pnpm contracts:check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 按最终候选实际执行并记录。
- [x] Admin unit tests 与新增导航测试通过。
- [ ] 真实浏览器桌面/窄屏与焦点流人工验收；当前工具环境没有浏览器执行能力，记录为 NOT_RUN。
- [x] 最终 diff 无 Secret、无无关文件、无后端协议变化。

## 风险与回退

- Next.js 必须按仓库实际版本文档实现。
- 优先在 Admin 组合层解决，不改共享 `@kit/ui/sidebar` 行为。
- 若实现必须触碰 Auth route、BFF、API、SQL、支付或权限，停止该部分并单独说明。
- 本 Proposal 无数据迁移，回退以阶段小提交回退 Admin 应用代码为主。
