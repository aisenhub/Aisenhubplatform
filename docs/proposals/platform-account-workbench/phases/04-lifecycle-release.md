# 阶段 04：Lifecycle / Release

状态：Not Started

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

完成 Account support 数据的 Global Delete/retention 隐私收口、完整 R3、已授权 staging 同步和 GitHub/main closeout。

## 任务

- [ ] LIFE-001：验证 Global Delete/retention 对 tags/notes/governance reason 的清理/脱敏；普通 account close 不误触发隐私删除。
- [ ] LIFE-002：验证 Config/Feedback/Billing 摘要在账户 closed/deleting/identity deleted 场景的 fail-closed 语义。
- [ ] TEST-001：当前库 + fresh reset + non-empty upgrade 全量 DB。
- [ ] TEST-002：API/contracts/breaking、Admin unit/typecheck/build、Consumer/Admin browser、lint/format/docs。
- [ ] TEST-003：canonical `TASK-0801` R3 PASS。
- [ ] STAGE-001：如 migration/Edge 有变更，同步到已授权 staging 并核对 migration/function/权限/HTTP smoke。
- [ ] GIT-001：最终 diff/hygiene、push task branch、PR/CI、fast-forward/merge main、核对远端 main。
- [ ] GIT-002：确认无独有提交/未提交改动后清理本地/远端 OPT-009 分支。

## 退出条件

所有必需 R3 与 staging 证据 PASS、最终 main 与远端状态一致且分支清理完成后，OPT-009 才可标记 Completed 并开始 OPT-010。Production 未授权则明确 NOT_RUN。
