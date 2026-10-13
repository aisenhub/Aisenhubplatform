# OPT-001～OPT-010 已确认 Bug 清单

审查日期：2026-10-13  
审查基线：`65c52fb1162b549b2446550b2cda9367c94e9e4f`  
范围：OPT-001～OPT-010 最近十项优化的实现、合同、数据库状态机、Admin UI 与验证记录。  
审查边界：本文只记录已经确认的功能/规格缺陷，不包含单纯架构风险项；不代表已实施修复。

## 项目前提

用户已明确：当前项目尚未正式上线，没有正式业务数据，现有数据仅属于测试环境；因此后续整改**不要求保留旧数据、旧接口、旧入口或旧行为的兼容层**。如果某个缺陷由 legacy/compatibility 双轨实现造成，修复方向应优先删除旧路径并收敛为单一权威实现，而不是继续给旧路径补兼容逻辑。

## 汇总

| ID | 严重度 | 优化项 | 标题 |
| --- | --- | --- | --- |
| R-01 | P1 | OPT-009 | 无效/无变化账户状态命令仍写入治理事件与 Audit |
| R-02 | P1 | OPT-007 → OPT-010 | 旧 Plan 管理入口可绕过新 Commerce 生命周期约束 |
| R-03 | P1 | OPT-010 | Provider Mapping 切换不是原子操作 |
| R-04 | P1 | OPT-010 | 高风险 Commerce `operation_id` 不具备真实幂等/未知结果恢复 |
| R-05 | P2 | OPT-010 | Entitlement 列表 cursor 基于可变 `subscriptions.updated_at` |
| R-06 | P2 | OPT-004 + OPT-010 | Platform Overview 仍使用旧 paid-account 算法，与 Commerce Summary 语义不一致 |
| R-07 | P2 | OPT-010 / QA | Verification Record 声称 Overview 已统一 Commerce Summary，但源码与浏览器测试并未证明 |
| R-08 | P2 | OPT-010 | Price / Mapping 的 `max(version)+1` 存在并发版本竞争 |
| R-09 | P2 | OPT-010 | 并发发布不同 draft Price 缺少 Offer 级业务序列化 |
| R-10 | P2 | OPT-010 | 缺少设计中明确要求的独立 Price retire 操作 |
| R-11 | P2 | OPT-008 | Feedback batch delete 的 `operation_id` 也不是真正幂等 |
| R-12 | P2 | OPT-007 | Config Admin 列表 cursor 基于可变 `updated_at` |
| R-13 | P2 | OPT-006 | Onboarding readiness 在切平台时存在旧响应覆盖新平台状态的竞态 |
| R-14 | P2 | OPT-001 | PlatformSwitcher 硬限制 100 条且只做本地过滤 |
| R-15 | P2 | OPT-005 | 跨平台切换保留实体级 suffix，可能把旧平台实体 ID 带入新平台 |

合计：**15 项 = 4 × P1 + 11 × P2**。

---

## R-01｜P1｜OPT-009：无效/无变化账户状态命令仍写治理事件

**位置**

- `supabase/migrations/20261012043000_platform_account_workbench_domain.sql:384-434`
- `docs/proposals/platform-account-workbench/design.md:91-95`

**当前行为**

`private.admin_account_transition_v2` 只有在状态满足合法前置条件时才执行实际 `update`：

- `suspend`：仅 `active → suspended`
- `restore`：仅 `suspended → active`
- `close`：仅非 `closed → closed`

但如果前置条件不满足，函数不会报错，也不会阻止后续逻辑；仍然无条件插入 `platform_account_governance_events`，并写 `audit_append`。

**可触发示例**

- 对已经 `suspended` 的账户再次执行 `suspend`；
- 对 `closed` 账户执行 `restore`；
- 对已经 `closed` 的账户再次执行 `close`。

**影响**

治理事件和 Audit 会记录一条并未真实发生的业务状态变化，使审计事实、支持记录和后续自动化判断失真。该问题属于治理事实正确性缺陷，不只是 UX 问题。

---

## R-02｜P1｜OPT-007 → OPT-010：旧 Plan 写入口绕过新 Commerce 生命周期

**位置**

