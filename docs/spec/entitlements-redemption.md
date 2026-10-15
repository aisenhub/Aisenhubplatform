# 权益、订阅投影与兑换需求

## REQ-ENT-001 — Grant/Event Ledger 是权益历史权威

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional
- **Architecture**: `architecture/modules/entitlements-redemption.md`

**Statement**

用户权益历史必须由 immutable Grant + append-only Subscription Event 表达；`subscriptions` 只能作为当前投影，不能替代历史事实。

## REQ-ENT-002 — Grant 来源必须可归因

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

每个 Grant 必须明确来源于 redemption code、Admin 或 billing order，并保持对应业务 identity/operation 关系，不得伪造来源。

## REQ-ENT-003 — 权益区间和冲突规则中央统一

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Functional

**Statement**

有限期、永久、同 Plan 续接、不同 Plan 冲突、Free fallback、pause/resume/revoke 与 UTC 日历期限算法必须由中央 Entitlement 规则统一决定，Consumer/Admin 不得本地复制。

## REQ-ENT-004 — Projection 正确性不能依赖 Cron 准时

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

到达 next transition 时，读取或受控写路径必须能够按 Ledger 在账户锁下重算当前投影；Cron 仅优化，不是正确性唯一来源。

## REQ-ENT-005 — Admin 权益治理必须写同一 Ledger

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Admin grant/revoke/pause/resume/correct 必须通过同一 Entitlement domain 入口、reason/operation/audit 写入，不能直接修改 projection 或伪装成 Provider purchase。

**Acceptance**

- Platform Entitlement Directory 使用服务端 cursor/filter，不能依赖浏览器已加载页筛选。
- Account 360 与平台权益中心调用同一 Grant/Revoke/Pause/Resume/Correct 写路径。
- Directory 能区分 Billing、Redemption、Admin Grant 来源和关联业务对象。

## REQ-ENT-006 — 兑换码明文不可持久化

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

兑换码数据库只能保存 HMAC/key version/有限掩码和状态；明文只允许在创建进程与一次性 no-store 交付中出现。

## REQ-ENT-007 — Redemption Batch 必须两阶段交付激活

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

新 Batch 必须先 `pending_delivery`，只有管理员对一次性明文材料完成受控 delivery confirmation 后才能 active；超时未确认不能兑换，重放不能恢复明文。

**Acceptance**

- Campaign 列表中的 redeemed/unused/disabled/兑换率由服务端权威聚合。
- Code 明细只暴露 masked code 与兑换结果，不恢复完整明文。
- Campaign 查询和 Code 明细均使用服务端分页。

## REQ-ENT-008 — Redeem 必须原子、幂等并受限流保护

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Redeem 必须在受控锁序中完成 code/batch/account/plan/entitlement 检查、Grant/Event、code consumed、projection 与 audit；同一幂等请求不能重复消费，限流不可用时敏感写入 fail closed。

## REQ-ENT-009 — Consumer 只能消费中央 Entitlement 结果

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Consumer 受保护能力只能依据中央返回的 effective status/features/term；不得本地计算到期、Plan 冲突、Free fallback 或把未知状态当 active。

## REQ-ENT-010 — 补偿修正必须保留原历史

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

错误 Grant 的修正必须通过 revoke + replacement/correction chain 表达，不得删除或原地改写原 Grant/Event。

## Domain Verification

当前基线证据包括 canonical Grant/Event/Subscription/Redemption SQL、Account/Admin runtime 与 OpenAPI、`m3_entitlement_ledger.sql`、`bill_03_entitlement_correction.sql`、`bill_06_admin_billing_and_consumer_authorization.sql`，以及 Consumer Harness entitlement/redeem 场景。Redemption Campaign 的服务端分页/聚合和一次性交付语义已经在当前 Admin domain/API 中核对；明文恢复从来不是验证要求。
