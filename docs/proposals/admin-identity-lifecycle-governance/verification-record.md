# OPT-003 实施与验证记录

## 项目与基线

- 优化目标：统一 Global Identity 与身份删除生命周期治理入口。
- 实施范围：Identity lifecycle read/API/OpenAPI、Admin Identity detail、deletion-jobs 子视图、Operations 兼容 redirect、内部深链迁移。
- GitHub 仓库：`aisenhub/Aisenhubplatform`。
- 工作分支：`codex/opt-003-identity-lifecycle`（已在本地与远端删除）；最终交付分支为 `main`。
- 起始 commit：`425173ea70efc19e5410a0a4f0e25e7e30204591`。
- 初始工作区状态：clean；`main == origin/main` 后创建任务分支。
- 运行环境：Local Windows + Docker Desktop + Local Supabase；Production 不在授权范围。
- 已知基线失败：无；OPT-002 canonical R3 在起始 main 前已通过。

## 阶段状态总表

| 阶段 | 名称 | 状态 | 已完成 | 剩余/依赖 | commit | push/GitHub |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Identity lifecycle 数据/API 合同 | PASS | migration/API/OpenAPI、Local fresh/upgrade/DB/API/contracts、workendstaging migration/Edge/权限、Git 分支交付 | 无 | `5cd68a5` | PASS |
| 02 | Unified Users lifecycle UI | PASS | Identity detail/deletion-jobs/redirect/deep links、真实 start/retry、DB forward-fix、Local canonical R3、workendstaging DB、GitHub/main 与分支清理 | 无 | `dca2582` | PASS |

## 阶段实施记录

### 阶段 01：Identity lifecycle 数据/API 合同

- 实际修改文件及职责：新增 `20261010134140_admin_identity_lifecycle_read.sql` 与 `t21_admin_identity_lifecycle.sql`；Account API 新增精确 Identity detail；Admin OpenAPI 与 Consumer Lab snapshot 同步；identity-security 当前架构同步。
- 已实现行为：live Auth Identity 可通过 `GET /admin/api/v1/accounts/{userId}` 读取身份、平台账户与安全的删除 request/job 聚合；缺失 Auth identity 404，Auth 上游故障 503；SQL 只授予 admin_executor 并隐藏 request session/fence/lease。
- 冻结的数据、接口和跨阶段契约：保留 existing deletion-job mutation APIs；新增只读 lifecycle function 与 `GET /accounts/{userId}`；详情不暴露 request session/lease/fence。
- 与计划的偏差、原因和影响：首次尝试仓库自定义 Supabase wrapper 创建 migration 时发现 wrapper 不支持 `migration new`，无副作用失败；随后按固定 CLI 实际入口 `pnpm exec supabase migration new` 创建 forward migration。`contracts:check` 首次因新增 operation 导致 Consumer Lab 生成快照过期，按仓库生成命令同步后复测通过。format 首次仅 OpenAPI/admin.ts 两文件不一致，定向 oxfmt 后通过。
- 新增依赖及必要性：无。
- 未完成或未验证内容：无；Phase 01 已交付并进入 Phase 02。

### 阶段 02：Unified Users lifecycle UI

- 实际修改文件及职责：新增 `/admin/accounts/[userId]` Identity detail 与 `/admin/accounts/deletion-jobs` 子视图；把旧 Operations 高风险 mutation 交互抽为共享 `DeletionMutationDialog`；移除一级“运维中心”；旧 `/admin/operations` 与 `/admin/deletion-jobs` 仅保留服务端兼容 redirect；Overview/Audit/platform files 深链迁移；Admin BFF allowlist 补齐 exact Identity GET；浏览器路由矩阵与 Global Delete 行为覆盖扩展。
- 高风险语义：start/retry 继续调用既有 deletion-job API，保留 recent-MFA、确认、Idempotency-Key、`replay: never` 与 unknown-outcome 不自动重放；跨用户任务视图不暴露 lease/fence，Auth 已删除后的 detached job 可追踪但不伪造 live Identity。
- 集成发现与修复：真实浏览器首次真正执行 Global Delete start 时返回 503。新增真实 `admin_executor` pgTAP 后定位为旧 `private.admin_deletion_job_start` 的 `RETURNS TABLE request_id` 与 `ON CONFLICT (request_id)` PL/pgSQL 歧义。新增 forward migration `20261010145245_fix_admin_deletion_job_start_conflict.sql`，仅把 upsert conflict target 绑定到 `deletion_jobs_request_id_key`，不改变状态机/API；新增 start→blocked→retry 行为断言防止回归。
- 与计划的偏差：Phase 02 原本预计纯 UI/consumer 迁移，但真实浏览器覆盖暴露既有 DB runtime 缺陷，因此新增一笔最小 forward-fix。没有修改任何已应用 migration，也没有重写 worker/checkpoint/lease/fence。
- 新增依赖：无。
- 未完成或未验证内容：无。

