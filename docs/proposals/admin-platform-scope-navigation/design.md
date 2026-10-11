# OPT-005 平台作用域侧边栏导航收敛

状态：Completed

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md)

## 背景与最新事实基线

实施基线为 `main@17212999e3eefcba39b755ce9e71555dde91f4f2`。

当前 Admin 已经以 URL 区分 Global / Platform 两种 scope，且 `PlatformSwitcher` 已承担 scope 切换：

- Global 使用 `adminNavigationGroups`。
- Platform 使用 `platformNavigationGroups(platformId)`，这些分组本身只包含当前平台资源。
- `AdminSidebar` 在 Platform 路由下又额外拼接“全局治理”，把平台目录、全局 Billing、Audit、Consumer Lab 常驻注入平台侧边栏。
- OPT-003 已移除独立“运维中心”一级导航，因此 Intake 中“运维中心仍在全局治理分组”的描述已经过时。
- `mapAdminScopeRoute` 已提供 Global/Platform Accounts、Billing 以及 Overview 的对等 scope 映射；无法映射的平台资源切回 Global 时回到平台目录。

现行架构文档与较早的双透镜 Proposal 仍声明平台范围保留全局治理一跳直通，这是本项明确要替代的旧决策。

## 目标

1. 进入 `/admin/platforms/:platformId/**` 后，Sidebar 只展示 `platformNavigationGroups(platformId)`。
2. Global 功能只在 Global scope 的 Sidebar 常驻；切回 Global 的主入口是顶部/Sidebar 中的 `PlatformSwitcher → 所有平台`。
3. 不删除任何 Global URL，也不改变 Audit/Billing/Consumer Lab 的页面能力与权限。
4. 不删除对象级业务深链；具体页面如需从对象详情跳到全局审计仍可保留显式链接。
5. 保留 `mapAdminScopeRoute` 的 Accounts/Billing 对等映射，scope 切换不经过平台目录绕行。
6. 同步当前 architecture、Admin DESIGN 与浏览器回归，消除旧“平台 Sidebar 常驻全局治理”的声明。

## 目标信息架构

### Global Scope

Global Sidebar 继续完整展示：

```text
工作台       概览 / 平台 / 统一用户
商业中心     计费管理
系统治理     审计中心 / Consumer Lab
设置         安全与账户
```

### Platform Scope

Platform Sidebar 只展示当前平台资源：

```text
平台运营     概览 / 账户
商业化       订单与计费 / 套餐 / 订阅 / 兑换码
资源与接入   文件 / 接入地址 / 接入密钥
平台设置     基本设置
```

不再追加“全局治理”或“平台目录”快捷组。

## 关键决策

- **Switcher 是 scope 主入口。** 选“所有平台”后，route mapper 尽可能映射到同等 Global 资源；不能映射时回到 `/admin/platforms`。
- **Global URL 不等于 Platform 导航项。** 全局页面仍可通过 Global Sidebar、对象级显式深链、浏览器 URL 等方式到达，但不作为 Platform Sidebar 常驻菜单。
- **删除死的导航派生。** `adminGlobalUtilityNavigation` 只为 Platform Sidebar 注入而存在；本项删除该导出及对应测试，不保留无消费者的第二套列表。
- **历史 Proposal 不重写历史验证。** 仅在旧双透镜设计/阶段文档标注其“平台内全局治理直通”条款已被 OPT-005 supersede；当前 architecture 改为新事实。

## 风险分级

**R2**。

理由：仅修改 Admin 共享导航/UI 与行为测试，不涉及数据库、API、DTO、Contract、BFF、权限或依赖；但它改变 Sidebar 中可见跳转入口，不满足 R1 的“不得改变跳转”约束。

受影响消费者：`AdminSidebar`、navigation model/tests、`PlatformSwitcher` scope 回退体验、Admin synthetic browser。

## 明确排除

- 不提前实施 OPT-006 的“接入配置”导航合并。
- 不改 PlatformSwitcher 的搜索/浮层视觉（OPT-001 已完成）。
- 不改 Audit/Billing/Consumer Lab URL、权限或业务逻辑。
- 不新增数据库、Supabase migration、Edge Function 或远端部署。
- 不处理 OPT-007–010 的新领域导航。

## 验收

- Platform scope DOM 中不存在 Global 的平台目录、统一用户、全局 Billing、Audit、Consumer Lab、安全入口。
- Platform scope 保留全部当前平台导航，active state 与移动端关闭行为不回归。
- 从 Platform scope 切换“所有平台”后仍按既有 mapper 到达 Global 对等资源/确定回退。
- Global scope 的完整导航保持不变。
- navigation unit、Admin typecheck/build、synthetic browser、format/lint/docs 与适用 R2 Local 验证通过。

