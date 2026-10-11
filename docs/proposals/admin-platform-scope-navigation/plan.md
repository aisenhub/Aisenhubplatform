# OPT-005 平台作用域侧边栏导航收敛计划

状态：Completed

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从 `main@17212999e3eefcba39b755ce9e71555dde91f4f2` 收敛 Platform Sidebar，使 Global / Platform scope 的常驻导航彻底分离，同时保持既有 route mapper、Global URL 和对象级深链兼容。

风险分级：**R2**。

当前分支：`main`。

## 阶段

| 阶段 | 目标 | 状态 | 详细计划 |
| --- | --- | --- | --- |
| 01 | Sidebar/navigation 收敛、文档同步、浏览器与 R2/Git closeout | 完成 | [阶段 01](phases/01-platform-scope-sidebar.md) |

## 总体验收

- [x] Platform Sidebar 仅包含平台资源分组。
- [x] Global Sidebar 能力与 URL 保持不变。
- [x] `adminGlobalUtilityNavigation` 与 Platform Sidebar 的平台目录注入删除。
- [x] PlatformSwitcher 的 Accounts/Billing 对等 scope 映射保持不变。
- [x] architecture/Admin DESIGN/旧双透镜 Proposal 的 supersede 说明同步。
- [x] unit/typecheck/build/browser/lint/format/docs 与适用 R2 Local 验证通过。
- [x] GitHub/main/远端 SHA/分支清理闭环后再进入 OPT-006。

## 风险与回退

- 风险集中在导航可发现性，而非业务权限；页面 URL 与服务端能力均不删除。
- 回退为恢复 `AdminSidebar` 的旧 Platform“全局治理”拼接和 `adminGlobalUtilityNavigation` 导出；无数据迁移或远端 Supabase 回滚。

