# OPT-001 平台切换器下拉浮层优化计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

本 Proposal 只修改 Admin PlatformSwitcher 的浮层结构和样式：改善搜索框/浮层比例，删除底部平台目录快捷入口，并增加对应浏览器回归。没有 API、数据、Supabase 或 Consumer 合同变化。

起始基线：`main@ff2003491148d02f94d3712dcc12242fd2bfe0cd`。

风险分级：**R2**。原因是共享 Admin UI 组件且删除一个现有点击跳转入口；不满足 R1 “不改点击事件/跳转、且不影响共享组件消费者”的条件。

受影响消费者：Admin Shell / Sidebar 中的 Global 与 Platform scope。Supabase：不涉及。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | 收敛 PlatformSwitcher 浮层职责、优化比例并完成本地回归 | design 已冻结；最新 main 已核对 | 执行中 | [阶段 01](phases/01-phase.md) |

## 总体验收

- [x] PlatformSwitcher 内只保留 Global 选项、搜索和平台选项。
- [x] 搜索名称/code、选中态、关闭行为、空结果和错误恢复未退化。
- [x] 390px 窄屏下浮层不溢出视口。
- [x] `pnpm --filter admin typecheck` PASS。
- [x] `pnpm --filter admin test:unit` PASS。
- [x] `pnpm --filter admin build` PASS。
- [x] PlatformSwitcher 定向浏览器回归 PASS。
- [x] `pnpm docs:check`、`pnpm contracts:check`、`git diff --check` PASS。
- [x] 最终 diff 审查确认无 Supabase/API/后续 OPT 越界修改。
- [ ] 任务分支 push、合并 main、远端 main SHA 与本地一致，分支清理完成。

## 风险与阻塞

当前没有业务规则阻塞。若本地浏览器环境不可用，R2 的 UI 验证不能以 typecheck/build 代替，应修复本地环境或记录 BLOCKED 后停止合并。

本 OPT 不修改 Supabase，因此不存在 phase 级 migration/Function 部署；最终仍需核对任务 diff 中没有 `supabase/` 变化，并确认现有远端状态不需要因本 OPT 更新。

## 验证与交付

实际命令、退出码、浏览器断言、commit、push、main 合并和远端核对记录在 [verification-record.md](verification-record.md)。
