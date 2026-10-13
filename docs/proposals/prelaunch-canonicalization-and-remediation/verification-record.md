# 预上线单轨化清理与缺陷修复 — 验证记录

本文件只记录实施期间真实发生的命令、结果、失败、修复、提交和环境动作。用户已于 2026-10-13 确认问题清单、兼容清理方向和 8 阶段 Proposal，并授权开始实施；Production 部署仍不在授权范围。

## 项目与基线

- Proposal：prelaunch-canonicalization-and-remediation
- 审查基线：`65c52fb1162b549b2446550b2cda9367c94e9e4f`
- 实施分支：`codex/prelaunch-canonicalization-remediation`
- 环境 destructive gate：PASS（仅 Local/Test/Staging；测试数据可重建）
- Production：NOT_RUN / 明确禁止

## 阶段状态

| 阶段 | 状态 | 实施结果 | 验证 | commit/push |
| --- | --- | --- | --- | --- |
| 00 | 已交付 | 环境、canonical surface、删除清单和最小 seed 已冻结 | PASS | `a1b2a54` / 已推送任务分支 |
| 01 | 已交付 | 公共 Contract/Harness/runtime/旧 URL surface 已收敛；Account 40 ops / Admin 70 ops | PASS（breaking diff 为预期 28 项） | `2ed8d5f` / 已推送任务分支 |
| 02 | 本地已完成 | Commerce 已收敛为 Plan→Offer→Price→Mapping→Checkout；Plan lifecycle、Mapping switch、operation replay、Price/Mapping 并发与 Price retire 已闭环 | PASS | 待 checkpoint |
| 03 | 本地已完成 | Config / Storage 已收敛为 Config-Version-only ledger；generic file 产品、旧 account quota、legacy storage 分支与 mutable Config cursor 已闭环 | PASS | 待 checkpoint |
| 04 | 本地已完成 | Account transition 已收敛为严格单入口状态机；Feedback batch delete 使用真实 Admin idempotency，unknown outcome 可安全重放 | PASS | 待 checkpoint |
| 05 | 本地已完成 | Overview / Commerce Summary 已共享 canonical paid-entitlement helper；Entitlement 与 Billing cursor 均为 opaque immutable boundary；历史 false-positive 已追加 errata，浏览器反例 fixture 可区分旧/新算法 | PASS（`contracts:breaking` 对旧 `origin/main` baseline 的 37 项 breaking 为阶段 07 前预期） | 待 checkpoint |
| 06 | 未开始 | 未验证 | 未运行 | 未验证 |
| 07 | 未开始 | 未验证 | 未运行 | 未验证 |

## R-01～R-15 关闭记录

已关闭：R-01、R-02、R-03、R-04、R-05、R-06、R-07、R-08、R-09、R-10、R-11、R-12。其余 R-13～R-15 由阶段 06 继续。

## LC-01～LC-13 关闭记录

阶段 02 已关闭 Commerce 域 LC-01、LC-02、LC-03、LC-04、LC-06、LC-07、LC-12；阶段 03 已关闭 Config/Storage 域 LC-05、LC-07、LC-10；LC-08、LC-09、LC-10、LC-11 的公共运行面已由阶段 01 关闭。最终 migration rebaseline 由阶段 07 完成。

