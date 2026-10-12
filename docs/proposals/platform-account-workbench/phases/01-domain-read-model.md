# 阶段 01：Account 支持域与权威读模型

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

建立 Admin-only tags/notes/governance events，修复治理 reason 丢失，并提供稳定分页的 Account list v3、Account 360 读模型与 privacy cleanup 基础。

## 任务

- [x] DB-001：新增 Admin tags / notes / governance events 表、RLS/grants/index。
- [x] DB-002：新增 `admin_account_list_v3`，stable cursor + 服务端结构化筛选。
- [x] DB-003：新增 `admin_account_workbench_read`，聚合 Profile/Subscription/Plan/Billing/Config/Feedback/support。
- [x] DB-004：新增 tags replace / note add 命令。
- [x] DB-005：新增 `admin_account_transition_v2(..., reason)`，同事务写 governance event。
- [x] DB-006：新增 account-admin privacy cleanup helper，并接入 Global Delete/retention 的权威最小化路径。
- [x] TEST-001：权限、IDOR、cursor、filters、reason、note/audit secrecy、privacy cleanup pgTAP。
- [x] TEST-002：fresh migration + non-empty upgrade，旧账户/Profile/Subscription/Config/Feedback 数据保持。

## 退出条件

Phase 01 的定向 pgTAP、全 DB fresh/upgrade 与权限证据 PASS；失败/未知不得进入 Phase 02。

实际结果：`20261012043000_platform_account_workbench_domain.sql` fresh 重放 PASS；`t31_account_workbench_domain.sql` 36/36 PASS；fresh 与 non-empty upgrade 均为 71 files / 1456 tests PASS。升级 fixture 的 Profile、Subscription/Plan、Config、Feedback 旧事实全部保持。最终 Phase 01 `pnpm verify:task:0801 --reuse-local` 20/20 executable gates PASS，API 106/0、Admin 95-route browser matrix、docs 184、Account/Admin OpenAPI 46/63 与 breaking check 全绿。
