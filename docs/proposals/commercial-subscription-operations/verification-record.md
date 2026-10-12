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
| 01 Domain/read model | In Progress | Formal design frozen | 无 |
| 02 API/contract | Not Started | - | 依赖 01 |
| 03 Admin commerce UI | Not Started | - | 依赖 02 |
| 04 Release | Not Started | - | 依赖 01–03 |

## 实施与验证日志

| 日期 | 范围 | 来源 | 结果 |
| --- | --- | --- | --- |
| 2026-10-12 | OPT-009 predecessor | `main@a0e90373...` | PASS：OPT-009 product + docs closeout、CI、staging 与 branch cleanup 已完整闭环后才创建 OPT-010 分支 |
| 2026-10-12 | OPT-010 revalidation | latest main source/migrations/contracts | PASS：完成 Plan/Offer/Price、Checkout、Grant source、Settlement/refund、Redemption、Admin UI/API 事实重核并冻结 design |
| 2026-10-12 | Formal Proposal baseline | `docs:check` + `pnpm verify:task:0801 --reuse-local` | PASS：192 documents；canonical 20/20 gates；DB 71/1472、API 107/0、Admin/Consumer browser、100-route responsive/a11y、OpenAPI account/admin 46/65、breaking/registry/runtime/contracts 全绿 |

## 规则

- 不预填 PASS；任何失败/修复/复测都记录。
- 每个 phase 只有本地验证、适用 staging、commit/push 证据都完整后才进入依赖阶段。
- 最终必须完成 PR/CI/main/branch cleanup 后才能标记 Completed。
