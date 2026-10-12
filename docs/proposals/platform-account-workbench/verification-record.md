# OPT-009 实施与验证记录

状态：Completed

## 项目与基线

- 优化目标：单平台 Platform Account 360 / 账户治理
- 起始 main：`e5376b6a4c626a9c55e86d64633491c20fdfde19`
- 任务分支：`codex/opt-009-account-workbench`
- 风险：R3
- Production：NOT_RUN / 本项无 Production 发布目标

## 起始事实核验

| 日期 | 范围 | 来源 | 结果 |
| --- | --- | --- | --- |
| 2026-10-12 | 前序整改 main | GitHub Actions `TASK-0801` | PASS：`main@e5376b6a` 完整 CI 成功 |
| 2026-10-12 | 账户列表 UI | `apps/admin/features/accounts/platform-accounts-page.tsx` | CONFIRMED：固定 `limit=100`；只展示 Account/User ID、status、created/updated；无 cursor/Profile/Plan/Config/Feedback 聚合 |
| 2026-10-12 | 账户列表 SQL | `20260908221107_admin_resource_search.sql` | CONFIRMED：`admin_account_list_v2` 仅 q + limit，搜索 ID/status，按 created_at/id 排序但无 cursor |
| 2026-10-12 | 账户治理 reason | `20260907124124_t14_account_lifecycle.sql` + `account-api/admin.ts` | CONFIRMED：UI 提交 reason，但 API 未读取；`admin_account_transition` 无 reason 参数；Audit metadata `{}`；动作本身已走 `adminStepUp` |
| 2026-10-12 | Config/Feedback 可复用性 | 当前 main migration/API | CONFIRMED：OPT-007/008 已落地，可用于 Account 360 权威摘要，不再是预研占位 |

## 阶段状态

| 阶段 | 状态 | 证据 | 阻塞 |
| --- | --- | --- | --- |
| 01 Domain/read model | Completed | migration + `t31`、fresh/non-empty upgrade、canonical R3 全绿 | 无 |
| 02 Admin API/contract | Completed | API 107/0、Admin unit 64/64、t31 37/37、OpenAPI 46/65、Consumer snapshot/compatibility、breaking、canonical R3 全绿 | 无 |
| 03 Account 360 UI | Completed | URL-backed cursor/filter 列表、独立 Account 360、support/governance、安全交互、100-route browser matrix、canonical R3 全绿 | 无 |
| 04 Lifecycle/release | Completed | lifecycle/fresh/upgrade + staging + 本地/GitHub canonical R3 + main/branch closeout 全绿 | 无 |

## 实施与验证日志

