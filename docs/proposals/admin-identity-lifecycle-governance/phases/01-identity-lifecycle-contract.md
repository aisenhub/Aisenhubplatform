# 阶段 01：Identity lifecycle 数据投影与 Admin Contract

状态：完成

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

建立不改写 Global Delete 状态机的安全只读聚合边界，并新增精确 Identity detail Admin API/OpenAPI，使 Phase 02 只消费已经通过 R3 数据/API 验证的权威合同。

## 进入条件

- 起始 `main@425173ea70efc19e5410a0a4f0e25e7e30204591` 已确认。
- 工作分支 `codex/opt-003-identity-lifecycle`，起始工作区 clean。
- 已核对 `deletion_requests` / `deletion_jobs` / `identity_lifecycle` 与现有 Global Delete mutation functions。
- 已确认现有 deletion-job write API 保持不变。

## 变更范围

- 新 forward migration：`private.admin_identity_lifecycle_read`。
- 新 SQL pgTAP：权限、active/recent request 选择、job 关联、撤销 session/其他 role 拒绝。
- `supabase/functions/account-api/admin.ts` / `index.test.ts`：`GET /admin/api/v1/accounts/{userId}`。
- `contracts/admin/v1/openapi.json`：Identity detail route/parameter/schema。
- 必要的 architecture/reference 文档同步。

本阶段不迁移 Admin 导航或 `/admin/operations` UI。

## 任务清单

- [x] DB-001：创建新 migration，不修改已应用 migration。
- [x] DB-002：实现 deterministic lifecycle read；active request 优先，否则最近 request；job 只按 request_id 关联。
- [x] DB-003：返回 UI 所需安全字段，不返回 request_session_id、fence、lease 信息。
- [x] DB-004：固定 security-definer search_path，显式撤权，只 grant admin_executor。
- [x] API-001：新增精确 `GET /admin/api/v1/accounts/{userId}`，复用现有 Auth Admin exact lookup 与 account enrichment。
- [x] API-002：Auth user 404、Auth 上游异常 503 fail closed；lifecycle 数据异常不降级放行危险 UI。
- [x] CONTRACT-001：OpenAPI 新增 Identity detail，无破坏性修改 deletion-job contract。
- [x] TEST-001：SQL/API/contracts 定向测试通过。
- [x] R3-001：Local fresh + 从当前 main migration baseline 的 upgrade 路径通过。
- [x] REMOTE-001：migration 与 `account-api` 同步 workendstaging，并核对 migration/version/函数权限与真实 Admin context 读取。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| migration fresh | `pnpm db:reset` | Local Supabase | 全迁移成功 | PASS：应用至 `20261010134140_admin_identity_lifecycle_read` |
| migration upgrade | `supabase migration up --local` | Local Supabase | 仅前向新增并成功应用 | PASS：从 OPT-002 当前库仅应用 `20261010134140` |
| SQL lifecycle tests | 定向 pgTAP + `pnpm test:db` | Local Supabase | admin_executor 真实权限与生命周期聚合正确 | PASS：定向 11/11；upgrade/fresh 全量均 61 files / 1124 tests |
| Account API | `pnpm test:api` | Local | detail 200/404/503、字段与 step-up 不回归 | PASS：97/97；Identity detail 200/404/503 与敏感字段负断言通过 |
| Contract | `pnpm contracts:check` + `pnpm contracts:breaking` | Local | 新增兼容 GET，无破坏 | PASS：Admin 47 operations；Consumer Lab snapshot 同步；breaking PASS |
| Quality | `pnpm lint` / `pnpm format:check` / `pnpm docs:check` / `git diff --check` | Local | PASS | PASS：首次 format 仅两文件失败，定向 oxfmt 后全绿；lint 0/0；143 docs |
| Remote | linked db push + `account-api` deploy + read-only SQL probe | workendstaging | repo migration/function 与 Edge 生效 | PASS：migration `20261010134140`；`account-api` ACTIVE v56；admin-only execute、固定 search_path 与 live Admin probe 均通过 |

## 退出与恢复条件

只有 fresh/upgrade、SQL 权限/行为、API 与 OpenAPI 全部通过且无未解释 FAIL/BLOCKED，才能进入 Phase 02。

本阶段只增加只读 SQL 与 GET API；出现问题时不 destructive down migration，保留旧 `/accounts` list 与 deletion-job APIs，使用 forward-fix 或回退 Edge 消费者。

## 文档与交付

- [x] 同步 identity-security / API/reference 中实际新增的 Identity detail 边界。
- [x] 更新 verification record 与总计划阶段状态。
- [x] 创建阶段 commit/push 并核对远端分支：`5cd68a597ab9012c138cf9b2585ce5014bc819c3`。
