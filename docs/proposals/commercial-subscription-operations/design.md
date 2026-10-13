# OPT-010 全局商业治理与单平台订阅运营

状态：Completed

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md) · [预研架构](../optimization-intake/commercial-subscription-operations-architecture.md)

## 背景与最新事实基线

正式实施基线为 `main@a0e903731333cdddeb20361064d9e3557ef5bd84`。OPT-010 开始前已重新核对最新 Admin UI、Account/Admin API、Billing/Entitlement/Redemption migration、OpenAPI 与 OPT-009 Account 360，不直接照搬预研判断。

当前真实结构：

- `plans` 是平台权益定义；Admin Plan 页仍以 code/kind/status/features 为主，客户端筛选。
- `platform_subscription_config` 仍只能选择一个 `paid_plan_id`，并启用全局固定 `monthly/yearly/lifetime` 商品；Lifetime 是 99 年有限期权益，不是真正永久订阅。
- `subscription_products` 仍是全局固定 Free/Monthly/Yearly/Lifetime、CNY；`price_version` 随原行更新，不是不可变价格历史。
- Consumer `GET /v1/subscription/products` 仍读取固定商品，`POST /v1/subscription/checkout` 只接受 `product_code=monthly|yearly|lifetime`。
- Checkout 已把 `subscription_product_id` 与 `entitlement_plan_id` 分开并快照价格/期限/映射版本，因此可以 additive 引入 Offer/Price，而不重写权益账本。
- 权益权威链是 `subscription_grants + subscription_events + subscriptions`；最新 main 的 Grant 来源实际为 `billing_order | redemption_code | admin`，不是预研早期所述的仅 redemption/admin。
- `private.entitlement_recompute` 的 winning grant 规则是活动 Grant 按 `starts_at desc, created_at desc` 取最新；`subscriptions` 投影本身不保存 source，因此运营列表必须关联 winning grant 才能权威展示来源。
- Billing 已有稳定分页订单、Provider Mapping、Checkout、验证、Settlement、退款观察、人工 requery/resolve 与运行健康；全局页面仍主要是 Payment Operations，不是经营工作台。
- `billing_settlements.state='finalized'` 不等价于成功成交：人工 `refund_confirmed / closed_anomaly / manual_correction` 也能终结 settlement。任何商业金额必须进一步限定成功支付/授予事实并处理退款观察，不能只按 finalized 求和。
- Redemption 已有安全的 HMAC 单码、一次性明文交付、`unused/redeemed/disabled`、`redeemed_by_platform_account_id/redeemed_at`，但 Admin 列表只有 bounded limit，无 cursor/统计/兑换用户运营视图。
- OPT-009 Account 360 已提供账户上下文和 Billing 安全摘要；OPT-010 应补商业深链与统一权益治理，不复制第二套状态机。

本项横跨商业目录、Checkout 兼容、Billing 报表、权益治理、Admin UI、OpenAPI、真实浏览器与 staging，风险分级 **R3**。

## 目标

1. 将 Plan、Offer、Price、Provider Mapping、Grant、Order/Settlement、Redemption 明确分层。
2. 支持一个平台多个 Paid Plan，每个 Paid Plan 可关联多个有限期 Offer；新价格通过不可变 Price Version 发布。
3. Consumer 从固定 `product_code` 迁移到平台 Offer，同时保持现有 Monthly/Yearly/Lifetime 合同兼容。
4. 全局 Admin 建立“经营摘要 + 支付运行/异常治理”双层商业中心；单平台建立“商业概览 → 套餐 → 售卖方案/价格 → 权益用户 → 订单 → 兑换 Campaign”。
5. 将订阅页升级为服务端 stable cursor 的权益账户列表，权威展示当前 Plan、winning Grant 来源、开始/结束/下一边界，并保留 Admin Grant/Revoke/Pause/Resume/Correct。
6. 将 Redemption Batch 升级为 Campaign 运营视图，展示总量、已兑换、剩余、兑换率和脱敏单码/兑换用户明细，不恢复明文码。
7. 让 OPT-004 平台概览、OPT-006 接入向导、OPT-009 Account 360 使用同一商业事实和深链。

