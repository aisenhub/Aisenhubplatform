# OPT-009 实施与验证记录

状态：In Progress

## 项目与基线

- 优化目标：单平台 Platform Account 360 / 账户治理
- 起始 main：`e5376b6a4c626a9c55e86d64633491c20fdfde19`
- 任务分支：`codex/opt-009-account-workbench`
- 风险：R3
- Production：NOT_RUN / 未授权

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
| 03 Account 360 UI | In Progress | Phase 02 已通过串行退出门禁 | 无 |
| 04 Lifecycle/release | Not Started | - | 依赖 01–03 |

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

## 规则

- 不预填 PASS。
- 每个失败/修复/复测、migration/Edge/staging、commit/PR/main/branch 状态都追加到本文件。
- Phase 01–02 已通过完整本地 R3；OPT-009 仍保持 In Progress，必须完成 Phase 03–04、适用 staging 与 GitHub main closeout 后才能标记 Completed。
