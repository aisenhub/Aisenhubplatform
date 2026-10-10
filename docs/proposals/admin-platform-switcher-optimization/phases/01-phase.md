# 阶段 01：PlatformSwitcher UI 收敛与回归

状态：完成

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

在不改变平台数据读取、scope 路由映射和权限边界的前提下，完成 OPT-001 的全部 UI 修改，并用静态、构建和本地浏览器证据证明 Global / Platform 切换器核心交互未退化。

## 进入条件

- 最新 `origin/main` 已同步并确认起始 SHA 为 `ff2003491148d02f94d3712dcc12242fd2bfe0cd`。
- 工作区在创建 `codex/opt-001-platform-switcher` 前为 clean。
- 正式 design 已冻结本阶段只改 PlatformSwitcher 和定向 UI 回归，不触碰后续 OPT。

## 变更范围

- `apps/admin/components/platform-context/platform-switcher.tsx`
- `tests/spikes/e2e/admin-ux-local.mjs`（增加 PlatformSwitcher 定向断言）
- 本 Proposal 文档、proposals 索引和 OPT-001 状态

不改 API、OpenAPI、数据库 migration、Edge Function、Storage/Auth/Policy 或 Supabase 配置。

## 任务清单

- [x] UI-001：删除 switcher 底部平台目录按钮、分隔线及未使用图标 import。
- [x] UI-002：调整浮层宽度、viewport 限制、内边距、搜索输入高度/图标定位。
- [x] TEST-001：浏览器回归断言 Global 选项存在、目录入口不存在、搜索名称/code 可过滤、清空后恢复列表、窄屏浮层不溢出。
- [x] DOC-001：完成 Proposal、验证记录和 intake 状态同步。
- [x] REL-001：产品提交已 push 并合并到远端 main；本 closeout 记录合并后立即完成分支清理并核对最终 Git 状态。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| Admin 类型 | `pnpm --filter admin typecheck` | Local | PASS | PASS |
| Admin 单元 | `pnpm --filter admin test:unit` | Local | PASS | PASS：9 files / 45 tests |
| Admin 构建 | `pnpm --filter admin build` | Local | PASS | PASS：18/18 static pages；独立重跑完成 |
| PlatformSwitcher 浏览器回归 | 启动本地 Admin 后执行 `node tests/spikes/e2e/admin-ux-local.mjs` | Local + synthetic API fixtures | 新增 switcher 断言与原有 Admin UX 回归全部 PASS | PASS：60 route/viewport 组合与新增 switcher 断言通过 |
| 文档 | `pnpm docs:check` | Local | PASS | PASS：131 documents |
| 合同 | `pnpm contracts:check` | Local | PASS | PASS |
| Diff | `git diff --check` + 最终 diff review | Local | 无 whitespace 错误、无越界改动 | PASS；无 `supabase/`、API 或后续 OPT 产品改动 |
| Supabase | 检查任务 diff 路径 | Local/Git | 无 `supabase/` 变更，因此无需远端部署 | NOT_RUN：不适用；诊断 `supabase status` 因本机 Docker 未运行退出 1，但本阶段无 Supabase 变更或验证依赖 |

## 退出与恢复条件

阶段完成必须满足：功能与定向浏览器回归通过、必需静态/构建检查通过、文档同步、最终 diff 审查通过，并完成 GitHub/main 闭环。

若 UI 回归失败，回退本阶段对 PlatformSwitcher 和定向测试的修改；没有 migration、持久数据或远端 Supabase 状态需要恢复。

## 文档与交付

- [x] 更新本阶段和总计划状态为 Completed。
- [x] 更新 verification-record.md 的实际证据。
- [x] OPT-001 intake 状态更新为已完成并链接正式 Proposal。
- [x] 记录产品 commit、push、main SHA 与 Supabase 不适用结论；分支删除在本 closeout 记录合并后执行并以最终 Git 状态核对。
