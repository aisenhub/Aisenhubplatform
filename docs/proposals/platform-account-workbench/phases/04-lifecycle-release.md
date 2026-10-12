# 阶段 04：Lifecycle / Release

状态：In Progress

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

完成 Account support 数据的 Global Delete/retention 隐私收口、完整 R3、已授权 staging 同步和 GitHub/main closeout。

## 任务

- [x] LIFE-001：验证 Global Delete/retention 对 tags/notes/governance reason 的清理/脱敏；普通 account close 不误触发隐私删除。
- [x] LIFE-002：验证 Config/Feedback/Billing 摘要在账户 closed/deleting/identity deleted 场景的 fail-closed 语义。
- [x] TEST-001：当前库 + fresh reset + non-empty upgrade 全量 DB。
- [x] TEST-002：API/contracts/breaking、Admin unit/typecheck/build、Consumer/Admin browser、lint/format/docs。
- [x] TEST-003：canonical `TASK-0801` R3 PASS。
- [x] STAGE-001：如 migration/Edge 有变更，同步到已授权 staging 并核对 migration/function/权限/HTTP smoke。
- [ ] GIT-001：最终 diff/hygiene、push task branch、PR/CI、fast-forward/merge main、核对远端 main。
- [ ] GIT-002：确认无独有提交/未提交改动后清理本地/远端 OPT-009 分支。

## 退出条件

所有必需 R3 与 staging 证据 PASS、最终 main 与远端状态一致且分支清理完成后，OPT-009 才可标记 Completed 并开始 OPT-010。Production 未授权则明确 NOT_RUN。

## 数据库退出证据

- `t31_account_workbench_domain.sql` 扩展到 52/52：普通 close 保留 Config/Feedback/Billing/support 历史；Global Delete `files_blocked` 后 Config/Feedback 摘要归零、tags 删除、notes/reasons 脱敏，Billing 仅保留不含金额/provider 私有标识的安全状态摘要；`personal_data_cleared` 清空 Profile；`auth_deleted` 解绑 UID 并留下匿名 closed Platform Account；三张 support/governance 表的 Admin actor FK 均有 covering index。
- 当前库与 fresh reset 均为 71 files / 1472 tests PASS；fresh 从零完整应用至 `20261012094715_platform_account_workbench_fk_indexes.sql`。
- non-empty upgrade 从 OPT-008 末尾 `20261011175718` 开始，保留旧 Account/Profile/Subscription/Config/Feedback 事实，仅前向应用三条 OPT-009 migration；定向 upgrade smoke 7/7、升级库全量 71/1469 PASS。Billing 旧订单的字段保持与 Account 360 安全摘要另做独立 smoke PASS，避免污染既有全局 Billing pagination 测试的空库前提。

## 本地 R3 退出证据

- 最终 `pnpm verify:task:0801 --reuse-local`：20/20 executable gates PASS；API 107/0；DB 71 files / 1472 tests；contracts/breaking、Consumer harness、registry/runtime 全绿。
- Admin T12 的 Account Workbench detail/support/governance/pagination/filters/IDOR 六组行为全部 PASS；responsive/a11y 覆盖 5 viewports × 20 routes = 100 observations，overflow/semantic controls/dialog focus/tab navigation 全 PASS。
- docs 184、OpenAPI account/admin 46/65、Consumer Lab snapshot 与 compatibility 全部 PASS。
- staging `workendstaging` 已增量同步 Feedback + OPT-009 migration 至 `20261012094715`，`account-api` 部署为 v61 且保持 `verify_jwt=false`；Hosted SQL 验证关键表/函数/权限与三条 FK index 均存在，未授权 `/functions/v1/account-api/v1/plans` 正确 fail-closed 为 HTTP 401。
- Supabase security advisor 未发现本轮新增 RLS/权限问题；现存 `pg_net` public extension 与 leaked-password protection WARN 为既有环境项。Performance advisor 暴露的三条 OPT-009 Admin actor FK 缺索引已由 `20261012094715` forward migration 修复。
- Phase 04 仍保持 In Progress：仅 `GIT-001`、`GIT-002` 尚未完成；Production 不属于本阶段发布目标，保持 NOT_RUN。
