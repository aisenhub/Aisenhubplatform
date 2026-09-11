# Aisenhubplatform 统一用户、订阅与中央支付架构

> 文档状态：Proposed（已完成架构审查修订，尚未实施或完成支付联调）  
> 适用项目：Aisenhubplatform 及同一运营主体控制的自营 Consumer 平台  
> 核心目标：让新平台以最低成本接入统一账号、订阅、支付、兑换码和权益系统，而无需重复开发后台商业化能力。

---

## 1. 架构结论

Aisenhubplatform 当前已经具备中央共享身份、平台账户、权益和管理端。本次优化在既有共享后台上增加统一商业商品、中央支付与完整 Consumer 接入能力，目标定位为：

> **所有 Aisen 系列平台共享的中央 Control Plane（控制面）**。

它统一负责：

- 用户身份与平台账号
- Platform 管理
- Free / Pro 权益模型
- 四种订阅产品
- 订阅状态计算
- 权益 Grant / Event Ledger
- 爱发电支付
- 支付订单
- Webhook
- 支付对账与补偿
- 兑换码
- Admin 中央管理
- 审计与安全
- Consumer API / SDK
- 用户中心与订阅页参考模板

新开发的平台项目只负责：

- 自己的产品业务
- 自己的产品页面
- 品牌、Logo、主题
- 与自身功能相关的 Free / Pro feature 配置
- 接入 Aisenhub Account / Subscription API
- 参考或复用用户中心、订阅页等 Consumer UI 模板

**Admin 永远只有 Aisenhubplatform 中央这一套，不作为其他平台的模板。**


### 1.1 文档权威与实施边界

本文件是本轮订阅与中央支付优化的唯一目标设计来源；当前实现仍以源码、迁移和 [现行架构](../../architecture/overview.md)、[跨模块合同](../../reference/contracts.md) 为准。本文不是实施完成证明，也不自动授权开发、生产部署、真实付款或费用变更。

[配套实施计划](00-master-plan.md)已按本文同步；design.md仅引用本文件，不复制旧冻结项。计划采用BILL编号，历史文件名仅为稳定导航。后续目标决策先修本文，再同步阶段与验收，计划修订不代表功能已实现。

任务标识采用 BILL-ARCH-REVIEW；未来阶段使用 BILL-01 等独立编号，避免与已有文件/任务模块 M4 编号混淆。

---

## 2. 最终目标

新增一个平台后，理想流程应当是：

```text
创建 Platform
    ↓
生成 / 配置 Platform Key
    ↓
配置允许域名
    ↓
配置该平台 Free / Pro 权益能力
    ↓
接入统一 Account SDK
    ↓
参考用户中心 / 订阅页模板
    ↓
替换 Logo、主题和少量文案
    ↓
上线
```

新增平台时不再重复开发：

```text
用户系统
订阅状态算法
爱发电商品
支付订单
Webhook
支付回调
支付对账
兑换码
Admin 权益管理
订阅到期计算
订阅幂等
```

最终验收标准：

> **新增一个平台时，不修改 Aisenhubplatform 的核心后端、不增加新的爱发电 Webhook、不创建新的平台专属支付逻辑，即可快速接入完整用户和订阅系统。**

---

## 3. 系统边界

### 3.1 Aisenhubplatform：Central Control Plane

```text
┌─────────────────────────────────────┐
│          Aisenhubplatform           │
│                                     │
│ Identity                            │
│ Platform Accounts                   │
│ Entitlements                        │
│ Subscription Products               │
│ Billing                             │
│ Afdian                              │
│ Redemption                          │
│ Audit                               │
│ Admin                               │
│ Consumer API / SDK                  │
└──────────────────┬──────────────────┘
                   │
                   │ Account / Subscription API
                   │
      ┌────────────┼────────────┐
      │            │            │
      ▼            ▼            ▼
   AisenPDF    AisenImage    AisenXXX
      │            │            │
 Product UI    Product UI    Product UI
```

### 3.2 新平台项目：Consumer / Product Plane

新平台不拥有自己的订阅数据库和支付系统。

它只持有：

- Platform Key
- 当前登录用户 Token
- 自身业务数据库（如果需要）
- Aisenhub SDK
- Consumer UI 页面

平台通过 Aisenhub 获取：

- 当前账号
- 当前订阅
- 可购买商品
- Checkout URL
- 兑换码状态
- 权益 Feature


### 3.3 服务端与浏览器职责

Platform Key 只配置在 Consumer 服务端 SDK/BFF，不能进入浏览器 bundle、公开环境变量或客户端存储。浏览器经同源 BFF 调用中央 Account API；BFF 执行会话、Origin、CSRF 与 HTTP method 检查。共享 Global JWT 证明用户身份，不证明平台 audience；本期只接入同一运营主体的自营平台。外部第三方接入必须另行评审授权模型。

共享身份不等于跨域自动登录；各平台仍须配置 Auth 回调、会话与 allowlist，并显式执行既有账户激活流程。

---

## 4. 核心设计原则

### 4.1 Platform、Entitlement、Subscription Product、Payment 必须分层

四个概念不能混在同一张 Plan 表中。

| 概念 | 回答的问题 | 示例 |
|---|---|---|
| Platform | 权益属于哪个产品 | AisenPDF |
| Entitlement Plan | 用户能使用哪些能力 | Free / Pro |
| Subscription Product | 用户如何购买 Pro | Monthly / Yearly / Lifetime |
| Billing Provider Product | 支付渠道中的实际商品 | 爱发电 plan / SKU |

### 4.2 “月 / 年 / 99 年”不是三个不同权益等级

对于能力相同的付费用户：

```text
Monthly ─┐
Yearly  ─┼──> Pro Entitlement
Lifetime ┘
```

它们的区别只有：

- 价格
- 有效期
- 购买方式

而不是 Feature 权限。

因此每个平台通常只需要：

```text
Free Plan
Pro Plan
```

这样可以直接复用现有 Entitlement Ledger 的“同 Plan 顺延”能力，并避免：

```text
Monthly Plan -> Yearly Plan
```

被误认为是不同权益 Plan 而产生 `PLAN_CONFLICT`。

### 4.3 支付系统只产生“订单事实”，不能直接成为权益事实

系统必须保持以下四层事实：

```text
Subscription Product
        ↓
Billing Order
        ↓
Subscription Grant / Event Ledger
        ↓
Subscription Projection
```

分别表示：

1. **Catalog Truth**：卖什么
2. **Payment Truth**：用户实际支付了什么
3. **Entitlement Truth**：系统授予了什么权益
4. **Current State**：用户现在能使用什么

任何一层都不能通过猜测替代另一层。

---

## 5. 全局四种订阅产品

所有平台共享同一套商业产品：

```text
free
monthly
yearly
lifetime
```

当前默认价格可以统一配置为：

```text
Free      ¥0
Monthly   ¥9.9 / month
Yearly    ¥19.9 / year
Lifetime  ¥29.9 / 99 years
```

价格不应硬编码在 Consumer 页面中。

如果以后调整价格，只在中央 Subscription Product 中修改一次。

### 5.1 推荐数据表

```text
subscription_products
```

建议字段：

```text
id
code                    free | monthly | yearly | lifetime
name
term_kind               free | finite
duration_value          nullable
duration_unit           day | month | year | null
price_amount             numeric
currency                 CNY
status                   active | archived
recommended              boolean
sort_order
created_at
updated_at
```

必须保证：

```text
unique(code)
```

普通 Admin 不创建第五个标准订阅 Product。

固定合同：free 的 term_kind=free、duration_value/duration_unit=NULL；monthly 为 finite/1/month，yearly 为 finite/1/year，lifetime 为 finite/99/year。保留 lifetime 商品 code 与 lifetime_enabled 配置名，含义固定为 99 年有限期，不新增第五个商品、不用 perpetual 表示该商品。购买页、订单和订阅页显示“99 年套餐”及真实期限，不能仅显示“永久”或“永不过期”。商品时长不可由 Admin 修改，批次和 Checkout 均保存不可变时长快照。

---

## 6. Platform Subscription Config

全局商品定义购买合同，平台配置只决定该平台映射的权益和启用范围。

