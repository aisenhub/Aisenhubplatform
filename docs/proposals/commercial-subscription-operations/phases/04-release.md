# 阶段 04：Upgrade / Staging / Release

状态：In Progress

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

完成非空升级、完整 R3、staging 状态核对和 GitHub/main/branch closeout。

## 任务

- [ ] LIFE-001：Plan/Offer/Price archive、Purchases Paused、Mapping 失效、历史 Checkout/Grant/Order 的兼容生命周期验证。
- [ ] LIFE-002：Global Delete/retention 对新增商业外键/投影无 PII 回流或阻塞。
- [ ] TEST-001：fresh reset + non-empty upgrade + full DB。
- [ ] TEST-002：API/OpenAPI/breaking、Admin/Consumer browser、unit/typecheck/build、lint/format/docs。
- [ ] TEST-003：canonical `TASK-0801` R3 PASS。
- [ ] STAGE-001：staging migration/Edge 对齐，SQL/权限/HTTP/关键工作流 smoke。
- [ ] GIT-001：最终 diff/hygiene、push、PR/CI、merge/rebase main、核对远端 main。
- [ ] GIT-002：确认无独有提交/未提交改动后删除本地/远端 OPT-010 分支。

## 退出条件

所有适用 R3、staging、GitHub main 与分支清理均闭环后才把 OPT-010 标记 Completed。Production 默认 NOT_RUN。
