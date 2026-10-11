# OPT-006 平台接入配置与首次接入向导计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从 `main@018bcaf78797391b9b9080c5cb4be81150d86925` 将分散的 Platform 接入配置收敛成一个真实事实驱动的首次接入/长期维护中心，并把平台创建与接入流程连续起来。

风险分级：**R3**。

当前分支：`codex/opt-006-platform-onboarding`。

本项复用现有 Admin API，不新增数据库 migration、Edge route 或 OpenAPI；因此无新的 Supabase 远端状态需要部署。

## 阶段

| 阶段 | 目标 | 状态 | 详细计划 |
| --- | --- | --- | --- |
| 01 | 状态模型、导航/路由兼容、平台创建连续流程 | 执行中 | [阶段 01](phases/01-integration-state-navigation.md) |
| 02 | 接入配置页、Origin/Key 复用、browser/R3/Git closeout | 未开始 | [阶段 02](phases/02-integration-workspace.md) |

## 总体验收

- [ ] 接入状态模型区分中央权威事实、按需商业配置和外部验证。
- [ ] 创建平台成功后进入 `/settings/integration?welcome=1`。
- [ ] Platform Sidebar 只保留一个接入配置入口，旧 URL 兼容。
- [ ] 接入配置页复用现有 Origin/Key 安全交互，不复制 mutation 逻辑。
- [ ] 外部目标平台步骤不出现手工伪 PASS。
- [ ] onboarding guide / Admin DESIGN / architecture 与当前实现同步。
- [ ] R3 Local 与 canonical gate 通过，GitHub/main/分支清理闭环后再进入 OPT-007。

## 回退

- UI 回退可恢复旧 Sidebar Origin/Key 项和独立页面入口；底层 API/SQL 未修改，无数据库回滚。
- 平台创建若新导航行为需要回退，只恢复创建后的目录刷新/关闭流程，不影响已创建平台事实。
