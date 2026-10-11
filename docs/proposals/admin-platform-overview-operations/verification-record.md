# OPT-004 实施与验证记录

## 基线

- 起始 main：`80a260bc43738b168d6521ccdbe51cb99eef929f`
- 分支：`codex/opt-004-platform-overview`
- 初始工作区：clean，`main == origin/main`。
- 环境：Local Windows + Docker Desktop + Local Supabase；Production 不在授权范围。
- 风险：R3。

## 阶段状态

| 阶段 | 状态 | 已完成 | 剩余 |
| --- | --- | --- | --- |
| 01 聚合合同 | PASS | migration/API/OpenAPI、权限、upgrade/fresh、DB/API/contracts、Admin BFF/unit | 无 |
| 02 Admin UI | PASS | Overview UI、unit/typecheck/build、synthetic browser、canonical R3、staging、Git/main | 无 |

## 验证记录

| 日期 | 阶段 | 操作 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 预研 | main/worktree、Platform Overview、账户/订阅/订单 schema、Admin API/OpenAPI 重新核对 | Local | PASS：确认需新增权威聚合边界；Feedback/Gallery 尚不存在，收入口径不在本项实现 |
| 2026-10-11 | 01 | `pnpm exec supabase migration up --local` + 定向 `t22_admin_platform_overview.sql` | Local Supabase | PASS：migration 前向应用；16/16 pgTAP |
| 2026-10-11 | 01 | `pnpm test:api` | Local | PASS：97/97 |
| 2026-10-11 | 01 | Consumer Lab snapshot write + `contracts:check` + `contracts:breaking` | Local | PASS：Admin 48 operations；compatibility/breaking 均 PASS |
| 2026-10-11 | 01 | `pnpm test:db`（upgrade） | Local Supabase | PASS：62 files / 1146 tests |
| 2026-10-11 | 01 | `pnpm db:reset` + `pnpm test:db` | Local Supabase | PASS：fresh 应用至 `20261010223414`；62 files / 1146 tests |
| 2026-10-11 | 01 | `pnpm --filter admin test:unit` | Local | PASS：11 files / 51 tests，含 BFF/OpenAPI allowlist 48 operations |
| 2026-10-11 | 01 | format/lint/docs/diff | Local | PASS：392 files；lint 0/0；149 docs；diff clean；format 首次仅 Account API test 一文件不一致，定向格式化后复测通过 |
| 2026-10-11 | 02 | `pnpm --filter admin typecheck` + `pnpm --filter admin test:unit` + `pnpm --filter admin build` | Local | PASS：typecheck；12 files / 55 tests；production build（首次 build 仅因工具 120 秒预算在 collect traces 后超时，重跑同一命令真实 exit 0） |
| 2026-10-11 | 02 | `node tests/spikes/e2e/admin-ux-local.mjs` | Local synthetic browser | PASS：权威 KPI、30→7 天服务端周期切换、两个“尚未接入”占位、刷新失败保留旧数据/恢复；60 route/viewport 响应式语义矩阵及既有交互全部 PASS |
| 2026-10-11 | 02 | browser 环境诊断 | Local | 首轮长时 dev instance 的 stale `.next` 令既有 accounts 子路由直接 404；清理 `.next` 后该路由 HTTP 200，完整 browser 复测 PASS；不是产品代码失败 |
| 2026-10-11 | 02 | `pnpm format:check` | Local | PASS：395 files |
| 2026-10-11 | 02 | `pnpm verify:task:0801` | Local + Local Supabase | PASS：21 executable gates；fresh migration 至本任务 migration；62 files / 1146 SQL tests；API 97/97；contract breaking、Registry/Harness、runtime、Admin/Consumer E2E、docs/OpenAPI 全 PASS |
| 2026-10-11 | Staging | `supabase db push --linked --dry-run` | workendstaging (`egsokuicabbxspkdccqe`) | PASS：linked project 明确为 workendstaging；dry-run 仅包含 `20261010223414_admin_platform_overview.sql` |
| 2026-10-11 | Staging | `supabase db push --linked --yes` | workendstaging | PASS：`20261010223414 admin_platform_overview` 已应用且 migration history 可见 |
| 2026-10-11 | Staging | `supabase functions deploy account-api --project-ref egsokuicabbxspkdccqe --no-verify-jwt --use-api` | workendstaging | PASS：`account-api` ACTIVE v57，`verify_jwt=false` 与现有自定义路由鉴权设计一致；远端代码包含 platform overview route 与 `private.admin_platform_overview(...)` 调用 |
| 2026-10-11 | Staging | SQL read-only verification | workendstaging | PASS：函数存在；admin_executor 可执行，account/job executor 不可执行；security definer + pinned search_path；5 个 Overview 索引存在；active Admin context 下 30 天聚合返回 1 行且账户/订单基础不变量成立 |
| 2026-10-11 | Staging | Supabase security/performance advisors | workendstaging | 无 OPT-004 新阻塞：security 仍为既有 `pg_net` public schema 与 leaked-password protection disabled 两项 WARN；performance 为历史 unindexed FK/unused-index INFO，新 Overview 索引因刚部署尚无使用统计，不据此删除 |
| 2026-10-11 | Git | task branch commits/push | GitHub | PASS：`caaa433` Proposal、`fee9ac1` 聚合合同、`1580d36` Overview UI、`c73b2c6` staging 验证均已 push 到 `origin/codex/opt-004-platform-overview` |
| 2026-10-11 | Git | `git merge --ff-only codex/opt-004-platform-overview` + `git push origin main` | GitHub | PASS：`main` fast-forward 到 `c73b2c6`，远端 main 已包含全部产品、migration/API、测试与 staging 证据提交 |

## 交接

- OPT-004 已完成设计、实施、Local R3、staging 同步、GitHub main 合并与远端核对。
- closeout 文档提交并清理已合并任务分支后，从最新 main 开始 OPT-005。
- 不应重复实施：OPT-003 Identity lifecycle；Global Billing observability；后续 OPT-007/008/009/010 目标域。

