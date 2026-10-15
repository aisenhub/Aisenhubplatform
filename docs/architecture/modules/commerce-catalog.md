# 商业目录架构

商业目录模块定义“卖什么、以什么期限卖、多少钱、映射到哪个 Provider 商品”。它不直接表示支付成功，也不直接授予权益。

## Requirements

本模块主要承担 [商业目录需求](../../spec/commerce-catalog.md) `REQ-COM-001` ～ `REQ-COM-007`，并共同满足 `REQ-SYS-001`、`REQ-SYS-004`、`REQ-SYS-006`、`REQ-SYS-009`。

## 1. Canonical 商业链

当前唯一商业主链：

```text
Plan
  ↓
Offer
  ↓
Immutable Price
  ↓
Provider Mapping
  ↓
Checkout snapshot
  ↓
Order / Settlement
  ↓
Grant
```

已经退出的 fixed `subscription_products`、`product_code` checkout fallback、legacy config 等兼容模型不得重新作为当前架构描述。

## 2. Plan：权益定义

`public.plans` 只回答“用户获得什么能力”：

- `platform_id`；
- `code / name / description`；
- `kind: free | paid`；
- `features: jsonb object`；
- `status: active | archived`。

Plan 不保存价格、Provider SKU 或销售期限。

每个平台可有一个 default Free Plan，通过 `platforms.default_plan_id` 引用。Free 权益是读取时 fallback，不写一条虚假的 Free Grant。

Plan archive 只阻止新销售/Grant；历史有效 Grant 继续能解释既有权益。Plan lifecycle 必须执行 Commerce/Grant/Redemption preflight，不能旁路删除或修改历史语义。

## 3. Offer：售卖方式

`public.platform_commercial_offers`：

- 绑定 `platform_id + plan_id`；
- `code / name / description`；
- `term_kind='finite'`；
- `duration_value`；
- `duration_unit: day | month | year`；
- `status: draft | active | archived`；
- `sort_order / recommended`；
- `row_version`。

当前 Offer 只支持有限期，不把“Lifetime”伪装为真正无限期 recurring subscription。

激活 Offer 前至少需要 active Price。archived Offer 不复活；改变已经被交易使用的售卖语义应创建新 Offer，而不是改写历史解释。

## 4. Price：不可变价格版本

`public.platform_commercial_prices`：

- `platform_id / offer_id`；
- 单调 `version`；
- `amount numeric(12,2)`；
- 当前只允许 `currency='CNY'`；
- `status: draft | active | retired`；
- `effective_from`；
- `row_version`。

发布新 Price 时，数据库在 Offer 锁下将旧 active Price 退休，再激活新版本。已发布 Price 的金额不原地改写；调价通过创建下一版本完成。

## 5. Provider Mapping

当前 Provider 商品映射表仍名为 `public.billing_provider_products`，但 canonical 归属是 **Commercial Price → Provider Product Facts**。

关键字段：

- `provider_account_id`；
- `platform_id`；
- `commercial_price_id`；
- `external_plan_id`；
- `product_type`；
- `external_sku_ids / sku_count`；
- `purchase_months`；
- expected show/total amount；
- currency / price version；
- `mapping_version`；
- `validation_status: unverified | verified | rejected`；
- `published / enabled`。

Published mapping 必须 verified。切换 mapping 时在同一 Provider Account + Commercial Price 范围内原子关闭旧 current mapping，再启用新 mapping。

Mapping 中的 expected amount/version 必须和目标 Price 一致，否则不可切换成 current。

## 6. Commerce Policy

`public.platform_commerce_policy` 独立保存：

- `purchases_paused`；
- 可选 subscription copy override；
- `row_version`。

`purchases_paused=true` 只阻止**新的 Checkout**。它不会：

- 取消已付款订单；
- 停止 Webhook；
- 撤销现有 Grant；
- 清空 Billing job。

这是支付控制平面重要的独立 kill switch。

## 7. Consumer 目录

公开目录：

- `GET /v1/plans`：展示 active Plan 的安全公共字段；
- `GET /v1/commerce/offers`：返回可购买 Offer/Price 和明确 purchasable reason。

