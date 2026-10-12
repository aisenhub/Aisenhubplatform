# OPT-010 实施与验证记录

状态：In Progress

## 项目与基线

- 优化目标：全局商业治理 + 单平台套餐/Offer/Price/权益用户/订单/兑换运营
- 起始 main：`a0e903731333cdddeb20361064d9e3557ef5bd84`
- 任务分支：`codex/opt-010-commercial-operations`
- 风险：R3
- Production：NOT_RUN / 默认不属于本项发布目标

## 最新事实核验

| 日期 | 范围 | 结果 |
| --- | --- | --- |
| 2026-10-12 | fixed catalog / config | CONFIRMED：一个 `paid_plan_id` + 全局 monthly/yearly/lifetime/CNY；price_version 原行更新，不是不可变历史 |
| 2026-10-12 | Checkout | CONFIRMED：Consumer 只接受 product_code，但 Checkout 已分离 subscription_product_id 与 entitlement_plan_id 并快照价格/期限/Mapping，可 additive 引入 Offer/Price |
| 2026-10-12 | Entitlement | CORRECTED：Grant 来源是 `billing_order/redemption_code/admin`；subscriptions projection 不保存来源，运营读模型必须按 winning grant 关联 |
| 2026-10-12 | Billing metrics | CONFIRMED：现有全局指标是 Payment Operations；`finalized` 可由人工 refund/anomaly/correction 结案产生，不能单独等价为成功成交 |
| 2026-10-12 | Refund | CONFIRMED：存在 refund observations，只有明确 compensated/confirmed 事实才能参与净额扣减；不是完整会计系统 |
| 2026-10-12 | Redemption | CONFIRMED：单码已有 status/redeemed_by/redeemed_at，可权威聚合 Campaign stats，明文/HMAC 不需要暴露 |
| 2026-10-12 | UI | CONFIRMED：Plan/Redemption 多为 bounded load + client filter；Subscription 仍先搜单 Account；Global Billing 以运行健康为主 |

## 阶段状态

| 阶段 | 状态 | 证据 | 阻塞 |
| --- | --- | --- | --- |
| 01 Domain/read model | Completed | Offer/Price + read models；fresh/non-empty；canonical R3；staging aligned | 无 |
| 02 API/contract | Completed | Offer-aware Consumer/Admin API + OpenAPI；DB 73/1536；API 111/111；contracts/breaking；staging migration + account-api v62；task branch 已 push | 无 |
| 03 Admin commerce UI | Completed | Global/Platform summary、Offer/Price、Entitlement stable cursor、Campaign stats/detail、OPT-004/006/009 集成；Admin unit 15/68、typecheck/build/lint/format、Consumer harness、真实 Local browser 与 100-observation responsive/a11y 全 PASS | 无 |
| 04 Release | In Progress | Phase 03 已满足依赖门槛 | fresh/non-empty/full R3、staging smoke、GitHub/main/branch closeout |

## 实施与验证日志

