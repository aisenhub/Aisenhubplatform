# 阶段 02：统一用户生命周期 UI 与 Operations 退场

状态：完成

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

基于 Phase 01 已验证合同，将 Global Identity 与删除生命周期整合到统一用户工作区；把旧 Operations 页面收敛成兼容重定向，迁移所有内部 deletion-job 深链并完成真实浏览器回归。

## 进入条件

- Phase 01 SQL/API/OpenAPI 与 Local R3 数据门槛全部 PASS。
- Identity detail DTO 和 deletion-job mutation contract 已冻结。
- existing recent-MFA/ConfirmActionDialog/unknown-outcome 交互可直接复用。

## 变更范围

- `apps/admin/features/accounts/`：Identity list/detail/lifecycle UI 与必要 model/types/tests。
- deletion-jobs 子视图：复用/迁移 `features/operations` 成熟逻辑，不复制 mutation 算法。
- `/admin/accounts/[userId]`、`/admin/accounts/deletion-jobs` 路由。
- `/admin/operations` 兼容 redirect。
- Admin navigation、Overview、Audit、platform files deletion-job links。
- Admin browser E2E / route inventory / accessibility tests。
- Admin DESIGN、architecture/reference/guides 实际状态同步。

## 任务清单

- [x] UI-001：Identity 列表行支持进入精确详情，不改变现有 email/UID/platform 查询能力。
- [x] UI-002：Identity detail 分层展示身份摘要、平台账户、删除 request/job。
- [x] UI-003：pending_admin request 从详情调用 existing deletion-job start；recent-MFA/confirm/idempotency/replay-never 不变。
- [x] UI-004：blocked/retry job 从详情和任务子视图调用 existing retry；unknown outcome 先重新读取权威状态。
- [x] UI-005：`/admin/accounts/deletion-jobs` 承载跨用户任务，历史 detached job 仍可查看。
- [x] IA-001：移除一级“运维中心”，在统一用户工作区提供删除任务入口。
- [x] COMPAT-001：`/admin/operations` 与旧 `/admin/deletion-jobs` 服务端 redirect，保留 `job_id` / `q`。
- [x] LINK-001：Overview/Audit/platform files 深链全部迁移。
- [x] TEST-001：unit/browser 覆盖 list→detail、approve、retry、redirect、404/错误/加载/窄屏/键盘焦点。
- [x] DBFIX-001：真实浏览器 start 暴露旧 `admin_deletion_job_start` 的 PL/pgSQL `request_id` 冲突歧义；新增 forward migration 修复并补真实 start/retry `admin_executor` 行为测试。
- [x] REL-001：canonical R3、最终 diff、GitHub/main 与分支清理闭环。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| Admin unit/typecheck/build | workspace commands | Local | PASS | PASS：11 files / 51 unit tests；typecheck PASS；Next production build 含 `[userId]` 与 `deletion-jobs` 新路由 |
| Browser lifecycle | current Admin E2E + 新 identity lifecycle assertions | Local Supabase/Auth/Chrome | approve/retry/redirect/deep links/404/unknown outcome PASS | PASS：list→detail、真实 pending→approved/start、blocked→retry、legacy redirect 与深链均通过 |
| Responsive/a11y | route viewport matrix | Local Browser | 新 routes 无 overflow，dialog/focus/keyboard 正常 | PASS：5 viewports × 19 routes = 95 组合；overflow/semantic controls/dialog focus/tab navigation 全 PASS |
| DB mutation behavior | targeted pgTAP + fresh/upgrade full DB | Local Supabase | start/retry 真执行且新 migration 双路径 PASS | PASS：定向 32/32；upgrade/fresh 均 61 files / 1130 tests |
| Canonical R3 | `pnpm verify:task:0801 --reuse-local` | Local Supabase/Auth/DB/Storage/Chrome | 所有 executable gates PASS | PASS：20/20 executable gates；API 97/97、DB 1130、Consumer/Admin browser、docs/contracts 全通过 |
| Docs/contracts/quality | docs/contracts/lint/format/diff | Local | PASS | PASS：format 392 files；lint 0/0；143 docs；Admin contract 47 operations；breaking/compatibility PASS |
| Remote DB compatibility | linked db push + read-only function probe | workendstaging | forward-fix 生效且权限不扩大 | PASS：仅应用 `20261010145245`；named constraint fix、domain_owner/security-definer、admin-only execute 均核对通过 |

## 退出与恢复条件

所有必需 R3 证据无 FAIL/BLOCKED、旧 `/admin/operations` 深链兼容验证通过、最终 diff 与文档一致后才能合并 main。

若 UI 需回退，新 SQL/GET API 是兼容扩展，existing deletion-job API/worker 未删除；可恢复旧 Operations UI 而不回滚删除状态机。

## 文档与交付

- [x] 更新 Admin DESIGN 与当前 identity-security/architecture 描述。
- [x] verification record 写入真实浏览器和 R3 结果。
- [x] 任务分支 push、main fast-forward 与远端核对完成。
- [x] 本地/远端任务分支已清理；OPT-003 不再保留并行工作分支。
