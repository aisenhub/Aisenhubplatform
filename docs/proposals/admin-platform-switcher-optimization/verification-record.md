# OPT-001 实施与验证记录

## 项目与基线

- 优化目标：收敛 PlatformSwitcher 为纯 scope switcher，优化搜索/浮层比例并移除平台目录快捷入口。
- 实施范围：Admin UI + synthetic browser regression + Proposal 文档。
- GitHub 仓库：`https://github.com/aisenhub/Aisenhubplatform.git`
- 工作分支：`codex/opt-001-platform-switcher`
- 起始 commit：`ff2003491148d02f94d3712dcc12242fd2bfe0cd`
- 初始工作区状态：clean；`HEAD == origin/main`
- 运行环境：Local；浏览器回归只使用 synthetic API fixture，不连接远端 Supabase。
- 风险级别：R2（共享 UI + 删除现有跳转入口）。
- 已知基线失败：无。

## 阶段状态总表

| 阶段 | 名称 | 状态 | 已完成 | 剩余/依赖 | commit | push/GitHub |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | PlatformSwitcher UI 收敛与回归 | 完成 | design/plan、产品实现、浏览器/静态/构建/合同/文档验证、diff 审查、产品 commit push/main 合并 | closeout 记录合并后执行任务分支删除并核对最终 Git 状态 | `8774aae3d3965fbdee9bf7762757d921514dde08` | 已 push；GitHub API 已确认 main |

## 阶段实施记录

### 阶段 01：PlatformSwitcher UI 收敛与回归

- 实际修改文件及职责：`platform-switcher.tsx` 收敛下拉结构和比例；`admin-ux-local.mjs` 增加 scope-only/search/390px 边界回归；`docs/architecture/modules/frontends.md` 同步已实现行为；本 Proposal 与 intake/proposals 索引维护设计、计划和证据。
- 已实现行为：删除“查看完整平台目录 →”及其 `Boxes` 图标；浮层调整为 `w-80` 并以 viewport max-width 防溢出；搜索框升至 `h-9` 并重排图标/内边距；保留 Global 选项、平台状态、名称/code 搜索、选中态、空结果和 Escape/外部关闭语义。
- 冻结的数据、接口和跨阶段契约：不修改平台 API、`mapAdminScopeRoute`、数据库或 Supabase。
- 与计划的偏差、原因和影响：无产品范围偏差。第一次将 build/lint/format 放在 120 秒链式命令时，build 在 TypeScript 阶段因 Runner 总时限退出；随后独立 `pnpm --filter admin build` 在 600 秒预算下 PASS。首次 `format:check` 正确发现本阶段两个修改文件格式未收敛，运行 `oxfmt` 后重验 PASS。
- 新增依赖及必要性：无。
- 未完成或未验证内容：仅 GitHub/main 交付和分支清理。

## 验证记录

| 日期 | 阶段 | 代码版本 | 命令/操作 | 环境 | 退出码 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 | 01 | 起始基线 | 最新 main / worktree /源码核验 | Local | 0 | PASS |
| 2026-10-10 | 01 | worktree | `pnpm --filter admin typecheck` | Local | 0 | PASS |
| 2026-10-10 | 01 | worktree | `pnpm --filter admin test:unit` | Local | 0 | PASS：9 files / 45 tests |
| 2026-10-10 | 01 | worktree | `pnpm docs:check` | Local | 0 | PASS：131 documents |
| 2026-10-10 | 01 | worktree | `pnpm contracts:check` | Local | 0 | PASS |
| 2026-10-10 | 01 | worktree | build/lint/format 链式验证 | Local | timeout | PARTIAL：build 已编译但 Runner 120 秒总预算耗尽；未据此判定 build 结果 |
| 2026-10-10 | 01 | worktree | `pnpm --filter admin build` | Local | 0 | PASS：Next.js production build、TypeScript、18/18 static pages |
| 2026-10-10 | 01 | worktree | `pnpm format:check`（首次） | Local | 1 | FAIL：仅本阶段两个修改文件需要格式化；随后修复 |
| 2026-10-10 | 01 | worktree | `pnpm exec oxfmt ...` 后 `pnpm lint && pnpm format:check && git diff --check` | Local | 0 | PASS：0 lint warnings/errors，格式与 diff 检查通过 |
| 2026-10-10 | 01 | worktree | `node tests/spikes/e2e/admin-ux-local.mjs` | Local + synthetic fixtures | 0 | PASS：60 route/viewport 组合、switcher 搜索/入口移除/390px 边界及既有 UX 回归通过 |
| 2026-10-10 | 01 | worktree | `pnpm exec supabase status` | Local | 1 | NOT_RUN：本机 Docker daemon 未运行；本 OPT 无 `supabase/` 变更且不依赖本地 Supabase 数据面 |
| 2026-10-10 | 01 | worktree | Git/Vercel deployment binding 核对 | Local + connected Vercel metadata | 0 | PASS：仓库 workflow 未发现 deploy/production 自动化；Vercel Git deployment context 未返回已关联 team/project |
| 2026-10-10 | 01 | `8774aae3d3965fbdee9bf7762757d921514dde08` | `git push -u origin codex/opt-001-platform-switcher` | GitHub | 0 | PASS：远端任务分支已创建并指向产品提交 |
| 2026-10-10 | 01 | `8774aae3d3965fbdee9bf7762757d921514dde08` | fast-forward 合并并 `git push origin main` | GitHub | 0 | PASS：GitHub API 确认远端 main 指向 `8774aae3d3965fbdee9bf7762757d921514dde08` |
| 2026-10-10 | 01 | `8774aae3d3965fbdee9bf7762757d921514dde08` | Supabase 项目健康核对 | Remote `workendstaging` | 0 | PASS：项目状态 `ACTIVE_HEALTHY`；本 OPT 无 Supabase diff，无需部署 migration/Function/config |

## GitHub 交付记录

| 阶段 | commit SHA | 分支 | push | 远端核对 | 链接 |
| --- | --- | --- | --- | --- | --- |
| 01 | `8774aae3d3965fbdee9bf7762757d921514dde08` | `codex/opt-001-platform-switcher` | PASS | PASS：远端 main 已包含产品提交 | GitHub commit `8774aae` |

## Supabase 交付记录

本 OPT 的正式设计排除 API、migration、Edge Function、Storage/Auth/Policy/Secret 和 Supabase 配置变更；最终任务 diff 的 `supabase/` 路径为空，因此远端 Supabase 部署 **不适用**。尝试读取本地 `supabase status` 时本机 Docker daemon 未运行，该诊断没有远端副作用，也不影响本次纯 Admin UI 验收。

远端项目 `workendstaging`（`egsokuicabbxspkdccqe`）在 main 产品提交后核对为 `ACTIVE_HEALTHY`。因为本 OPT 没有任何 `supabase/`、migration、Edge Function 或项目配置变化，没有为了制造版本号而重复部署远端函数。

## 交接信息

- 下一阶段从哪里开始：本 closeout 提交进入 main 并完成任务分支删除后，从最新 main 开始 OPT-002。
- 必须先解决的问题：只剩本 closeout 提交的 main 合并、任务分支删除与最终 clean/remote SHA 核对；这些属于本记录之后的 Git 运行时收尾。
- 可直接复用的接口和能力：现有 PlatformSwitcher、`mapAdminScopeRoute` 和 synthetic Admin UX E2E。
- 不应重复实施的工作：不要修改 scope 路由、平台 API 或 Sidebar IA。
- 当前未提交修改及归属：仅本次 closeout 文档状态与交付证据更新，归属 OPT-001。
- 需要用户决定的事项：无。