## 实际验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-13 | 00 | `65c52fb` | `git status --short; git branch --show-current; git rev-parse HEAD; git remote -v; git rev-list --left-right --count HEAD...origin/main` | Local | 0 | PASS：新建任务分支前后均确认基线 `65c52fb`，`origin/main` 0/0；保留既有并发文档改动。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm toolchain:check` | Local | 0 | PASS：Node 24.19.0 / pnpm 11.18.0 / Deno 2.9.6 / Supabase 2.111.0。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm exec supabase --version` | Local | 0 | PASS：Supabase CLI 2.111.0。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm exec supabase migration list --local` | Local Supabase | 0 | PASS：Local migration history 对齐到 `20261012145252`。 |
| 2026-10-13 | 00 | `65c52fb` | Supabase project / migration / Edge read-only inventory | Connected Supabase | 0 | PASS：仅发现 `workendstaging`；migration history 对齐到 `20261012145252`；Edge baseline account-api v63 / billing-webhook v31 / maintenance v39。 |
| 2026-10-13 | 00 | `65c52fb` | OpenAPI/migration baseline counter | Local | 0 | PASS：Account 47 ops v1.2.0；Admin 77 ops v1.0.0；migration files 112。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm docs:check` | Local | 0 | PASS：207 documents，required entries / local links / navigation 一致。 |
| 2026-10-13 | 00 | `65c52fb` | `pnpm contracts:check` | Local | 0 | PASS：Account 47 / Admin 77 operations，Consumer Lab snapshot 与 compatibility check 通过。 |
| 2026-10-13 | 00 | `65c52fb` | `git diff --check` | Local | 0 | PASS；仅有既有 CRLF→LF 提示，无 whitespace error。 |
| 2026-10-13 | 00 | `a1b2a54` | `git commit -m "docs: freeze prelaunch remediation baseline"` | Local | 0 | PASS：仅提交本任务 Proposal/审查文档；未暂存既有 `docs/README.md` 与 `project-review-2026-10-13.md`。 |
| 2026-10-13 | 00 | `a1b2a54` | `git push -u origin codex/prelaunch-canonicalization-remediation` | GitHub | 0 | PASS：远端任务分支已建立并跟踪；仓库 workflow 仅在 main push / main PR 触发，不因普通任务分支 push 触发该 workflow。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:api` | Local | 0 | PASS：103/103；fixed-product/config-files 测试退出，Checkout/支付/MFA/Global Delete/Config/Feedback 有效场景均改为 canonical surface。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:unit` | Local | 0 | PASS：Domain 12、UI 36、Admin 64（14 files），合计 112 tests；Contract operation count 已重基线到 40/70。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:consumer-harness` | Local | 0 | PASS：37 canonical operations；dynamic route、workspace isolation、CSRF/origin 与 unsupported-route smoke 全绿。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm contracts:check` | Local | 0 | PASS：Account 40 / Admin 70；OpenAPI refs/sample/binary/no-store、Consumer Lab snapshot、3 contracts / 30 fields consumer manifest 全绿。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm contracts:breaking` | Local vs `origin/main` | 1（预期） | EXPECTED BREAKING：28 项，全部属于已批准删除清单：fixed products、product_code checkout、legacy attribution、generic config-files、account root PATCH、subscription-config 与 Admin config-files。阶段 07 建新 baseline 前保持该预期。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm typecheck` | Local | 0 | PASS：5/5 typecheck tasks。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm lint` | Local | 0 | PASS：344 files，0 warning / 0 error。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm format:check` | Local | 0 | PASS：409 files。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm test:tooling` | Local | 0 | PASS：9/9。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `pnpm docs:check` | Local | 0 | PASS：207 documents。 |
| 2026-10-13 | 01 | `fef123f+worktree` | `git diff --check` | Local | 0 | PASS。 |
| 2026-10-13 | 01 | `2ed8d5f` | `git commit -m "feat: remove prelaunch compatibility surfaces"` | Local | 0 | PASS：41 files，345 insertions / 4066 deletions；既有 `docs/README.md` 与 `project-review-2026-10-13.md` 明确排除。 |
| 2026-10-13 | 01 | `2ed8d5f` | `git push` | GitHub | 0 | PASS：远端任务分支已更新到 Phase 01 代码提交。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm db:reset -- --yes` | Local Supabase | 0 | PASS：完整历史从零应用到 `20261013041332_prelaunch_commerce_canonicalization.sql`；一次 Storage health-check 抖动失败后状态恢复并重跑成功，未将基础设施失败伪记为代码 PASS。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:db` | Local | 0 | PASS：66 files / 1431 tests；canonical Commerce、历史 Billing/Config/Feedback/Identity 回归全部通过。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:api` | Local | 0 | PASS：103/103；Checkout 仅接受 Offer，Admin Plan/Offer/Price/Mapping/Policy 路径与 Entitlement `offer` 投影全绿。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:sql:prelaunch-commerce-concurrency` | Local | 0 | PASS：双连接并发 Price versions `[1,2]`、Mapping versions `[1,2]`；two-draft concurrent publish 最终仅一个 active Price，无 raw unique violation。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm test:sql:bill-05-concurrency` | Local | 0 | PASS：两笔并发支付保留 2 条 settlement history，仅 1 个 Grant；决策为 `duplicate_payment` + `granted`。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | runtime `pg_proc` legacy Commerce scan | Local DB | 0 | PASS：`subscription_product_id` / `product_code` / `platform_subscription_config` / `subscription_products` / `legacy_product_code` 命中 0 个 surviving function。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm contracts:check`; `pnpm test:consumer-harness` | Local | 0 | PASS：Account 40 / Admin 72 operations；3 contracts / 30 fields；Consumer Harness canonical operations / route isolation / CSRF smoke 全绿。 |
| 2026-10-13 | 02 | `a7aa71e+worktree` | `pnpm typecheck`; `pnpm lint`; `pnpm format:check`; `pnpm docs:check`; `git diff --check` | Local | 0 | PASS：typecheck 5/5；lint 0 warning / 0 error；410 files format；207 docs；无 whitespace error。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm db:reset -- --yes` | Local Supabase | 0 | PASS：完整历史从零应用到 `20261013080000_prelaunch_config_storage_canonicalization.sql`；Config-Version-only ledger、retired generic file functions 与 Storage Policy rebaseline 可 fresh install。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm test:db` | Local | 0 | PASS：62 files / 1338 tests；新增 t35 19 项覆盖 retired functions/quotas、internal storage capability、函数体无 legacy 分支与 Config cursor mutation-between-pages。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm test:api`; `pnpm test:unit`; `pnpm typecheck` | Local | 0 | PASS：API 103/103；Unit Domain 12 + UI 36 + Admin 64 = 112；typecheck 5/5。 |
| 2026-10-13 | 03 | `a7aa71e+worktree` | `pnpm contracts:check`; `pnpm test:consumer-harness`; `pnpm lint`; `pnpm format:check`; `pnpm docs:check`; `git diff --check` | Local | 0 | PASS：Account 40 / Admin 72 operations；Consumer Harness 全绿；Lint/Format/Docs/whitespace 全绿。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | `pnpm db:reset -- --yes` | Local Supabase | 0 | PASS：完整历史从零应用到 `20261013103000_prelaunch_governance_idempotency.sql`；旧 4 参数 / v2 Account transition 可安全退休。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | `pnpm test:db` | Local | 0 | PASS：62 files / 1349 tests；非法/no-op Account transition 为 0 event + 0 success audit；Feedback same-operation replay 不重复 row_version/delete_requested/audit，hash 冲突 fail closed。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | `pnpm test:api`; `pnpm test:unit`; `pnpm typecheck` | Local | 0 | PASS：API 107/107；Unit Domain 12 + UI 36 + Admin 67 = 115；typecheck 5/5。 |
| 2026-10-13 | 04 | `a7aa71e+worktree` | retired transition/runtime scan; `pnpm contracts:check`; `pnpm test:consumer-harness`; `pnpm lint`; `pnpm format:check`; `pnpm docs:check`; `git diff --check` | Local | 0 | PASS：生产 runtime/UI 对 `admin_account_transition_v2` 0 命中，旧入口仅保留“不存在”断言；Account 40 / Admin 72 contracts、Consumer Harness、Lint/Format/Docs/whitespace 全绿。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | `pnpm db:reset -- --yes`; `pnpm test:db` | Local Supabase | 0 | PASS：完整历史应用到 `20261013120000_prelaunch_read_model_pagination_qa.sql`；62 files / 1354 DB tests。Overview 与 Commerce Summary 共享 `commerce_active_paid_entitlements`；Entitlement mutation-between-pages 与 immutable account cursor 回归通过。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | `pnpm test:api`; `pnpm typecheck`; `pnpm format:check` | Local | 0 | PASS：API 107/107；Commerce Entitlement opaque cursor 解码后把 `account_created_at + account_id` 传回 SQL；typecheck 5/5；410 files format。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | `pnpm verify:task:0801 --reuse-local` | Local | 1（预期 gate） | 前置 format/lint/typecheck/build/unit/tooling/API 107/DB 1354/settlement concurrency 全部 PASS；随后 `contracts:breaking` 对 `origin/main` 报 37 项已批准 prelaunch breaking，因此按设计在阶段 07 rebaseline 前停止，未伪记为产品失败。 |
| 2026-10-13 | 05 | `a7aa71e+worktree` | standalone Local T12 browser flow | Local | 0 | PASS：fixture 先证明 retired subscription-only paid count=2、canonical helper=1，再由浏览器断言 Overview 与 Commerce Summary 一致；`commerceSummarySurfaces` PASS，architecture behavior 全绿，5 viewports × 20 routes = 100 responsive/a11y observations PASS。 |

工具记录：首次组合 Git 诊断使用 `&&` 被当前 Windows PowerShell 解析拒绝（退出码 1），未修改文件；改用 PowerShell 兼容分隔符后 PASS。`supabase status -o json` 仅用于确认 Local 服务存在，命令输出包含本地开发用 key/secret，因此这些值不写入验证记录或任务报告。

## GitHub / Staging

未开始。不得预填成功记录。
