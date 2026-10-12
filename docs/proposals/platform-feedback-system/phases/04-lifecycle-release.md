# Phase 04 — 删除生命周期、恢复边界与发布收口

状态：已完成

## 目标

完成 Feedback attachment Maintenance cleanup、Global Delete/retention/backup barrier 集成和整项 R3 验收，随后执行 Git closeout。

## 修改范围

- Maintenance candidate/claim/remove/finish + tests。
- forward migration：把 feedback privacy helper 接入现有 `deletion_job_step(files_blocked)` 与 `account_retention_cleanup`，不新增 checkpoint。
- architecture/reference/onboarding/Admin DESIGN/Intake。
- canonical R3、final diff/hygiene/Git。

## 生命周期验证

- Storage remove 成功后 attachment/feedback 收敛 deleted。
- remove failure/timeout 保持 deleting + retry。
- write unknown/in-flight 不释放对象身份或盲删。
- backup barrier active 阻止物理删除。
- Global Delete/retention 立即使正文/邮箱/note/labels不可见并进入 cleanup。
- 旧 Config/Files/Global Delete/Retention 全量回归继续 PASS。

## 最终验证

fresh + non-empty upgrade、full pgTAP、API、maintenance、Consumer Harness、Admin browser/T12、unit/typecheck/build/lint/format/docs/contracts/breaking/toolchain、Supabase Advisors、final diff/hygiene/secret review。

实际结果：fresh migration 全量重放 PASS；Phase 02 非空 Feedback/label/event/active attachment 数据向前升级到 Phase 03/04 后内容与状态原样保留，升级库 t29+t30 52/52 PASS；最终 Local DB 70 files / 1420 tests、API 106/106、Consumer `feedbackSubmissionAndIsolation=PASS`，canonical `TASK-0801` 20/20 executable gates PASS。Production NOT_RUN。

## Git closeout

已完成：任务分支产品提交 `fb6ec006bdba94b844a2635d5883dc0ec1dcc292` 已推送并 fast-forward 到远端 main；远端 main 核对一致后，本地/远端 `codex/opt-008-feedback-system` 均已删除。Production NOT_RUN。最终 docs-only closeout 后按用户要求暂停，不启动 OPT-009。
