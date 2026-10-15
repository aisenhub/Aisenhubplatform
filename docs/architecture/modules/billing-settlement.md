# 支付、订单与结算架构

本模块描述 Checkout、Provider Webhook、订单事实、验证、Settlement、后台作业、对账和 Afdian adapter。Billing 的目标是把不可信/异步 Provider 观察转换为可审计、可重放、可恢复的内部支付事实，再通过受控 Settlement 请求 Entitlement 模块授予权益。

## Requirements

本模块主要承担 [支付与结算需求](../../spec/billing-settlement.md) `REQ-BIL-001` ～ `REQ-BIL-010`，并共同满足 `REQ-SYS-002` ～ `REQ-SYS-006`、`REQ-SYS-009`。Hosted/Cron/Provider 等环境要求若缺少真实环境证据，Requirement 可以保持 Active，但不能把 Delivery 或架构事实写成“生产已验证”。

## 1. 运行组件

```text
Consumer -> Account API checkout
                   │
                   v
           billing_checkout_intents
                   │
Afdian -> billing-webhook -> webhook inbox -> billing jobs
                                      │
maintenance <-> Provider query-order │
     │                                v
     └--------------------------> billing_orders
                                      │
                                      v
                                settlement
                                      │
                                      v
                                 Grant ledger
```

核心运行代码：

- `supabase/functions/account-api`：Checkout 与 Admin Billing；
- `supabase/functions/billing-webhook`：Provider ingress；
- `supabase/functions/maintenance/billing.ts`：发现、核验、结算、对账；
- `supabase/functions/_shared/afdian.ts`：Afdian Provider adapter；
- `packages/domain/src/contracts/billing.ts`：Provider-neutral DTO、状态和错误分类。

## 2. Checkout Intent

`public.billing_checkout_intents` 在创建时冻结商业事实：

- platform/account；
- entitlement Plan；
- commercial Offer/Price；
-期限 snapshot；
- price amount/currency/version；
- Provider account/product；
- mapping version；
- Provider external plan/SKU/product type；
- custom order ID；
- token digest/key version；
- idempotency/request hash；
- expiry/paid/granted 时间。

状态：

`pending | expired | paid | verified | granted | review_required | resolved`

只有服务端 Catalog resolution 可以生成 Checkout。浏览器不提交价格、Provider SKU 或权益期限。

## 3. Webhook Inbox

`billing_webhook_events` 是 hash-only 入站事实：

- Provider account；
- provider event key；
- SHA-256 payload hash；
- signature status；
- processing status；
- provider order number；
- timestamps/error code。

同一个 Provider event key 如果收到不同 payload hash，不覆盖原记录，而写 `billing_webhook_event_conflicts`。这能保留重复投递和冲突证据。

Webhook ACK 只代表事件被验证/持久化到可恢复边界，不代表订单已经结算或权益已经授予。

## 4. Afdian 协议

当前 Afdian 模式固定为：**Webhook + server-side API query-order**。

### API 请求签名

服务端使用 `AFDIAN_USER_ID` 与 `AFDIAN_API_TOKEN`：

```text
MD5(token + "params" + params + "ts" + timestamp + "user_id" + userId)
```

Token 不进入浏览器、URL、日志或仓库。

### Webhook 签名

标准订单 envelope 要求：

- `ec = 200`；
- `data.type = order`；
- `data.sign` 存在；
- 使用 RSA PKCS#1 v1.5 / SHA-256；
- 签名原文为 `out_trade_no + user_id + plan_id + total_amount` 的 UTF-8 拼接。

Webhook `status` 不在签名 canonical 内，不能作为 Inbox identity。event key 绑定订单号；payload hash 用于发现同订单不同事实冲突。

### Fail closed

Afdian API 非 2xx、网络错误、超时、响应格式异常统一返回 `temporarily_unavailable`。不能把“查询失败”猜成 `not_found`、`paid` 或 `success`。

Provider URL 在非明确 loopback 环境强制 HTTPS。

## 5. Billing Order

`public.billing_orders` 是中央订单读模型与处理事实，主要状态维度分开保存：

- `provider_status`；
- `verification_status: unverified | verified | rejected`；
- `entitlement_status: not_started | blocked | granted | rejected`；
- `linkage_status: unlinked | linked | ambiguous`；
- `resolution_status: open | resolved`；
- `admin_version` 供 Admin 并发控制。

此外保存 Provider order no、金额、币种、Provider facts、mapping version、paid/observed/resolved 时间等。

这些状态不能压成一个笼统的“订单状态”。例如 Provider `paid` 不等于内部 verified，也不等于 Grant 已成功。

## 6. Observation 与 Evidence

`billing_order_observations` append-only 保存每次可信 Provider 观察：