```text
platform_subscription_config
  platform_id                  primary key
  paid_plan_id
  monthly_enabled
  yearly_enabled
  lifetime_enabled
  subscription_copy_override
  created_at / updated_at
```

Free 的唯一来源继续使用现有 platforms.default_plan_id，不新增 free_plan_id。paid_plan_id 必须通过同平台复合外键关联 paid Plan，创建 Checkout 时还须验证 active。

迁移仅在平台恰好有一个 active paid Plan 时允许自动回填；零个或多个时保持未配置，关闭购买，等待管理员选择。不得猜测旧 Plan 的商业含义。

标准商品启用时不得归档其 paid Plan。切换 paid_plan_id 前必须检查未结束和未来排期 Grant、未结清订单及仍可能到账的旧 Checkout：不得把旧合同重新映射为新 Plan；需要停用新下单、排空旧交易或明确进入人工结算流程。存在不同 Plan 的未结束 Grant 时继续遵守 PLAN_CONFLICT。

Monthly / Yearly / Lifetime 都映射同一平台 Pro；商品共享不改变 platform_id 隔离。

---

## 7. 一次购买只授予一个平台权益

当前 V1 明确采用：

> **一个订单 = 一个 Platform Entitlement。**

例如：

```text
用户从 AisenPDF 发起 Yearly Checkout
    ↓
支付 ¥19.9
    ↓
只获得 AisenPDF Pro Yearly
```

不会自动获得：

```text
AisenImage Pro
AisenTranslate Pro
其他未来平台 Pro
```

未来如需推出：

```text
Aisen All Access
```

应另建 `suite` / `global entitlement scope`，不能让现有单平台订单隐式扩展为全平台权益。

---

## 8. 爱发电中央支付架构

如果所有平台：

- 价格一致
- 周期一致
- 结算主体一致
- 品牌归属于同一 Aisen 产品体系

则爱发电只维护一套。

推荐：

```text
Aisen 月度会员
Aisen 年度会员
Aisen 99 年会员
```

所有平台共同使用。

### 8.1 中央化结构

```text
AisenPDF ─────┐
AisenImage ───┼──> Aisenhub Billing ───> 同一个爱发电账户
AisenXXX ─────┘          │
                         │
                         ├── Monthly Product
                         ├── Yearly Product
                         └── Lifetime Product
```

爱发电只需要：

```text
1 个 Creator Account
1 套 API Token
1 个 Webhook
3 个付费商品
1 套订单同步逻辑
1 套支付对账逻辑
```

新增平台时无需重新配置爱发电。


### 8.2 Provider 能力验证门槛

“一个账户、三个商品、一个 Webhook”是待联调验证的目标拓扑，不是已核实的渠道能力。正式冻结 Adapter 前，必须核对当前开发者后台、官方协议与经授权的最小联调，保存协议来源、核验日期、版本或页面摘要及脱敏输入/输出。

必须验证：custom_order_id 的长度、字符、传递和查询回显；付款链接能否重复使用；月数和 SKU 数量；签名原文、算法、公钥可信来源及轮换；查询返回成功状态；折扣/渠道兑换/零元订单；调价后旧链接结算价格；延迟、重复回调及查询限流/分页/失败。不能用模拟 fixture 证明真实 Provider 支持这些能力。

