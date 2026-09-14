# 审查修复目标设计与约束

状态：Proposed；唯一实施路线图[plan.md](plan.md)，问题定义[repair-issues.md](repair-issues.md)。本文件是目标，不是当前架构。当前行为仍以源码/迁移→测试配置→文档为优先级。

## 当前可复用能力

Consumer/Admin同源BFF、Supabase Auth/JWT/Session/MFA、受控executor与private领域过程、RLS和复合归属关系、Order/Inbox/Job/Settlement/Grant、HMAC兑换码及交付、correction/审计、维护与恢复屏障。具体缺口不重新造框架解决。

## 目标边界

1. 浏览器只提交商品/意图和授权动作；BFF持有平台配置，API完成认证/归属，SQL唯一写入规则；中央故障fail-closed。
2. Checkout是不可变商业合同和长期幂等绑定；Provider是外部事实；Order是本地观察/归属投影；Settlement是本地决策；Grant是账本来源；Subscription是当前有效投影；不得混为一次HTTP成功。
3. Provider API逐字段验证，只有完整TRUE可授予；Webhook验签后持久入队并ACK，不能直接授予。未知状态/未知外部结果保留，不猜failed。
4. Job租约可接管，所有写提交均校验fence，重试预算有界，dead-letter/人工复核有责任和恢复路径。对账发现游标与处理队列独立。
5. 原Order一次原结算；退款/撤销/拒付/冲正追加事实和补偿操作，定位correction链当前有效Grant，不删除原记录。未归属paid隔离可见，但不凭用户指定平台认领。
6. 同Plan顺延、不同Plan冲突、Free fallback、暂停、删除和Plan下架遵循统一锁序/政策。99年有限与Admin真永久区别固定；是否允许再购由D1决定，不改变历史订单解释。
7. 兑换码保留真实31默认/合法旧码/HMAC域及双密钥解释；只保存hash/掩码，首次明文交付和确认激活分开；失败兑换不消费；已兑换后禁用批次不等于撤销Grant。
8. Consumer消费权威状态和未来生效区间；Admin使用完整timeline/preview/MFA/operation/If-Match/202，禁止自行算金额期限配额或直接改状态。
9. cron调用、Job执行与业务成功三个证据层分开；备份包含DB与实际Storage对象，恢复先屏障/墓碑后开放读取。

## 与旧目标的冲突处理

[归档设计](../../archive/subscription-billing-centralization/AisenFlow_Subscription_Billing_Architecture.md)只作背景；[D0–D6决策表](repair-matrices.md)唯一记录本次冲突。D1续购、D2退款政策、D3暂停/保留需具体决定；无依赖的fail-closed与lease修复不因此停摆。旧phase-2自动退款、多渠道、OAuth/Suite不因本计划自动授权。

## 跨阶段唯一来源

字段/状态兼容由TASK-0101输出，锁/生命周期由0102输出，消费者清单由0103输出；执行时实际schema/OpenAPI/DTO是实现合同，不能复制第二套定义。未完成的决策留在proposal，不先改architecture。

## TASK-0102 已落地的局部边界

2026-09-14 的 Local forward-fix 已将共享 `private.entitlement_apply` 的授予前置冻结为：幂等重放先返回既有结果；新授予先对 `platforms` 取 `FOR SHARE` 并要求 `status = active`，再对目标 `platform_accounts` 取 `FOR UPDATE`，随后校验账户和套餐。这样 Billing settlement、Admin Grant 与兑换码共用同一平台禁用闸门，平台状态更新与新授予按数据库锁串行化。

这只是 TASK-0102 的可独立安全修复，不宣称完整锁表已完成：`identity_lifecycle`、batch/code、checkout/order/job 及暂停/删除策略仍需 D3 和 Hosted/Staging 双连接证据后统一冻结。
