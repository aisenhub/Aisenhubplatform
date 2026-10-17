# 开发、测试与运维指南

`docs/development` 是当前开发执行资料的统一入口。2026-10-15 先完成旧 Guide 的职责迁移；2026-10-16 在不改变 `spec / architecture / plans / review` 权威边界的前提下完成第二轮结构收敛：稳定工作规则留在本目录，目标环境/Provider/恢复等可执行步骤拆入 `runbooks/`，不再把一次性运行证据混进 Architecture 或 Plan。

## 当前入口

- [Agent 开发、分支合并、本地验证与生产发布流程](development-release-workflow.md)
- [本地开发](development.md)
- [测试](testing.md)
- [Design System](design/README.md)：通用设计原则、Foundations、标准组件契约、页面模式与 UI/UX 规则
- [运维、备份、恢复与发布](operations.md)
- [运维与发布 Runbook](runbooks/README.md)：Hosted Maintenance、Provider、备份恢复、Retention、Production 执行清单
- [新平台接入兼容入口](platform-onboarding.md)
- [文档维护规则](documentation-governance.md)

## 与其他顶层目录的边界

- [`../spec`](../spec/README.md)：系统必须满足什么、验收条件与 Requirement 状态。
- [`../architecture`](../architecture/README.md)：当前已经实现的系统结构、边界与精确 reference / ADR。
- [`../plans`](../plans/README.md)：未来改变如何设计、分阶段实施和验证。
- [`../review`](../review/README.md)：审查发现、风险、评分与优化建议。

开发指南可以引用这些权威来源，但不能复制出第二套 Requirement、当前架构事实或合同定义。
