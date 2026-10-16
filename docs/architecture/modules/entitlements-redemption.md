# 权益、订阅投影与兑换架构

本模块负责“用户当前能使用什么”和“为什么拥有这些能力”。权威模型是不可变 Grant + append-only Event ledger；`subscriptions` 是当前投影，不是历史事实源。

## Requirements

本模块主要承担 [权益、订阅投影与兑换需求](../../spec/entitlements-redemption.md) `REQ-ENT-001` ～ `REQ-ENT-010`，并共同满足 `REQ-SYS-001`、`REQ-SYS-003` ～ `REQ-SYS-006`、`REQ-SYS-009`。

## 1. 领域对象

主要数据：

- `public.subscription_grants`；
- `public.subscription_events`；
- `public.subscription_grant_corrections`；
- `public.subscriptions`；
- `public.redemption_code_batches`；
- `public.redemption_codes`；
- `public.redemption_events`；
- `public.plans`（由 Commerce 定义）。

## 2. Grant 来源

当前 canonical `subscription_grants.source` 只有：

- `redemption_code`；
- `admin`；
- `billing_order`。

约束绑定 source 与业务 ID：

- redemption -> `redemption_code_id` 非空，operation ID 等于 code ID；
- billing -> `billing_order_id` 非空，operation ID 等于 order ID；
- admin -> 不伪造 redemption/order 归因。

Redemption 和 Billing Grant 必须有有限 `ends_at`；Admin 可在受控规则下创建永久 Grant。

## 3. Subscription Event Ledger

事件类型：

`granted | revoked | paused | resumed`

每个 Platform Account 的 event `sequence` 单调递增，在账户锁下分配。

- granted 引用 Grant；
- revoked 引用被撤销 Grant；
- paused/resumed 不引用 Grant；
- 原 Grant 的 starts/ends 不原地改写；
- 修正通过 revoke + replacement grant 表达。

`subscription_grant_corrections` 额外绑定 original/replacement grant、expected event sequence、operation ID 和 reason，确保修正形成可调查的替代链。

## 4. Projection

`public.subscriptions` 每账户一行当前付费投影：

- current plan；
- status `active | suspended`；
- started/current_period_end；
- next transition；
- last event sequence。

Free/none 不通过伪造 Grant 表达。读取时：

- 有有效 paid Grant -> paid entitlement；
- 无 paid Grant + default Free -> free；
- 无 default -> none；
- paused -> `effective_status=suspended` 且不返回可用 features。

到达 `next_transition_at` 边界时读取路径可在账户锁下同步重算，不能把正确性依赖 cron 是否准时。

## 5. 有效区间与冲突规则

统一使用数据库 UTC 时间，区间为 `[starts_at, ends_at)`。

- 同 Plan 的有限 Grant 可续接；
- 不同 Plan 的未结束/未来 Grant 构成冲突；
- 永久 Grant 阻止同 Plan 再续有限或重复永久；
- Free → Paid 不冲突；
- paid 到期后自动回退 Free/none；
- suspend 不冻结时钟；
- revoke 中间 Grant 不把后续 Grant 前移。

month/year 使用 UTC 日历加法，月末夹到目标月最后一天，2 月 29 日 +1 year 为次年 2 月 28 日。

### 99 年有限期商品与重复购买

当前历史上被称为 “Lifetime” 的销售商品在 canonical Commerce/Entitlement 模型中是 **99 年有限期 Offer**，不是 `ends_at = NULL` 的永久权益。真正的永久 Grant 仍只属于受控 Admin 授权，不从商品名称或 Provider 文案推断。

同一有限期 Plan 可以重复购买。每笔成功购买保留独立 Billing Order / Settlement / Grant，新的 Grant 从 `max(now, 同 Plan 所有未撤销有限 Grant 的 ends_at)` 之后继续顺延对应期限；因此重复购买 99 年商品会再顺延 99 年，而不是覆盖、合并删除或改写原 Grant。不同 Plan 的未结束/未来 Grant 继续按冲突规则拒绝，重复购买也不能把 99 年有限权益升级成永久权益。

## 6. Entitlement 读取

Consumer `GET /v1/subscription` 返回标准化 Entitlement：

- effective status；
- entitlement kind；
- Plan 安全摘要；
- features；
- start/end；
- evaluated time；
- next transition。

Consumer 受保护功能只能信任中央结果：

- `effective_status !== active` -> 拒绝；
- feature 只有严格 `true` 才放行；
- 上游不可用 -> fail closed；
- 不在 Consumer 本地计算到期、Plan 冲突或免费 fallback。

## 7. Admin Entitlement 治理

Admin 可以：

- grant；
- revoke；
- pause；
- resume；
- correct。

所有动作：

- 绑定目标 Platform Account；
- 要求 reason；
- 使用 operation ID；
- 写同一 ledger/audit；
- 不伪装成 Provider purchase；
- correction 在一个事务内形成 revoke + replacement。

UI 的 accepted/success/failure/unknown-outcome 必须保持区分。

