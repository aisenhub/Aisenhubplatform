# 阶段 01：Global Sidebar 与 PlatformSwitcher 收敛

状态：已完成

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

在不改变 Admin 路由、安全边界、API 与 Platform scope 业务结构的前提下，一次完成 Global 导航扁平命名、桌面折叠短名、PlatformSwitcher 浮层收窄与搜索输入修复，并提供单测和真实浏览器证据。

## 进入条件

- 当前分支为 `codex/optimization-batch-20261015`。
- 起始 HEAD 为批次基线 `3b82c1d`，工作区已有修改仅归属于本批次 Intake。
- 已核实 `admin-navigation.ts`、`admin-sidebar.tsx`、共享 Sidebar、PlatformSwitcher、Admin E2E 当前行为。
- 用户已冻结六个 Global full label 与 compact label，无待决业务规则。

## 变更范围

- `apps/admin/components/navigation/admin-navigation.ts`：Global flat items、`compactLabel`、Platform compact label。
- `apps/admin/components/navigation/admin-navigation.test.ts`：固定 full / compact label、顺序和 route label。
- `apps/admin/components/shell/admin-sidebar.tsx`：无标题 group、full/compact label 切换。
- `apps/admin/components/shell/admin-shell.tsx`：Admin 专用 collapsed width CSS variable。
- `apps/admin/components/platform-context/platform-switcher.tsx`：sidebar dropdown width、option visual、search spacing/test anchor。
- `apps/admin/app/globals.css`：Admin collapsed button 局部覆盖，不修改共享 Sidebar 默认。
- `tests/spikes/e2e/admin-ux-local.mjs`：Global 展开/折叠与 PlatformSwitcher 视觉几何断言。
- `apps/admin/DESIGN.md`：同步已实现导航规则。
- Proposal / Intake：记录实际结果。

不修改 migration、SQL、Edge Function、OpenAPI、RLS、Storage、Auth、Secret 或部署配置。

## 任务清单

- [x] NAV-01：把 Global 导航改为单个无标题 group，full label 按“仪表盘 → 平台中心 → 用户中心 → 业务中心 → 审计中心 → 安全中心”排序；路由和 active match 不变。
- [x] NAV-02：为导航项增加 `compactLabel`；Global 固定六个短名，Platform 为长名称提供稳定短名但不改展开态。
- [x] NAV-03：AdminSidebar 在 group label 为空时不渲染标题；展开态显示 full label，collapsed 显示 compact label。
- [x] NAV-04：AdminShell 只为本产品覆盖 collapsed Sidebar 宽度；CSS 仅在 Admin collapsed 容器中解除 icon-only `size-8`，保证图标 + 短名水平可读。
- [x] SW-01：PlatformSwitcher sidebar dropdown 改为容器宽度；平台 option 只显示 name + selected state，保留 name/code 搜索。
- [x] SW-02：搜索图标与文本建立更大的左侧安全区并加测试锚点。
- [x] TEST-01：更新 navigation unit tests，增加 full/compact labels 断言。
- [x] TEST-02：扩展 Admin 浏览器 E2E，验证展开/折叠、平台 scope、dropdown 宽度、code 搜索不显示 code、search icon 几何不重叠和窄屏边界。
- [x] DOC-01：同步 `apps/admin/DESIGN.md`、Proposal 状态和 verification record。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| Navigation unit | `pnpm --filter admin test:unit -- components/navigation/admin-navigation.test.ts` | Local | full/compact label、路由和 scope 映射 PASS | PASS：Admin 14 files / 69 tests 全绿，目标 navigation 8 tests PASS |
| Admin typecheck | `pnpm --filter admin typecheck` | Local | 0 error | PASS |
| Lint / format | `pnpm lint`、`pnpm format:check` | Local | 0 error | PASS：lint 347 files，format 413 files |
| Admin build | `pnpm --filter admin build` | Local | Next build PASS | PASS：Next.js 16.3.8 production build |
| R2 browser | canonical `pnpm run verify:task:0801 --reuse-local` + `node tests/spikes/e2e/admin-ux-local.mjs` | Local Supabase + Chrome | 展开/折叠/PlatformSwitcher/移动端断言 PASS | PASS：TASK-0801 22 executable gates；UX 60 route/viewport + 导航/几何/Account 360 全链通过 |
| Docs/contracts | `pnpm docs:check`、`pnpm contracts:check` | Local | PASS | PASS：224 docs；Account 40 / Admin 76 OpenAPI operations 与 Consumer compatibility 通过 |
| Diff hygiene | `git diff --check` + 最终 diff / Secret 审查 | Local | PASS，无无关文件 | PASS：`git diff --check` 退出码 0；最终 changed-path / hunk 审查仅含本批次 OPT-011 与 Intake/Proposal |
| Supabase deploy | 不执行 | N/A | NOT_RUN：无 Supabase 变更 | NOT_RUN（不适用） |

## 退出与恢复条件

完成条件：所有范围代码与文档落地；必需 R2 本地检查无 FAIL/NOT_RUN/PARTIAL/BLOCKED；浏览器能够证明展开与折叠两种状态以及 PlatformSwitcher 几何要求；最终 diff 只包含 OPT-011 与本批次 Intake/Proposal 文件。

失败恢复：本项无持久数据与 schema 变化，可通过回退本阶段前端文件恢复；不得通过修改共享 Sidebar 全局默认或删除失败断言来“修复”局部问题。

## 文档与交付

- [x] 同步 `apps/admin/DESIGN.md`。
- [x] 更新 `plan.md` / `design.md` 状态与 `verification-record.md`。
- [x] Intake OPT-011 更新为已完成（表示本批次内设计/实施/验证完成）。
- [x] 用户已要求结束本轮优化批次；后续按批次收口流程 push、合并 `main` 并清理已合并分支。
