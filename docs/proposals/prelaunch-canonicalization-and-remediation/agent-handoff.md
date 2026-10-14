# Agent 交接：预上线单轨化清理与缺陷修复

状态：In Progress / 已授权实施

## 开始前必读

1. `design.md`
2. `plan.md`
3. [15 个已确认 Bug](../../reviews/opt-001-010-confirmed-bugs-2026-10-13.md)
4. [Legacy / Compatibility 审查](../../reviews/prelaunch-legacy-compatibility-audit-2026-10-13.md)
5. 对应 `phases/*.md`
6. 根 `AGENTS.md`、`docs/agents.md`、release workflow

## 核心约束

- 用户已明确项目未正式上线、没有正式数据，不要求旧数据/旧接口兼容。
- 不要给将被删除的 legacy path 打补丁。
- 先按阶段 00 确认 destructive gate，再允许 reset/squash。
- 不触碰 Production。
- 保留并加强安全、幂等、并发、历史 snapshot 不变量。
- 每个阶段真实验证结果写入 `verification-record.md`；不要预填 PASS。

## 当前工作区注意

在本 Proposal 创建时，工作区已经存在不属于本审查任务的并发文档变更：`docs/README.md` 修改和 `docs/reviews/project-review-2026-10-13.md` 未跟踪文件。后续 Agent 必须重新核对归属，不得擅自覆盖或回滚。

## 实施授权

2026-10-14 已交付：R/LC 全部关闭、默认 Local fresh 22 gates PASS、测试 Supabase 和现有 Admin 托管渠道已发布，PR #19 已合并 main。准确源版本、限额/暂停配置与未运行的真实联调见[验证记录](verification-record.md)最新章节；原 `AUDIT_REPORT.md` 按用户要求继续保留，不提交。

用户已确认 R-01～R-15、LC-01～LC-13 与本 Proposal 的实施方向，并授权按阶段开始修改业务代码、合同、测试和计划文档。仍不包含 Production 部署、真实支付、费用变更或 force push；每阶段必须按门槛验证并记录真实结果。
