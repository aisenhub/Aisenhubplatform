# OPT-010 实施交接

- 优化名称：OPT-010 全局商业治理与单平台订阅运营
- 总计划：[plan.md](plan.md)
- 当前阶段：Phase 04 / In Progress
- 任务分支：`codex/opt-010-commercial-operations`
- 基线：`main@a0e903731333cdddeb20361064d9e3557ef5bd84`
- 风险：R3

## 必读顺序

1. 根 `AGENTS.md`、`docs/agents.md`、开发发布流程。
2. `design.md`、`plan.md`、当前 phase、`verification-record.md`。
3. `docs/proposals/optimization-intake/commercial-subscription-operations-architecture.md` 只作为历史输入；实施以最新 main 与正式 design 为权威。
4. Entitlement/Billing/Redemption migrations、Account/Admin API、Account/Admin OpenAPI、Admin plans/subscriptions/redemption/billing 页面、OPT-004/006/009 集成点。

## 不可回退约束

1. 不重写 `subscription_grants/events/subscriptions` 权益权威链。
2. Plan/Offer/Price 分层；Price 发布后不可原地改金额。
3. 首版 CNY only；不伪装 recurring，不展示 MRR/ARR/churn。
4. legacy Monthly/Yearly/Lifetime Consumer contract 必须兼容。
5. 商业金额只用 design 冻结的可核实 settlement/refund 口径。
6. Admin Grant 明确为手工/补偿权益，不伪装 Billing purchase。
7. Redemption 明文/HMAC 不进入运营 DTO。
8. 高风险写保持 recent-MFA、reason、idempotency、unknown-outcome 恢复。
9. Production 默认 NOT_RUN。

## 当前执行环境

OPT-009 已完成并 closeout 到 `main@a0e90373...`，原任务/closeout 分支已清理。OPT-010 Phase 01–03 已完成；Phase 04 的 fresh DB **73/1536**、真实 non-empty upgrade、commerce lifecycle、retention / Global Delete compatibility 与 canonical `TASK-0801` **20/20** 已全绿。授权 staging 已对齐 `20261012145252 commercial_operations_api_contract`，`account-api` 为 **v63 ACTIVE** 且保持 `verify_jwt=false`；最终 runtime bundle 已包含 JWT issuer 分离与 Commerce VOLATILE 写函数单次求值修复，HTTP fail-closed 与 Security advisor 核验通过。当前仅剩 GitHub PR/CI/main/branch cleanup；Production 仍为 NOT_RUN。

## 阶段完成门槛

- [x] Phase 01 数据模型/读模型与权限已实施。
- [x] fresh + non-empty upgrade 与 pgTAP 真实通过。
- [x] 需要的 staging migration 已同步并核对。
- [x] verification record 已更新。
- [x] Phase 02 local + staging 技术验证已完成。
- [x] task branch commits 已 push 并核对：远端 Proposal `43891ca` + Phase 01 `056e881` + Phase 02 `5f20f1e`；无 force push。
- [x] Phase 03 Admin commerce UI / cross-OPT integration + 真实 browser / responsive-a11y / Consumer harness 已完成。
- [x] Phase 04 fresh/non-empty/full R3、lifecycle/retention 与 staging v63 已完成。
- [ ] Phase 04 GitHub PR/CI/main/branch cleanup 待完成。
