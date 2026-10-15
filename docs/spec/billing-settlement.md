# 支付、订单与结算需求

## REQ-BIL-001 — Provider 输入必须先形成可审计内部事实

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability
- **Architecture**: `architecture/modules/billing-settlement.md`

**Statement**

Webhook/API Provider 观察不得直接等同于权益；系统必须先持久化可验证事件、Order/Observation/Settlement 事实，再由受控 Entitlement 边界授予 Grant。

## REQ-BIL-002 — Webhook 必须可重复、可冲突检测

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

Webhook 重复投递必须幂等；同 Provider event identity 出现不同 payload 时必须保留冲突证据，不能静默覆盖。

## REQ-BIL-003 — Provider 网络失败不是业务否定事实

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

Provider 超时、非 2xx 或响应异常必须表达 temporarily unavailable/retryable，不得猜成 not_found、unpaid 或 paid。

## REQ-BIL-004 — Order 状态维度不得压成单一状态

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional

**Statement**

系统必须分别表达 Provider status、verification、linkage、entitlement processing 和 resolution；Provider paid 不等价于 verified，也不等价于 Grant success。

## REQ-BIL-005 — Settlement 是支付到权益的唯一受控桥梁

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Billing 只有在验证 Platform/Account、Checkout snapshot、Provider mapping/price 和 Entitlement 冲突规则后，才能通过 Settlement 请求 Billing-source Grant；不得直接更新 subscription projection 冒充权益成功。

## REQ-BIL-006 — Billing 后台作业必须租约化和可恢复

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

发现、验证、结算和对账作业必须保存持久 retry/lease/fence/observation 证据，Provider 网络调用不得持有数据库事务。

## REQ-BIL-007 — 风险开关必须独立

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

Checkout、Webhook ingress、Background Processing、Auto Settlement 必须作为不同风险面独立启停；关闭一个能力不得无意破坏其他恢复链路。

## REQ-BIL-008 — 人工 Billing 治理需要高风险保护

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Admin requery/resolve/correction 等高风险订单动作必须具备服务端授权、recent MFA、reason、operation identity、并发保护和 unknown-outcome 恢复。

## REQ-BIL-009 — 退款事实与权益撤销分离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Functional

**Statement**

Provider refund/chargeback 观察、Billing 决策和 Entitlement revoke 必须是可审计的独立步骤；普通退款请求不得自动假设 Provider 已退款或自动撤销权益。

## REQ-BIL-010 — 环境能力不得由代码存在推断

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Constraint

**Statement**

Cron/Vault/Provider/生产调度等 Hosted 能力只有取得对应环境证据才能声明已运行；migration、schedule metadata 或本地测试通过不构成生产部署证明。

## Domain Verification

当前 Implemented 基线由 canonical Billing/Webhook/Settlement/Observation/Job SQL、Account/Admin/Maintenance runtime 与 OpenAPI，以及 `bill_06_admin_billing_and_consumer_authorization.sql`、`bill_07_billing_retry_dead_letter.sql`、`bill_08_webhook_security.sql`、`bill_13_admin_billing_pagination.sql`、`bill_15_admin_billing_timeline.sql`、`bill_16_admin_billing_diagnostics.sql`、`repair_task_0702_billing_worker_cron.sql` 等验证支撑。Hosted Provider、Vault、Cron 投递健康仍按 `REQ-BIL-010` 单独要求环境证据。
