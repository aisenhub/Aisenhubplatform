# Phase 08：Sidebar / Switcher 双透镜语义修复

状态：Completed（待整体验收收口）

关联：[总计划](../plan.md) · [设计 §2/§5.1](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

在 PR #13 的轻量 Sidebar 视觉基础上恢复双轨透镜语义：进入平台后不失去系统治理入口；从 Global/Platform 切换 scope 时优先落到同等业务路由；平台切换器支持本地搜索与明确状态表达。

## 路由映射合同

新增纯函数作为唯一 route mapper，至少满足：

- Global `/admin/accounts` → Platform `/admin/platforms/:id/accounts`。
- Global `/admin/billing` 与 `/admin/billing/orders` → Platform `/admin/platforms/:id/billing`。
- Global overview/platform directory → Platform overview。
- Platform accounts → All Platforms `/admin/accounts`。
- Platform billing → All Platforms `/admin/billing/orders`（旧 `/admin/billing` 仍兼容）。
- Platform overview → `/admin`。
- Platform→Platform 保留已知平台资源 suffix；无法映射的资源回退目标必须确定且测试固定。

## 任务清单

- [x] 在 navigation 模块新增 `mapAdminScopeRoute` 和测试，不把映射 if/else 留在 `PlatformSwitcher`。
- [x] 平台 Sidebar 恢复紧凑“全局治理”直通：Operations、Audit、Consumer Lab、全局 Billing；避免重新形成第二套完整 Global Sidebar。
- [x] `PlatformSwitcher` 用 mapper 导航；增加输入式本地平台过滤，不因搜索再发网络请求。
- [x] 每个平台 option 显示 status dot/可访问文本；active 与非 active 状态语义区分。
- [x] 平台列表 `limit=100` 明确展示“已加载平台 (匹配数/窗口数)”，不暗示全库总数。
- [x] 未新增“创建平台”假入口；保留真实平台目录入口。

## 验证

纯函数 route mapper 单测 + Sidebar/navigation 单测 + 浏览器键盘/焦点/窄屏检查。任何平台视角需要先退回目录才能访问 Audit/Operations 的情况视为 FAIL。