- `supabase/migrations/20261011070729_config_resource_admin_governance.sql:543-657`
- `supabase/functions/account-api/admin.ts:2051-2081`
- `apps/admin/features/plans/platform-plans-page.tsx:305-350`
- `docs/proposals/commercial-subscription-operations/design.md:144-154`

**当前行为**

旧 `private.admin_plan_upsert` 仍允许修改 Plan 的 `code/name/description/kind/features/status`，也允许将 Plan 归档。Admin API 的 `POST /admin/api/v1/platforms/{platformId}/plans` 和 Plans UI 仍直接调用该入口。

但 OPT-010 已引入 Offer / Price / Mapping / Grant 生命周期，且设计明确要求：**Plan archive 必须 preflight，不能破坏 active Offer 或现存有效/future Grant 的解释。** 旧入口没有这些约束。

**影响**

合法管理员可以通过旧入口：

- 归档仍被 active Offer 使用的 Plan；
- 修改 Plan `kind`，改变 Commerce 目录和付费权益解释；
- 让现有 Grant / Offer / Summary 在不同读模型中产生不一致解释。

这是一条跨优化项的治理旁路。鉴于项目没有正式数据，不应给旧入口补兼容，而应在整改阶段删除或彻底收口旧写路径。

---

## R-03｜P1｜OPT-010：Provider Mapping 切换不是原子操作

**位置**

- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:14-16`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:849-881`

**当前行为**

数据库通过唯一索引保证同一个 `(provider_account_id, commercial_price_id)` 最多只有一个 `published=true AND enabled=true` 的 Mapping。

但 `private.admin_commercial_mapping_command` 的：

- `publish` 只把目标 Mapping 更新为 `published=true, enabled=true`；
- `disable` 是另一个独立命令；
- 没有一个事务内的“旧 Mapping → 新 Mapping”原子切换。

**影响**

若旧 Mapping 仍是 current，直接 publish 新 Mapping 会撞唯一约束；如果管理员先 disable 旧 Mapping 再 publish 新 Mapping，两步之间存在购买不可用窗口，而且第二步失败会让不可用状态持续。

设计把 Provider Mapping 切换列为高风险生命周期动作，因此应该提供单事务 switch 语义，而不是要求 UI 拼接两个命令。

---

## R-04｜P1｜OPT-010：高风险 Commerce `operation_id` 不具备真实幂等

**位置**

- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:684-717`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:749-777`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:849-881`
- `supabase/migrations/20260907103848_security_helpers.sql:318-355`
- `docs/proposals/commercial-subscription-operations/design.md:144-154`

**当前行为**

Offer activate/archive、Price publish、Mapping publish/disable 都要求传 `p_operation_id`，但这些函数仅把它作为 `audit_append` 的 request id 使用。`private.audit_append` 每次都会直接插入新的 audit row，没有 claim、request hash、completed replay 或 operation-in-progress 语义。

**影响**

网络超时或响应丢失后，客户端无法使用相同 operation id 安全重放并确定“前一次是否已经成功”；重复执行可能再次改变状态、产生重复审计，或因为状态已经变化得到不同错误。

这与设计中“recent-MFA + reason + idempotent operation id”“unknown outcome 不自动换 operation id”的要求不一致。

---

## R-05｜P2｜OPT-010：Entitlement 稳定 cursor 实际依赖可变时间戳

**位置**

- `supabase/migrations/20261012123209_commercial_operations_read_models.sql:161-329`
- `docs/proposals/commercial-subscription-operations/design.md:136-139`

**当前行为**

`private.admin_commerce_entitlement_list` 使用 `(subscriptions.updated_at, platform_account_id)` 作为分页 cursor，并要求下一页调用时 cursor 对应 subscription 仍具有完全相同的 `updated_at`。

如果两页请求之间该 subscription 被更新，cursor 会直接变成 `resource_not_found`；其他记录的 `updated_at` 变化也可能跨过分页边界，导致重复或遗漏。

**影响**

设计称其为“稳定 cursor”，但它在正常业务写入并发下并不稳定。当前测试没有覆盖“第一页后修改 cursor/邻近记录，再取下一页”的场景。

---

## R-06｜P2｜OPT-004 + OPT-010：Overview 与 Commerce Summary 使用两套付费账户算法

**位置**

- `supabase/migrations/20261011173144_feedback_admin_center.sql:591-659`
- `supabase/migrations/20261012123209_commercial_operations_read_models.sql:61-89`
- `supabase/functions/account-api/admin.ts:1312-1328`

**当前行为**

Platform Overview 的 `active_paid_accounts` 仍按：

- `subscriptions.status='active'`
- Plan `kind='paid'`
- subscription period 有效

进行统计。

OPT-010 的 `admin_commerce_summary` 则按当前未撤销 winning Grant、paid Plan、active subscription、**active platform account** 共同判断。

**影响**

例如账户已经 `suspended/closed`，但 subscription 仍 active 时，旧 Overview 可能继续计为 active paid account，而 Commerce Summary 不计。两个管理页面会对同一业务事实给出不同数字。

---

## R-07｜P2｜OPT-010 / QA：Verification Record 对 Overview 的 PASS 声明与源码不一致

**位置**

- `docs/proposals/commercial-subscription-operations/verification-record.md:52-60`
- `supabase/functions/account-api/admin.ts:1312-1328`
- `supabase/migrations/20261011173144_feedback_admin_center.sql:591-659`

**当前行为**

Verification Record 明确写道：Phase 03 已由“同一 `admin_commerce_summary` 驱动 Global Billing、Platform Billing 与 Overview”，并在后续记录中将浏览器和 canonical gates 标为 PASS。

实际源码中 `/platforms/{id}/overview` 仍调用 `private.admin_platform_overview`，该函数继续使用 R-06 的旧 paid-account 算法。

**影响**

这说明现有测试/验收存在 false-positive：浏览器测试证明页面可用，但没有证明 Overview 的数据源和数值语义已经统一。后续整改必须增加“数据源/数值一致性”断言，而不能只依赖页面出现和 HTTP 成功。

---

## R-08｜P2｜OPT-010：Price / Mapping 版本生成存在并发竞争

**位置**

- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:10-16`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:720-745`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:808-845`

**当前行为**

Price version 与 Mapping version 都使用 `coalesce(max(version), 0) + 1` 计算下一版本号，然后再 insert；没有锁定对应 Offer / Price / Provider scope，也没有使用序列化/advisory lock。

**影响**

两个管理员并发创建时都可能读到相同 max 值，随后其中一个因唯一约束失败。数据完整性虽然被唯一索引保护，但正常合法业务操作会出现无意义的 409/数据库冲突，且错误语义不稳定。

---

## R-09｜P2｜OPT-010：并发发布不同 draft Price 缺少 Offer 级序列化

**位置**

