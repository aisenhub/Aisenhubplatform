# 阶段 02：Admin API 与合同

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把 Phase 01 权威 SQL 暴露为兼容的 Admin HTTP contract，并让现有账户治理 API 真正持久化 reason。

## 任务

- [x] API-001：扩展 `GET /admin/api/v1/platforms/{platformId}/accounts` 的 cursor/filters/next_cursor。
- [x] API-002：新增 `GET /admin/api/v1/platforms/{platformId}/accounts/{accountId}` Account 360，服务端 exact Auth read 补只读 identity email。
- [x] API-003：新增 tags replace 与 note add routes。
- [x] API-004：现有 suspend/restore/close 读取并校验 body.reason，调用 transition v2；保持 `adminStepUp`；兼容 PATCH status 也统一进入同一治理语义，避免 reason 旁路。
- [x] CONTRACT-001：Admin OpenAPI additive 更新；BFF allowlist 与 Consumer Lab snapshot 同步。
- [x] TEST-001：API unit 覆盖 filters/cursor/404/IDOR/Auth unavailable/reason/tags/notes/recent-MFA。
- [x] TEST-002：`contracts:check` + `contracts:breaking` PASS。

## 退出条件

API/contract 定向验证、Admin contract snapshot 与 breaking gate 全绿后才能进入 Phase 03。

## 完成证据

- Account API：107 passed / 0 failed；新增 OPT-009 contract 测试覆盖 stable cursor、结构化筛选、Account 360 exact Auth email、Auth unavailable fail-closed、tags/notes、reason、recent-MFA 与 PATCH status governance 收口。
- DB 定向：`t31_account_workbench_domain.sql` 37/37 PASS；forward-fix 将 status 搜索重新纳入 list v3，保持旧 v2 搜索兼容语义。
- Admin unit：14 files / 64 tests PASS；BFF allowlist 与 OpenAPI operation count 对齐到 65。
- Contract：Admin OpenAPI 65 operations；Consumer Lab snapshot/compatibility PASS；`contracts:breaking` 对 `origin/main` PASS。
- Canonical R3：`pnpm verify:task:0801 --reuse-local` 20/20 executable gates PASS；DB 71 files / 1457 tests、API 107/0、Admin browser 95 routes、docs 184、OpenAPI 46/65 全绿。
