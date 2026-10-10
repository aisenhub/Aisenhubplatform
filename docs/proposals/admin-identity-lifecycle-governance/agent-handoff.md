# OPT-003 Agent 执行交接

## 项目与计划

- 项目：`E:\Projects\Aisenhubplatform`
- 任务：OPT-003 统一用户与身份删除生命周期治理
- 起始 main：`425173ea70efc19e5410a0a4f0e25e7e30204591`
- 最终分支：`main`；任务分支已本地/远端删除
- 风险：R3
- 正式设计：[design.md](design.md)
- 总计划：[plan.md](plan.md)
- 当前阶段：OPT-003 已完成；后续工作从最新 `main` 重新建立独立任务分支

## 必读顺序

1. `AGENTS.md`、`docs/README.md`、`docs/agents.md`、`docs/guides/development-release-workflow.md`。
2. 本 Proposal design/plan/当前 phase/verification-record。
3. `docs/architecture/modules/identity-security.md`、`docs/reference/data-model.md`、Admin Accounts/Operations 源码。
4. `deletion_requests` / `deletion_jobs` / `admin_deletion_job_*` / `admin_identity_accounts` migrations 与 Account API Admin routes。

## 关键架构结论

- Global Delete 状态机、recent-MFA、幂等、lease/fence、checkpoint/worker 已存在且是权威边界；不要重写。
- Identity detail 只代表当前 live Auth user；Auth 删除完成后 detached 历史 job 通过任务子视图追踪。
- 新 SQL 只聚合读取，不返回 request_session_id / lease / fence。
- Identity detail 精确 Auth 身份继续由服务端 Supabase Auth Admin API 获取，数据库不扩大 Auth PII 权限。
- start/retry 继续调用 existing deletion-job API，并保留 confirm + recent MFA + replay-never + unknown-outcome recovery。
- `/admin/operations` 是兼容重定向，不保留第二套产品状态。
- Phase 02 真实浏览器验收发现原 `admin_deletion_job_start` 的 `ON CONFLICT (request_id)` 与 RETURNS TABLE 输出变量同名导致运行时歧义；已用 `20261010145245_fix_admin_deletion_job_start_conflict.sql` forward-fix，并新增真实 `admin_executor` start/retry pgTAP，不能删除该回归覆盖。

## 执行边界

只实施 OPT-003。不要提前实施 OPT-004 平台指标、OPT-005 平台侧栏收敛、OPT-009 Platform Account 360 或新的身份高风险能力。

Phase 01 未通过 fresh/upgrade、executor 权限、API/contract 前不得进入 UI 重构。

## 文件所有权

- Phase 01：新 migration/SQL test、`account-api/admin.ts`、`account-api/index.test.ts`、Admin OpenAPI、相关文档。
- Phase 02：Accounts/Operations UI、routes/navigation/deep links、Admin E2E、实际架构文档。
- migration/OpenAPI/Account API 属于串行共享文件，不与其他 OPT 并行修改。

## 完成门槛

- [x] Phase 01 Identity lifecycle data/API contract 已交付。
- [x] Phase 02 Unified Users lifecycle UI 与旧 Operations 兼容实现/验证已完成。
- [x] 必需 Local R3 无未解释 FAIL/BLOCKED。
- [x] GitHub/main 与适用 workendstaging 状态一致。
- [x] 本地/远端任务分支已删除；后续事项必须从最新 main 建立新分支。
