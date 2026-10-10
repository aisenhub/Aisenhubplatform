# 商业业务与订阅运营预研架构

状态：Preliminary Architecture / OPT-010 预研输入，尚未提升为正式 Proposal，也不代表当前系统已经实现。

关联事项：[OPT-010：全局商业治理 + 单平台套餐、订阅与兑换运营](README.md#优化事项总清单)

当前实现参考：[订阅、权益与兑换](../../architecture/modules/entitlements.md)、[核心数据模型](../../reference/data-model.md)、`apps/admin/features/plans/platform-plans-page.tsx`、`apps/admin/features/subscriptions/platform-subscription-page.tsx`、`apps/admin/features/redemption/platform-redemption-batches-page.tsx`、`apps/admin/features/billing/`。

## 1. 目标与定位

OPT-010 的目标不是重写现有 Billing、Entitlement 和 Redemption 安全账本，而是把已经存在的底层能力组织成管理员可以理解和运营的商业系统。

当前后台已经具备 Plan、Grant/Event/Projection、Checkout、Order、Settlement、Provider Mapping、兑换批次和 Admin correction 等能力，但页面主要围绕数据库对象和工程状态展开。目标状态应让管理员从商业视角回答：

1. 每个平台现在卖什么、不同方案给用户什么权益、分别以什么价格和期限销售。
2. 当前有哪些用户处于有效付费/赠送权益，权益来自购买、兑换还是管理员直接授予。
3. 某笔钱是否真正支付、验证、结算、退款或仍需人工处理。
4. 某个用户如果需要客服补偿、修正、暂停或取消，应执行哪个动作，是否影响未来 Billing、当前访问或历史账务。
5. 某批兑换码发给谁、兑换了多少、剩余多少、实际产生了哪些权益。
6. 全局和单平台能看到哪些经营数据，哪些指标因为事实条件不足必须明确不展示。

预研固定两个管理层级：

- **Global Admin / 商业治理**：跨平台经营摘要、订单与结算、Provider/Worker/异常治理、全局商品/支付基础设施。
- **Platform Admin / 商业运营**：当前平台商业概览、套餐与权益、售卖 Offer/Price、订阅/权益用户、订单、兑换 Campaign。

## 2. 当前实现事实与必须保留的基础

### 2.1 当前 Plan 与商品目录不是同一个概念，但 UI 尚未清晰表达

当前 `public.plans` 属于平台级权益定义，`kind` 为 Free / Paid，`features` 决定用户实际能力；平台的默认 Free 由 `platforms.default_plan_id` 表达。

另一方面，当前 `public.subscription_products` 是中央固定商业商品目录：

```text
free
monthly
yearly
lifetime
```

其中 Monthly 为 1 month，Yearly 为 1 year，Lifetime 实际是有限的 99 years，并非真正永久权益；当前币种固定 CNY，价格变更要求递增 `price_version`。

`public.platform_subscription_config` 当前只允许一个 `paid_plan_id`，再分别打开 `monthly_enabled / yearly_enabled / lifetime_enabled`。因此现在的商业模型大致是：

```text
平台
  -> 一个标准 Paid Plan
      -> Monthly
      -> Yearly
      -> Lifetime(99 years)
```

这可以支撑早期单层付费模型，但会限制未来一个平台同时拥有 Pro、Team、Ultimate 等多个付费权益层级，也很难表达同一 Plan 的多个价格、币种、销售渠道或历史价格版本。

### 2.2 当前权益事实以 Grant + Event + Projection 为权威

当前系统的核心不是 Provider Subscription 对象，而是：

```text
subscription_grants        不可变正向授权
subscription_events        granted / revoked / paused / resumed
subscriptions              当前投影
```

Grant 当前来源包括：

```text
redemption_code
admin
```

因此系统已经天然支持两条获取权益的路径：

- 用户通过兑换码主动 Claim。
- 管理员直接为指定账户授予权益。

暂停/恢复属于账户权益访问状态；修正通过 revoke 原 Grant + grant 新 Grant 实现，不直接篡改历史 Grant。

这套 Ledger / Event / Projection 结构是 OPT-010 应继续复用的权威权益链路，不应为了商业 UI 重构而重新发明第二套权益状态机。

### 2.3 当前 Admin 已经具备直接治理指定账户权益的底层动作

当前订阅页面已有：

```text
pause
resume
grant
revoke
correct
```

但交互是“先搜索 Account ID / User ID → 选择账户 → 查看单条 projection → 执行工程命令”，缺少平台级订阅用户列表，也没有把这些动作翻译成清晰的业务语义。

因此后续目标不是用兑换码替代这些能力，而是把它们升级成管理员可理解、可审计、可从 Account 360 发起的订阅/权益治理工具。

### 2.4 当前 Billing 已经有较强的支付与异常治理基础

现有 Billing 领域已经包含 Provider Account、Provider Product Mapping、Checkout Intent、Billing Order、Webhook Event、Processing Job、Settlement、Reconciliation 等对象。

全局 Admin 已能：

- 跨平台查看订单。
- 按订单状态、平台、账户、Provider 等筛选。
- 查看订单详情和结算证据。
- 对异常订单执行 requery / resolve。
- 查看 pending、retryable、manual review、duplicate payment、lease、调度延迟、refund mismatch 等运行指标。

这些能力更接近成熟的 **Payment Operations / Revenue Operations** 基础，而不是需要删除的旧实现。OPT-010 应把它们保留在“支付运行与异常治理”层，同时增加真正的经营摘要层。

### 2.5 当前兑换码安全模型应继续保留

现有兑换批次具备重要安全语义：

- 一批最多 1000 个码。
- 明文只在成功创建响应中显示一次。
- 管理员保存明文并确认交付后，批次才进入 active。
- 数据库保存 HMAC，不保存可再次导出的完整明文。
- 批次可停用，但已兑换产生的 Grant 不被追溯撤销。
- 兑换结果最终写入 Grant/Event，并受平台/账户/Plan 不变量保护。

OPT-010 应增加 Campaign 运营视角，但不能为了“好导出”破坏一次性 Secret 和 HMAC 安全边界。

## 3. 核心领域分层

后续正式架构建议明确以下概念，避免继续把“套餐、商品、价格、订阅、权益、订单”混在一起。

### 3.1 Plan：用户得到什么

`Plan` 代表平台内的权益层级/服务方案，回答：

> 用户拥有这个 Plan 后，可以使用哪些功能、额度和能力？

例如概念上可以有：

```text
Free
Pro
Team
Ultimate
```

Plan 负责 features / entitlement，不负责表达“月付多少钱”。

### 3.2 Offer：这个 Plan 以什么方式出售

建议正式设计评估新增逻辑上的 `Offer` 层，用来表达：

```text
Pro 月付
Pro 年付
Pro 一次性 99 年
Team 年付
```

Offer 关联某个 Plan，并定义销售周期、购买策略、是否可购买、显示顺序等商业语义。

当前固定 Monthly / Yearly / Lifetime 可以视为早期 Offer 形态，但不应继续和全平台唯一 Paid Plan 强绑定。

### 3.3 Price：这个 Offer 在一个版本下卖多少钱

价格应和 Plan 分离，并遵守历史不可篡改原则。

概念目标：

```text
Plan: Pro
  Offer: Pro Monthly
    Price v1: CNY 19.90
    Price v2: CNY 24.90
  Offer: Pro Yearly
    Price v1: CNY 199.00
```

新价格生效后，历史订单仍引用/快照原价格版本，不反推当前价格。

正式设计再冻结是否支持：

- 多币种。
- 同一 Offer 多 Price。
- 区域价格。
- Provider-specific price mapping。

不能因为成熟产品支持这些能力就一次性全部实现。

### 3.4 Provider Mapping：外部渠道如何对应内部 Offer / Price

Provider 商品 ID、SKU、金额、币种和 mapping version 属于外部支付渠道映射，不应该成为内部 Plan 的身份。

目标关系应保持类似：

```text
Plan
  -> Offer
      -> Price Version
          -> Provider Mapping
```

Provider 映射异常时，应让 Offer 明确变成不可购买，而不是让 UI 假装支付可用。

### 3.5 Grant：用户当前拥有什么访问权益

Grant 是权限事实，不是支付事实。

无论来源是：

```text
Provider 购买结算
兑换码
Admin Grant
未来其他受控来源
```

最终用户能否使用付费功能仍应落到统一 Entitlement Ledger，而不是由订单页面或前端自行判断。

### 3.6 Order / Settlement：钱发生了什么

Billing Order / Settlement 回答：

> 是否真的发生支付、支付金额是什么、Provider 是否验证、系统是否完成结算/授予、是否需要退款或人工处理？

它们不能被 Admin Grant 伪造。

### 3.7 Redemption：用户凭一个 Claim Code 取得权益

Redemption Code 是“凭证换权益”，不是支付优惠。

```text
Redemption Code
  -> Claim
  -> Grant
```

### 3.8 Discount / Promotion：未来若需要，应单独建域

折扣码/优惠券回答：

> 用户付款时应该少付多少？

它影响 Checkout / Price，但本身不直接等于 Grant。

因此未来若增加优惠码，应是：

```text
Promotion / Discount
  -> Checkout pricing
  -> Paid Order
  -> Settlement
  -> Grant
```

不能把现有 Redemption Code 改名后承担折扣语义。

## 4. 目标 Admin 信息架构

### 4.1 Global 商业治理

全局商业中心建议拆成两个逻辑层。

#### A. 经营摘要

回答跨平台业务结果：

- 各平台有效付费账户。
- 周期内有效购买订单。
- 已验证/已结算金额（口径冻结后）。
- 商品 / Offer 表现。
- 兑换授予数量。
- 即将到期权益。
- 各平台异常订单数量。

支持时间范围以及平台维度比较和下钻。

#### B. 支付运行与异常治理

继续承载现有强项：

- Provider Account / Product Mapping。
- Checkout / Order。
- Settlement。
- Webhook / Processing Job。
- Reconciliation。
- retry / manual review / duplicate payment。
- refund mismatch。
- requery / resolve。
- 调度、lease、告警和运行健康。

不能为了做经营 Dashboard 把这些工程治理能力隐藏或删除。

### 4.2 单平台商业中心

单平台建议逻辑上形成：

```text
商业概览
套餐与权益
商品 / Offer / Price
订阅与权益用户
订单
兑换码 / Campaign
```

最终导航是否全部作为一级子菜单，还是由一个“商业”入口内使用 Tabs/二级导航，留到正式 UI 设计冻结。

## 5. 套餐与权益管理

当前 Plan 页面主要展示 code、name、kind、status 和 features 字段数量，偏数据库目录。

目标应改为业务方案目录，一级就能回答：

```text
Pro
状态：可用
当前用户：1,204
主要权益：配置 10 个、反馈图片 5 张、...
销售方式：月付 / 年付
```

技术 code、UUID、原始 features JSON 留在详情/高级信息中。

Plan 详情建议包括：

- 名称、说明、状态。
- Free / Paid 类型。
- 可读权益矩阵。
- 关联 Offer / Price。
- 当前有效权益用户数（权威聚合存在后）。
- 归档影响。
- 历史购买/Grant 兼容说明。

Plan 归档继续只能阻止新 Grant/新销售，不能擅自取消历史有效权益。

## 6. 商品、Offer 与价格

正式设计应评估把当前“全局固定商品 + 单 Paid Plan 映射”升级成平台可扩展目录。

推荐目标能力：

- 一个 Plan 可以有多个 Offer。
- Offer 可以按月、年、自定义有限期或一次性长期权益表达。
- Price 使用不可变版本/快照解释历史订单。
- 新价格只影响未来 Checkout。
- Offer 可以暂停新购买，但不能使已购买权益提前失效。
- Provider Mapping 必须经过真实校验后才可标记 Purchasable。

### 6.1 购买暂停与 Plan/Offer 归档必须分开

需要区分：

- `Plan archived`：不再允许新权益绑定到这个 Plan。
- `Offer disabled`：该销售方式不可新购。
- `Purchases paused`：运营上暂停新 Checkout。
- `Provider mapping unavailable`：技术上无法完成购买。

这四种状态不能压成一个“不可用”。

## 7. 订阅与权益用户中心

### 7.1 从“单账户查询工具”升级为平台级目录

管理员进入订阅/权益中心后，应先看到整个当前平台的用户列表，而不是必须先知道一个 Account ID。

建议一级列：

```text
用户 | 当前方案 | 权益来源 | 状态 | 开始时间 | 到期/下一边界 | 操作
```

权益来源至少区分：

```text
Provider Purchase
Redemption
Admin Grant
```

服务端结构化筛选建议至少支持：

- 用户/邮箱/Platform Account ID。
- Plan。
- entitlement 状态。
- 来源。
- 开始时间。
- 到期时间。
- 即将到期。
- 是否暂停。
- 是否存在订单异常。

所有筛选必须发生在服务端 cursor pagination 之前。

### 7.2 Account 360 与订阅中心共享同一套写路径

OPT-009 Account 360 可以直接展示当前权益和“管理权益”入口，但不能复制另一套 Grant/Revoke 算法。

两个 UI 最终都应调用同一 Admin Subscription / Entitlement Contract 和同一 PostgreSQL private 领域过程。

## 8. 管理员直接治理指定用户

这一能力正式确认属于 OPT-010。

成熟商业后台允许管理员对明确的 Customer/Subscription 执行创建、取消、暂停、修正等操作。AisenHub 也应该支持指定账户直接治理，不要求管理员为了补偿一个确定用户而生成兑换码、发送给用户、再等待用户自己 Claim。

### 8.1 Admin Grant / Complimentary Entitlement

适用场景：

- Bug / 服务事故补偿。
- 客服关怀。
- 内测账号。
- 合作伙伴。
- 商务赠送。
- 数据修正后的补偿。

业务交互可以类似：

```text
授予权益
Plan: Pro
时长: 1个月 / 3个月 / 1年 / 自定义
开始: 立即 / 指定时间
原因类型: 客服补偿 / 合作 / 测试 / 修正 / 其他
详细原因: ...
```

但数据库权威仍写入现有或演进后的 Grant/Event 领域链路。

必须明确：

> Admin Grant 是无 Provider 支付的受控权益授予，不是“管理员伪造了一笔购买”。

因此 Admin Grant：

- 不生成虚假 Billing Order。
- 不计入购买收入。
- 不冒充 recurring subscription。
- 必须记录 actor、reason、operation_id、时间和审计。

### 8.2 Pause / Resume

暂停属于访问控制，不默认冻结权益时钟，也不自动延长到期时间，除非未来商业政策明确改变。

恢复只解除暂停；如果原权益在暂停期间已经自然到期，恢复后不能凭空重新获得已过期权益。

### 8.3 Correct

Correction 用于管理员修复错误 Plan、错误期限等事实。

推荐继续保持当前原则：

```text
revoke 原 Grant
+ grant 新 Grant
```

在同一个受控操作中完成，而不是直接修改不可变 Grant 的 starts_at / ends_at。

### 8.4 Revoke Entitlement

Revoke 表示**立即撤销当前或未来访问权益**，属于高风险治理动作。

适用场景可能包括：

- 错误授予。
- 欺诈/滥用处置。
- 商业纠纷中已明确需要终止访问。
- 人工修正的第一步。

它不能和“停止未来自动续费”混为同一个按钮。

## 9. Billing 取消与 Entitlement 撤销必须分开

这是 OPT-010 的核心边界。

### 9.1 当前系统尚不能默认声称存在真实 recurring subscription

当前 Monthly / Yearly / Lifetime 首先表达有限期购买后产生的 Grant。`subscriptions.current_period_end` 是权益投影边界，不足以证明 Provider 会在到期时自动再次扣款。

因此在正式确认 Provider 支持以下事实之前：

- 自动周期扣款。
- Provider Subscription / Agreement ID。
- 续费成功/失败。
- past_due / grace period。
- 用户取消续费。
- Provider 侧恢复续费。

UI 不应该出现会误导管理员的：

```text
取消自动续费
恢复续费
MRR
ARR
Churn
Renewal Rate
```

### 9.2 未来真实 recurring Provider 接入后的取消模型

如果未来存在真正 Billing Agreement，应至少区分：

#### Cancel at Period End

```text
停止未来续费
当前已付周期继续有效到 current_period_end
不立即撤销 Entitlement
```

#### Immediate Billing Cancel

```text
立即终止 Provider Billing Agreement
```

但“立即取消 Billing”之后是否：

- 立即撤销剩余权益。
- 保留已付权益至原结束日。
- 全额退款。
- 按比例退款。
- 不退款。

必须由商业政策单独冻结，不能由技术层自动猜测。

### 9.3 Refund 是第三个独立动作

Refund 回答“钱是否退回”，Revoke 回答“访问是否失效”，Cancel 回答“未来 Billing 是否继续”。

因此三者逻辑上必须分开：

```text
Cancel Billing
Refund Payment
Revoke Entitlement
```

可以在某个管理员工作流中组合执行，但每一步都必须有独立权威事实和失败恢复语义。

## 10. 兑换码与 Campaign 运营

### 10.1 兑换码适合“用户主动领取”场景

兑换码主要用于：

- 市场活动。
- 合作渠道。
- 线下礼品。
- 批量分发。
- 邀请测试。
- 无法提前确定最终领取账户的场景。

如果管理员已经明确知道目标账户，直接 Admin Grant 通常更合理。

### 10.2 Batch 升级为 Campaign 视角

列表建议显示：

```text
Campaign / 批次名称
关联 Plan / Offer
总量
已兑换
剩余
兑换率
状态
到期时间
创建/交付时间
渠道 / 用途
```

详情建议支持：

- 单码脱敏标识（prefix/suffix）。
- unused / redeemed / disabled。
- redeemed_by 用户。
- redeemed_at。
- 对应 Grant。
- 兑换事件/失败统计。

不恢复完整明文。

### 10.3 Redemption 与 Promotion 永久分域

Redemption：

```text
Code -> Grant
```

Promotion：

```text
Code/Rule -> Discounted Checkout -> Paid Order -> Grant
```

未来优惠券若实现，可借鉴成熟产品的：

- 生效/失效日期。
- 最大使用次数。
- 每用户限制。
- 适用商品。
- 活动统计。

但不能复用兑换码 HMAC/Grant 业务语义后再靠字段判断“这是折扣还是权益”。

## 11. 商业指标与报表口径

### 11.1 第一阶段只展示当前事实能够证明的指标

在现有架构下，更可靠的指标包括：

- 有效 Paid Entitlement 账户数。
- Admin Grant 有效账户数。
- Redemption Grant 数量。
- 周期内新购买订单数。
- verified/finalized 订单/结算数量。
- 即将到期权益。
- 异常订单/人工审核数量。
- Offer / Product 购买量（映射事实足够时）。

### 11.2 金额指标必须先定义状态口径

不能直接：

```text
SUM(billing_orders.show_amount) = Revenue
```

正式设计至少需要区分：

- Checkout 请求金额。
- Provider 报告金额。
- verified paid amount。
- finalized settlement amount。
- refunded amount。
- net amount（如果手续费/退款/税等事实足够）。

只有状态和来源冻结后，UI 才能使用“收入”“GMV”“已结算金额”等名称。

### 11.3 MRR / ARR / Churn 暂不属于当前默认指标

MRR、ARR、续费率、Churn 的前提是系统具有可靠 recurring Billing 生命周期。

在当前有限 Grant 模型下，把“年付金额 / 12”称为 MRR 会制造业务假象。因此正式 recurring 合同建立前，这些指标明确不做。

## 12. 建议的服务端读模型

当前多个页面仍是读取一批对象后在浏览器筛选。OPT-010 的运营列表与统计必须增加服务端权威查询边界。

以下只是逻辑能力，函数/API 名称在正式 Proposal 冻结：

### 12.1 Global Commerce Summary

可按日期范围返回：

- 平台维度购买/结算数量。
- 可核实金额。
- 有效 Paid Entitlement。
- 异常订单。
- Redemption / Admin Grant 摘要。

### 12.2 Platform Commerce Summary

供单平台商业首页和 OPT-004 平台概览复用：

- 有效付费权益账户。
- 周期新购买。
- 即将到期。
- 异常订单。
- Redemption 使用。
- 主要 Plan / Offer 分布。

### 12.3 Subscription / Entitlement Directory

服务端 cursor pagination + 稳定排序，并支持 Plan、source、status、date、account 等过滤。

### 12.4 Redemption Campaign Metrics

已兑换/剩余/兑换率等必须由数据库权威聚合或可验证投影提供，不能根据 Admin 当前加载的 100 条码临时统计。

## 13. 写入边界与安全要求

OPT-010 不应放宽当前核心安全约束。

### 13.1 权益写入

Admin Grant / Revoke / Correct / Pause / Resume：

- 继续经过 PostgreSQL private 领域过程。
- 使用 `operation_id` 幂等。
- 对竞争写使用版本/预期事件边界。
- 高风险操作要求 recent MFA / step-up。
- 强制 reason。
- Audit 记录 actor、target、action、result 和必要 metadata。
- 网络 unknown outcome 时先读取权威状态，不自动生成新 operation_id 重放不同逻辑操作。

### 13.2 Billing 写入

订单 requery / resolve、未来 cancel/refund 等继续需要：

- Provider 权威核验。
- If-Match / version。
- operation_id。
- reason。
- 可重放/可恢复结果。
- 不能通过 Admin UI 高权限直写 Order/Settlement 表绕过领域过程。

### 13.3 兑换码

- 明文仍只允许一次性安全交付。
- 日志、Audit、CI、导出不包含完整码。
- Admin Campaign 统计只使用脱敏标识。

## 14. Account 360 集成

OPT-009 的账户工作台应成为“管理一个确定用户”的高频入口。

账户商业区域建议展示：

- 当前 Plan。
- Entitlement 状态。
- 来源：Purchase / Redemption / Admin Grant。
- started_at / ends_at。
- 最近订单。
- 是否有支付异常。
- 最近兑换记录。

并提供“管理权益”动作。

但 Account 360 只提供上下文和入口，实际写逻辑仍复用 OPT-010 的统一领域 Contract。

## 15. 与新平台接入的关系

OPT-006 首次接入向导后续应把商业能力拆成可验证步骤，而不是只显示“Plan 已配置”。

根据平台实际启用范围，可以检查：

```text
Plan / features 已配置
Offer / Price 已配置
Provider Mapping 已验证
Products API 可返回真实 purchasable 状态
Checkout 闭环已验证
Entitlement 授予已验证
Redemption（如启用）已验证
```

如果平台只使用 Free + Admin Grant / Redemption，不接 Provider，也应该能明确显示“支付购买未启用”，而不是伪装成接入失败。

## 16. 数据演进原则

### 16.1 不重写历史 Ledger

现有 `subscription_grants`、`subscription_events`、Billing Order / Settlement、Redemption Event 中的历史事实继续保留。

产品目录演进不能通过批量重写历史 Grant/Order 来假装它们来自新 Offer。

### 16.2 新目录与旧固定商品需要明确迁移映射

如果正式设计采用 Plan / Offer / Price：

- 当前 Monthly / Yearly / Lifetime 应映射为可追踪的新 Offer/Price 记录或兼容层。
- 旧订单和旧兑换批次继续按自己的不可变 snapshot / model_version 解释。
- 新代码不能让旧记录反推最新价格。
- 迁移期间不能同时存在两套互相矛盾的“当前权益”算法。

### 16.3 recurring subscription 应作为独立能力引入

不要因为 UI 改名为“订阅中心”就直接把 Provider recurring 字段加到现有 Grant Projection 上。

如果未来 Provider 支持真实自动续费，建议正式设计独立的 Billing Agreement / Provider Subscription 事实，再定义它如何在每次成功结算后产生 Grant。

## 17. 正式设计前必须冻结的问题

OPT-010 提升为正式 Proposal 前，至少重新确认以下问题：

1. 一个平台是否确定需要多个 Paid Plan，而不是长期只有一个标准 Paid Plan。
2. Offer 与 Price 是否在第一版就拆表，还是先建立逻辑 Contract 再迁移。
3. 第一版是否只支持 CNY；多币种是否明确排除。
4. Price 更新采用新 Price Version、有效时间还是新 Offer；旧 Checkout 如何固定解释。
5. 当前 Provider 是否真正支持 recurring subscription；如果支持，其 Subscription ID、续费、取消、past-due 和 webhook 语义是什么。
6. Admin Grant 允许哪些时长：固定 preset、自定义 ends_at、未来生效、永久；不同动作是否有额外审批。
7. Admin Revoke 对购买产生的已付权益是否允许直接执行；是否需要更高确认或与退款政策联动。
8. `cancel_at_period_end`、immediate cancel、refund、revoke 的允许组合和默认政策。
9. Plan 归档、Offer 停售、Purchases Paused、Provider Mapping 失效对历史权益和新 Checkout 的精确影响。
10. Redemption Campaign 是否需要渠道、活动标签、每用户限制或特定受众。
11. 未来 Discount/Promotion 是否属于 OPT-010 第一版范围；预研默认不是第一阶段必做。
12. “购买金额 / 已支付金额 / 已结算金额 / 收入 / 净收入”各自的数据来源和状态口径。
13. 商业导出范围、个人信息字段和 Audit 要求。
14. 全局经营摘要与单平台概览需要哪些预聚合/索引，如何避免对 Billing Ledger 做无界实时扫描。

## 18. 建议的后续正式化顺序

本文件只是 OPT-010 的预研输入，不是实施授权。

按照统一优化清单的执行规则，轮到 OPT-010 时应：

```text
OPT-010
  -> 读取本预研架构
  -> 基于当时最新 main 重新核对源码、迁移、OpenAPI、Provider 合同和测试
  -> 明确 recurring 能力是否真实存在
  -> 冻结 Plan / Offer / Price / Grant / Billing / Redemption 领域边界
  -> 建立正式 design.md
  -> 建立 plan.md + phases/
  -> 按阶段实施并验证
  -> 同步 architecture/reference/guides
  -> 完成 GitHub 分支交付、合并 main 与分支清理
```

只有真实实现并完成验收后，最终运行架构才同步到 `docs/architecture/`；在此之前，本文件中的 Plan/Offer/Price、recurring cancellation、商业聚合等均属于目标设计输入，而不是当前已实现能力。
