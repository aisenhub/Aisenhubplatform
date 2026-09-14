# 订阅支付审查修复计划

状态：执行中（TASK-0001 基线冻结、TASK-0101/0103、TASK-0301～0306、TASK-0402、TASK-0601/0603/0605/0609 已完成本地实现或回归；TASK-0002 完成本地静态门槛审查）。其余F01–F17任务仍按依赖推进，不能以本地结果宣称阶段或生产完成。旧方案在编写期间由外部提交归档，见[历史资料](../../archive/subscription-billing-centralization/README.md)；不恢复、不重写、不复制其验证结果。

- [唯一修复总计划](plan.md)
- [问题总表](repair-issues.md)
- [依赖、文件、合同、测试、回滚及上线矩阵](repair-matrices.md)
- [目标设计与不变量](design.md)
- [Agent执行入口](agent-handoff.md)
- [验证记录模板](verification-record.md)

## 阶段索引

- [RC-00：基线、工作区与决策门槛](phases/00-repair-baseline-and-gates.md)
- [RC-01：状态、关系与公共合同修复设计](phases/01-global-catalog-and-contract-foundation.md)
- [RC-02：目录、不可变Checkout合同与购买意图](phases/02-redemption-v2-and-term-semantics.md)
- [RC-03：权威核验、Inbox、租约与未关联订单](phases/04-webhook-order-processing-and-billing-entitlement.md)
- [RC-04：共享权益、事实刷新、退款补偿与兑换码](phases/03-billing-core-and-afdian-checkout.md)
- [RC-05：Consumer支付体验与BFF恢复](phases/06-consumer-sdk-and-reference-template.md)
- [RC-06：Admin订单、人工处理与审计体验](phases/08-admin-billing-repair.md)
- [RC-07：主动对账、cron、告警与恢复](phases/05-reconciliation-observability-and-central-admin.md)
- [RC-08：全链路验收、迁移演练与发布门槛](phases/07-final-verification-cleanup-and-doc-sync.md)

本轮已实施 TASK-0301、TASK-0302、TASK-0304 的局部源码、迁移、合同与回归测试；未部署或连接真实 Provider/生产。阶段文件沿用旧职责路径，但状态和TASK均为本次修复，不能按旧文件名推断执行顺序。
