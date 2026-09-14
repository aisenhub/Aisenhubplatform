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

2026-09-14 的 Local forward-fix 已将共享 `private.entitlement_apply` 的授予前置冻结为：幂等重放先返回既有结果；读取目标账户的身份后，确保 `identity_lifecycle` 有 `active` 行并取 `FOR SHARE`；新授予再对 `platforms` 取 `FOR SHARE` 并要求 `status = active`，再对目标 `platform_accounts` 取 `FOR UPDATE`，随后校验账户和套餐。Global Delete 的 start 过程对同一身份行执行 upsert/update，因此删除门闩与新授予按数据库锁获得线性化顺序；Billing settlement、Admin Grant 与兑换码共用同一平台和身份闸门。

这只是 TASK-0102 的可独立安全修复，不宣称完整锁表已完成：batch/code、checkout/order/job 及暂停/删除完整策略仍需 D3 和 Hosted/Staging 双连接证据后统一冻结。

## TASK-0201 已落地的 Local forward-fix

`supabase/migrations/20260914093019_repair_task_0201_checkout_snapshot.sql` 采用 expand-first forward-fix：不修改历史迁移，新增 Checkout Provider 合同快照字段，并由触发器在创建时从当前 mapping 填充或逐字段校验。快照覆盖 external plan/type、SKU 全集与数量、Provider 期限、展示价、实付价和 price version；Checkout 自身的商品、期限、价格、币种、price version 与 mapping version 也必须和当前发布商品/mapping 一致。已发布或已被 Checkout 引用的 mapping 合同字段不得原地修改；需要调价时应发布新的 mapping 版本。

结算过程和付款链接重建都只读取 Checkout 快照。旧 Checkout 若缺少这些证据不会从当前 mapping 猜测，而是进入 `contract_conflict`/人工复核或不再签发可付款链接。Local 专项同时证明快照落库、客户端金额注入被拒绝、mapping 原地改价被拒绝以及付款链接事实不再读取当前 mapping；真实 Provider、旧付款链接迟到、并发发布/调价及 Hosted/Staging 仍不在本地证据范围内。

## TASK-0202 已落地的 Local recovery path

`supabase/migrations/20260914095321_repair_task_0202_checkout_recovery.sql` 新增只读 `private.subscription_checkout_read_by_idempotency` wrapper。它先按当前平台与认证账户计算并查找 Idempotency-Key 的 SHA-256 绑定，再复用 `subscription_checkout_read_v2` 的状态投影；未知 key 返回 `resource_not_found`，不会创建 Checkout，也不会把已付/已授予记录降回过期。Account API 暴露 `GET /v1/subscription/checkout` + `Idempotency-Key` 作为响应丢失后的恢复入口，SDK、OpenAPI、Next 路由和 Local 负例已同步。

这只完成同一意图的持久化恢复入口；跨 Tab 不同 key 的多意图治理、Provider 取消/迟到 paid 的业务政策、两笔付款的全链路并发证明和真实 HTTP/Provider 仍需后续任务与环境门槛。

## TASK-0501 已落地的 Consumer 展示边界

订阅页面现在直接消费目录返回的 `currency`、`price`、`term`、`enabled`、`purchasable` 与 `reason`，不再写死货币符号或通用权益承诺；finite lifetime 明确显示为 99 年有限期。创建 Checkout 后，待支付摘要保存并展示 API 返回的价格、币种和期限快照；状态轮询再次读取 Checkout 时会覆盖恢复中的摘要，旧 Session Storage 数据缺少快照时先显示读取中，不用当前目录价格冒充订单价格。浏览器级目录展示回归已加入 T16 探针，并已随独立 Consumer 安装链路在 Local 双来源 E2E 中通过；Hosted 双平台仍未运行。

## TASK-0701 已落地的独立分页发现边界

主动发现与订单处理保持双进度：Afdian `query-order` 分页只负责读取页、校验 `list`/`total_page` 并把 `out_trade_no` 作为本地订单线索写入；每个线索按 Provider account/order 唯一去重后进入 `reconciliation` 队列，后续仍由既有权威单订单查询、合同核验和结算入口完成事实判断。发现页游标独立存储在 `billing_reconciliation_cursors(stream = 'discovery')`，成功页才写入下一页或完成本轮，Provider 不可用、响应不完整、页版本冲突均保留当前页并记录错误。

维护端通过 `/maintenance/v1/billing/reconciliation/page` 执行一次页扫描，批次运行在存在分页 Provider adapter 时先执行扫描再领取处理队列；没有分页适配时保持旧的订单处理行为。数据库过程限定为 `job_executor` 的 security-definer 入口，直接表写权限仍不授予 executor。Local 已验证首扫、续页、重复扫描、坏响应、失败重试页和 optimistic cursor conflict；真实 Provider 429/Retry-After、并发崩溃恢复、Hosted/Staging/Production 仍不由 Local 证据替代。
