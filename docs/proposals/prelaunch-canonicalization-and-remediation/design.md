# 预上线单轨化清理与缺陷修复设计

状态：Completed（2026-10-14）；实施与发布证据见[验证记录](verification-record.md)。

关联：
- [15 个已确认 Bug](../../reviews/opt-001-010-confirmed-bugs-2026-10-13.md)
- [Legacy / Compatibility 审查](../../reviews/prelaunch-legacy-compatibility-audit-2026-10-13.md)
- [总计划](plan.md)

## 背景

项目尚未正式上线，没有正式业务数据，当前只有测试平台与管理员。此前 OPT-001～OPT-010 为了保护旧数据、旧 Consumer、旧 URL 与 non-empty upgrade，采用了大量 additive / compatibility / v1-v2-v3 双轨策略。该前提现在已被明确取消。

当前已经确认：

- 15 个功能/规格 Bug（R-01～R-15）；
- 13 个 legacy/compatibility 清理问题（LC-01～LC-13）；
- 两类最大复杂度来源是 Commerce 双目录/双 Checkout 与 Config legacy-file/Config-Version 双产品面。

本 Proposal 的目标不是“把所有旧路径都补到正确”，而是先让系统收敛为一个权威模型，再只修权威模型中的缺陷。

## 冻结目标架构

### 1. Contract

预上线允许执行一次 breaking rebaseline：

- Account API 继续使用 `/v1`，但删除尚未正式发布、只为旧实现保留的 operation/field/variant；
- Admin API 同理；
- 更新 OpenAPI、Domain DTO、Consumer Harness、Consumer Lab snapshot 与 Registry canonical operation set；
- 完成后把新 contract 作为正式兼容基线，重新启用并长期保留 `contracts:breaking` 与 expand/migrate/contract 纪律。

这不是取消兼容治理，而是把兼容起点移动到真正准备上线的 canonical contract。

### 2. Commerce

只保留：

`Plan → Offer → immutable Price → Provider Mapping → Checkout snapshot → Order/Settlement → Grant`

冻结规则：

- `Plan` 只描述权益能力；
- `Offer` 描述售卖期限/方式；
- `Price` 是不可变价格版本；
- Provider Mapping 只指向 `commercial_price_id`；
- Consumer catalog 只读 `/v1/commerce/offers`；
- Checkout 只接受 `offer_id`；
- 不再存在 fixed `subscription_products`、`legacy_product_code`、Monthly/Yearly/Lifetime availability 开关、旧 product_code checkout fallback；
- 平台级 `purchases_paused` 若保留，独立作为 Commerce policy，而不是 fixed product config 的一部分；
- Redemption Campaign 只支持 Offer-based 或明确的 Admin-defined Plan+duration，不保留 product_code 模型。

### 3. Config

只保留：

`Config → immutable Config Version → private Storage ledger → Gallery submission/entry`

冻结规则：

- 删除 Consumer `/v1/config-files` legacy 产品面；
- 不再有 `resource_kind='legacy'`；
- Storage ledger 作为 Config Version 的内部物理状态机继续保留 fencing、unknown outcome、quota、delete/retention/Global Delete 能力；
- Admin 技术诊断以 Config/Version 为业务上下文，不继续提供 generic legacy file CRUD；
- Config slot entitlement 与平台物理容量是业务/资源限制；旧账户级 legacy file count/bytes quota 不再是产品规则。

### 4. Private SQL capability

每个领域只保留当前权威 function：

- 不以 rollback/older caller 为理由保留可执行 v1/v2/v3 旧函数；
- surviving function 在 prelaunch schema rebaseline 时可以恢复无版本号 canonical 名称；
- executor grant 只授予 runtime 实际调用的权威函数；
- 删除旧测试对 retired function privilege 的要求。

### 5. 数据与迁移

由于没有正式数据：

- 不做 legacy data transform/backfill；
- 不要求历史 non-empty schema 可升级到新 schema；
- Local/Test/Staging 使用 destructive reset + seed；
- 最终 schema 建议在功能修复完成后做一次 prelaunch migration rebaseline/squash，避免把大量已经废弃的“先建旧模型→再兼容→再删除”历史迁移带入首个正式上线版本；
- 执行 reset 前仍必须再次确认目标环境不是 Production、没有需要保留的人工测试证据或密钥配置。

### 6. 安全与可靠性不变量

清理 compatibility 不得删除：

- RLS / force RLS；
- fixed search_path；
- executor 最小授权；
- platform/account ownership 校验；
- recent-MFA / AAL2；
- If-Match/row_version；
- 真实 idempotency claim/hash/replay；
- Checkout/Order/Grant/Settlement immutable snapshot；
- private Storage 与服务端受控传输；
- fail-closed 行为。

## Bug 修复目标

- R-01：非法/no-op transition 明确失败，不产生 false governance fact。
- R-02：通过删除旧 Plan 写旁路解决；Plan lifecycle 只有一个权威入口并执行 Commerce/Grant preflight。
- R-03：Mapping 提供单事务 switch。
- R-04：Commerce 高风险命令接入真实 idempotency claim/finalize/replay。
- R-05/R-12：稳定分页不再依赖可变 sort boundary。
- R-06/R-07：Overview 与 Billing/Commerce 使用同一权威 Summary，并用数值一致性测试证明。
- R-08/R-09：Price/Mapping version 与 publish 在业务 scope 上序列化。
- R-10：实现独立 Price retire。
- R-11：Feedback batch delete 使用真实 operation idempotency/replay。
- R-13：平台相关异步请求绑定 request generation/platform id，禁止 stale response 覆盖。
- R-14：PlatformSwitcher 使用服务端搜索/分页，不硬截断 100。
- R-15：跨平台切换只保留 scope-safe route，不携带旧实体 ID。

## 非目标

- 不在本 Proposal 中引入 recurring subscription、MRR/ARR、优惠券、多币种等新商业能力。
- 不改变 Provider/Webhook/Settlement 的既有支付事实语义，除非为删除 fixed-product attribution 所必需。
- 不为了当前测试数据设计迁移兼容。
- 不以删代码为理由弱化现有安全边界。

## 完成定义

完成时必须满足：

1. runtime 中不存在 fixed product / legacy config-file 双产品路径；
2. Account/Admin OpenAPI 只暴露 canonical contract；
3. executor 不再拥有 retired compatibility function；
4. R-01～R-15 有针对性自动化回归；
5. LC-01～LC-13 对应旧路径从 runtime、schema、contract、UI、test/docs 中退出；
6. Local fresh reset + DB/API/unit/typecheck/lint/format/contracts/Consumer Harness/Admin E2E 全绿；
7. 若重置 staging，完成只读 schema/function/grant 与 Edge runtime 核验；Production 仍不得执行，除非未来另行授权。