## 非目标

- 不宣称或实现真实 recurring Provider 生命周期；没有自动续费合同前不提供 cancel-at-period-end、past-due、renewal、MRR、ARR、churn。
- 不新增优惠券/促销码 Discount/Promotion 领域；Redemption 仍是权益 claim code。
- 首版不支持多币种；Offer Price 固定 `CNY`，多币种未来 additive 扩展。
- 不删除历史 `subscription_products`、旧 Checkout product_code、旧 Admin entitlement command；兼容消费者继续可工作。
- 不把 `show_amount`、Provider paid、verified、finalized 任一单一状态直接叫收入。
- 不把退款观察自动等价为财务退款完成；只在可证明的 compensated/confirmed 事实下做净额扣减。

## 领域分层

### Plan：权益包

`public.plans` 保持“用户获得什么能力”的权威定义，不承载价格、销售期限或 Provider SKU。允许多个 active paid Plan；已有 default free Plan 语义不变。

### Offer：售卖方式

新增 `public.platform_commercial_offers`：

- `id, platform_id, plan_id, code, name, description`
- `term_kind='finite'`
- `duration_value, duration_unit(day|month|year)`
- `status(draft|active|archived)`、`sort_order`、`recommended`
- `legacy_product_code` 可为空；仅 bootstrap 兼容 Offer 使用 `monthly|yearly|lifetime`
- `(platform_id, code)` 唯一；Offer 的 Plan/期限一旦被 Checkout/Grant 使用后不可原地改语义，只能归档并创建新 Offer。

### Price：不可变版本

新增 `public.platform_commercial_prices`：

- `id, platform_id, offer_id, version, amount, currency='CNY'`
- `status(draft|active|retired)`、`effective_from`、`created_at`
- `(offer_id, version)` 唯一；同 Offer 同时最多一个 active Price。
- Price 发布后 amount/currency/version 不可更新；调价创建下一版本，旧版本保留历史解释。

### Provider Mapping

保留 `billing_provider_products` 的旧 `subscription_product_id` 映射用于 legacy Checkout；additive 增加 `commercial_price_id`，新 Offer Checkout 必须解析到当前 active Price 的已验证 Provider Mapping。历史订单/Checkout 继续依赖自身 snapshot，不追随未来调价或 Mapping 切换。

### Grant / Subscription Projection

不重写现有 Ledger：

- Grant 来源固定为 `billing_order | redemption_code | admin`。
- `subscriptions` 继续只作为当前投影。
- 新读模型通过与 `entitlement_recompute` 相同 winning-grant 规则返回 `entitlement_source`、`grant_id`、Billing order / redemption batch 归因。
- Admin Grant 继续是 `source='admin'`，明确显示“手工/补偿权益”，绝不伪装成购买。

### Billing / Settlement

订单与 Settlement 状态机保持原权威。经营读模型只读聚合，不改变 Provider/Webhook/Job/reconciliation。

### Redemption Campaign

保留 `redemption_code_batches`/`redemption_codes` 安全模型。Campaign 是运营 read/write surface，而不是新 Secret 模型；单码页面只显示 prefix/suffix、status、redeemed account/time，不返回 HMAC 或明文。

## 兼容迁移

### Legacy 商品 bootstrap

迁移为每个已配置 `paid_plan_id` 的平台创建最多三个 active Offer：monthly/yearly/lifetime，并从当时 `subscription_products` 价格创建 Price v1。`legacy_product_code` 保留旧合同关联。

旧 `platform_subscription_config` 和 `subscription_products` 暂不删除。兼容规则：

