# OPT-008 平台用户反馈系统总计划

状态：In Progress（实现与 Local R3 已验收，Git closeout 待完成）

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从 `main@67620082f43f2e608f24a5d301bb5adacbfc887f` 新增完整 Feedback 领域、专用 private Storage attachment ledger、Account v1 Consumer contract、Admin 处理中心、Overview 聚合与 Global Delete/retention/cleanup 集成。风险分级 **R3**。

当前分支：`codex/opt-008-feedback-system`。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | Feedback/Attachment 数据模型、专用 Storage、领域状态机与权限 | 最新 main / 正式 design | 已完成 | [阶段 01](phases/01-domain-storage.md) |
| 02 | Account v1 additive API、Auth 邮箱快照、Consumer Harness/E2E | 01 已完成 | 已完成 | [阶段 02](phases/02-account-consumer.md) |
| 03 | Admin API/UI、筛选/治理/CSV/批量删除、Overview 聚合 | 01–02 已完成 | 验收通过待交付 | [阶段 03](phases/03-admin-feedback-center.md) |
| 04 | Maintenance cleanup、Global Delete/retention/backup barrier、完整 R3 与 Git closeout | 01–03 已完成 | 验收通过待 Git closeout | [阶段 04](phases/04-lifecycle-release.md) |

阶段串行交付。共享 migration、OpenAPI、Account/Admin API、Harness 和 lifecycle 函数不并行修改。

## 跨阶段冻结契约

- Feedback：`draft/new/reviewing/planned/resolved/closed/deleting/deleted`。
- Attachment：`pending/receiving/storing/active/deleting/deleted/failed/expired`；write outcome 与设计一致。
- bucket：`platform-feedback-attachments`，private；JPEG/PNG/WebP；每张 ≤4 MiB、每反馈 ≤5 张/12 MiB。
- Account API 不接受归属、邮箱、Admin 状态/标签；邮箱只由服务端 Auth 快照。
- 删除统一走 Feedback domain helper + Maintenance Storage API，不直接删 `storage.objects`。
- Global Delete/retention 不增加 checkpoint，接入现有 `files_blocked` / retention cleanup。
- CSV 只导出数据库字段与附件 metadata，不打包图片。

## 总体验收

- [x] Schema/RLS/grants/索引与 fresh/upgrade 完成。
- [x] Account additive contract、Consumer Harness 与真实 Local 图片上传/提交闭环通过。
- [x] Admin feedback center 和 Overview 权威聚合完成。
- [x] Global Delete/retention/backup barrier/Storage cleanup 失败恢复通过。
- [x] contracts/API/unit/typecheck/build/lint/format/docs/DB/browser E2E 全绿。
- [ ] final diff/hygiene、main/远端 SHA/任务分支清理闭环。

## 风险与阻塞

- Production 未授权；不得部署 Production。
- 若 main push 会自动部署 Production，合并前必须重新核实绑定和 G0–G5；未知则阻止 main push。
- 外部 Storage object backup 仍无可证明介质，不作为假验收项。

## 验证与交付

每阶段实际命令、失败/修复、commit/push 与远端核对写入 [verification-record.md](verification-record.md)。R3 最终候选必须覆盖 fresh + non-empty upgrade、权限、并发/恢复、Storage Local/Mock、Consumer 与 Admin 浏览器链。