公开目录不需要用户账户，但必须有有效 active Platform Key。读取目录不隐式激活用户。

不可购买场景要明确表达原因，例如：

- purchases paused；
- active Price 缺失；
- verified/current Provider Mapping 缺失；
- Plan/Offer 非 active。

不得为了 UI 演示返回假的 payment URL 或本地推断价格。

## 8. Checkout 边界

`POST /v1/subscription/checkout` 只接受 `offer_id` + `Idempotency-Key`。服务端在创建时冻结：

- entitlement Plan；
- Offer code/期限；
- Price amount/currency/version；
- Provider account/product/mapping version；
- Provider external plan/SKU/product type 等必要映射事实。

后续修改 Catalog 不改变既有 Checkout/Order 的历史解释。

Checkout 生命周期属于 [支付与结算](billing-settlement.md)；最终 Grant 属于 [权益与兑换](entitlements-redemption.md)。

## 9. Admin 控制面

Admin Platform 商业化主要能力：

- Plan list/create/commands；
- commerce policy read/update；
- Offer list/create/commands；
- Price create/publish/retire；
- Provider Mapping list/upsert/switch/disable；
- Commerce summary；
- Entitlement/Campaign 下钻。

高风险 lifecycle command 使用 operation ID + reason + admin idempotency claim/finalize，并写 Audit。价格、映射发布必须数据库串行化，不能依赖页面先查后写。

## 10. 经营指标边界

“价格”“订单显示金额”“Provider paid”“verified”“settlement finalized”不是同一个事实。

经营金额必须明确口径。`private.admin_commerce_summary` 当前按可选 Platform + 时间区间返回：

- active paid entitlement accounts；
- Billing / Admin / Redemption Grant count；
- `verified_gross_amount`；
- `compensated_refund_amount`；
- `net_verified_amount`；
- amount/refund amount unknown count；
- 30 天内即将到期的 paid entitlement accounts。

因此当前 Admin 可以展示这些**有明确定义的事实名称**；不能把任一原始订单金额直接命名为 revenue，也不能把 `settlement.state=finalized` 数量推导成成功收入。

系统目前不具备真实 recurring Provider 生命周期，因此架构中不承诺 MRR、ARR、churn、renewal rate、past-due 或 cancel-at-period-end。

### Cancel / Refund / Revoke 的领域分离

当前系统没有真实 recurring Billing Agreement，因此不存在可被诚实描述为“取消自动续费”的现行能力。未来即使引入 Provider recurring，也必须把三件事分开：

1. **Cancel Billing**：未来 Provider 扣款是否继续；
2. **Refund Payment**：钱是否退回；
3. **Revoke Entitlement**：访问权益是否立即失效。

当前已经落地的是 Refund observation/compensation 与 Entitlement revoke 的独立事实链；不能因为观察到退款就由 UI/adapter 自动删除 Grant，也不能把 Admin revoke 伪装为一笔退款或 Billing cancel。

## 11. 关键不变量

- Plan 决定权益，Offer 决定期限，Price 决定金额，Mapping 决定 Provider 对应关系。
- Price 发布后不原地改金额。
- Checkout 只引用 server-resolved current facts。
- 历史交易以 snapshot 解释，不追随未来 Catalog 修改。
- 没有 verified Provider Mapping 就不可购买。
- Admin 写路径必须通过 private domain function 和 Audit。

## 12. 实现与验证入口

- schema/functions：canonical migration 中 `plans`、`platform_commercial_*`、`billing_provider_products`、`platform_commerce_policy`；
- Account API：`account.ts` 的 plans/offers/checkout；
- Admin API：`admin.ts` commerce routes；
- UI：`apps/admin/features/plans`、billing/commerce 相关 panel；
- Provider/settlement：`billing-settlement.md`；
- Entitlement：`entitlements-redemption.md`。

必测：Price version 并发、mapping switch 并发、Offer activate preflight、Plan archive preflight、purchases pause、无 mapping checkout 拒绝、catalog 与 checkout snapshot 一致性。
