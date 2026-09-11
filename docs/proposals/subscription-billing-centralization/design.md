# 目标设计入口与当前实现差距

> 状态：Proposed。唯一目标依据为 [最新架构](../AisenFlow_Subscription_Billing_Architecture.md)。

本文件不再复制架构正文和旧34条冻结项；冲突必须回到唯一架构修订，再同步计划与消费者，不能在局部阶段偷偷选择另一套规则。

## 当前实现与目标差距

| 当前可复用事实 | 目标新增工作 | 责任 |
|---|---|---|
| 中央身份、平台账户、Admin 与 PostgreSQL private 领域过程 | 商业目录与支付闭环 | BILL-02～06 |
| 默认 Free 已在 platforms.default_plan_id | 不再创建第二个 Free 配置源 | BILL-02 |
| 当前 Grant source 为 admin/redemption_code；日历计算和尾部顺延在 SQL | billing source、结算决定、商业永久与 correction 链 | BILL-03～05 |
| 普通幂等记录最长7天 | Checkout 长期操作绑定与动态状态重放 | BILL-04 |
| generator 默认31位、允许16–128参数；页面旧格式不一致 | 保留31位新默认、兼容合法旧码、统一显示验证 | BILL-03、06 |
| Maintenance 有 HTTP 入口和租约模式 | 可恢复支付任务、调度合同、双进度对账 | BILL-04、05、07 |
| 删除/保留已有固定任务链 | Billing 外键、匿名保留、任务竞态和恢复兼容 | BILL-03～05、07 |
| Consumer 订阅页仍有本地演示 | 真实 SDK/BFF、订阅显示与服务端授权示例 | BILL-06 |

准确函数签名、路径与部署状态在执行时重新核对；旧文档描述不替代源码，页面 correct 选项不证明新的排期修正已实现。用户提供的脱敏 Provider 调试字段见 [Afdian 调试参考](afdian-debug-reference.md)；其中未出现 custom_order_id，因此不能作为自动绑定能力的证明。

## 迁移约束

保留旧 /v1/plans 的权益含义、历史 Plan/Grant/Batch/HMAC 与一次性消费约束。新批次才使用 Product snapshot；本期不做 Free claim，不把新码缩到16位。Provider 协议未经证据验证只能处于模拟/待验证模式，不能启用真实购买。

## 执行来源

详细职责与验收见 [总计划](00-master-plan.md) 及阶段文件；架构补充决策的实现责任已写入各阶段，不再沿用旧随机 Token、零元默认接受、单高水位或旧 Checkout 状态。
