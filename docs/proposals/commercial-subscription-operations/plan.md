# OPT-010 全局商业治理与单平台订阅运营总计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从 `main@a0e903731333cdddeb20361064d9e3557ef5bd84` 建立多 Paid Plan 的 Offer/immutable Price 商业目录，在不重写 Entitlement/Billing/Redemption 权威链的前提下升级 Consumer Checkout、经营汇总、权益用户列表、Redemption Campaign 与 Admin 商业工作台。风险分级 **R3**。

任务分支：`codex/opt-010-commercial-operations`。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | Offer/Price 数据模型、legacy bootstrap、经营/权益/Campaign 读模型 | 最新 main + design 冻结 | 进行中 | [阶段 01](phases/01-commerce-domain-read-model.md) |
| 02 | Consumer/Admin API、OpenAPI、Checkout/Provider Mapping 兼容 | 01 | 未开始 | [阶段 02](phases/02-api-contract-checkout.md) |
| 03 | Global/Platform 商业 UI、套餐/Offer、权益用户、Campaign 与跨 OPT 集成 | 02 | 未开始 | [阶段 03](phases/03-admin-commerce-workspaces.md) |
| 04 | lifecycle/upgrade/staging、完整 R3、GitHub/main closeout | 01–03 | 未开始 | [阶段 04](phases/04-release.md) |

阶段串行交付。数据库目录/Checkout/OpenAPI 属共享契约，不并行修改。

## 冻结契约

- Plan=权益，Offer=售卖期限/方式，Price=不可变价格版本；Provider Mapping 绑定具体 Price。
- 首版 CNY only；不存在真实 recurring 时不得显示 recurring cancellation/MRR/ARR/churn。
- legacy Monthly/Yearly/Lifetime 合同保留并映射到 bootstrap Offer；新实现不得破坏现有 Consumer。
- Grant/Event/Subscription projection 继续是权益权威链；来源固定 billing_order/redemption_code/admin。
- 商业金额只按 design 的“可核实成交/已补偿退款/净可核实成交额”口径，不把 show_amount/finalized 单独当收入。
- Redemption 明文仍只在创建响应一次性出现；运营详情永不返回明文或 HMAC。
- 高风险目录发布、Provider Mapping、权益治理继续 recent-MFA + reason + idempotent operation。
- Production 默认 NOT_RUN。

## 总体验收

- [ ] Offer/Price + legacy bootstrap + historical snapshot 完成。
- [ ] 多 Paid Plan 可销售，Plan/Offer/Price 不混淆。
- [ ] Consumer legacy + Offer-aware catalog/checkout 合同兼容。
- [ ] Global/Platform commerce summary 采用可证明金额口径。
- [ ] 权益账户列表 stable cursor/filter + source projection 完成。
- [ ] Admin direct entitlement governance 保持安全语义。
- [ ] Redemption Campaign v2 stats/detail 安全完成。
- [ ] OPT-004/006/009 集成完成。
- [ ] fresh/non-empty upgrade、DB/API/contracts/browser/canonical R3 全绿。
- [ ] staging 与最终 main 一致。
- [ ] PR/CI/main/branch cleanup 闭环。

## 风险与阻塞

- R3：涉及现有 checkout/settlement/entitlement 权威链。任何迁移必须 additive/forward，先保护 legacy contract。
- 退款观察并非完整会计系统；金额口径不足时必须显示 unknown，而不是推测 Revenue。
- Provider Mapping 迁移必须保证旧 Checkout snapshot 和已付款订单不受未来 Offer/Price 改动影响。
- 非空升级必须验证现有 paid_plan/fixed product/provider mapping/checkout/order/grant/redemption 数据保持解释一致。

## 验证与交付

每阶段至少执行定向 DB/API/unit/contracts；Phase 03 起加入真实 Admin/Consumer browser；Phase 04 fresh reset、non-empty upgrade 与 `pnpm verify:task:0801 --reuse-local`。涉及 Supabase migration/Edge 的阶段同步到已授权 `workendstaging` 并核对实际版本。