### Platform Entitlement Directory

Admin 的平台级权益中心不是“输入一个 Account ID 才能查”的工具。`private.admin_commerce_entitlement_list` 提供服务端 cursor 目录，当前返回：

- Platform Account / User / display name / avatar / account status；
- Subscription status；
- 当前 Plan；
- winning Grant 与 `entitlement_source`；
- Billing Order / Redemption Batch 归因；
- Commercial Offer/Price 归因；
- start / current period end / next transition；
- account created / projection updated time。

筛选在 pagination 之前完成，当前支持 `q`、`status: active|suspended`、`plan_id`、`source: billing_order|redemption_code|admin`、`ending_from/ending_to`，limit 1–100。Cursor 绑定 `(account_created_at, platform_account_id)`，不能用浏览器当前页再做伪全量筛选。

Account 360 的“管理权益”入口和平台级 Entitlement Directory 必须继续复用同一 Admin entitlement command/correction domain，不形成第二套 Grant/Revoke 算法。

## 8. Redemption Batch

`redemption_code_batches` 保存：

- platform/plan；
- optional commercial offer；
- quantity 1–1000；
- duration snapshot；
- expires time；
- `pending_delivery | active | disabled`；
- delivery deadline/receipt/session/admin；
- creation operation/request hash。

批次创建后数量、期限、Plan/Offer 解释不能随意改变。

### Campaign 运营读模型

Admin Campaign list 由 `private.admin_redemption_campaign_list` 服务端聚合，而不是从已加载的 Code 页临时统计。当前列表包含：

- Batch / Plan / optional Offer；
- 名称与状态；
- quantity；
- `redeemed_count / unused_count / disabled_count`；
- `redemption_rate`；
- expires / delivery deadline / delivered / created time。

支持 query、status、Plan、Offer、created range 和 cursor pagination。Code 明细通过独立 `admin_redemption_campaign_codes` 分页读取，只返回 masked code、状态、redeemed account/display name/time 等安全字段，不恢复明文。

## 9. Code 安全

兑换码使用 31 字符安全集合与 rejection sampling 生成足够随机载荷。数据库只保存：

- HMAC-SHA256；
- key version；
- 少量 prefix/suffix 掩码；
- status；
- redeem account/time。

HMAC 输入包含 `platform_id`，防止同码跨平台解释。

旧 HMAC key 只 verify-only；没有明文码时无法重新哈希迁移。Secret 泄露时禁用相关未使用批次/码并重新发放。

## 10. 两阶段明文交付

创建 Batch：

1. Admin 请求生成，数据库创建 `pending_delivery` Batch/Codes；
2. 明文码只在创建进程内存和一次性 no-store 响应中出现；
3. Admin 保存后提交 delivery confirmation；
4. 服务端校验一次性 receipt/session/数量/deadline 后激活 Batch；
5. 超期未确认 Batch 不可兑换。

重放 batch create 只返回已存在 batch ID/状态，不恢复明文 code 或 receipt。同 operation ID 不同请求 hash 返回 idempotency conflict。

## 11. Redeem 事务

典型顺序：

```text
verify session/platform key
 -> idempotency claim
 -> lock platform account
 -> lock batch/code
 -> recheck account/batch/code/plan
 -> entitlement conflict rules
 -> create Grant + subscription event
 -> mark code redeemed
 -> recompute projection
 -> redemption event + audit
 -> finalize idempotency
 -> commit
```

失败业务拒绝可记录 rejected redemption event 和幂等结果；认证/限流在事务前拒绝，不占用业务幂等槽。

## 12. 限流

兑换固定窗口基线：

- 每账户每分钟 5 个新意图；
- 每平台每分钟 300 个新意图；
- 已完成同 key replay 不重复计数。

限流不可用时敏感写入 fail closed。

## 13. 并发与锁

权益写入统一遵循 Identity lifecycle / Platform / Key / idempotency / account / batch-code / plan / projection 的受控锁方向。锁内不做外部网络调用。

并发 Batch disable vs redeem 由锁和提交顺序决定：disable 先提交则兑换拒绝；兑换先提交则既有 Grant 保留，禁用不追溯撤销。

## 14. 商业与 Billing 的边界

- Commerce 定义 Plan/Offer/Price；
- Billing 验证 payment/order/settlement；
- Entitlement 模块是唯一 Grant/Event 写入权威；
- Billing 不直接通过更新 `subscriptions` 冒充权益；
- Redemption 不复用 Checkout/discount 模型。

## 15. 代码与测试

- SQL：canonical migration 的 subscription/redemption/private entitlement functions；
- HTTP：`supabase/functions/account-api/account.ts`；
- DTO/错误：`packages/domain`；
- Admin UI：subscriptions/redemption/plans 相关 feature；
- Billing source：`billing-settlement.md`。

重点测试：Free fallback、paid expiry、永久、不同 Plan 冲突、月末/闰年、pause/resume、revoke gap、并发 redeem、同 key replay/conflict、明文交付丢失、Batch disable race、Projection replay。
