# 阶段 01：Identity lifecycle 数据投影与 Admin Contract

状态：执行中

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

- [ ] DB-001：创建新 migration，不修改已应用 migration。
- [ ] DB-002：实现 deterministic lifecycle read；active request 优先，否则最近 request；job 只按 request_id 关联。
- [ ] DB-003：返回 UI 所需安全字段，不返回 request_session_id、fence、lease 信息。
- [ ] DB-004：固定 security-definer search_path，显式撤权，只 grant admin_executor。
- [ ] API-001：新增精确 `GET /admin/api/v1/accounts/{userId}`，复用现有 Auth Admin exact lookup 与 account enrichment。
- [ ] API-002：Auth user 404、Auth 上游异常 503 fail closed；lifecycle 数据异常不降级放行危险 UI。
- [ ] CONTRACT-001：OpenAPI 新增 Identity detail，无破坏性修改 deletion-job contract。
- [ ] TEST-001：SQL/API/contracts 定向测试通过。
- [ ] R3-001：Local fresh + 从当前 main migration baseline 的 upgrade 路径通过。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| migration fresh | `pnpm db:reset` 或仓库 canonical wrapper | Local Supabase | 全迁移成功 | 未运行 |
| migration upgrade | reset 至本 migration 前一版本后 `supabase migration up --local` | Local Supabase | 仅前向新增并成功应用 | 未运行 |
| SQL lifecycle tests | 定向 pgTAP + `pnpm test:db` | Local Supabase | admin_executor 真实权限与生命周期聚合正确 | 未运行 |
| Account API | `pnpm test:api` / 定向 Deno | Local | detail 200/404/503、字段与 step-up 不回归 | 未运行 |
| Contract | `pnpm contracts:check` + `pnpm contracts:breaking` | Local | 新增兼容 GET，无破坏 | 未运行 |
| Quality | `pnpm lint` / `pnpm format:check` / `git diff --check` | Local | PASS | 未运行 |

## 退出与恢复条件

只有 fresh/upgrade、SQL 权限/行为、API 与 OpenAPI 全部通过且无未解释 FAIL/BLOCKED，才能进入 Phase 02。

本阶段只增加只读 SQL 与 GET API；出现问题时不 destructive down migration，保留旧 `/accounts` list 与 deletion-job APIs，使用 forward-fix 或回退 Edge 消费者。

## 文档与交付

- [ ] 同步 identity-security / API/reference 中实际新增的 Identity detail 边界。
- [ ] 更新 verification record 与总计划阶段状态。
- [ ] 创建阶段 commit/push 并核对远端分支。
