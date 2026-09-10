# Frontend Experience & State Upgrade — Package Manifest

> FE-R1（2026-09-10）：按当前代码基线 `main@94631ff` 维护；Auth 已实施，本期默认简体中文。原规划快照已产生 Phase 01–08 实施结果，当前状态以 [verification-record.md](verification-record.md) 为准。

> 本包仍是执行计划索引，不替代实施证据。Phase 01–08 与 FE-D02 Local 已有代码、验证、commit/push 和 `main` 合并；Hosted/Staging/生产、全状态故障注入和正式发布仍按状态记录维护。

## 推荐放置位置

```text
docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/
```

## 执行入口

1. [00-master-plan.md](./00-master-plan.md) — 总计划、冻结契约、阶段依赖、风险、完成标准。
2. [agent-handoff.md](./agent-handoff.md) — 可直接复制给执行 agent 的稳定提示词、Git/协作/停止边界。
3. [verification-record.md](./verification-record.md) — 实施期间唯一进度、测试、commit/push、交接记录模板。
4. [architecture-coverage-matrix.md](./architecture-coverage-matrix.md) — 架构逐项覆盖矩阵，防遗漏。

## Phase 01–08

| 顺序 | 文档 | 内容 |
|---|---|---|
| 01 | [01-experience-foundation-admin-shell.md](./01-experience-foundation-admin-shell.md) | `@kit/ui`/CSS 硬门槛、Shared Experience、AdminShell、Command、Audit 第一条真实闭环 |
| 02 | [02-platform-context-workspace.md](./02-platform-context-workspace.md) | URL-based Platform context、Global/Platform scope、Platform Directory/Workspace |
| 03 | [03-high-risk-state-interactions.md](./03-high-risk-state-interactions.md) | Confirm、recent MFA、Mutation states、accepted/unknown、secret、Accounts/Keys 纵切 |
| 04 | [04-accounts-entitlements-resource-pages.md](./04-accounts-entitlements-resource-pages.md) | Accounts、Plans、Subscriptions、Redemption Batches |
| 05 | [05-files-platform-settings.md](./05-files-platform-settings.md) | Files、File Policy、General、Origins、API Keys |
| 06 | [06-operations-audit-overview.md](./06-operations-audit-overview.md) | Operations Center、Audit、真实 Overview、request-id UX |
| 07 | [07-consumer-registry-adoption.md](./07-consumer-registry-adoption.md) | Consumer protected UX、Account/Subscription/Files/Security、Registry 同步 |
| 08 | [08-responsive-accessibility-integration-cleanup.md](./08-responsive-accessibility-integration-cleanup.md) | Responsive/A11y、全量集成回归、旧路径退出、最终清理 |

推荐执行依赖：

```text
01 → 02 → 03 → (04 ∥ 05 ∥ 07) → 06 → 08
```

其中 Phase 06 只依赖 04+05；最终 Phase 08 等待 04+05+06+07。

## Future / 第二期

- [future/01-diagnostics-search-alerts.md](./future/01-diagnostics-search-alerts.md)
  - System Health
  - Global Resource Search
  - Alerts/Notification Center
  - full Request Inspector
  - unified operation feed/worker metrics

这些能力依赖 Observability/API 后端；**不参与本期 Phase 01–08 验收，不得做假数据或假状态**。

## Reference 快照

- [references/Aisenhub_Frontend_Experience_State_Architecture.md](./references/Aisenhub_Frontend_Experience_State_Architecture.md) — 本计划的主要目标架构来源。
- [references/Aisenhub_Platform_Optimization_Architecture.md](./references/Aisenhub_Platform_Optimization_Architecture.md) — 上位总体优化架构。
- [references/auth-session-upstream-contract.md](./references/auth-session-upstream-contract.md) — Authentication & Session 上游合同摘要；执行时仍须读取实际 Auth 计划和 verification record。

## 研究基线说明

规划研究曾核对 `aisenhub/Aisenhubplatform` 的 Admin/Consumer、BFF、UI package、测试脚本与历史 evidence。研究阶段使用的代码快照和远端 main 只用于说明“当时看到的事实”，**不能替代执行 agent 的本地起始 SHA**。

执行 agent 必须重新运行：

```bash
pwd
git remote -v
git branch --show-current
git status --short
git rev-parse HEAD
git log -1 --oneline
node --version
pnpm --version
```

并将结果写入 `verification-record.md`。

## 本包自检项目

- [x] 总计划存在。
- [x] Phase 01–08 均有独立执行文档。
- [x] Future 能力与本期验收隔离。
- [x] `agent-handoff.md` 存在。
- [x] `verification-record.md` 以未开始/未验证创建。
- [x] 架构覆盖矩阵存在。
- [x] 原始架构 reference 存在。
- [x] 相对 Markdown 链接：打包前检查为 0 个缺失链接；这是计划包结构自检，不是产品验证。
- [x] ZIP 完整性：打包后 `zipfile.testzip()` 返回无损坏条目；这是计划包交付自检，不是产品验证。
