# 商业目录需求

## REQ-COM-001 — 权益与售卖模型分层

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional
- **Architecture**: `architecture/modules/commerce-catalog.md`

**Statement**

系统必须把 Plan、Offer、Price、Provider Mapping 分为不同领域概念：Plan 定义权益，Offer 定义售卖期限，Price 定义版本化金额，Mapping 定义外部 Provider 对应关系。

## REQ-COM-002 — Price 必须版本化并保持历史解释

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

已用于销售的价格不得通过原地修改破坏历史交易解释；调价必须创建新 Price version，Checkout 保存当时快照。

## REQ-COM-003 — Checkout 只能使用服务端解析的可购买目录事实

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

客户端只选择 Offer，不得提交可信价格、期限、Provider SKU 或 Grant 事实；服务端必须验证 active Plan/Offer/Price、购买策略和 verified/current Provider Mapping 后才能创建 Checkout。

## REQ-COM-004 — 购买暂停只阻断新 Checkout

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

平台购买暂停不得停止已付款 Webhook、删除 Billing jobs 或撤销现有权益；它只控制新的购买入口。

## REQ-COM-005 — 不可购买原因必须明确

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: UX

**Statement**

Consumer 目录必须明确表达 Offer 当前是否可购买及其原因，不得为了 UI 演示生成假的付款 URL、价格或 Provider readiness。

## REQ-COM-006 — 商业指标必须使用可证明口径

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

经营摘要的收入/金额指标必须基于明确 verified/refund/net 口径；不得把 checkout/request/show amount 或任意 finalized settlement 直接命名为 revenue。

**Acceptance**

- Summary 区分 verified gross、compensated refund、net verified 与 unknown amount count。
- Admin/Redemption/Billing Grant 数量保持来源分离。
- 缺少金额证据的订单不会为了图表完整而计入“收入”。

## REQ-COM-007 — 当前不承诺真实 recurring subscription 指标

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Constraint

**Statement**

在没有真实 recurring Provider 生命周期前，产品不得宣称 MRR、ARR、churn、renewal、past-due 或 cancel-at-period-end 等能力已经存在。

## Domain Verification

当前基线证据包括 canonical Plan/Offer/Price/Provider Mapping/Checkout SQL、Account/Admin runtime、canonical OpenAPI、`t34_prelaunch_commerce_canonicalization.sql` 与 Billing/Consumer contract tests。经营金额口径同时由 Commerce Summary SQL 与 Billing observation/settlement facts 支撑；任何未来 recurring 指标必须先新增相应 Provider 生命周期 Requirement 和权威数据模型，不能从现有有限期 Grant 推导。
