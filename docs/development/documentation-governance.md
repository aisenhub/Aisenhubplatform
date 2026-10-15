# 文档维护规则

`docs/spec` 是项目 Requirement 的权威管理层，定义系统必须满足什么以及怎样验收；当前架构文档描述实际代码、迁移与配置如何满足这些 Requirement；优化设计和实施计划单独维护。判断当前行为时，代码行为优先于测试断言，测试与配置优先于架构说明；但代码与 Active Requirement 不一致时应记录为需求缺口，不能因为当前代码如此就静默改写 Requirement。

所有Agent开始任务必须阅读[开发与发布流程](development-release-workflow.md)，据整次变更选择R0/R1/R2/R3、本地验证及生产门槛。该文件描述已接受的工作规则，不证明环境或自动化已建立；代码当前行为也不能用于豁免发布规则。

仓库根 [`platform-integration`](../../platform-integration/README.md) 是当前 Contract-First 平台接入的唯一推荐入口，同时维护开发者文档、AI 指令、capability 索引、Harness/配置、用户待办与验收。Auth/BFF/HTTP 合同/Registry/Consumer Harness 变更时在同一任务检查同步；独立新平台的实际测试记录另存，不能以接入包存在证明接入成功。[`platform-onboarding.md`](platform-onboarding.md) 仅保留兼容入口。

## 目录职责

| 目录 | 内容 |
| --- | --- |
| spec | 项目 Requirement、验收条件、状态与需求追踪 |
| architecture | 已实现的模块、边界、调用链、运行组件；`architecture/reference` 保存精确 API/配置/数据模型/合同/工具链，`architecture/decisions` 保存 ADR |
| development | 开发/发布流程、本地开发、测试、运维、接入兼容入口与文档治理；当前内容由旧 Guide 完整收敛，后续可继续重建 |
| plans | 新开发/优化的目标设计、总计划、分阶段计划及其执行状态 |
| review | 审查、审计、风险、评分与优化建议；不作为当前实现事实源 |
| README.md | 文档导航 |

已有历史资料的清理不限制后续维护优化设计和计划。新需求先在 [spec](../spec/README.md) 建立或引用稳定 Requirement ID；从 2026-10-15 起，新优化统一进入 [plans](../plans/README.md)，每项工作建立独立目录。旧 `proposals` 顶层已经退出；Design/Plan 必须继续沿用 Requirement 追踪规则。

Plan 按 Proposed → In Progress → Completed 维护；只有实际开始执行或满足验收条件后才更新状态。每个阶段落地后同步 spec/architecture 和适用的 development 指南；未实现目标留在 Plan，不提前改写当前架构。Plan 完成且最终事实已经进入长期文档后，默认删除 design/plan/phases/agent-handoff/verification-record 等实施过程资料；只有仍被活跃任务直接依赖、或确有独立历史追溯价值且无法由 Git 历史替代的资料才保存在对应 Plan 的 `history/`。删除前先提取仍有效的架构决定、协议边界和运维规则，禁止为了减文件数丢失当前事实。

Requirement 追踪是强制关系：Architecture 必须声明承担哪些 `REQ-*`；Design/Plan 必须声明本次满足、修改或不影响哪些 `REQ-*`；Verification/Review 必须能回指到对应 Requirement。若设计发现现有 Requirement 不足，先修改或新增 spec，再继续冻结目标设计，禁止让 Plan 自己成为唯一需求来源。

重要决策按需在 `architecture/decisions` 中记录背景、选择、影响及状态；决策被替代时使用新记录关联旧记录。没有实际内容时无需创建 ADR。执行证据可由计划链接到测试报告，不在当前架构中追加验收流水。

## 更新规则

1. 阅读根 AGENTS.md、本目录导航、相关源码与测试。
2. 阅读相关 `spec` Requirement，核对模块职责、接口、配置、数据库约束、运行入口和页面行为是否仍满足要求。
3. 每项事实只保留一个主要来源；其他文档链接引用。完整 SQL 以迁移为准，字段合同以 OpenAPI 和共享类型为准，避免复制整套定义。
4. 区分源码具备的能力、页面演示状态和外部部署事实。只有代码无法证明的生产配置，不写成已部署能力。
5. Requirement 变化时同步 spec 与 traceability；架构/设计/计划/审查必须更新 Requirement 引用。修改路径时同步根 README、Agent 入口、脚本、Registry 和文档内引用。
6. 运行 pnpm docs:check 与 pnpm contracts:check；涉及检查器时同时检查语法和负向用例。
7. 整理报告放在任务回复中，不写入 docs。不得写入真实凭据、用户数据、兑换码或文件内容。

文档整理不自动授权功能开发、生产部署或费用变更。