- 旧 `GET /v1/subscription/products` 返回 legacy Offer 对应的现有 DTO。
- 旧 `POST /v1/subscription/checkout {product_code}` 解析该平台 `legacy_product_code` Offer。
- 新消费者使用 Offer-aware catalog 与 `offer_id` 创建 Checkout。
- 若平台还没有 migrated Offer，legacy 路径继续读取旧 config；迁移完成后两条路径必须指向同一 Plan/Price/Mapping 事实。

### Checkout snapshot

Checkout additive 增加 `commercial_offer_id/commercial_price_id`，继续快照：Plan、期限、price amount/currency、price version、Provider mapping version。历史 Checkout 不回填成未来价格。

## Consumer 合同

新增 additive 路径：

- `GET /v1/commerce/offers`：平台 active Offer + current active Price + purchasable/reason。
- `POST /v1/subscription/checkout`：body 允许 `offer_id`；兼容期仍允许 `product_code`，两者必须且只能提供一个。
- Checkout DTO additive 返回 `offer_id/offer_code/plan_id/plan_name/price_version`，保留旧 `product_code`（新非 legacy Offer 可为 null；OpenAPI 改为 nullable）。

服务端定价、Idempotency-Key、durable recovery、Provider URL、unknown outcome 语义保持不变。

## Admin 读模型

### Global Commerce Summary

新增 `private.admin_commerce_summary(ctx, platform_id?, from, to)`，返回：

- 有效 paid entitlement account 数（按当前 winning grant + paid Plan）。
- 期间成功 Billing Grant 数。
- 已最终成功结算毛额：仅 scope 已关联、`verification_status='verified'`、`entitlement_status='granted'`、settlement `state='finalized'` 且 `decision_code='granted'` 的 Billing order `total_amount`。
- 已补偿退款金额：仅已关联上述 order 且 refund observation `status='compensated'` 的 `refund_amount`。
- 净可核实成交额 = 毛额 - 已补偿退款额；缺 amount/currency 或 scope 时不进入金额统计，并单独计 `amount_unknown_count`。
- Admin Grant / Redemption Grant 数量分开展示，不计为购买金额。
- 即将到期 paid entitlement 数（默认 30 天窗口）。

这些指标命名固定为“可核实成交/已补偿退款/净可核实成交额”，**不称 Revenue/MRR/ARR**。

### Platform Entitlement List

新增稳定 `(updated_at desc, platform_account_id desc)` cursor 列表，服务端筛选：q/status/plan/source/ending_from/ending_to。一级投影 Profile、Account、Plan、winning Grant source、周期与下一边界；Auth email 不进入数据库搜索。

### Redemption Campaign v2

稳定 `(created_at desc,id desc)` cursor，服务端 q/status/plan/offer/date filters；聚合 `quantity/redeemed/unused/disabled/redemption_rate`。Campaign detail 分页读取脱敏单码状态、兑换账户 Profile/ID 与 redeemed_at。

## Admin 写入边界

### Offer / Price

- Offer create/update/archive 需要 AAL2；影响新购买可用性的 activate/archive、Price publish/retire、Provider Mapping 切换需要 recent-MFA + reason + idempotent operation id。
- 已被 Checkout/Redemption 使用的 Offer 不允许修改 Plan/term；Price publish 后不可编辑金额。
- Plan archive 必须 preflight：不能破坏 active Offer 或现存有效/future Grant 的解释。

### Entitlement governance

复用 `admin_entitlement_command`：grant/revoke/pause/resume/correct。UI 文案改为“手工/补偿权益”，全部要求 reason、operation id、recent-MFA；unknown outcome 不自动换 operation id。

### Redemption Campaign

创建 Campaign 可选择 `offer_id` 或直接 `plan_id + duration` 的 Admin-defined finite entitlement；首版 UI 默认选择 active Offer。一次性明文生成、delivery receipt、disable 语义不变。

## Admin 信息架构

### Global

`/admin/billing/orders` 升级为商业中心：

1. 经营摘要（可核实成交、退款、净额、付费权益账户、即将到期、来源分布）。
2. 原有 Payment Operations 健康/告警区，明确标记“支付运行”。
3. 跨平台订单工作台。

### Platform