- job；
- provider status；
- provider contract version；
- source：webhook discovery / verification / settlement / reconciliation；
- provider facts；
- observed time。

Admin Evidence Timeline 应从这些事实和 Settlement/Audit 解释处理过程，而不是覆盖历史状态。

## 7. Settlement

`billing_settlements` 把“订单已观察”与“权益处理决定”分离：

- kind: `automatic | manual | correction`；
- state: `retryable | blocked | review_required | finalized`；
- operation ID；
- optional Grant；
- decision code/reason。

`finalized` 代表该 Settlement 已得到最终处理决定，不自动等价“成功收入”。decision code 可能表示 duplicate、unlinked、provider_not_paid、plan_conflict 等非授予结果。

只有满足平台、账户、Checkout snapshot、Provider mapping/价格事实和 Entitlement 冲突规则后，Settlement 才能形成 Billing source Grant。

## 8. Processing Jobs

`billing_processing_jobs` 状态：

`pending | processing | retryable | completed | manual_review`

job kind：

- `webhook_order_discovery`；
- `order_verification`；
- `settlement`；
- `reconciliation`。

记录 attempts、retry attempts、max attempts、lease owner/until、fence、error class/code、dead-letter/requeue 证据。

Maintenance 流程：

1. DB 事务 claim job/lease；
2. 提交事务；
3. 在事务外调用 Provider；
4. 新事务写 observation/decision；
5. 使用 fence finish/retry。

**任何 Provider 网络等待都不能持有数据库事务。**

## 9. Reconciliation 与告警

`billing_reconciliation_cursors` 为 discovery 和 processing 分开保存游标/high-water mark。不能用一个游标同时代表“发现到了哪里”和“处理到了哪里”。

私有控制表还包括：

- `billing_operational_alerts`；
- `billing_refund_observations`；
- `billing_cron_invocations`。

Admin metrics 同时关注队列年龄、lease、retry、manual review、refund observation、双游标、Cron HTTP/Worker 结果和告警送达。

## 10. 运行开关

四个开关独立：

- `BILLING_CHECKOUT_ENABLED`；
- `BILLING_WEBHOOK_INGRESS_ENABLED`；
- `BILLING_BACKGROUND_PROCESSING_ENABLED`；
- `BILLING_AUTO_SETTLEMENT_ENABLED`。

关闭 Checkout 不能误关已付款 Webhook；关闭自动 Settlement 不能删除积压 job。这些开关分别用于阻断不同风险面。

## 11. Hosted Cron 边界

`maintenance/schedule.json` 描述 billing-processing 每分钟、默认 limit=5，但普通 schedule metadata 本身不证明真实调度已安装。

Billing Hosted 路径另有 PostgreSQL cron/pg_net + Vault 设计和 `billing_cron_invocations` 观察；是否在真实 Hosted 环境完整运行必须以环境证据为准，不能因为 migration 存在就宣称 G-OPS 已通过。

## 12. Admin 操作

Global `/admin/billing/orders` 与 Platform billing workspace 复用相同订单工作台。支持：

- stable cursor/filter；
- detail/evidence；
- `If-Match` / admin version；
- requery；
- resolve；
- unknown outcome 恢复。

人工 requery/resolve 是高风险动作，需要 recent MFA、reason、operation ID，并由服务端授权。浏览器不直接改订单状态字段。

## 13. 退款与经营口径

当前系统没有实现“网站自动退款”产品承诺。Provider 的退款/拒付/逆向事实必须记录并进入人工/补偿处理，但普通退款请求不自动调用 Provider API，也不自动撤销已授予权益。

金额指标必须区分：

- Provider show/total amount；
- verified gross；
- compensated refund；
- net；
- unknown amount count。

不得仅按 `settlement.state=finalized` 或 `show_amount` 求和命名为收入。

## 14. 关键不变量

- Webhook 可重复，处理必须幂等。
- 同 event key 不同 payload 不能静默覆盖。
- Provider 网络失败不是业务否定事实。
- Checkout snapshot 永久解释历史交易。
- Order verification、linkage、entitlement、resolution 是不同维度。
- Job 使用 lease + fence，过期 worker 不能完成新状态。
- Payment success 只有通过 Settlement/Entitlement 边界才形成 Grant。

## 15. 验证入口

- `pnpm test:billing:webhook`
- `pnpm test:billing:jobs`
- `pnpm test:billing:jobs:integration`
- `pnpm test:billing:workers`
- `pnpm test:sql:billing-security`
- `pnpm test:sql:billing-ops`
- `pnpm test:sql:billing-settlement`
- `pnpm test:sql:billing-refund`
- `pnpm test:sql:billing-cron`

Local/fixture PASS 不等于真实 Provider、Vault、Cron 或 Production 已验收；环境结果必须单独记录。
