# 项目文档

- [需求管理](spec/README.md)：项目级 Requirement、验收条件与需求追踪；开发设计和架构都必须引用对应 Requirement ID。
- [模块化架构文档](architecture/README.md)：当前项目完整模块地图、领域边界、跨模块基础设施和资料吸收矩阵；后续架构整理以此为主入口。
- [开发、测试与运维指南](development/README.md)：开发/发布流程、本地开发、测试、运维、接入兼容入口与文档治理；当前内容已从旧 Guide 收敛，后续可继续重建。
- [开发与优化计划](plans/README.md)：从现在开始的新计划权威入口；当前文档架构收敛工作按其详细计划执行。
- [审查与审计](review/README.md)：风险、评分、问题与优化建议；当前实现事实回写 Architecture/Spec。

## 架构与精确参考

- [系统概览](architecture/overview.md)
- [平台账户与安全边界决策](architecture/decisions/0001-platform-account-boundaries.md)
- [决策记录索引](architecture/decisions/README.md)
- [Billing 历史输入](plans/subscription-billing-centralization/history/README.md)：仍被活跃 Billing Plan 直接依赖，不作为当前架构事实。
- [运行拓扑](architecture/deployment.md)
- [身份与安全](architecture/modules/identity-security.md)；其他业务模块统一从[模块化架构索引](architecture/README.md)进入。
- [本地开发](development/development.md)
- [新平台接入手册（兼容入口；当前权威入口为 platform-integration）](development/platform-onboarding.md)
- [测试](development/testing.md)
- [运维操作](development/operations.md)
- [文档维护规则](development/documentation-governance.md)
- [API](architecture/reference/api.md)
- [跨模块合同](architecture/reference/contracts.md)
- [平台接入包（开发者与 AI Agent）](../platform-integration/README.md)
- [数据模型](architecture/reference/data-model.md)
- [配置](architecture/reference/configuration.md)
- [工具链](architecture/reference/toolchain.md)

## 详细文档迁移映射

历史文件名不再作为第二套文档保留；详细内容已按职责放入当前结构：

| 旧文件 | 当前文档 |
| --- | --- |
| `docs/api-sdk.md` | [API](architecture/reference/api.md)；新平台接入与 Registry 见[平台接入包](../platform-integration/README.md) |
| `docs/auth-security.md` | [身份、安全与生命周期](architecture/modules/identity-security.md) |
| `docs/config-files.md` | [配置文件与持久任务](architecture/modules/files-jobs.md) |
| `docs/data-model.md` | [核心数据模型](architecture/reference/data-model.md) |
| `docs/operations.md` | [运维操作](development/operations.md) |
| `docs/subscription-redemption.md` | [订阅、权益与兑换](architecture/modules/entitlements.md) |
| `docs/development/contracts.md` | [跨模块合同](architecture/reference/contracts.md) |
| `docs/development/decision-register.md` | [决策记录](architecture/decisions/README.md) 与 [ADR-0001](architecture/decisions/0001-platform-account-boundaries.md) |
| `docs/upstream-sources.md` | [工具链、上游来源与许可证](architecture/reference/toolchain.md) |
