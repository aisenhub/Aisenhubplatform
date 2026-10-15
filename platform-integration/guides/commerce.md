# Commerce and Subscription

Commerce 为可选能力。Plan 定义权益，Offer/Price 定义售卖事实；目录信息不能替代用户 entitlement。

## Consumer 能力

- `listPublicPlans`
- `listCommerceOffers`
- `getSubscription`
- checkout create/read/recovery
- `redeemSubscriptionCode`

## Checkout

- 价格、期限、币种、purchasable/reason 只信中央响应。
- 创建 checkout 使用合同要求的 Idempotency-Key；网络结果未知时优先使用同一 key/checkout read 恢复，不创建重复付款意图。
- 浏览器 callback/query 不是付款凭证。

## Redemption

兑换码不进 URL、日志或持久化调试信息。是否授予权益由中央原子处理结果决定。

## Consumer 不接入

Provider webhook、settlement worker、Provider secret、中央 SQL 和 reconciliation job 都留在中央服务。
