# 开发与优化计划

`docs/plans` 是新的开发、优化与文档治理计划目录。每次独立工作使用一个语义明确的子目录，保存本次工作的目标、设计约束、阶段顺序、验证与完成条件。

项目需求由 [`docs/spec`](../spec/README.md) 管理；当前稳定实现由 [`docs/architecture`](../architecture/README.md) 管理；计划只能描述“如何改变”，不能代替 Requirement，也不能把尚未实现的目标提前写成当前架构。

## 当前工作

- [当前剩余工作 TODO](TODO.md)：以 Active Requirement 的 Partial/Planned 缺口、当前源码和真实环境证据为准的唯一剩余工作清单。
- [TODO 缺口收敛实施计划](todo-remediation-2026-10-16/plan.md)：本轮仓库实现已完成，当前仅被 Local Supabase 服务权限及真实外部环境/政策/生产授权阻塞；验证证据见同目录 `verification-record.md`。

## 计划基础设施

- [计划编写规范](plan-writing.md)
- 模板：[Design](_template/design.md) · [Plan](_template/plan.md) · [Phase](_template/phases/01-phase.md) · [Agent Handoff](_template/agent-handoff.md) · [Verification Record](_template/verification-record.md)

旧 `docs/proposals` 已在 2026-10-15 文档收敛中退出顶层结构。完成或被后续主干吸收的 Plan 在稳定事实进入 Architecture/Spec、真实未完成项迁入 `TODO.md` 后删除，实施过程由 Git 历史追溯；`docs/plans` 不再承担历史档案库职责。

## 计划要求

每个计划至少必须说明：

- 关联 Requirement 或明确声明“不改变产品 Requirement”；
- 当前事实与问题；
- 范围和非目标；
- 按依赖排序的阶段；
- 每阶段输入、输出、验证和退出条件；
- 风险、数据/合同/安全边界和回滚策略；
- 完成后应同步的 Architecture / Spec / Review。

未经验证的执行结果不得写成通过；Completed 计划的稳定事实进入长期文档后，过程资料是否保留由文档治理规则决定。

## 实施 Agent 固定顺序

执行计划时至少遵循：

1. 阅读根 `AGENTS.md`、`docs/README.md`、`docs/development/documentation-governance.md` 和适用 Requirement。
2. 阅读当前 Architecture、对应 Plan/Design/Phase 和实际源码/迁移/OpenAPI/测试；历史资料只提供背景，不覆盖当前事实。
3. 记录任务 ID、起始 HEAD、工作区已有改动、风险级别、受影响消费者和授权边界；不得擅自覆盖其他任务工作区。
4. 先冻结共享数据/合同/状态机，再实施可独立验收的阶段；共享 migration/OpenAPI/领域函数不得由并行 Agent 各自发明。
5. 每阶段运行计划要求的验证并把真实命令、退出码、失败/复测、commit/push 状态写入 verification record；计划文字本身不是验证证据。
6. 只有满足阶段退出条件才更新状态；需要生产部署、真实 Provider、费用、远程恢复或其他高风险操作时仍需独立授权。

## Git 与协作边界

- 新任务从最新已确认基线使用短期 `codex/<task>` 分支；不 force push、不重写既有历史。
- 多 Agent 并行必须先切分文件/领域所有权；同一 migration、OpenAPI、共享 contract 或状态机默认串行。
- 不自动 stash、丢弃、覆盖或混入无法确认归属的已有改动。
- commit/push 只代表代码交付证据，不代表部署；Hosted/Staging/Production 结论必须说明真实执行层级。
