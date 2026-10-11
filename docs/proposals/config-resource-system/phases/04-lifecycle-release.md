# Phase 04 — 删除生命周期、备份真值与发布收口

状态：未开始

## 目标

把 Config 业务层并入 Global Delete / retention / cleanup / backup barrier，完成全链验收、文档和 Git closeout。

## 实施项

- [ ] LIFE-001：Config delete 原子移出 Gallery、cancel pending submission、标记全部 Version file deleting；file cleanup 结算后 reconcile Config deleted。
- [ ] LIFE-002：Global Delete `files_blocked` 与 account retention cleanup 立即停 Gallery、Config deleting、清理 liker 关系、Usage actor 匿名化、清空用户文本，并继续现有物理文件删除。
- [ ] LIFE-003：Gallery query 要求作者账户 active；关闭账户后无需等待物理清理即可停止公开访问。
- [ ] BACKUP-001：文档/协议声明 Config/Version/Gallery/Like/Usage 进入恢复数据集；现有 backup barrier 继续阻止删除，但没有外部 Storage backup 时 Admin 不显示已备份。
- [ ] DOC-001：同步 files-jobs、frontends、onboarding guide、Admin DESIGN、Account/Admin contract 文档与 OPT Intake。
- [ ] VERIFY-001：fresh + upgrade Local Supabase、SQL、Account/Admin API、unit/typecheck/build/lint/format/docs、contracts/breaking、Consumer Harness Local E2E、Admin T12/synthetic 全绿。
- [ ] VERIFY-002：对授权 staging 最终 migration/function/Edge/advisors/smoke 做 commit 对齐核验；Production 明确 NOT_RUN。
- [ ] REL-001：运行 canonical `pnpm verify:task:0801`，final diff/hygiene，通过后 commit/push、fast-forward main、远端 SHA 核对并清理任务分支。

## 完成门槛

- Global Delete/retention 不留下可公开访问的作者 Config。
- Storage 对象的删除与预算释放仍由原 file state machine 证明，不按业务行状态猜测。
- 所有 docs/current architecture 在实现后才更新为事实。
- main/GitHub/staging 完全对齐后才能进入 OPT-008。