| 日期 | 范围 | 来源 | 结果 |
| --- | --- | --- | --- |
| 2026-10-12 | Proposal baseline | `docs:check` + `pnpm verify:task:0801 --reuse-local` | PASS：补齐 `docs/proposals/README.md` 可达性后 184 documents；Proposal-only canonical 20/20 gates PASS，DB 70/1420、API 106/0、Admin 95 routes、OpenAPI 46/63、breaking PASS |
| 2026-10-12 | Phase 01 fresh migration | `supabase db reset --local --no-seed --yes` | PASS：首次容器初始化瞬态失败发生在任何 migration 之前；debug 重试完整从零应用至 `20261012043000_platform_account_workbench_domain.sql` 成功 |
| 2026-10-12 | Phase 01 DB | `pnpm ... supabase db --local` | PASS：新增 `t31` 36/36；全量 71 files / 1456 tests。首次仅 `plan(34)` 与实际 36 条断言不匹配，修正计划数后功能断言与全量回归全部通过 |
| 2026-10-12 | Phase 01 non-empty upgrade | reset 到 `20261011175718` → 旧 Account/Profile/Subscription/Config/Feedback fixture → `migration up --local` | PASS：仅增量应用 OPT-009 migration；Profile、Subscription/Plan、Config、Feedback 旧事实均保持；升级库 `t31` 36/36、全量 71/1456 PASS |
| 2026-10-12 | Phase 01 canonical R3 | `pnpm verify:task:0801 --reuse-local` | PASS：20 executable gates；DB 71/1456、API 106/0、settlement concurrency、contracts/breaking、Consumer E2E、Admin T12、95-route responsive/a11y、docs 184、OpenAPI 46/63 全绿 |
| 2026-10-12 | Phase 02 Account API | `pnpm test:api` | PASS：107/0；新增 Account workbench contract 覆盖 cursor/filter、Account 360 exact Auth email、Auth fail-closed、tags/notes、reason、recent-MFA、PATCH status governance 收口 |
| 2026-10-12 | Phase 02 DB forward-fix | `20261012054500_platform_account_workbench_search_fix.sql` + `t31` | PASS：恢复 list v3 对 status 的 q 搜索兼容；`t31` 37/37 |
| 2026-10-12 | Phase 02 Admin/contract | Admin unit + `contracts:check` + `contracts:breaking` | PASS：Admin 14 files / 64 tests；OpenAPI account/admin 46/65；Consumer Lab snapshot 与 compatibility PASS；breaking 对 `origin/main` PASS |
| 2026-10-12 | Phase 02 canonical R3 | `pnpm verify:task:0801 --reuse-local` | PASS：20 executable gates；DB 71/1457、API 107/0、Admin T12 + 95-route responsive/a11y、docs 184、OpenAPI 46/65、Consumer/registry/runtime/contracts 全绿 |
| 2026-10-12 | Phase 03 Admin UI/static | Account list + `/admin/platforms/:platformId/accounts/:accountId` + Admin unit/typecheck/build | PASS：列表改为 20 条 stable cursor、URL-backed q/status/Plan/subscription/tag/joined filters；独立 Account 360 汇总 Profile/Entitlement/Billing/Config/Feedback、tags/notes、governance timeline 与 Global Identity 深链；Admin unit 15 files / 67 tests、typecheck/build PASS |
| 2026-10-12 | Phase 03 browser hardening | `tests/spikes/e2e/t12-r2-admin.mjs` | FIXED：扩展 T12 时依次暴露测试 fixture/等待条件问题（IDOR 平台 code 与旧 selector 前缀碰撞、原 Feedback 已在前序链隐私删除、cursor 导航 React loading/RSC 响应竞态）；均收窄为独立 fixture / 精确 BFF JSON 等待，不改变既有产品语义 |
| 2026-10-12 | Phase 03 effective Plan forward-fix | `20261012070000_platform_account_workbench_effective_plan.sql` + fresh `db:reset` + `t31` | PASS：真实 browser 揭示 free subscription projection 经 entitlement recompute 后 `plan_id=null`；按 design/architecture 的“当前有效 Plan”语义修复 list v3 与 Account 360，使 active default free Plan 参与投影/搜索/Plan filter，subscription 状态保持独立；fresh 106 migrations 完整应用；`t31` 40/40；全 DB 71 files / 1460 tests PASS |
| 2026-10-12 | Phase 03 real browser | Admin T12 | PASS：Global Identity→Account 360 deep link、Profile/effective Plan/Config/Feedback 摘要、tags/notes、reason timeline、recent-MFA 不自动重放 + 显式 resubmit、cross-platform IDOR、20-row cursor pagination、组合 server-side filters 全绿；responsive/a11y 5 viewports × 20 routes = 100 observations，overflow/semantic controls/dialog focus/tab navigation 全 PASS |
| 2026-10-12 | Phase 03 canonical R3 | `pnpm verify:task:0801 --reuse-local` | PASS：20 executable gates；DB 71/1460、API 107/0、Account workbench browser 六组 architecture behavior 全 PASS、100-route responsive/a11y、docs 184、OpenAPI account/admin 46/65、breaking/Consumer/registry/runtime/contracts 全绿 |
| 2026-10-12 | Phase 03 Git checkpoint | `2c847e3 feat(admin): complete opt-009 phase 03 workbench` | PASS：14 files；任务分支 `codex/opt-009-account-workbench` 已 push 到 origin |
| 2026-10-12 | Phase 04 lifecycle DB | `t31_account_workbench_domain.sql` | PASS：扩展至 52/52；普通 close 保留运营历史；Global Delete `files_blocked` 最小化 support 并使 Config/Feedback 摘要归零，Billing 只保留安全状态字段；随后 `personal_data_cleared` 清空 Profile、`auth_deleted` 解绑 UID/匿名化 Platform Account；Hosted advisor 暴露的三条 Admin actor FK covering index 也纳入回归；全 DB 71/1472 |
| 2026-10-12 | Phase 04 fresh | `pnpm db:reset --yes` → `pnpm test:db` | PASS：全部 migration 从零重放至 `20261012094715`；71 files / 1472 tests |
| 2026-10-12 | Phase 04 non-empty upgrade | reset `20261011175718` + legacy Account/Profile/Subscription/Config/Feedback fixture → 三条 OPT-009 migration → upgrade smoke + full pgTAP | PASS：仅应用 `20261012043000` / `054500` / `070000`；旧事实原样保持；upgrade smoke 7/7；升级库 71/1469 PASS |
| 2026-10-12 | Phase 04 Billing upgrade compatibility | legacy Billing order before/after migration + Account 360 smoke | PASS：原始 amount/provider private facts 在 Billing 领域记录中保持，Account 360 仅返回 provider/verification/entitlement/linkage/resolution/settlement 等安全状态，不暴露 `total_amount` / `show_amount` / provider user/private id；该持久 Billing fixture 不参与最终全量 pgTAP，因为既有 `bill_13` 明确假设全局订单表除本测试三单外为空 |
| 2026-10-12 | Phase 04 final canonical R3 | fresh reset → `pnpm verify:task:0801 --reuse-local` | PASS：20 executable gates；DB 71/1469、API 107/0；Account Workbench detail/support/governance/pagination/filters/IDOR 全 PASS；responsive/a11y 5 viewports × 20 routes = 100 observations；docs 184；OpenAPI account/admin 46/65；breaking、Consumer、registry、runtime、contracts 全绿 |
| 2026-10-12 | Phase 04 hosted staging | Supabase `workendstaging` | PASS：增量同步 6 条 Feedback + 4 条 OPT-009 migration，最新为 `20261012094715_platform_account_workbench_fk_indexes`；`account-api` v61 / `verify_jwt=false`；关键 support/governance 表、list v3/Account 360/transition v2 与权限均存在；三条 Admin actor FK covering index 存在；未授权 `/v1/plans` HTTP 401 fail-closed |
| 2026-10-12 | Phase 04 hosted advisors | Supabase security/performance advisors | PASS（本轮范围）：未出现新增 RLS/权限安全告警；三条 OPT-009 FK index 警告已 forward-fix。既有 `pg_net` public extension、Auth leaked-password protection 与历史 FK/index INFO 不归入 OPT-009 release blocker |
| 2026-10-12 | Phase 04 final canonical after hosted fix | fresh reset → `pnpm verify:task:0801 --reuse-local` | PASS：20 executable gates；DB 71/1472、API 107/0；Account Workbench 六组 browser architecture behavior、100-route responsive/a11y、docs 184、OpenAPI 46/65、breaking/Consumer/registry/runtime/contracts 全绿 |
| 2026-10-12 | GitHub PR CI | PR #15 / Actions run #155 / head `4901dd7` | PASS：PR Ready 后完整 `M0 quality checks` 成功，`TASK-0801 full local verification` step 明确 success |
| 2026-10-12 | GitHub main | PR #15 rebase merge | PASS：GitHub 返回 merged=true；远端 `main` 核对为 `0bb6e7f835f75698b10cabdfebd59b5b7609e224` |
| 2026-10-12 | Task branch cleanup | `codex/opt-009-account-workbench` | PASS：worktree clean 后删除本地 branch；远端 ref 通过 GitHub API 删除并再次检索确认不存在 |

## 规则

- 不预填 PASS。
- 每个失败/修复/复测、migration/Edge/staging、commit/PR/main/branch 状态都追加到本文件。
- OPT-009 已完成 Proposal→Phase 01–04→本地/hosted 验证→PR/CI→main→原任务分支清理全链路；后续工作从最新 main 开始 OPT-010。
