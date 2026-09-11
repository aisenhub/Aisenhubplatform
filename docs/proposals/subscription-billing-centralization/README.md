# 统一订阅与中央支付 — Agent 实施计划

> 状态：In Progress / BILL-01 本地开发门槛已完成；真实 Provider 与运维门槛仍未运行。

唯一目标设计：[架构文档](AisenFlow_Subscription_Billing_Architecture.md)。本目录将设计转换为可派发任务，不保留旧架构副本或第二套冻结规则。当前代码事实仍以 architecture/reference 与实际源码为准。

执行导航：[设计入口](design.md) · [唯一总计划](00-master-plan.md) · [兼容入口](plan.md) · [Agent 交接](agent-handoff.md) · [验证记录](verification-record.md) · [Afdian 调试参考](afdian-debug-reference.md) · [Checkout 链接分析](afdian-checkout-link-analysis.md)。

- [BILL-01：协议验证、决策与开发门槛](phases/01-global-catalog-and-contract-foundation.md)
- [BILL-02：Catalog、平台映射与公共合同](phases/02-redemption-v2-and-term-semantics.md)
- [BILL-03：Ledger、Redemption V2 与生命周期合同](phases/03-billing-core-and-afdian-checkout.md)
- [BILL-04：Checkout、订单、Inbox 与持久任务](phases/04-webhook-order-processing-and-billing-entitlement.md)
- [BILL-05：Provider 验证、结算与双进度对账](phases/05-reconciliation-observability-and-central-admin.md)
- [BILL-06：中央 Admin、Consumer SDK/BFF 与服务端授权](phases/06-consumer-sdk-and-reference-template.md)
- [BILL-07：完整验收、迁移恢复与发布准备](phases/07-final-verification-cleanup-and-doc-sync.md)

历史文件名保留以避免链接断裂；旧 Phase01～07 已被 BILL-01～07 取代，编号含义不能混用。BILL-01 区分开发门槛 G-DEV 与真实渠道门槛 G-PROVIDER；可独立本地工作不因缺少真实凭据停摆，但实际购买启用必须通过真实渠道与运维门槛并另获部署授权。

第二期，仅在单独派发时评审/实施：

- [OAuth 与历史订单认领](phase-2/01-afdian-oauth-and-unlinked-order-claim.md)
- [多渠道、退款、Suite 及可选增强](phase-2/02-provider-expansion-refunds-and-suite-entitlements.md)

项目目标仓库：https://github.com/aisenhub/Aisenhubplatform.git。历史研究基线 d3c25e9 不代表执行起点；每次执行记录实际 HEAD。计划文档提交也不代表任何功能阶段已交付。
