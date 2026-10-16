# 运维与发布 Runbook

`docs/development/runbooks` 只保存**怎么执行、怎么留证据、失败时怎么停**。Requirement 仍以 [`docs/spec`](../../spec/README.md) 为准，当前实现事实仍以 [`docs/architecture`](../../architecture/README.md) 为准；Runbook 不复制第二套状态机、API 或数据模型。

当前执行入口：

- [Hosted Maintenance / Billing Cron / Vault 验收](hosted-maintenance-evidence.md)
- [Afdian Provider 受控联调](afdian-provider-acceptance.md)
- [DB + Storage 备份恢复演练](backup-recovery-drill.md)
- [个人数据 Retention Policy 落地](retention-policy-rollout.md)
- [Production 发布与 G6 观察](production-release.md)

所有 Runbook 都遵循 [`development-release-workflow.md`](../development-release-workflow.md)。Local 是代码验收最高测试环境；Hosted/Provider/Production 步骤只在实际需要声明对应环境能力、开启真实业务或执行发布时运行，不额外制造普通代码合并门槛。生产写入、Secret/费用变化、真实付款和恢复操作必须被当前授权明确覆盖。

证据统一记录：目标环境、准确 commit / deployment、执行时间、操作者、输入配置版本（不记录 Secret 值）、实际命令或操作、关键 request/operation/job ID、结果、失败/复测、停止点和后续责任人。没有真实运行就写 `NOT_RUN`，不把代码存在、空队列 200 或 Dashboard 勾选当 PASS。
