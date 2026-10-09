# Phase 09：Billing URL 与平台上下文闭环

状态：Completed（待整体验收收口）

关联：[总计划](../plan.md) · [Phase 07](07-shared-billing-workspace.md) · [Phase 08](08-dual-lens-navigation.md) · [验证记录](../verification-record.md)

## 阶段目标

让全局 Billing 的筛选、平台上下文与深链可刷新/后退/复制，消除手工 UUID 平台筛选，并让 Overview 的 `status=manual_review` 真正生效。

## URL 合同

- 旧 `/admin/billing` 保持兼容。
- 新增 `/admin/billing/orders` 作为订单中心 canonical UI route，复用同一个页面/组件，不复制业务实现。
- `q/status/platform/platform_account/provider_account/selected` 等 UI 参数由 URL 初始化；Apply/Clear/选中项反写 URL 时保留相关合法参数。
- API wire 继续使用 `platform_id/platform_account_id/provider_account_id`，UI route 参数与 API 参数转换集中处理。

## 任务清单

- [x] Global Billing 首次从 URL 构造 filters；Overview canonical `/admin/billing/orders?status=manual_review` 深链生效。
- [x] Global UI 加载平台选项并使用 select，不要求管理员手输 platform UUID。
- [x] 订单行展示平台名称/code；若平台元数据读取失败，诚实显示 platform_id；未关联订单明确显示“未关联平台/账户”。
- [x] `BillingOrder` 保留 nullable `platform_id/platform_account_id/checkout_intent_id` 真实合同，Platform scope 对返回详情校验所属平台。
- [x] 新增 `/admin/billing/orders` route；导航和 route mapper 指向 canonical route，同时保留 `/admin/billing` 兼容行为。
- [x] 本轮未制造独立 Settlement UI；设计文档明确该能力仍属后续范围。

## 退出条件

刷新、浏览器后退和复制链接后筛选结果必须一致；Overview 深链必须激活对应 filter；Global 平台筛选不得依赖手输 UUID。