平台商业区组织为：

- `/billing`：平台商业概览 + 订单。
- `/plans`：权益套餐 + Offer/Price 子视图/深链。
- `/subscriptions`：权益账户列表 + 单账户治理。
- `/redemption`：Campaign 列表 + Campaign detail。

导航不新增过多一级入口；现有四个入口语义升级即可。

## 与既有 OPT 集成

- OPT-004 Overview：商业卡改读同一 commerce summary，只有可证明金额才展示。
- OPT-006 Onboarding：商业 readiness 从“一个 paid_plan + fixed product”升级为 active paid Plan + active Offer/Price + valid Provider Mapping/Checkout；未启用付费仍是可选能力，不阻塞基础接入。
- OPT-009 Account 360：Subscription/Billing 摘要补 `entitlement_source` 和商业深链；治理动作复用同一 entitlement command。

## 安全、隐私与性能

- 新表强制 RLS，只允许 `domain_owner` 直接访问；Admin/Account 只通过固定 search_path 的 security-definer 函数。
- 新 cursor/filter 必须在 SQL 分页前执行；为 active price、offer status、subscription list、campaign stats 增加必要 covering indexes。
- 商业汇总使用有界时间范围（默认 30 天、最大 366 天），不得每次无界扫描全部 Billing 历史。
- Provider user/private id、Secret、HMAC 不进入商业 DTO。
- 金额统一 numeric string 输出，避免 JS 浮点聚合。

## 回退与迁移策略

- 全部 forward migration；不 destructive 修改历史订单、Grant 或 Redemption Secret。
- legacy fixed-product contract 在 OPT-010 内保留；新 Offer 路径可关闭而不影响旧 Consumer。
- 新 UI 出问题可回退到旧页面/API；新表和 snapshot 仍保持兼容。
- Price/Offer 一旦被历史事实引用，不通过 rollback 删除；只能 archive/retire + forward fix。

## 验收条件

1. 一个平台可以拥有多个 paid Plan，每个 Plan 可以有多个 active/archived Offer，Price 历史不可变。
2. 旧 Monthly/Yearly/Lifetime Consumer 合同继续通过；新 Offer catalog/checkout 可用且服务器定价。
3. Provider Mapping 能绑定新 Price，Checkout/Order/Grant 保持可追溯到 Offer/Price/Plan。
4. 全局/平台商业摘要不使用假收入口径；成功结算、退款、unknown amount 有明确证明与测试。
5. 权益账户列表 server-side cursor/filter，准确区分 billing_order/redemption_code/admin 来源。
6. Admin Grant/Revoke/Pause/Resume/Correct 保持 recent-MFA、reason、idempotency、unknown-outcome 恢复。
7. Redemption Campaign server-side cursor/filter + stats + 脱敏兑换明细；明文/HMAC 不泄露。
8. OPT-004/006/009 使用同一商业事实或深链，无重复算法。
9. fresh + non-empty upgrade、DB/API/OpenAPI/breaking、Admin unit/typecheck/build、Consumer/Admin browser、docs/lint/format、canonical R3 全绿。
10. 已授权 staging 的 migrations/Edge 同步并验证；Production 不属于本项默认发布目标，保持 NOT_RUN，除非另有正式生产授权。
11. GitHub task branch、PR/CI、main 与分支清理全部闭环后才标记 Completed。

## 已冻结取舍

- 多 Paid Plan：**是**。
- Offer/Price 第一版：**拆表并成为新商业目录权威；旧 fixed product 仅兼容**。
- 币种：**首版仅 CNY**。
- recurring：**未真实存在，不实现/不伪装**。
- 商业金额：**只展示可核实成功结算及已补偿退款推导的明确口径，不叫 Revenue**。
- Discount/Promotion：**不在首版范围**。

## 待确认项

无阻塞性产品决策。Provider 当前仍以 Afdian 合同为主，因此新 Price Mapping 第一版复用既有 provider mapping/validation 能力，不扩展新的支付 Provider。