官方参考：[爱发电开发者 API 与 Webhook](https://guide.afdian.com/creator/developer)。该公开页面描述 status=2、创建时间倒序分页及展示金额/实付金额差异，但不足以单独冻结当前签名与自定义订单参数合同。本轮未访问商户后台、未执行真实付款；以上联调状态均为 NOT_RUN。

---

## 9. Provider Account 与 Provider Product

虽然 V1 只有一个爱发电账户，数据库模型仍然建议支持未来多个 Provider Account。

### 9.1 `billing_provider_accounts`

```text
id
provider                 afdian
name
status
external_creator_id
secret_reference
webhook_public_key_version
created_at
updated_at
```

敏感 Token 不直接存普通业务配置表。

优先使用：

- Edge Secret
- Secret Manager
- 加密 Secret Reference

### 9.2 `billing_provider_products`

```text
id
provider_account_id
subscription_product_id
external_plan_id
product_type
external_sku_id
expected_show_amount
enabled
created_at
updated_at
```

映射关系：

```text
monthly  -> Afdian plan / sku A
yearly   -> Afdian plan / sku B
lifetime -> Afdian plan / sku C
```

Consumer 页面永远不保存这些外部 ID。


### 9.3 映射与调价发布

V1 仅激活一套 Provider Account。新 Checkout 必须同时满足商品 active、平台 enabled、映射 enabled，以及渠道映射价格与中央当前价格一致；不一致则拒绝新下单。映射保存版本及验证状态。

调价采用新价格/映射版本发布，旧版本只服务既有 Checkout 的验证。中央快照不能强迫 Provider 接受旧价格：若渠道不支持价格锁定，停止旧链接或将价差订单转人工处理，不能承诺改中央价格一次即可完成外部调价。

Checkout 的 snapshot 必须额外覆盖 product_type、SKU 集合及数量、购买月数、优惠接受策略和 mapping version；这些不得从最新配置补读。

---

## 10. Checkout Intent

站内正常购买必须先由 Aisenhub 创建 Checkout Intent；渠道直接付款仍可被发现并记录为 unlinked，但本期不自动认领。

用户不能直接根据页面硬编码拼爱发电 URL。

### 10.1 API

```text
POST /v1/subscription/checkout
```

请求：

```json
{
  "product_code": "yearly"
}
```

客户端不发送：

```text
platform_account_id
user_id
price
external_plan_id
```

这些必须由服务端根据：

```text
Bearer Token
X-Platform-Key
```

解析。

### 10.2 `billing_checkout_intents`

建议字段：

```text
id
platform_id
platform_account_id
subscription_product_id
entitlement_plan_id
provider_account_id
provider_product_id
public_token_hash
term_kind_snapshot
duration_value_snapshot
duration_unit_snapshot
price_amount_snapshot
currency_snapshot
external_plan_id_snapshot
external_sku_id_snapshot
status
expires_at
created_at
updated_at
```

### 10.3 Checkout Snapshot 是强制要求

必须保存下单当时：

- 商品
- 价格
- 周期
- Entitlement Plan
- Provider Product

例如：

```text
用户打开 Yearly ¥19.9
    ↓
创建 Checkout Intent
    ↓
管理员后来把全局价格改为 ¥29.9
    ↓
用户完成原支付
```

系统必须按 Checkout 创建时的 ¥19.9 合同判断，而不是按最新 ¥29.9 配置误判。


### 10.4 创建事务与响应重放

POST 必须带 Idempotency-Key；服务端以 platform/account/operation 组成 scope，规范化 product_code 计算 request_hash。同键同参数返回同一 Checkout，不同参数返回 IDEMPOTENCY_CONFLICT；重放前仍须重新鉴权。

短事务校验 session/platform/account active、未暂停、商品和映射可售、无冲突及未拥有未撤销同 Plan Admin 真永久 Grant，再写入不可变 snapshot、Token 派生版本、幂等结果和审计。Free 不创建 Checkout。

事务提交后构造 payment_url；幂等缓存只存 Checkout ID 与非敏感结果，不存包含 Token 的完整 URL。响应丢失时按第11节重建同一有效链接。重放始终返回当前权威状态：仅未确认付款且窗口已结束时显示 expired；paid/verified/granted 等状态不因时间到期回退。已确认付款、已结算或不允许付款时不再返回 payment_url；新的购买操作须新键。

---

## 11. custom_order_id 与可恢复支付链接

平台与账号信息不能明文或 Base64 编码进外部参数。目标采用带版本的不可猜 HMAC Token，解决“只存摘要但响应丢失后需要重建链接”的矛盾：

```text
token = AC_<key_version>_<base64url(HMAC-SHA256(
  dedicated_key[version],
  canonical_encode("aisen-checkout-v1", provider_account_id, checkout_id)
))>
```

checkout_id 使用安全随机 UUID；canonical_encode 必须无拼接歧义。完整摘要输出不截短，具体外部长度/字符限制经第8.2节验证后冻结。若渠道不支持，先修订协议决策，不能静默降低熵。

数据库保存 Token SHA-256 digest（唯一）、key_version 与不可变派生输入；密钥放受控 secrets，与兑换码/平台 Key 分离。服务端在已认证重放时重建同一 Token 和 payment_url；查询状态接口不返回 Token 或 digest。

旧派生密钥至少保留到相关付款窗口和允许的恢复窗口结束。密钥撤换不影响已返回 Token 通过 digest 关联迟到订单；已禁用或泄露密钥版本不得重新签发链接。密钥丢失时显式返回链接恢复不可用，禁止生成另一个 Token 覆盖原 digest。

Token 仅定位收款归属，不是支付成功证明；完整 Token、payment_url 不进入日志、审计、分析埋点或普通幂等缓存。替代方案可使用短期加密存储链接，但须另行修订本决策，不能同时维护两套权威恢复机制。

---

## 12. Checkout URL

支付 URL 必须由后端 Provider Adapter 构造。

Consumer 页面只接收：

```json
{
  "checkout_id": "...",
  "status": "pending",
  "payment_url": "https://...",
  "provider_display_name": "爱发电"
}
```

页面只负责：

```text
打开 payment_url
```

Consumer UI 不应该出现：

```text
afdian plan_id
sku
product_type
custom_order_id 生成逻辑
Afdian Token
```

这样以后增加：

```text
WeChat Pay
Alipay
Stripe
Paddle
App Store
```

Consumer UI 不需要重写。

---

## 13. Billing Order

爱发电成功付款后，第一事实不是直接修改 Subscription，而是写入标准化订单。

建议：

```text
billing_orders
```

字段：

```text
id
provider
provider_account_id
provider_order_no
checkout_intent_id
platform_id
platform_account_id
subscription_product_id
provider_user_id
provider_user_private_id
external_plan_id
external_sku_id
product_type
total_amount
show_amount
discount_amount_or_metadata
provider_status
verification_status
entitlement_status
received_at
verified_at
granted_at
created_at
updated_at
```

强制唯一：

```text
unique(provider_account_id, provider_order_no)
```

如果未来 Provider 的订单号全局唯一，也仍建议保留 provider account scope。


### 13.1 归属、处理与结案字段

真实订单无法匹配 Checkout 时仍入库，checkout/platform/account/product 允许同时为空，linkage_status=unlinked；不得猜测归属或授予权益。已关联时用复合外键同时绑定 platform、account、checkout 与 order，Grant 也绑定同账户订单，不能只验证“同平台”。

补充 provider_created_at、provider_paid_at（仅渠道权威提供时）、last_observed_at、verification_method、mapping_version、processing_attempts、next_attempt_at、last_error_code。渠道不提供的时间保持空，不用 received_at 冒充付款时间。

补充 resolution_status=open|resolved、resolution_reason、resolved_by、resolved_at 和相关审计。重复付款、already_perpetual、合同不匹配和生命周期阻塞必须有结案路径；人工确认退款只记录已完成的外部处理证据，不声称本系统已自动退款。

---

## 14. Webhook 边界

爱发电 Provider Ingress 应使用独立 Edge Function：

```text
supabase/functions/billing-webhook/index.ts
```

不要放入现有 Account API。

原因：

- Account API 是用户身份边界
- Webhook 是第三方 Provider 身份边界
- 鉴权方式不同
- 风险模型不同
- 限流方式不同
- 日志与审计要求不同

推荐入口：

```text
POST /webhooks/afdian
```

---

## 15. Webhook 接收与持久恢复

```text
bounded body / method / content-type 校验
    ↓
提取最小发现线索、计算摘要、验证可用签名
    ↓
短事务：持久化 Inbox + 可恢复处理任务
    ↓
提交成功后返回 Provider 成功 JSON
    ↓
Worker：事务外查询权威订单 / 验证来源
    ↓
短事务：订单合同验证 → 统一权益入口 → 结果与审计
```

确认接收成功只表示可恢复工作已持久化，不表示权益已到账。数据库写入失败不确认成功；格式错误不作为成功订单处理。有效重复通知确认既有持久结果，不重复调度无界任务。

若只保存 order_no 和摘要，必须先证明 query-order 能重建完整验证输入；否则短期加密保存必要白名单字段并明确 TTL，不能保存不可恢复的 hash 后就丢弃唯一输入。

任务包含状态、attempts、next_attempt_at、lease/fence、错误分类和人工处理状态。暂时故障退避重试，确定性拒绝转人工处理；持久任务复用现有数据库基础设施，不引入消息总线。无签名发现入口限流、按订单去重并限制 Provider 查询预算。成功响应格式以经验证的官方合同为准。

---

## 16. Webhook Inbox

建议增加：

```text
billing_webhook_events
```

字段：

```text
id
provider
provider_account_id
provider_event_key
payload_hash
signature_status
processing_status
provider_order_no
received_at
processed_at
error_code
```

不建议永久保存完整原始 Payload，尤其其中可能包含：

- 姓名
- 电话
- 地址
- Remark
- SKU 图片或其他无关内容

只保存业务必要字段和 Payload Hash。


Inbox 与处理任务的关系必须可恢复且同事务建立。事件精确去重不能抑制尚未完成任务的恢复。已验证订单归属不可被后续未验证 Payload 覆盖；重复或乱序观察只追加必要事实，禁止把 verified/granted 降级为 received/pending。

---

## 17. Webhook + API 双通道

不能把 Webhook 当作唯一支付事实来源。

架构定义：

```text
Webhook = Realtime Signal
Provider API = Verification / Reconciliation
Billing Order = Local Payment Truth
```

原因：

- Webhook 可能重复
- Webhook 可能延迟
- Webhook 可能暂时丢失
- Worker 可能执行到一半失败
- Provider 和本地网络可能短时异常

因此需要：

```text
afdian_order_reconcile
```

后台维护任务。

可复用当前 Maintenance 的：

- lease
- fencing
- job lock
- retry
- operation id

---

## 18. Afdian API Adapter

Provider 代码建议单独放置：

```text
supabase/functions/_shared/afdian.ts
```

职责：

```text
buildCheckoutUrl()
signApiRequest()
queryOrder()
verifyWebhookSignature()
normalizeOrder()
```

Provider Adapter **不能**负责：

```text
计算用户订阅到期时间
决定 Plan Conflict
直接写 Subscription Projection
```

这些属于 Entitlement Domain。

---

## 19. 订单合同验证与优惠策略

只有可信签名覆盖完整字段的订单，或经受控 Provider Account 查询取得的权威订单，才能进入验证。必须核对：

- success 状态、Provider Account 与订单号；
- custom_order_id digest 关联的 Checkout 及同平台同账户关系；
- snapshot 的 plan_id、product_type、完整 SKU 集合和数量、购买月数；
- 币种、show_amount、实付金额与优惠规则；
- snapshot 的期限、权益 Plan 和 mapping version。

show_amount 是展示/折扣前金额，不能单独证明满足本平台销售合同；total_amount 是实付事实。V1 默认仅自动接受实付与快照价格一致且无未批准渠道兑换的订单。折扣、redeem_id、零元订单只有在经过验证并写入 snapshot 的明确优惠策略下才能自动授权，其余保留真实付款事实并转人工处理。

金额在 API 中用十进制字符串，数据库用限定精度 numeric，并验证币种、范围和小数位；禁止 JS 浮点权威比较。数量不符不能简单按一期发放，也不能自行按实付除以单价推导期限。

本地 expired 不等于未付款。迟到真实订单继续按旧快照验证；渠道未锁价导致的价差转人工处理。用户页面不得把该情况显示为“未支付”。

---

## 20. Webhook 签名策略

架构上支持两层验证：

### 20.1 Provider Signature

如果 Provider Payload 提供官方签名：

```text
verify webhook signature
```

### 20.2 Query API Confirmation

如果签名能力缺失、版本不一致或存在兼容问题：

```text
Webhook 只作为“发现订单”的信号
        ↓
query-order API
        ↓
验证成功订单
        ↓
再授予权益
```

不要因为历史协议或 Provider 文档版本差异而把未经验证的 Webhook 直接升级为 Entitlement Truth。


V1 在当前签名合同尚未完成可信核验前，所有自动授权均要求 query-order 权威确认。签名失败事件记录为失败，最多仅以订单号作发现线索；查询后以 API 返回的完整事实独立验证，不合并未经验证的 Payload 字段。公钥不能来自请求体或任意外部 URL，不能对“签名存在”直接标记 verified。

---

## 21. 幂等模型

支付必须具备两层幂等。

### 21.1 Payment Layer

```text
unique(provider_account_id, provider_order_no)
```

保证：

```text
同一个爱发电订单
= 一条 billing_order
```

### 21.2 Entitlement Layer

扩展：

```text
subscription_grants.source
```

当前：

```text
admin
redemption_code
```

新增：

```text
billing_order
```

同时增加：

```text
billing_order_id
```

对于 Billing：

```text
source = billing_order
operation_id = billing_order.id
```

继续使用现有唯一约束思想：

```text
unique(platform_id, source, operation_id)
```

因此：

```text
Webhook 重发
Webhook 与 Reconcile 同时处理
Worker Crash 后重试
Provider API 重复返回
```

最终都只能产生一个 Grant。


### 21.3 Checkout 重复真实付款

同一 Provider Order 的重复通知与同一 Checkout 的第二笔付款是两种情况。V1 一个 Checkout 最多自动结算一笔符合合同的真实订单；以事务内锁定 Checkout 和唯一自动结算绑定保证。每一笔外部订单均独立留存，不能用 checkout_id 唯一约束阻止第二笔付款事实入库。

同 Checkout 的第二笔真实付款标记 duplicate_payment，进入人工结案，不再自动发 Grant。不同 Checkout 的正常有限续购继续顺延。不同 Checkout 并发购买 99 年套餐时，按普通有限续购在账户锁下串行顺延，两笔合规付款各授予 99 年；同 Checkout 重复款仍不得自动授予第二次。already_perpetual 仅适用于已有 Admin 真永久授权的账户，不用于拦截 99 年套餐续购。

订单即使没有产生 Grant，也必须保存不可重复的结算决定；撤销首笔 Grant 后重放旧订单不能重新发放。人工退款/转为有效续购必须是有原因、独立 operation_id、受控且可审计的命令，不直接改订单归属。

---

## 22. `subscription_grants` 强类型 Source

不使用：

```text
source_id text
```

这种泛化弱约束。

继续使用强类型 FK：

```text
admin
  -> redemption_code_id null
  -> billing_order_id null

redemption_code
  -> redemption_code_id not null
  -> billing_order_id null

billing_order
  -> billing_order_id not null
  -> redemption_code_id null
```

这样可以继续维持：

- Tenant Isolation
- Composite FK
- 强约束
- 可审计性

---

## 23. Monthly / Yearly 顺延规则

Monthly 和 Yearly 都映射到同一个平台 Pro Plan。

例如：

```text
Monthly:
2026-09-11 -> 2026-10-11

用户 2026-09-20 再购买 Yearly
```

不能从 09-20 开始覆盖剩余月订阅。

应当：

```text
Yearly starts_at = 2026-10-11
Yearly ends_at   = 2027-10-11
```

即：

```text
starts_at = max(now, max(active/future same-plan ends_at))
```

延续当前 Entitlement Ledger 的同 Plan stacking 规则。

---

## 24. Lifetime：99 年有限期套餐

商业 lifetime 商品采用 99 年有限期，term_kind=finite、duration_value=99、duration_unit=year。它与 monthly/yearly 使用同一 Plan 和同一有限期领域规则；不是 ends_at=NULL 的真永久，也不是固定截止到 2099 年。

授权 starts_at=max(DB now, 未撤销同 Plan 有限 Grant 的最大 ends_at)，ends_at=现有 UTC 日历加法(starts_at, 99, year)，必须为有限时间。沿用月末/闰年夹取规则，不用 99×365 天代替。例：现有权益结束于 2027-03-01T00:00:00Z，续购后的新增 Grant 为 [2027-03-01T00:00:00Z, 2126-03-01T00:00:00Z)。

### 24.1 续购、撤销与展示

已有当前或未来的 99 年 Grant 不阻止月/年/99 年续购与兑换，全部在同 Plan 尾部顺延；不同 Checkout 的两笔合规 99 年付款各增加 99 年，同 Checkout 第二笔真实款仍走 duplicate_payment 人工结案。结算读取可信快照并在账户锁下重算尾部，不能沿用 Checkout 创建时的到期时间。

撤销仅撤销目标 Grant，不改变其他历史或未来 Grant 的起止时间，也不自动压缩空档；这是现有有限期规则。通用撤销预览、审计修正和订单关联保留，但不新增商业永久起点提前的专用命令或专用替代链。需要修正时继续遵守通用原子 correction 合同。

API 返回 entitlement_kind=term 和真实 current_period_end；页面显示“99 年套餐”及实际到期日期，不能按 code=lifetime 或日期很远就改成 perpetual。到期后正常回退 Free/none。日期计算、序列化和页面须覆盖跨世纪、闰日与续购结果；超出支持日期范围应在领域事务内确定拒绝，不得溢出、写 NULL 或消费兑换码，已收款则进入可追踪人工处理。

### 24.2 现有 Admin 真永久兼容

已有 Admin 真永久授权仍以 ends_at=NULL 表达，保持现有首次授予限制、读取和撤销语义，不迁移为 99 年。已有未撤销同 Plan 真永久（含未来授权）仍阻止新 Checkout/兑换；到账后若出现该冲突，记录订单并进入 already_perpetual 人工结案。不同 Plan 冲突、暂停和生命周期校验继续保留。

商业 billing/redemption 入口只接受商品快照定义的有限时长，不能伪造 source 或 NULL 时长获得真永久。现有 Grant/旧批次按原事实解释，不反推或改写。第42节核心保留指唯一写入口与 Ledger 原则，Billing source、快照和权限扩展仍需实现。

---

## 25. Free 规则

Free 保持当前设计：

> **Free 是 fallback，不是一个 paid Grant。**

当用户不存在有效 Paid Grant 时：

```text
当前权益 = Platform Default Free Plan
```

不要创建：

```text
Free Subscription Grant
```

否则会污染 Paid Entitlement Ledger。

---

## 26. Redemption V2

兑换码不再让 Admin 任意选择：

```text
Plan + duration_value + duration_unit
```

而是改为：

```text
Subscription Product
```

即 Admin 创建：

```text
Monthly Code Batch
Yearly Code Batch
Lifetime Code Batch
```

### 26.1 Batch Snapshot

兑换码 Batch 创建时保存：

```text
subscription_product_id
entitlement_plan_id_snapshot
term_kind_snapshot
duration_value_snapshot
duration_unit_snapshot
quantity
expires_at
```

Batch 创建后不可修改其商业含义。

这样可以避免：

```text
人为创建一个“370 天 Yearly”
```

这类不一致。


### 26.2 历史兼容

旧批次保留原 plan/duration/HMAC 语义，继续只读展示及合法兑换，不反推或伪造 Subscription Product。新增批次通过 model_version 与不可变 snapshot 区分；新建标准批次使用 Product，旧码验证继续走对应历史版本。

保留现有两阶段交付、禁用不可复活、明文仅首次返回和原子消费规则。迁移必须保留成功兑换事件绑定同码同账户 Grant 的约束，不以 Free claim 为由放宽付费兑换约束。

---

## 27. Free Redemption Code 的范围

Free 是 fallback，不产生付费 Grant。本期没有独立邀请码/活动登记需求时，不实现 Free Code Batch，也不为四档展示而创造第五套业务效果；Admin 禁止创建 free 支付/兑换批次。

未来明确派发 free_claim 时，另定义 Claim 事实与一次性消费约束。不得为了使 grant_id 为空而放松现有“付费兑换成功必须关联 Grant”的完整性约束。四档商品展示不等于四种都必须支持支付和兑换。

---

## 28. Redemption Code 统一规范与迁移

源码事实：packages/domain/src/redemption.ts 当前 alphabet 为 ABCDEFGHJKMNPQRSTVWXYZ023456789，默认生成31个随机字符，长度参数允许16–128；现行权益文档的26位描述与源码不同。不得把字符集大小、随机长度与显示分组混为一谈。

本期默认继续生成31个随机字符，不为适应前端16位正则降低熵。Consumer/Admin 复用 Domain 的 normalize/validate/format，安全随机生成与 HMAC 材料留在服务端调用路径。显示可分组，但分隔符不是随机载荷。

历史验证必须保留旧 alphabet、HMAC domain separation、key version 与既有合法输入；任何新增分隔符归一化须明确无歧义且通过历史样例验证，不能重新计算数据库中的旧 HMAC。迁移前统计脱敏批次版本/长度分布并确认实际验证规则，不以文档描述替代数据事实。

后续如变更长度或 alphabet，必须版本化、计算随机熵、评审在线限流和批次数量，并同步 OpenAPI、Domain、UI、历史兼容用例及现行文档；旧16位合法码不能因新默认31位失效。

---

## 29. Consumer Subscription API

推荐固定为：

```text
GET  /v1/subscription
GET  /v1/subscription/products
POST /v1/subscription/checkout
GET  /v1/subscription/checkouts/:id
POST /v1/subscription/redeem
```

### 29.1 `GET /v1/subscription`

返回：

- 当前 Plan
- 当前 Status
- starts_at
- ends_at
- entitlement_kind（99 年授权为 term；仅 Admin 真永久为 perpetual），不新增含糊的 is_lifetime 判断
- Feature
- future scheduled entitlement（如有）

### 29.2 `GET /v1/subscription/products`

返回当前平台允许展示的：

```text
free
monthly
yearly
lifetime
```

以及：

- name
- price
- billing label
- recommended
- enabled
- platform-specific copy

### 29.3 `POST /v1/subscription/checkout`

创建 Checkout Intent。

### 29.4 `GET /v1/subscription/checkouts/:id`

返回第48节统一定义的用户状态、付款事实和权益处理结果；该节是状态枚举唯一来源。

### 29.5 `POST /v1/subscription/redeem`

保留现有兑换入口，但迁移到 Product-based Batch。


### 29.6 兼容合同

保留现有 GET /v1/plans 的权益 Plan 语义，商业价格只由新增 /v1/subscription/products 提供。Products 可支持未登录 Pricing，但平台凭据仍只由 BFF/服务端携带。

GET checkout 必须重新验证用户、平台及账户归属，不匹配返回404；仅查询本地状态，不触发无界 Provider 查询。状态 DTO 以第48节为准，包含付款事实、权益效果和人工处理提示，禁止 paid 被渲染为已授权。

Auth/个人权益和付款结果使用 no-store。实现时同步 OpenAPI、DTO、SDK、路由与消费者，不在本轮文档修订中宣称接口已存在。

---

## 30. Consumer SDK

所有新平台应优先接入 SDK，而不是自己手写分散 `fetch()`。

目标接口：

```ts
subscription.getCurrent()
subscription.listProducts()
subscription.createCheckout('yearly')
subscription.getCheckout(checkoutId)
subscription.redeem(code)
```

Account SDK 同样统一处理：

- Token
- Platform Key
- Error Contract
- Idempotency Key
- API Version

新平台前端不需要理解：

```text
Grant
Event
Projection
Afdian API
Webhook
Order Reconciliation
Provider Signature
```


### 30.1 运行时授权与故障策略

浏览器 features 只用于展示；受保护业务由 Consumer 服务端检查中央权益结果。SDK 不复制日历计算、Plan 冲突或配额写入算法。

V1 默认不缓存允许付费操作的授权结果：中央 API 超时/不可用时，付费操作返回可重试的服务不可用，不伪装为 Free、不继续无期限放行。无需权益授权的公开页面可继续提供。配额消费必须通过相应权威写入口，不能凭缓存剩余额度本地扣减。

未来若需要有限缓存，应先冻结每类操作风险策略、最大撤销/暂停延迟与失效机制。缓存键至少含 platform/account，TTL 不超过配置上限及 next_transition_at-now；不得沿用第48节之前的旧投影判断已到期权益。该缓存方案本期未授权实施。

---

## 31. Consumer 参考页面定位

`apps/template-preview` 的定位应升级为：

> **Aisenhub 官方 Consumer Integration Reference**

它不是另一套独立产品，而是开发新平台时的官方前端参考实现。

建议稳定保留：

```text
/account
/subscription
/settings
```

可选：

```text
/subscription/orders
/files
```

Auth 页面也可作为统一参考。

---

## 32. Subscription 页面结构

推荐保持简单：

### 32.1 当前权益

```text
当前方案

Pro · 年订阅
有效期至 2027-09-11
```

### 32.2 选择方案

```text
Free
Monthly
Yearly   [推荐]
Lifetime
```

### 32.3 激活码

```text
兑换码输入框
[兑换]
```

整个页面核心只保留：

```text
当前权益
购买
兑换
```

支付技术信息不暴露给普通用户。

---

## 33. 删除“我已完成支付”作为授权动作

用户不能自行声明支付成功。

支付后页面应该：

```text
等待支付结果

支付成功后权益将自动到账。
无需手动确认。

[检查到账状态]
```

“检查到账状态”调用：

```text
GET /v1/subscription/checkouts/:id
```

必要时服务端可触发：

```text
query-order
```

但前端绝不执行：

```text
点击“我已付款” -> 直接更新订阅
```

---

## 34. Consumer UI 不感知 Afdian

Consumer UI 只知道：

```text
payment_url
provider_display_name
checkout_status
```

不写：

```tsx
if (provider === 'afdian')
```

也不保存固定爱发电 URL。

这样支付渠道属于 Backend Capability，而不是前端实现细节。

---

## 35. Consumer 文案配置

价格和通用 Product 文案可以有全局默认。

平台只覆盖产品语义文案，例如：

```text
AisenPDF Pro
- 解锁高级 PDF 工具
- 更高文件限制

AisenImage Pro
- 高清导出
- 批量处理
```

建议：

```text
Global Subscription Product Copy
             ↓
Platform Override
             ↓
i18n
```

不要把平台特有卖点硬编码进中央 Product。

---

## 36. Admin 不是模板

Admin 只存在于：

```text
apps/admin
```

只有超级管理员使用。

所有平台通过同一个中央后台管理。

不存在：

```text
AisenPDF Admin
AisenImage Admin
AisenXXX Admin
```

中央 Admin 通过 Platform Selector 切换上下文。

---

## 37. Admin 导航建议

推荐长期结构：

```text
Platforms
Accounts
Subscriptions
Redemption
Billing
Security
Operations
```

### 37.1 Platforms

管理：

- Platform
- Domains
- Keys
- Free / Pro Entitlement Feature
- Subscription UI Override

### 37.2 Accounts

跨平台用户与平台账号。

### 37.3 Subscriptions

查看和管理：

- 当前 Projection
- Grants
- Events
- Pause / Resume
- Admin Grant
- Revoke / Correct

### 37.4 Redemption

管理：

- Product-based Batch
- Code Delivery
- Redeem Events

### 37.5 Billing

全局模块：

```text
Products
Provider Accounts
Provider Products
Checkouts
Orders
Webhook Events
Reconciliation
```

可按 Platform 筛选。

### 37.6 Security

- MFA / Step-up
- Keys
- Audit
- Sensitive Operation

### 37.7 Operations

- Maintenance Jobs
- Reconcile Jobs
- Failed Orders
- Webhook Health
- Provider Health

---

## 38. Plan 页面重新定位

当前 Admin 的 `Plans` 页面不再承担“月 / 年 / 99 年定价”的职责。

建议重命名概念为：

```text
Entitlements
```

或者：

```text
Access Plans
```

它只回答：

```text
Free 用户能做什么？
Pro 用户能做什么？
```

而不是：

```text
Monthly 多少钱？
Yearly 几个月？
Lifetime 多少钱？
```

这些属于中央 Subscription Product / Billing。

---

## 39. Billing Admin 页面

推荐中央 Billing 提供：

### Products

查看全局：

```text
Free
Monthly
Yearly
Lifetime
```

### Afdian

查看：

- Provider Account 状态
- API Health
- Webhook Health
- 最近成功事件
- 最近错误

### Orders

字段重点：

```text
Order No
Platform
Account
Product
Amount
Provider Status
Verification
Entitlement Effect
Source
Created At
```

### Checkouts

用于定位：

```text
用户发起了支付但没有到账
```

### Webhook Events

用于：

- Replay diagnosis
- Signature failure
- Unknown order
- Contract mismatch

### Reconciliation

显示：

- Last success
- Cursor / high-water mark
- Scanned Orders
- Newly Found Orders
- Failed Orders

---

## 40. Reconciliation：发现与处理分离

### 40.1 订单发现

Provider 创建时间倒序分页的 page 不是稳定游标。每轮从头部扫描最新订单，使用重叠范围，记录 candidate high-water；只有到达上一已提交发现边界且扫描范围的订单线索均已持久化，才能提交新的 discovery high-water。

分页上限触发时保存 continuation，但后续仍须分配头部扫描预算，避免历史积压阻塞新订单发现。页面移动允许重复，由外部订单唯一键去重；不能仅凭命中一个已知订单就宣称连续区间完整。

重叠范围外的迟到订单由周期性深度补扫与精确订单查询补偿。重叠窗口、深扫频率、每轮页数/调用预算在 Provider 限流验证后配置，并在上线前形成可量化的最大发现延迟目标。若 Provider 不提供稳定游标/时间范围，不能承诺有限分页绝不漏单。

### 40.2 本地处理恢复

独立扫描本地 verification pending、entitlement pending、可重试失败任务，通过 next_attempt_at + lease/fence 领取，再调用统一订单处理入口。订单一旦已发现，其验证/授权恢复不依赖再次出现在 Provider 分页中。

发现游标与业务处理进度分别持久化。持久化线索后授权失败不阻塞发现游标，但必须保留待处理工作；任务失败不能因游标推进而遗失。过期 lease 的旧 worker 不得更新游标或结算结果。

### 40.3 运行指标

分别记录 discovery_last_success_at、processing_last_success_at、oldest_pending_age、retryable_count、manual_review_count、扫描范围和 continuation。API 请求成功不等于对账完成，授权成功数量也不能替代扫描覆盖率。

---

## 41. 外部网络调用与数据库事务

继续遵守现有重要原则：

> **持有数据库事务 / Lock 时，不进行第三方网络请求。**

错误示例：

```text
BEGIN
LOCK ACCOUNT
CALL AFDIAN API
WAIT...
UPDATE GRANT
COMMIT
```

正确做法：

```text
Query Provider
    ↓
得到 Provider Fact
    ↓
进入短事务
    ↓
Normalize / Verify / Apply Entitlement
    ↓
Commit
```

---

## 42. Entitlement Ledger 保持核心不变

现有优秀设计继续保留：

```text
subscription_grants       immutable fact
subscription_events       append-only event
subscriptions             current projection
```

规则继续是：

- Grant 不原地修改
- Revoked / Paused / Resumed 记录 Event
- Projection 可重建
- DB Time 为权威时间
- Calendar Month / Calendar Year 为订阅时间语义
- Composite FK 保证 Tenant Isolation

Billing 只作为新的 Grant Source 接入现有 Ledger。

---

## 43. Platform Isolation

即使所有平台共享：

- 同一个 Supabase Auth
- 同一个 Billing
- 同一个 Afdian
- 同一个 Admin

权益仍必须由：

```text
platform_id
```

严格隔离。

任何支付授权必须最终绑定：

```text
platform_id
platform_account_id
```

不能只绑定 `user_id`。

同一个用户可以：

```text
AisenPDF = Lifetime
AisenImage = Free
AisenXXX = Yearly
```

这必须是完全合法状态。


### 43.1 生命周期与付款竞态

付款来源不获得恢复账号、绕过暂停或创建账号的特权。Checkout 创建和付款授予都须在事务内重新检查当前生命周期，并沿用 identity → platform → account 等既有锁方向；新增 Checkout/order 锁的准确顺序必须在实施合同中统一，禁止 Webhook 与 Admin 反向加锁。

| 付款期间变化 | 订单处理 | 权益处理 |
|---|---|---|
| account suspended / 权益 paused | 保存权威付款，标记 lifecycle_blocked | 不自动恢复；获授权恢复后可重试 |
| account closed / 删除处理中 | 保存最小付款事实，人工处理 | 不自动激活、不创建替代账号 |
| platform disabled | 保存付款，标记阻塞 | 不绕过平台停用 |
| Plan 归档 / 映射改变 | 按原 snapshot 验证并记录 | 不映射到新 Plan；冲突转人工处理 |
| Checkout 本地过期后真实到账 | 保留并按旧 snapshot 验证 | 生命周期允许且合同满足时可结算 |
| 身份已清除后历史通知 | 通过保留订单去重或进入未关联人工处理 | 不重新关联新身份、不自动发 Grant |

新增 Billing 表、复合 FK、保留与脱敏必须纳入现有删除/恢复任务。财务事实保留与用户资料清除分别建模；需要保留的最小匿名关联不能被 Auth 删除级联抹除，也不能用未经评审的 RESTRICT FK 卡住删除流程。具体保留期、tombstone/脱敏结构和已有 Ledger 清理兼容须作为迁移前门槛，不能编造已通过生产验证。

---

## 44. Account Context 安全边界

Consumer API 继续坚持：

客户端不能指定：

```text
platform_account_id
```

正确流程：

```text
Bearer Token
+
X-Platform-Key
    ↓
Backend
    ↓
resolve user
resolve platform
resolve platform_account
```

Checkout / Redeem / Subscription Read 全部基于服务端解析结果。

---

## 45. Provider Identity

Afdian 的：

```text
user_id
user_private_id
```

只能作为支付平台身份。

不能替代：

```text
Supabase User
Platform Account
```

未来如需 OAuth，可增加：

```text
billing_external_identities
```

例如：

```text
provider
provider_account_id
provider_user_id
provider_user_private_id
user_id
linked_at
```

用于：

- 历史订单 Claim
- 从爱发电直接购买后的账号绑定
- 找回订单

OAuth 不是正常 Checkout V1 的前置条件。

---

## 46. Privacy

只保存 Billing 所需数据。

不要长期存储：

- Shipping Name
- Phone
- Address
- 无业务价值 Remark
- Provider 原始完整 Payload

不要写入普通日志：

- API Token
- Redemption Code 明文
- custom_order_id 明文
- Access Token
- 个人敏感信息

推荐保存：

```text
provider_order_no
provider_user_id / private_id（如确有业务需要）
amount
product mapping
payload_hash
verification result
```


支付 URL 含关联 Token，按敏感数据处理；返回 no-store，不记录到日志/埋点/错误上下文。必要恢复白名单数据仅短期加密保留，明确清理任务与访问角色；长期只保留结算所需规范化事实。保留期限应与现有生命周期合同一起批准，不在本提案虚构法定年限。

---

## 47. Observability

中央 Billing 至少应有以下指标：

```text
checkout_created_total
checkout_expired_total
webhook_received_total
webhook_signature_failed_total
billing_order_verified_total
billing_order_rejected_total
entitlement_grant_success_total
entitlement_grant_failed_total
reconcile_orders_found_total
reconcile_last_success_at
```

关键错误必须支持按：

```text
provider_order_no
checkout_id
platform_id
platform_account_id
```

定位。


另增加 duplicate_payment_total、manual_review_open_count、oldest_pending_age、processing_retry_total、discovery_last_success_at、processing_last_success_at。对发现中断、长期未授权和人工待处理分别告警；阈值与责任人是上线门槛。仅有 received_total 增长不能证明到账健康。

---

## 48. 支付、权益与用户状态合同

订单分别保存 payment/provider status、verification status、entitlement status、resolution status，不用一个 status 承担全部含义。

Checkout 用户状态由持久事实派生：

| 状态 | 含义 | 允许的后续 |
|---|---|---|
| pending | 尚无权威成功付款 | expired / paid / review_required |
| expired | 站内付款窗口结束 | 迟到真实付款可转 paid |
| paid | 已确认付款，验证或授权未完成 | verified / review_required |
| verified | 合同验证通过，待授权 | granted / review_required |
| granted | 原结算已成功授权 | 保留历史成功；撤销另显示权益结果 |
| review_required | 已付款但重复、冲突、生命周期阻塞或合同异常 | 受控重试 / resolved |
| resolved | 人工处理已结案 | 展示具体处理原因 |

签名失败只是事件事实，不直接使已成功 Checkout 失败。暂时网络故障保留待处理状态和重试信息，不终结为“未付款”。已有 Admin 真永久授权导致的 already_perpetual 属于无新增权益效果且需要结案，不等同 granted。

同 Checkout 多订单时以既有成功结算为主状态，额外展示 duplicate_payment 问题，不能让第二笔异常订单覆盖首笔 granted。订单状态升级与结算决定必须在锁和唯一约束下完成；Grant/Event/Projection、订单权益效果、审计同事务提交。

---

## 49. Refund / Reversal

在 Provider 没有稳定、权威的自动退款事件契约前：

V1 不自行推断退款。

退款处理：

```text
超级管理员确认
    ↓
Admin Revoke
    ↓
Append subscription_event = revoked
```

不能删除原始 Billing Order 或 Grant。

未来如果 Provider 支持可靠 Refund / Reversal Event：

```text
Billing reversal
    ↓
find original billing_order
    ↓
find original grant
    ↓
append revoked event
```

仍不修改历史 Grant。


人工撤销前必须展示对未来排期的影响，包括第24节普通有限授权撤销造成的空档。Admin Revoke 仅撤销权益，不等于渠道已退款；退款确认、金额/币种、外部处理参考和结案原因独立记录且脱敏。保留原订单的已结算决定，避免通知重放后再次授权。

---

## 50. 推荐代码组织

### Domain

```text
packages/domain/src/subscription-products.ts
packages/domain/src/billing.ts
packages/domain/src/redemption.ts
packages/domain/src/entitlements.ts
```

Domain 保持：

- Pure
- 无网络请求
- Edge compatible
- 校验 / 类型 / 规则集中

### Edge Shared

```text
supabase/functions/_shared/billing.ts
supabase/functions/_shared/afdian.ts
```

### Edge Functions

```text
supabase/functions/account-api
supabase/functions/billing-webhook
supabase/functions/maintenance
```

其中：

```text
account-api
  -> Consumer Checkout / Subscription

billing-webhook
  -> Provider Ingress

maintenance
  -> Provider Reconciliation
```


Domain 的“规则集中”仅指 DTO、输入校验与序列化；生产期限计算、并发冲突、配额和授权效果仍唯一位于 PostgreSQL private 领域过程。billing webhook executor 仅授予受控接收/处理入口，不直接授予 entitlement_apply 或基础表任意写权限；用户、Admin、job 身份边界分别验证。

---

## 51. 实施阶段与依赖门槛

本节为 Proposed 计划，不代表已获功能开发或生产操作授权。使用独立 BILL 编号，不复用现有文件模块 M4 编号。

| 阶段 | 范围 | 依赖与验收门槛 |
|---|---|---|
| BILL-01 | 同步唯一设计、Provider 合同与决策 | 先交付G-DEV；第8.2节真实证据作为G-PROVIDER独立跟踪，联调须实际授权 |
| BILL-02 | Catalog、平台映射、公共合同 | G-DEV通过；固定商品/期限、Free单源、旧Plan映射策略；真实购买未就绪保持关闭 |
| BILL-03 | Ledger 扩展与 Redemption V2 | 历史批次/码兼容、99 年有限期顺延和撤销、source FK、生命周期与权限矩阵 |
| BILL-04 | Checkout、Token 恢复、订单、Inbox 和任务 | 幂等重放能恢复 URL；持久接收与最小权限；重复付款结算约束 |
| BILL-05 | Provider 接入、统一订单处理、对账 | 权威验证、优惠策略、并发/崩溃恢复、双进度对账和人工结案闭环 |
| BILL-06 | Admin、SDK、Consumer | no-store、BFF Key 边界、服务端授权、故障策略、状态展示、价格 API |
| BILL-07 | 完整验收、文档同步与发布准备 | 合同/本地运行/真实 Provider 证据分别报告；生产部署另行授权 |

每阶段明确变更目录、领域入口、OpenAPI/DTO 消费者、权限/锁顺序和失败用例。修改公共合同须同步代码、SDK 与测试；迁移追加生成，不改旧生产迁移。Supabase 实施时再按技能要求核对当前官方文档与仓库固定 CLI 版本，不在此编造迁移时间戳。

OAuth、历史订单 Claim、更多 Provider、自动退款、suite、Free claim 与授权缓存均不属于本期实施范围。

---

## 52. 验收矩阵

以下均为待实施验收要求，不是本轮测试结果。

| 领域 | 必须保留的用例与预期 |
|---|---|
| Checkout 重放 | DB 已提交但响应丢失；同键重试恢复同 Checkout/有效 URL；异参数冲突；过期不再签发付款链接 |
| Token 生命周期 | key version 轮换、旧链接迟到付款、密钥缺失恢复失败；日志/缓存无完整 Token/URL |
| 通知幂等 | exact replay、不同 payload、Webhook 与对账并发；同 order 一次结算且最多一个 Grant |
| 重复付款 | 同 Checkout 两个 order_no、不同 Checkout 并发 99 年付款；同 Checkout 仅一笔自动结算，不同 Checkout 合规付款分别顺延 |
| 撤销后重放 | Grant 被撤销后旧通知重放不得再次授权；已无 Grant 的处理决定也保持幂等 |
| 可信验证 | 无签名、错误签名、API 查无订单、错误 Provider Account；未验证字段不得污染已验证事实 |
| 商品合同 | 错误 plan/type/SKU/count/month、币种/精度、零元/折扣/渠道兑换；只接受 snapshot 批准规则 |
| 调价 | 中央/渠道配置不一致禁止新下单；旧快照保留；渠道旧链接价差进入人工处理 |
| Inbox 恢复 | 接收提交前失败不 ACK；ACK 后 worker 崩溃任务可恢复；只存摘要时仍可查回足够事实 |
| 对账发现 | 分页新增订单、page cap、中断续扫、旧订单迟到；头部预算与历史补扫均执行 |
| 对账处理 | high-water 推进后旧授权失败仍重试；过期 fence 不得写游标/结算；扫描成功不冒充处理成功 |
| 权益 | 月→年同 Plan 顺延；UTC 月末/闰年；有限→99 年、99 年→月/年/99 年顺延；真实截止日期、到期回退、前置撤销空档和通用受控 correction |
| 生命周期 | Checkout 后 pause/close/delete/归档/停平台；记录付款但不恢复账号；删除后通知不创建新身份 |
| 数据约束 | 跨平台及同平台跨账户非法 FK；Billing 新表不阻塞既有合法清理/恢复流程 |
| Redemption | 旧批次原语义可兑换；历史16–128合法长度兼容；新默认31位；HMAC 与交付/消费不变 |
| API/Consumer | 旧 plans 语义保留、价格无硬编码、他人 checkout 404、Key 不入浏览器、状态不误报到账 |
| 运行故障 | 中央不可用时付费操作可重试拒绝；不伪装 Free；暂停/到期不被旧展示状态绕过 |
| Privacy/结案 | 含 PII fixture 不进入永久数据/日志；重复款和冲突可追踪处理人/原因；撤权益不冒充退款 |

验证报告严格区分静态检查、本地实际运行、Provider 真实联调、生产观察；未执行写 NOT_RUN。模拟 Provider 测试不能替代渠道能力验证。

---

## 53. 新平台标准接入清单

未来新增平台只需要：

### Central Admin

```text
1. Create Platform
2. Configure Domains
3. Generate Platform Key
4. Configure Free Entitlement Features
5. Configure Pro Entitlement Features
6. Enable Monthly / Yearly / Lifetime
7. Optional Consumer Copy Override
```

### Consumer Project

```text
1. Install Account SDK
2. Configure API Base URL
3. Configure Platform Key
4. Integrate Auth
5. Integrate Account Page
6. Integrate Subscription Page
7. Gate Product Features using entitlement.features
```

不需要：

```text
创建爱发电商品
创建 Webhook
配置 Token
增加 Payment Table
实现 Subscription Algorithm
实现 Redemption Backend
实现 Admin
```


接入前还须完成服务端 BFF/SDK 密钥配置、Auth allowlist 与回调校验、明确账户激活、产品服务端授权及中央故障用例。仅接入页面或在浏览器判断 features 不构成完整验收。

---

## 54. Reference Template 的成功标准

用户页面模板应做到：

### Account Page

只依赖标准 Account API。

### Subscription Page

只依赖：

```text
subscription.getCurrent()
subscription.listProducts()
subscription.createCheckout()
subscription.getCheckout()
subscription.redeem()
```

### Branding

允许替换：

```text
Logo
Product Name
Theme
Platform-specific Feature Copy
```

但不复制商业逻辑。

---

## 55. 最终架构图

```text
                              ┌────────────────────────────┐
                              │       Aisenhub Admin       │
                              │   Super Admin Only         │
                              └──────────────┬─────────────┘
                                             │
                                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                        Aisenhubplatform                            │
│                                                                    │
│  Identity / Platform Account                                      │
│             │                                                      │
│             ├────────────> Entitlement Plans (Free / Pro)          │
│             │                         │                            │
│             │                         ▼                            │
│             │                Subscription Ledger                   │
│             │             Grants / Events / Projection             │
│             │                         ▲                            │
│             │                         │                            │
│             │      ┌──────────────────┴─────────────────┐          │
│             │      │                                    │          │
│             ▼      ▼                                    ▼          │
│      Redemption Codes                           Billing Orders      │
│                                                       ▲             │
│                                                       │             │
│ Subscription Products                                │             │
│ Free / Monthly / Yearly / Lifetime                   │             │
│             │                                         │             │
│             ▼                                         │             │
│       Checkout Intent                                 │             │
│             │                                         │             │
│             ▼                                         │             │
│        Afdian Adapter ────────────────> Afdian Webhook/API          │
│                                                                    │
│ Consumer Account / Subscription API + SDK                          │
└───────────────────────────┬────────────────────────────────────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
          AisenPDF      AisenImage      AisenXXX
             │              │              │
         Product UI     Product UI     Product UI
             │              │              │
      Reference Account / Subscription UI Templates
```

---

## 56. 最重要的架构决策摘要

1. **Aisenhubplatform 是中央 Control Plane，不是每个平台复制一份的后台模板。**
2. **Admin 是唯一中央超级管理员后台，不向其他平台复制。**
3. **其他平台只参考 / 复用用户中心、订阅页等 Consumer 页面。**
4. **所有平台共享 Free / Monthly / Yearly / Lifetime 四种 Subscription Product。**
5. **Monthly / Yearly / Lifetime 都授予目标平台同一个 Pro Entitlement Plan。**
6. **价格全局统一时，爱发电完全中央化。**
7. **所有平台共享一个爱发电账户、一套 Token、一个 Webhook、三个付费商品。**
8. **Platform 区分通过服务端 Checkout Intent，而不是爱发电商品本身。**
9. **custom_order_id 使用带版本、可重建的不可猜 HMAC Token；数据库仅保存摘要与派生元数据。**
10. **每笔允许自动结算的付款最多授予一个 Platform 的权益；重复款和未关联订单不自动授权。**
11. **支付先成为 Billing Order，再通过 Entitlement Ledger 授权。**
12. **Webhook + Provider API Reconciliation 双通道。**
13. **Billing Order 和 Entitlement Apply 都必须幂等。**
14. **Lifetime 固定为 finite/99/year，复用有限期顺延、撤销和到期回退；不再设计商业永久起点修正。Admin 真永久保持兼容，通用审计修正仍保留。**
15. **Free 是 fallback，不创建 Paid Grant。**
16. **新兑换批次采用 Subscription Product + Snapshot，历史批次与已发码保留原验证语义。**
17. **Consumer UI 不知道 Afdian，只知道 `payment_url` 和 Checkout Status。**
18. **新增 Provider 复用 Ledger；不同结算/退款/续费语义仍须评审合同，不能承诺只加 Adapter 即可。**
19. **新增平台时无需创建新的爱发电商品、Webhook 或支付数据库。**
20. **新平台的目标是“注册为 Platform Consumer”，而不是重新搭建一套 SaaS 用户与订阅后台。**

---

## 57. 架构最终目标

当这套架构完成后，Aisenhubplatform 应当具备这样的能力：

> 开发一个新的 Aisen 平台时，只需要创建 Platform、配置 Free / Pro 权益、接入 Account SDK、参考用户与订阅 UI 模板，即可立即拥有统一登录、用户中心、四档订阅、中央爱发电支付、自动到账、兑换码和中央 Admin 管理能力。

后续无论新增：

```text
AisenPDF
AisenImage
AisenVideo
AisenTranslate
AisenCode
...
```

都不再重新设计用户系统、订阅系统和支付系统。

本次优化将在现有共享后台基础上补齐商业化闭环，形成：

> **Aisen 全产品体系的统一 Identity、Entitlement、Subscription 与 Billing Control Plane。**

---

## 58. 实施合同补充：恢复、修正与运行门槛

### 58.1 长期Checkout操作绑定

现有普通幂等响应最多保留7天，不能承担长期交易身份。Checkout另保留scope/key（或不可逆摘要）、request_hash、checkout_id绑定，至少随Checkout及明确交易去重周期保留；普通缓存清理后同键仍定位原Checkout，异参数仍冲突。清理/身份删除使用经评审的匿名保留，不让旧身份重新获得访问权。

### 58.2 处理结果分类

暂时故障/可恢复暂停属于retryable/blocked，可以恢复后受控重试；重复付款、合同冲突、关闭删除属于review_required；已授权或经受控结案属于finalized。无Grant不等于永久终态。finalized不得被后台重试复活，必要修正须新的审计补偿操作。

### 58.3 原结算与替代授权

同订单最多一次原始结算和原始billing Grant。correction使用独立operation_id，记录原始结算、被替代Grant和替代Grant；保证同一授权链仅一个当前有效替代，撤销/新增/审计原子完成。不能把新UUID当重复原结算绕过唯一性。退款或后续撤销沿链定位当前有效替代，不永远只操作已撤销原Grant。

重复款转有效续购必须是显式人工结算，保留原重复付款问题与处理决定，不占第二个自动结算槽位，不修改原归属/snapshot。

### 58.4 Plan切换与外链边界

仍可兑换旧Plan批次阻止标准paid_plan切换；须过期或经授权禁用未使用批次，已用权益不追回，不重映射旧码。与未结订单、旧Checkout和未结束Grant一起在共同锁下预检。

本地不再签发URL不等于已打开的渠道链接失效。只有Provider已验证支持撤销时才可声明外链失效；否则迟到付款按旧snapshot记录/验证或人工处理。切换策略不得凭本地expires_at宣称旧付款风险已排空。

### 58.5 开发、渠道与运维门槛

G-DEV冻结本地合同、模拟器与独立实现前提；允许Catalog/Ledger等本地工作。G-PROVIDER证明§8.2真实渠道合同，不能被crypto固定向量或fake替代。G-OPS证明调度、认证、预算、报警、开关和恢复准备。三者独立记录，缺少真实凭据不阻塞所有独立开发，但真实购买启用必须后两者通过并获实际部署授权。

BILL-01可先交付开发准备，Provider核验继续单列；方案未达到全部门槛时最多报告本地实现验收，不能标整体Completed或真实支付已可用。

### 58.6 调度与应急控制

明确maintenance支付任务调用方、认证、频率、并发/单次预算、退避和积压报警责任人，实际值经Provider限流和本地容量验证后冻结。HTTP入口存在不代表自动执行。复用现有设施，不强制新增调度产品。

新Checkout签发、入站接收、自动结算、发现/重试须独立控制。常规故障先停新购买，继续持久接收已付款；暂停结算时积压必须可见且可恢复。上线前演练调度停机接管、密钥轮换/丢失、代码/schema兼容与forward-fix；恢复后重新对账不重复授权。生产执行仍需实际授权。
