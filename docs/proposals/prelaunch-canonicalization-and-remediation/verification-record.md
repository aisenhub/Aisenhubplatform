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
| 02 | 未开始 | 未验证 | 未运行 | 未验证 |
| 03 | 未开始 | 未验证 | 未运行 | 未验证 |
| 04 | 未开始 | 未验证 | 未运行 | 未验证 |
| 05 | 未开始 | 未验证 | 未运行 | 未验证 |
| 06 | 未开始 | 未验证 | 未运行 | 未验证 |
| 07 | 未开始 | 未验证 | 未运行 | 未验证 |

## R-01～R-15 关闭记录

全部：未开始。

## LC-01～LC-13 关闭记录

LC-08、LC-09、LC-10、LC-11 的公共运行面已关闭；LC-03、LC-05、LC-13 的公共 surface 已关闭但数据库/历史测试清理继续由阶段 02/03/07 完成。其余 LC 项未开始。

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

工具记录：首次组合 Git 诊断使用 `&&` 被当前 Windows PowerShell 解析拒绝（退出码 1），未修改文件；改用 PowerShell 兼容分隔符后 PASS。`supabase status -o json` 仅用于确认 Local 服务存在，命令输出包含本地开发用 key/secret，因此这些值不写入验证记录或任务报告。

## GitHub / Staging

未开始。不得预填成功记录。
