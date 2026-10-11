# OPT-007 验证记录

状态：Completed

## 阶段状态

| 阶段 | 状态 | 已有证据 | 下一步 |
| --- | --- | --- | --- |
| 01 领域/Storage 兼容 | DONE | 三条 migration、legacy 隔离、Config/Version/Gallery/Like/Usage primitives、fresh+upgrade 63/1209、staging/advisors 已验证 | Phase 02 Account/Consumer |
| 02 Account/Consumer | DONE | additive Account v1、private Storage Version/Gallery 内容流、OpenAPI 1.1.0、Consumer Harness、Local fresh+upgrade、staging v59 已验证 | Phase 03 Admin 治理 |
| 03 Admin 治理 | DONE | Admin Config resource/review/Gallery governance、平台容量、Plan slot、Overview pending review、Local canonical R3、staging v60 已验证 | Phase 04 Lifecycle/Release |
| 04 Lifecycle/Release | DONE | Lifecycle migration + t26、fresh/upgrade、canonical 21 gates、staging migration/functions/triggers/advisors/HTTP smoke、Git closeout 全部通过 | 无 |

## 事实与验证日志

| 日期 | 范围 | 命令/来源 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 基线 | Git / latest main | Local | PASS：OPT-006 closeout 后 `main@ec997111969c6abfda42f57abd179e6fc0bdfb8e`，新分支 `codex/opt-007-config-resource-system` |
| 2026-10-11 | 预研复核 | SQL / Account+Admin OpenAPI / Consumer Harness / Admin Files / Overview | Source | PASS：legacy `/v1/config-files` 是 canonical v1；file ledger 含 unknown/delete/backup barrier；Admin 仍是文件运维；Overview 审核仍 planned |
| 2026-10-11 | 权益/生命周期 | Plan features / Global Delete / retention / rate limit / profiles | Source | PASS：features 可携带数值但 UI 无编辑；Global Delete `files_blocked` 标记作者 files deleting；通用 rate limiter 可复用；profile 可作为作者当前展示源 |
| 2026-10-11 | Supabase 安全基线 | 当前 Supabase docs：Database Functions / RLS / private Storage / Database backup scope | Public docs | PASS：继续 private bucket、RLS/收窄 grants、security-definer 固定 search_path；数据库备份不包含 Storage objects |
| 2026-10-11 | Phase 01 schema/functions | `20261011024824` / `20261011025311` / `20261011044555` | Local | PASS：Config/Version/Gallery/Like/Usage、legacy-only wrappers、平台总容量、slot helper、限流和 FK covering indexes 已落地 |
| 2026-10-11 | Local fresh | `pnpm exec supabase db reset --local --no-seed` + `pnpm test:db` | Local Supabase | PASS：三条 migration fresh 应用；63 files / 1209 tests |
| 2026-10-11 | Local upgrade | reset 到 `20261010223414` + 非空 legacy fixture + `migration up --local`；随后第三条 index migration 增量应用 | Local Supabase | PASS：旧 file 保持 `legacy`、reserved bytes 保留、默认平台容量 1 GiB、6 张新表/Like+Usage 函数权限正确；升级库 63 / 1209 PASS |
| 2026-10-11 | v1 兼容 | `pnpm contracts:breaking` | Local | PASS：Account/Admin OpenAPI 相对 `origin/main` 无 breaking change |
| 2026-10-11 | staging migration | `supabase db push --linked`（link=`workendstaging` / `egsokuicabbxspkdccqe`） | Staging | PASS：远端 history 精确包含 `20261011024824`、`20261011025311`、`20261011044555` |
| 2026-10-11 | staging security | Supabase SQL + Security Advisor | Staging | PASS：6/6 Config 表 force RLS；关键函数均 `domain_owner` + security definer + pinned search_path；浏览器无直表/函数越权；仅保留既有 `pg_net` public schema 与 leaked-password protection WARN |
| 2026-10-11 | staging performance | Supabase Performance Advisor | Staging | PASS：OPT-007 新 Config FK 的 unindexed findings 从 Advisor 中消失（总数 55→42）；新索引 fresh/零流量下显示 unused，暂不删除 |
| 2026-10-11 | staging Edge | Supabase Edge Functions | Staging | PASS：`account-api` ACTIVE v57；Phase 01 无 Edge 改动，未 redeploy |
| 2026-10-11 | Phase 02 DB/API | `20261011052654` + Account API / shared contract | Local | PASS：legacy `file_*` wrapper 保持最终历史签名并锁定 `legacy`；Config Version 使用专用 Storage wrapper；Gallery list/read/content/usage 与 Config delete request 落地；共享稳定错误码同步 |
| 2026-10-11 | Phase 02 fresh | `supabase db reset --local --no-seed` + `pnpm test:db` | Local Supabase | PASS：完整 migration fresh 重放；64 files / 1230 tests |
| 2026-10-11 | Phase 02 upgrade | reset 到 `20261011044555` → `migration up --local` + `pnpm test:db` | Local Supabase | PASS：仅增量应用 `20261011052654`；legacy 最终函数签名兼容；64 / 1230 PASS |
| 2026-10-11 | Phase 02 API | `pnpm test:api` | Local | PASS：101 passed / 0 failed；Account API 49 tests，覆盖 Config create、If-Match、平台容量错误与 Gallery apply Idempotency-Key |
| 2026-10-11 | Phase 02 contracts | `contracts:check` + `contracts:breaking` + `typecheck` + `lint` + `format:check` | Local | PASS：Account OpenAPI 1.1.0 / 38 operations、Admin 48；Consumer compatibility 4 contracts / 39 fields；相对 `origin/main` 无 breaking；lint 0/0、typecheck/format PASS |
| 2026-10-11 | Phase 02 Consumer Harness | canonical contract probe + `pnpm test:e2e:consumer-harness` | Local Browser + Local Supabase | PASS：35 canonical operations；真实 Config/Version private Storage、审核前私有、批准后 Gallery、Like、download/apply usage 去重、跨平台 IDOR、删除即下架、legacy 隔离均通过 |
| 2026-10-11 | Phase 02 staging migration | `supabase db push --linked --dry-run` → `--yes` | Staging | PASS：dry-run 仅包含 `20261011052654_config_resource_account_content.sql`，远端 history 已精确包含该版本 |
| 2026-10-11 | Phase 02 staging Edge | Supabase Functions deploy / source inspection | Staging | PASS：仅部署 `account-api`，最终 ACTIVE v59、`verify_jwt=false` 保持既有函数内认证模型；`billing-webhook` v31、`maintenance` v39 未改动 |
| 2026-10-11 | Phase 02 staging permissions | Supabase SQL | Staging | PASS：Config Version/Gallery/删除公开 wrapper 对 `account_executor` 可执行；kind helper / Version resolver 不可直接执行；新增函数均 `domain_owner` + security definer + pinned `pg_catalog, private, public` search_path |
| 2026-10-11 | Phase 02 staging HTTP | `pg_net` staging DB → 同项目 `account-api` Edge | Staging | PASS：`/v1/configs` 与 `/v1/config-gallery` 未认证真实 HTTP 均为 401 `UNAUTHORIZED`、`Cache-Control: no-store`、有效 `X-Request-Id`、无 timeout；未创建业务 fixture。Runner 直连当时为 TLS reset/timeout，未伪记为 PASS |
| 2026-10-11 | Phase 02 staging advisors | Supabase Security + Performance Advisor | Staging | PASS：Security 仍只有既有 `pg_net` public schema 与 leaked-password protection WARN；Performance 仍为既有 unindexed-FK / fresh-unused-index 信息，无 Phase 02 新安全告警 |
| 2026-10-11 | Phase 03 DB/Admin | `20261011070729` + Admin API/OpenAPI/UI | Local | PASS：Config resource list/detail、review queue、approve/reject、Gallery remove/restore/block、usage、平台总容量、Plan `config_slot_limit` 与 Overview `pending_config_reviews` 已落地；Admin OpenAPI 54 operations |
| 2026-10-11 | Phase 03 canonical R3 | canonical `TASK-0801 --reuse-local` | Local Supabase + Browser | PASS：20 executable gates；Edge/API 101/0；65 files / 1260 pgTAP；breaking PASS；Consumer Harness、Admin synthetic 与真实 T12 全绿 |
| 2026-10-11 | Phase 03 Admin T12 | `tests/spikes/e2e/t12-r2-admin.mjs` | Local Browser + Local Supabase | PASS：`configReviewGovernance`、`globalCapacityStepUp`、`overCapacityNoDelete`；recent-MFA 后显式 resubmit、无自动重放；95 组响应式/可访问性路由矩阵保持通过 |
| 2026-10-11 | Phase 03 staging migration | `supabase db push --linked --dry-run` → `--yes` | Staging | PASS：dry-run 仅包含 `20261011070729_config_resource_admin_governance.sql`，远端 history 已精确包含该版本 |
| 2026-10-11 | Phase 03 staging Edge | Supabase Functions deploy / source inspection | Staging | PASS：仅部署 `account-api`，最终 ACTIVE v60、`verify_jwt=false`；远端 source 包含 Config resources/reviews/Gallery governance/file-policy v2/Plan upsert/Overview 路由 |
| 2026-10-11 | Phase 03 staging permissions | Supabase SQL | Staging | PASS：10 个关键 Phase 03 private functions 均 `domain_owner` + security definer + pinned search_path；`admin_executor` 可执行，`account_executor`/authenticated/anon 不可直接执行 |
| 2026-10-11 | Phase 03 staging HTTP | `pg_net` staging DB → 同项目 `account-api` Edge | Staging | PASS：Config resources、review queue、Overview、file-policy 未认证真实 HTTP 均 401 `UNAUTHORIZED`、`Cache-Control: no-store`、有效 `X-Request-Id`、无 timeout；Runner 直连为 `ECONNRESET`，未伪记为 PASS |
| 2026-10-11 | Phase 03 staging advisors | Supabase Security + Performance Advisor | Staging | PASS：Security 仅既有两条 WARN；Performance 为既有 unindexed-FK / fresh-unused-index INFO；无 Phase 03 新安全告警，不基于低流量 unused 统计移除新索引 |
| 2026-10-11 | Phase 04 lifecycle DB | `20261011101738_config_resource_lifecycle.sql` + `t26_config_lifecycle.sql` | Local | PASS：Config deleting→deleted reconciliation、零/多 Version 收敛、Global Delete `files_blocked`、retention privacy cleanup、Like 删除、Usage actor 匿名化、用户文本最小化与 backup barrier 行为均覆盖；targeted 29/29 PASS |
| 2026-10-11 | Phase 04 Local non-empty regression | `pnpm test:db` | Local Supabase | PASS：Phase 04 增量应用后的现有数据库 66 files / 1289 tests；旧 files/global-delete/retention/backup/billing/audit/Config Phase 01–03 全绿 |
| 2026-10-11 | Phase 04 fresh | `supabase db reset --local --no-seed` → `pnpm test:db` | Local Supabase | PASS：首次 fresh 暴露并修复新 migration UTF-8 BOM；去 BOM 后全部 migration 从零重放成功，66 / 1289 PASS |
| 2026-10-11 | Phase 04 upgrade | reset 到 `20261011070729` → 非空 Config/Version/Gallery/Like/Usage fixture → `migration up --local` → t26 + full pgTAP | Local Supabase | PASS：只增量应用 `20261011101738`；历史 Config title/description、Version schema/changelog、file active、approved Gallery、pending review、Like 与 Usage actor 原样保留；t26 29/29、全量 66 / 1289 PASS |
| 2026-10-11 | Phase 04 API/Admin/static | `test:api`、Admin unit/typecheck/build、lint、format、docs、contracts/breaking | Local | PASS：Edge/API 101/0；Admin unit 13 files / 59 tests；Admin typecheck/build PASS；lint 0 warnings/errors；format PASS；docs 168；Account 38 / Admin 54 operations；相对 `origin/main` 无 breaking |
| 2026-10-11 | Phase 04 canonical R3 | `pnpm verify:task:0801` | Local Supabase + Browser | PASS：21 executable gates；fresh reset、workspace build/unit/tooling/API、66 / 1289 pgTAP、settlement concurrency、contracts/breaking、Registry/Harness/runtime probe、真实 Consumer Local E2E、真实 Admin T12、docs/contracts 全绿 |
| 2026-10-11 | Phase 04 canonical Consumer/Admin | TASK-0801 Consumer Harness + T12 | Local Browser + Local Supabase | PASS：Consumer `configResources` / `galleryUsageAndIsolation`；Admin `configReviewGovernance` / `globalCapacityStepUp` / `overCapacityNoDelete`；95 组响应式/可访问性矩阵与安全边界保持 PASS |
| 2026-10-11 | Phase 04 staging migration | `supabase db push --linked --dry-run` → `--yes` | Staging | PASS：dry-run 仅包含 `20261011101738_config_resource_lifecycle.sql`；远端 migration history 已精确包含 `20261011101738` |
| 2026-10-11 | Phase 04 staging lifecycle boundary | Supabase SQL introspection | Staging | PASS：6 个 lifecycle/private helper 均 `domain_owner` + security definer + pinned `pg_catalog, private, public` search_path；仅 `account_retention_cleanup` / `deletion_job_step` 授予 `job_executor`；Account/Admin/browser roles 不可直接执行；两个 reconcile trigger 均启用 |
| 2026-10-11 | Phase 04 staging Edge | Supabase Edge Functions | Staging | PASS：Phase 04 无 Edge 源码变更，不 redeploy；`account-api` 保持 ACTIVE v60、`billing-webhook` v31、`maintenance` v39 |
| 2026-10-11 | Phase 04 staging HTTP | `pg_net` staging DB → 同项目 `account-api /v1/config-gallery` | Staging | PASS：未认证真实 HTTP = 401 `UNAUTHORIZED`、`Cache-Control: no-store`、有效 `X-Request-Id`、`timed_out=false` |
| 2026-10-11 | Phase 04 staging advisors | Supabase Security + Performance Advisor | Staging | PASS：Security 仍只有既有 `pg_net` public schema 与 leaked-password protection 两条 WARN；Performance 仍为既有 42 个 unindexed FK + 51 个 fresh/低流量 unused-index INFO；无 Phase 04 新安全告警 |
| 2026-10-11 | Phase 04 Git checkpoint | Git / GitHub | Task branch | PASS：Phase 04 产品提交 `a248d8a07717a9f58c6f34523614114237cc6342`（tree `3bae2b8dbdb2ab587fb891b46a057fa710a96db7`）已 push 到 `codex/opt-007-config-resource-system`；GitHub ref 精确核对为该 SHA |
| 2026-10-11 | OPT-007 main closeout | `git merge --ff-only` + GitHub ref | Local + GitHub | PASS：`main` 从 `ec997111969c6abfda42f57abd179e6fc0bdfb8e` fast-forward 到 `a248d8a07717a9f58c6f34523614114237cc6342`，无 merge commit；远端 `main` ref 已精确核对为 `a248d8a` |
| 2026-10-11 | OPT-007 branch cleanup | Git / GitHub | Local + GitHub | PASS：远端 `codex/opt-007-config-resource-system` 已删除；本地同名任务分支已删除，删除前与 `main` 同为 `a248d8a`，无独有提交 |
| 2026-10-11 | Production | 发布边界 | Production | NOT_RUN：OPT-007 未获 Production 授权 |

## 当前结论

- 正式模型已冻结为 Config / immutable Version / Gallery Submission + Entry / Like / Usage Event，并保留 `platform_config_files` 作为唯一物理 ledger。
- legacy API 采用 additive coexistence，不做 v1 breaking rename/delete。
- 槽位、平台容量、Gallery admission、删除与 usage 语义已在 design 固化。
- Phase 01–04 的产品/数据库实现与 Local/staging 验证均已完成；Account API 保持 v60，Phase 04 没有 Edge 源码变更。
- Phase 04 新增 lifecycle reconciliation 与统一 privacy cleanup；Global Delete/retention 已覆盖 Config/Gallery/Like/Usage，而 Storage 物理删除仍由原 file state machine + backup barrier 证明。
- canonical R3 为 21 executable gates PASS；产品提交 `a248d8a` 已进入并核对远端 `main`，任务分支本地/远端均已清理，OPT-007 已闭环。Production 始终 NOT_RUN，除非用户另行明确授权。