## 验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 | 计划/01 | `425173ea` + plan-only worktree | 最新 main、Accounts/Operations、Global Delete migrations、Admin API/OpenAPI、architecture/reference 重新核对 | Local | 0 | PASS：确认 Global Delete 状态机可复用；缺口是 Identity lifecycle 聚合读取与 Admin IA |
| 2026-10-10 | 01 | worktree | `pnpm test:api` | Local | 0 | PASS：97/97；Identity detail 新增 200、404、Auth unavailable 503 与敏感字段负断言 |
| 2026-10-10 | 01 | worktree | `pnpm contracts:check`（首次） | Local | 1 | FAIL：OpenAPI 本体识别 Admin 47 operations，但 Consumer Lab 生成快照尚未包含新 operation |
| 2026-10-10 | 01 | worktree | `pnpm consumer-lab:contracts:write` → `pnpm contracts:check` → `pnpm contracts:breaking` | Local | 0/0/0 | PASS：Consumer Lab 快照同步；Admin 47 operations；相对 origin/main 无破坏性合同变更 |
| 2026-10-10 | 01 | worktree | `pnpm exec supabase migration up --local` | Local Supabase | 0 | PASS：从 OPT-002 当前库仅前向应用 `20261010134140_admin_identity_lifecycle_read.sql` |
| 2026-10-10 | 01 | worktree | `pnpm exec supabase test db --local supabase/tests/t21_admin_identity_lifecycle.sql` | Local Supabase | 0 | PASS：11/11，含 admin_executor、权限负例、active request 优先、blocked job、无 request 与过期 session |
| 2026-10-10 | 01 | worktree | `pnpm test:db`（upgrade） | Local Supabase | 0 | PASS：61 files / 1124 tests |
| 2026-10-10 | 01 | worktree | `pnpm db:reset` + `pnpm test:db` | Local Supabase | 0/0 | PASS：fresh migration 应用至 `20261010134140`；61 files / 1124 tests |
| 2026-10-10 | 01 | worktree | `pnpm format:check`（首次） | Local | 1 | FAIL：仅 `contracts/admin/v1/openapi.json` 与 `admin.ts` 格式不一致 |
| 2026-10-10 | 01 | worktree | changed-file `oxfmt` → `pnpm format:check` → `pnpm lint` → `pnpm docs:check` → `git diff --check` | Local | 0/0/0/0/0 | PASS：386 files format；lint 0/0；143 docs；diff clean |
| 2026-10-10 | 01 | worktree | linked `supabase db push --dry-run` → `db push --linked --yes` | workendstaging | 0/0 | PASS：dry-run 仅列 `20261010134140`；远端成功应用同版本 migration |
| 2026-10-10 | 01 | worktree | `supabase functions deploy account-api --project-ref ... --no-verify-jwt --use-api` | workendstaging | 0 | PASS：`account-api` 从 v55 升至 ACTIVE v56，保持 `verify_jwt=false` 的现有自定义 Admin/Platform auth 边界 |
| 2026-10-10 | 01 | worktree | migration/function list + read-only lifecycle SQL probe | workendstaging | 0 | PASS：migration `20261010134140` 存在；admin_executor 可执行、account/job executor 拒绝、search_path 固定；真实活动 Admin context 返回单一合法 lifecycle row |
| 2026-10-10 | 02 | worktree | Admin typecheck / unit / build（首轮） | Local | 1→0 | 首轮 unit 暴露 Phase 01 集成遗漏：BFF allowlist 未放行 exact Identity GET，Consumer Lab/unit 仍硬编码 46 operations；补齐后 11 files / 51 tests、typecheck、production build 全 PASS |
| 2026-10-10 | 02 | worktree | `pnpm lint` / `pnpm format:check` | Local | 0/0 | PASS：lint 0 warnings / 0 errors；392 files format PASS |
| 2026-10-10 | 02 | worktree | canonical R3（前两次诊断） | Local Supabase/Auth/Chrome | 1/1 | FAIL 均属于测试 fixture：直接 SQL 伪造 Auth user 无法被 GoTrue exact Admin API 当作真实身份；改为真实 Local Supabase signup fixture，不放宽产品断言 |
| 2026-10-10 | 02 | worktree | canonical R3（第三次） | Local Supabase/Auth/Chrome | 1 | FAIL：真实 Auth Identity detail/pending request 已通过，但 Global Delete start 返回 503；证明失败点已收敛到真实 DB mutation |
| 2026-10-10 | 02 | worktree | 新增真实 `admin_executor` start 行为 pgTAP（修复前） | Local Supabase | 1 | FAIL（预期诊断）：PostgreSQL 原始错误 `column reference "request_id" is ambiguous`，定位旧函数 `ON CONFLICT (request_id)` 与 RETURNS TABLE 输出变量冲突 |
| 2026-10-10 | 02 | worktree | `20261010145245` migration up + 定向 Global Delete pgTAP | Local Supabase | 0/0 | PASS：forward-fix 成功应用；真实 start/retry 32/32 |
| 2026-10-10 | 02 | worktree | `pnpm test:db` upgrade → `pnpm db:reset` → `pnpm test:db` fresh | Local Supabase | 0/0/0 | PASS：upgrade/fresh 均 61 files / 1130 tests；fresh 应用至 `20261010145245` |
| 2026-10-10 | 02 | worktree | `pnpm verify:task:0801 --reuse-local`（最终） | Local Supabase/Auth/DB/Storage/Chrome | 0 | PASS：20/20 executable gates；API 97/97；DB 1130；start/retry/redirect/deep links；5 viewports × 19 routes = 95 responsive/a11y 组合；docs/contracts 全 PASS |
| 2026-10-10 | 02 | worktree | linked `supabase db push --dry-run` → `db push --linked --yes` | workendstaging | 0/0 | PASS：dry-run 仅列 `20261010145245`；远端成功应用同版本 forward-fix |
| 2026-10-10 | 02 | worktree | read-only function/migration privilege probe | workendstaging | 0 | PASS：migration 存在、named conflict target 生效、domain_owner + security-definer + pinned search_path 保持、admin_executor 可执行且 account_executor 拒绝 |
| 2026-10-10 | closeout | `94f8c7f` | `main` fast-forward + push + `git ls-remote` | GitHub | 0 | PASS：远端 `main` 与任务分支均指向 `94f8c7f343300fe670c20c69eb08f142ff047aed` 后完成合并 |
| 2026-10-10 | closeout | `94f8c7f` | 删除远端与本地 `codex/opt-003-identity-lifecycle` | Git/GitHub | 0 | PASS：任务分支两端均已清理，产品历史仅保留在 main |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 01 | `5cd68a597ab9012c138cf9b2585ce5014bc819c3` | `codex/opt-003-identity-lifecycle` | PASS | PASS：`git ls-remote` 与本地 SHA 一致 | GitHub task branch |
| 02 | `dca258284917c03095f65b31c49bd0e5cb2015b2` | `codex/opt-003-identity-lifecycle` | PASS | PASS：`git ls-remote` 与本地 SHA 一致 | GitHub task branch |
| final | `94f8c7f343300fe670c20c69eb08f142ff047aed` | `main` | PASS | PASS：fast-forward 后远端 main 与本地一致；任务分支随后删除 | GitHub main |

## 交接信息

- 下一阶段从哪里开始：从 OPT-003 最终 closeout 后的最新 main 建立新的独立任务分支。
- 必须先解决的问题：无。
- 可直接复用的接口和能力：`getAdminAuthUserById`、`admin_identity_accounts`、`admin_deletion_job_start/list/read/retry`、Admin recent-MFA/ConfirmActionDialog。
- 不应重复实施的工作：Global Delete worker、checkpoint、lease/fence、Auth 删除与匿名化算法。
- 当前未提交修改及归属：仅本次最终 closeout 文档，归属 OPT-003；产品代码已在 main。
- 需要用户决定的事项：无。
