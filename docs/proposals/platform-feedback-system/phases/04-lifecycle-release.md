# Phase 04 — 删除生命周期、恢复边界与发布收口

状态：未开始

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

## Git closeout

满足仓库自动合并条件后 push 任务分支、核对 SHA、合并/fast-forward main、push main、核对远端 main，再删除无独有提交的本地/远端任务分支。Production 未明确授权则 NOT_RUN。
