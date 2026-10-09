# Phase 07：共享 Billing Workspace

状态：Completed（待整体验收收口）

关联：[总计划](../plan.md) · [设计 §4.3](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

把 `central-billing-page.tsx` 与 `platform-billing-page.tsx` 中重复的订单队列、分页、详情、Evidence Timeline、Provider requery、受控 resolve、If-Match/operation_id/Unknown Outcome 逻辑收敛为一个实现。Global 与 Platform 页面只能通过 scope/config props 改变过滤器与附加区域。

## 共享边界

- 共享组件为 `BillingOrderWorkspace`；敏感 action 算法只能存在一份。
- `platformId?: string` 是 scope 参数；有值时请求始终附带该 platform_id，UI 不允许覆盖。
- Global scope 可以显示平台列/平台筛选；Platform scope 隐藏该控制。
- `BillingMetrics/alerts` 属于 Global 页面附加观测，不强行塞入共享订单组件。
- `BillingOrder` 类型补齐服务端已有的 `platform_id/platform_account_id/checkout_intent_id` 等 scope 字段。

## 任务清单

- [x] 提取共享 filters 构造、cursor、load/append、inspect、requery、resolve 状态机。
- [x] 提取唯一 Order Queue + Inspector + Timeline + Action UI。
- [x] 保留同 `operation_id` 在网络未知后重试；4xx/409/412 按既有语义决定何时丢弃 operation ref。
- [x] Platform 页面变成轻量 wrapper，只负责当前 platform 标题/说明和 locked scope。
- [x] Global 页面保留 metrics/alerts，并复用共享订单 workspace。
- [x] Billing URL/API helper、scope mapper 与 Admin 行为测试覆盖两种 scope；敏感 action payload 只有共享实现。

## 退出条件

不得保留第二份 requery/resolve/Timeline 实现。若为了视觉差异复制 action handler，本阶段视为未完成。
