# OPT-005 实施与验证记录

## 基线

- 起始 main：`17212999e3eefcba39b755ce9e71555dde91f4f2`
- 分支：`codex/opt-005-platform-scope-navigation`
- 初始工作区：clean，`main == origin/main`。
- 风险：R2；无数据库/API/Contract/Supabase 远端变更。

## 阶段状态

| 阶段 | 状态 | 已完成 | 剩余 |
| --- | --- | --- | --- |
| 01 Sidebar scope | PASS | 最新 main 核对、实现、unit/build/browser、canonical R2、GitHub/main/branch cleanup | 无 |

## 验证记录

| 日期 | 阶段 | 操作 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 预研 | main/worktree、Sidebar/navigation、Architecture、旧双透镜 Proposal 重新核对 | Local | PASS：确认 Platform Sidebar 的全局治理为 `AdminSidebar` 额外注入；`platformNavigationGroups` 本身纯平台；OPT-003 已使旧 Operations 描述过时 |
| 2026-10-11 | 01 | `pnpm --filter admin test:unit` + `pnpm --filter admin typecheck` + `pnpm --filter admin build` | Local | PASS：12 files / 55 tests；typecheck；Next production build 完成且全部 Admin routes 可生成 |
| 2026-10-11 | 01 | `node tests/spikes/e2e/admin-ux-local.mjs` | Local synthetic browser | PASS：Platform Sidebar 仅保留平台资源；6 类 Global href 不再常驻；Switcher 返回“所有平台”后 Global 审计导航恢复；原有 60 route/viewport 响应式与语义矩阵全部 PASS |
| 2026-10-11 | 01 | `pnpm lint` + `pnpm format:check` + `pnpm docs:check` | Local | PASS：lint 0 warnings / 0 errors；format 395 files；docs 154 documents |
| 2026-10-11 | 01 | 首次 `pnpm verify:task:0801` | Local + Local Supabase | FAIL：fresh reset、API 97/97、62 files / 1146 SQL tests、contracts/Consumer Harness 等均已通过；最终 Admin browser 仍保留旧“平台内 audit 一跳直通”断言而失败，定位为被 OPT-005 替代的历史验收，不是产品回归 |
| 2026-10-11 | 01 | 更新 `tests/spikes/e2e/t12-r2-admin.mjs` 后 `pnpm verify:task:0801 --reuse-local` | Local + Local Supabase | PASS：20 executable gates；T12 `platformScopeIsolation=PASS`；62 files / 1146 SQL tests、API 97/97、build/unit/contracts/Registry/Harness/runtime、Consumer/Admin E2E、docs/OpenAPI 全 PASS |
| 2026-10-11 | GitHub | `57c7ae7` + `6e729a1`，任务分支 push，fast-forward main，远端 SHA 核对，任务分支清理 | GitHub | PASS：产品实施提交 `6e729a17faea415b89ae2088dd6535b23d9a3d1e` 已进入远端 main；首次 push/ls-remote 遭遇临时 HTTPS 连接失败，链路恢复后按标准 Git 流程完成；本地/远端任务分支均已删除 |

## 交接

- OPT-005 已完成，无产品决策、Local R2、GitHub 或远端 Supabase 阻塞；本项无 Supabase 远端变更，部署不适用。
- 下一步：从完成 closeout 后的最新 `main` 开始 OPT-006，不回补本项已关闭的 Platform Sidebar 全局治理入口。

