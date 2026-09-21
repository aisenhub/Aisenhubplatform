# 阶段 01：Context-aware Navigation Shell

状态：已完成

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

建立 Admin 2.0 的 Global / Platform 两种导航上下文，并移除平台顶部横向一级导航；不改变后端、安全协议和现有路由。

## 进入条件

- 分支：`codex/admin-2-navigation-ia`
- 起始基线：`447e7be`
- 固定工具链可用
- 修改代码前阅读当前 Next.js 安装版本相关指南
- 不触碰 Auth/BFF/API/SQL

## 已核实调用链

```text
/admin/** → AdminLayout → AdminShell → AdminSidebar + AdminTopbar

/admin/platforms/:platformId/**
→ PlatformLayout → PlatformWorkspace → PlatformHeader → feature page
```

## 变更范围

- `apps/admin/components/navigation/admin-navigation.ts`
- `apps/admin/components/navigation/admin-command-menu.tsx`
- `apps/admin/components/shell/admin-sidebar.tsx`
- `apps/admin/components/shell/admin-topbar.tsx`
- `apps/admin/components/platform-context/platform-header.tsx`
- `apps/admin/components/platform-context/platform-switcher.tsx`
- `apps/admin/components/platform-context/platform-navigation.tsx`
- 必要的 Admin 单测和 `globals.css`

## 任务清单

- [x] P01-01：导航数据模型拆分为 Global groups、Platform groups、Global utility links，并提供 pathname → context/label 纯函数。
- [x] P01-02：AdminSidebar 根据 pathname 解析 platformId。
- [x] P01-03：Global Mode 使用工作台 / 业务管理 / 系统管理 / 管理员。
- [x] P01-04：Platform Mode 显示返回所有平台、当前平台、平台/商业化/资源/配置和全局管理。
- [x] P01-05：复用 PlatformSwitcher，不复制平台列表逻辑。
- [x] P01-06：PlatformHeader 移除横向 PlatformNavigation。
- [x] P01-07：Topbar 显示准确的平台资源上下文。
- [x] P01-08：Sidebar 移除 MFA 一级入口，仅保留安全与账户。
- [x] P01-09：Command Menu 支持当前平台资源跳转。
- [x] P01-10：增加导航纯函数测试。

## 状态要求

- Login / MFA auth flow 继续不显示 Admin Shell。
- 平台读取失败时，不显示猜测的其他平台数据。
- disabled platform warning 保留。
- Sidebar collapsed 状态仍可通过 tooltip 识别入口。
- 不新增任何假 health / 假状态。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期 |
| --- | --- | --- | --- |
| 工具链 | `pnpm toolchain:check` | Local | 固定版本一致 |
| 单测 | `pnpm --filter admin test:unit` | Local | 导航测试通过 |
| 类型 | `pnpm --filter admin typecheck` | Local | 0 errors |
| 构建 | `pnpm --filter admin build` | Local | Admin build 成功 |
| 文档 | `pnpm docs:check` | Local | Proposal 链接和格式通过 |
| 差异 | `git diff --check` | Local | 无 whitespace 错误 |

## 退出条件

- Global / Platform Sidebar 都可工作。
- 平台横向一级导航已退出。
- 所有旧路由仍可直接访问。
- 安全相关操作语义未修改。
- 验证记录已更新。
