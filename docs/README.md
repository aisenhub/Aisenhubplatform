# 项目文档

- [系统概览](architecture/overview.md)
- [优化设计与实施计划](proposals/README.md)
- [平台账户与安全边界决策](decisions/0001-platform-account-boundaries.md)
- [决策记录索引](decisions/README.md)
- [运行拓扑](architecture/deployment.md)
- [身份与安全](architecture/modules/identity-security.md)
- [权益与兑换](architecture/modules/entitlements.md)
- [文件与任务](architecture/modules/files-jobs.md)
- [管理端与平台参考页面](architecture/modules/frontends.md)
- [本地开发](guides/development.md)
- [测试](guides/testing.md)
- [运维操作](guides/operations.md)
- [API](reference/api.md)
- [跨模块合同](reference/contracts.md)
- [SDK 与 Registry](reference/sdk.md)
- [数据模型](reference/data-model.md)
- [配置](reference/configuration.md)
- [工具链](reference/toolchain.md)
- [文档维护规则](agents.md)

## 详细文档迁移映射

历史文件名不再作为第二套文档保留；详细内容已按职责放入当前结构：

| 旧文件 | 当前文档 |
| --- | --- |
| `docs/api-sdk.md` | [API](reference/api.md)；SDK 发布与 Registry 入口见 [SDK 与 Registry](reference/sdk.md) |
| `docs/auth-security.md` | [身份、安全与生命周期](architecture/modules/identity-security.md) |
| `docs/config-files.md` | [配置文件与持久任务](architecture/modules/files-jobs.md) |
| `docs/data-model.md` | [核心数据模型](reference/data-model.md) |
| `docs/operations.md` | [运维操作](guides/operations.md) |
| `docs/subscription-redemption.md` | [订阅、权益与兑换](architecture/modules/entitlements.md) |
| `docs/development/contracts.md` | [跨模块合同](reference/contracts.md) |
| `docs/development/decision-register.md` | [决策记录](decisions/README.md) 与 [ADR-0001](decisions/0001-platform-account-boundaries.md) |
| `docs/upstream-sources.md` | [工具链、上游来源与许可证](reference/toolchain.md) |