- `supabase/migrations/20261012114256_commercial_operations_domain.sql` 中 `platform_commercial_prices_one_active_idx`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:749-777`

**当前行为**

`admin_commercial_price_publish` 只 `FOR UPDATE` 锁定目标 Price；两个事务如果同时发布同一个 Offer 下的两个不同 draft Price，不会锁定同一业务互斥资源。

每个事务都会先 retire 当前 active Price，再把自己的目标改为 active。最终唯一索引会阻止双 active，但其中一个事务可能以底层唯一冲突结束，而不是得到确定的业务级冲突或序列化结果。

**影响**

完整性可保持，但管理员并发操作的可靠性和错误合同不稳定。现有 settlement concurrency 测试不能证明 catalog Price publish 的并发安全。

---

## R-10｜P2｜OPT-010：缺少独立 Price retire 操作

**位置**

- `docs/proposals/commercial-subscription-operations/design.md:144-154`
- `supabase/migrations/20261012145252_commercial_operations_api_contract.sql:749-777`

**当前行为**

设计明确把 `Price publish/retire` 列为高风险动作，但当前实现只有 `admin_commercial_price_publish`；它会在发布新 Price 时顺带 retire 旧 active Price。仓库未实现独立的 `admin_commercial_price_retire` 对应命令/接口。

**影响**

管理员无法在“不发布另一个 Price”的前提下正式 retire 当前 active Price，设计中的生命周期操作不完整。

---

## R-11｜P2｜OPT-008：Feedback batch delete 的 `operation_id` 不是真正幂等

**位置**

- `supabase/migrations/20261011173144_feedback_admin_center.sql:450-498`
- `supabase/migrations/20261011175718_feedback_lifecycle_release.sql:4-42`

**当前行为**

`admin_feedback_batch_delete` 验证 `p_operation_id` 非空，但仅把它写进 Audit metadata；没有幂等 claim/dedupe/replay。

`feedback_privacy_delete` 对 `deleted` 才直接 return；对 `deleting` 再次调用仍可能再次增加 `row_version` 并写 `delete_requested` 事件。另一方面，batch precheck 又把已经 `deleted` 的目标当作 `resource_not_found`。

**影响**

响应丢失后的相同操作重放可能得到 404、重复状态变更或重复事件，无法可靠判断第一次是否已经成功。

---

## R-12｜P2｜OPT-007：Config Admin 列表 cursor 基于可变 `updated_at`

**位置**

- `supabase/migrations/20261011070729_config_resource_admin_governance.sql:4-112`

**当前行为**

`admin_config_resource_list` 的 cursor 只传 `config_id`。下一页请求时函数再次从当前记录读取它的最新 `updated_at`，然后用 `(updated_at,id)` 作为边界。

如果 cursor 对应 config 在两页之间被编辑，边界会移动；如果记录被删/失效则 cursor 直接 404。其他记录更新也可以跨越边界。

**影响**

分页可能重复、遗漏或失败，当前测试未覆盖分页过程中的并发修改。

---

## R-13｜P2｜OPT-006：Onboarding readiness 存在跨平台 stale-response race

**位置**

- `apps/admin/features/platform-integration/platform-integration-page.tsx:55-103`
- `apps/admin/features/platform-integration/platform-integration-model.ts:145-173`

**当前行为**

`loadSubscription` 捕获并校验的只有 Auth session epoch；请求内容却依赖当前 `platform.platform_id`。平台切换通常不会改变 Auth epoch，因此：

1. 平台 A 请求先发出；
2. 切到平台 B 并完成 B 请求；
3. A 的旧请求更晚返回；
4. 因 Auth epoch 仍相同，A 的 subscription/offers 可以覆盖 B 的 state。

catch 分支还只清空 subscription，不会同步清空 offers。

**影响**

`derivePlatformIntegrationState` 会用错误平台的 Offer/Subscription 判断 commerce readiness，导致用户看到错误平台的接入完成状态。

---

## R-14｜P2｜OPT-001：PlatformSwitcher 硬限制 100 条且本地搜索

**位置**

- `apps/admin/components/platform-context/platform-switcher.tsx:78-128`

**当前行为**

Switcher 固定请求 `/platforms?limit=100`，没有处理 `next_cursor` 或服务端搜索；搜索仅在已加载的 100 条数组上本地过滤。当前平台若不在首 100 条，会被单独注入，但其他超出首 100 条的平台仍不可发现。

**影响**

平台数量超过 100 后，管理员无法通过 Switcher 选择部分平台。该问题属于明确规模边界缺陷。

---

## R-15｜P2｜OPT-005：跨平台切换保留旧平台实体 ID

**位置**

- `apps/admin/components/navigation/admin-navigation.ts:272-304`

**当前行为**

当当前 URL 已经处于 `/admin/platforms/{platformId}/...` 时，`mapAdminScopeRoute` 对任意 suffix 都直接执行：

`targetPrefix + currentPlatform.suffix`

因此从平台 A 的实体详情页（例如 `/accounts/{accountAId}`）切换到平台 B，会得到 `/platforms/B/accounts/{accountAId}`。

**影响**

正常情况下后端 scope 校验应返回 404，但 UX 会把用户带到错误实体路径；更重要的是，这种前端路由行为长期增加跨平台实体 ID 被错误复用的攻击/回归面。一旦未来某个详情 API 的平台归属校验退化，会直接放大为 IDOR 风险。

---

## 当前结论

以上 15 项是本轮已确认、可从当前源码/设计/验证记录直接支持的功能或规格缺陷。本文不包含此前另外识别的两个长期架构风险（Audit actor 历史快照语义、Audit `%query%` 搜索规模性能），它们应保留在架构风险登记中，不与这 15 个 Bug 混计。

后续整改需要结合单独的 legacy/compatibility 审查结果统一规划；在该计划获确认前，不修改业务代码。