| 日期 | 范围 | 来源 | 结果 |
| --- | --- | --- | --- |
| 2026-10-12 | OPT-009 predecessor | `main@a0e90373...` | PASS：OPT-009 product + docs closeout、CI、staging 与 branch cleanup 已完整闭环后才创建 OPT-010 分支 |
| 2026-10-12 | OPT-010 revalidation | latest main source/migrations/contracts | PASS：完成 Plan/Offer/Price、Checkout、Grant source、Settlement/refund、Redemption、Admin UI/API 事实重核并冻结 design |
| 2026-10-12 | Formal Proposal baseline | `docs:check` + `pnpm verify:task:0801 --reuse-local` | PASS：192 documents；canonical 20/20 gates；DB 71/1472、API 107/0、Admin/Consumer browser、100-route responsive/a11y、OpenAPI account/admin 46/65、breaking/registry/runtime/contracts 全绿 |
| 2026-10-12 | Phase 01 implementation | worktree | PASS：新增 Offer/immutable Price domain、legacy bootstrap、Provider/Checkout/Redemption additive attribution、Commerce Summary、Entitlement stable cursor/filter、Campaign v2 masked detail 与 FK indexes；`t32_commercial_operations.sql` 43 assertions PASS |
| 2026-10-12 | Phase 01 transient validation | Local | 首轮 canonical 曾在 `bill_13_admin_billing_pagination.sql` 的 tie-order 断言失败；随后 fresh DB 与重复 canonical 均 PASS，确认不是生产排序回归，因此未为偶发本地污染修改产品排序逻辑 |
| 2026-10-12 | Phase 01 non-empty upgrade | Local Supabase | PASS：从 `20261012094715` 建立 legacy paid plan/provider/checkout/order/grant/redemption fixture 后前向应用三条 migration；生成 3 legacy Offer/Price；订单 `9.90`、`billing_order` Grant、active Campaign 保持；历史 Checkout/Batch attribution 维持 null 以保留历史解释 |
| 2026-10-12 | Phase 01 fresh DB | Local Supabase | PASS：`pnpm db:reset --yes`；`pnpm test:db` = 72 files / 1515 tests |
| 2026-10-12 | Phase 01 canonical R3 | Local | PASS：`pnpm verify:task:0801 --reuse-local` = 20/20 gates；API 107/107；DB 72/1515；settlement concurrency、contracts breaking、registry、Consumer/Admin browser、docs/OpenAPI 全绿 |
| 2026-10-12 | Phase 01 staging migrations | `workendstaging / egsokuicabbxspkdccqe` | PASS：`20261012114256`、`20261012123209`、`20261012131422` 全部进入 remote migration history；只读 SQL 核验 Offer/Price、Commerce Summary、Entitlement list、Campaign v2 与 `billing_checkout_commercial_price_idx` 均存在；Production NOT_RUN |
| 2026-10-12 | Phase 02 implementation | Local | PASS：Offer catalog、`offer_id XOR product_code` Checkout、Price-scoped Provider Mapping、Admin Offer/Price/Mapping、Commerce Summary、Entitlement filters、Campaign v2/detail 与 Offer-based Campaign create 全部接入现有 Account/Admin API；高风险写保持 recent-MFA，权益命令继续复用 `admin_entitlement_command` |
| 2026-10-12 | Phase 02 DB/API | Local | PASS：fresh reset；DB **73 files / 1536 tests**（新增 `t33` 21 assertions 验证非 legacy 7-day Offer Checkout、server pricing、snapshot/idempotency）；API **111/111**；typecheck/lint/format/diff 全绿 |
| 2026-10-12 | Phase 02 contracts | Local | PASS：Account/Admin OpenAPI **47/77 operations**；Consumer Lab snapshot/compatibility、breaking PASS；为 additive response union 增加 breaking-checker 回归，只有完整保留旧 response schema 的新 union 才允许通过 |
| 2026-10-12 | Phase 02 staging | `workendstaging / egsokuicabbxspkdccqe` | PASS：remote migration history=`20261012145252 commercial_operations_api_contract`；SQL 核验 Offer/Checkout/Admin/Campaign functions + constraint/index；`account-api` **v62 ACTIVE**（from v61，`verify_jwt=false` 保持）；Security advisor 仅既有 pg_net/leaked-password WARN，未出现 OPT-010 新 SECURITY finding；Production NOT_RUN |
| 2026-10-12 | GitHub delivery | task branch | PASS：远端先存在 patch-equivalent Proposal `43891ca`；本地 Phase 01/02 安全 rebase 到该 SHA 后无 force push 成功。当前远端：`056e881 feat(db): complete opt-010 commerce domain`、`5f20f1e feat(api): add opt-010 commerce contracts`。最终 PR/CI/main/branch cleanup 仍属于 Phase 04。 |
| 2026-10-12 | Phase 03 implementation | Local Admin | PASS（implementation/static）：同一 `admin_commerce_summary` 驱动 Global Billing、Platform Billing 与 Overview；Plans 增 Offer/Price + readiness；Subscriptions 增 stable cursor/filter + source；Redemption 切 server Campaign stats/filter/cursor + masked code detail；Onboarding readiness 升级为 active Offer + active Price + ready Mapping；Account 360 增 source/Offer/Billing/Campaign 深链。Admin unit **15 files / 68 tests**、typecheck、production build、lint PASS。 |
| 2026-10-12 | Phase 03 browser environment | Local | IN_PROGRESS：首次 E2E 在测试用户创建于 Local Supabase、Admin Web 仍指向非 Local Auth 时于登录得到 403；这发生在任何 Commerce DOM 断言前。已启动独立 Local `account-api` 并确认无 Platform Key 请求按预期返回 401，正在用内存注入 Local Supabase env 的 built Admin server 继续；失败不计为产品回归，也不预填 browser PASS。 |
| 2026-10-13 | Phase 03 browser recovery + product fix | Local | PASS：Local Auth + Local Edge + built Admin 同源环境完成；发现 Commerce composite 写函数使用 select (volatile_function(...)).* 会重复求值并导致 Offer 首次写入 23505/409，已统一改为 select * from function(...) as result，API **111/111** 保持 PASS。 |
| 2026-10-13 | Phase 03 real browser / a11y | Local | PASS：完整 T12 browser 输出所有顶层治理场景 PASS；commerceSummarySurfaces、commerceCatalogSurface、commerceEntitlementSurface、commerceCampaignSurface、commerceRecentMfaNoReplay 全 PASS；responsive/a11y **5 viewports × 20 routes = 100 observations** 全 PASS。 |
| 2026-10-13 | Phase 03 final static/harness | Local | PASS：Admin unit **15 files / 68 tests**、typecheck、production build、workspace lint **0/0**、format PASS；Consumer harness contract（含 **43 canonical operations**）+ smoke 全 PASS。 |

## 规则

- 不预填 PASS；任何失败/修复/复测都记录。
- 每个 phase 只有本地验证、适用 staging、commit/push 证据都完整后才进入依赖阶段。
- 最终必须完成 PR/CI/main/branch cleanup 后才能标记 Completed。
