# 文档目录逐文件迁移表

本表是 [文档架构收敛与知识迁移计划](plan.md) P7 的执行清单。P8 只能执行本表列出的动作；发现新范围时必须先回到 P7 更新本表，而不是临时删除或搬运。

## 1. 迁移原则

- **Move**：内容完整保留，只改变长期归属；迁移后修复相对链接。
- **Move + Normalize**：完整保留主要内容，同时把已确认的旧目录名/当前事实漂移修正到新体系；历史验证事实不改写。
- **Extract + Delete**：文件自身是旧目录导航/治理壳；先把独有规则合入新入口，再删除旧壳。
- **Keep Transitional**：当前不能安全迁移；保留原位并明确后续任务，不为了目录数量强行搬运。
- 历史 verification 中“当时修改了某旧路径”的 inline code 可以保留原路径，因为那是历史事实；Markdown 导航链接必须指向迁移后的真实文件。
- P8 不删除任何仍被活跃 Billing/MFA 计划依赖且尚未迁移到新计划目录的资料。

## 2. `docs/proposals` → `docs/plans`

### 2.1 计划治理文件

| Source | Target / action | Decision |
| --- | --- | --- |
| `docs/proposals/README.md` | **Extract + Delete** | 将仍有效的模板使用、实施 Agent、验证/Git 门槛合入 `docs/plans/README.md` 与 `docs/plans/plan-writing.md`；旧 Proposal 导航壳退出 |
| `docs/proposals/plan-writing.md` | `docs/plans/plan-writing.md` — **Move + Normalize** | 保留全部计划编写细节，把 `proposal` 路径/术语更新为 `plans`，合同引用切到新的 Architecture Reference |

### 2.2 模板

| Source | Target | Action |
| --- | --- | --- |
| `docs/proposals/_template/agent-handoff.md` | `docs/plans/_template/agent-handoff.md` | Move + Normalize |
| `docs/proposals/_template/design.md` | `docs/plans/_template/design.md` | Move + Normalize |
| `docs/proposals/_template/plan.md` | `docs/plans/_template/plan.md` | Move + Normalize |
| `docs/proposals/_template/verification-record.md` | `docs/plans/_template/verification-record.md` | Move + Normalize |
| `docs/proposals/_template/phases/01-phase.md` | `docs/plans/_template/phases/01-phase.md` | Move + Normalize |

### 2.3 活跃 Admin MFA 计划

目录深度保持不变，因此相对的 `../../spec`、`../../architecture` 等链接原则上继续有效；迁移后由 `docs:check` 逐项确认。

| Source | Target | Action |
| --- | --- | --- |
| `docs/proposals/admin-security-mfa-hardening/agent-handoff.md` | `docs/plans/admin-security-mfa-hardening/agent-handoff.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/design.md` | `docs/plans/admin-security-mfa-hardening/design.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/plan.md` | `docs/plans/admin-security-mfa-hardening/plan.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/verification-record.md` | `docs/plans/admin-security-mfa-hardening/verification-record.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/phases/00-auth-probe.md` | `docs/plans/admin-security-mfa-hardening/phases/00-auth-probe.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/phases/01-operator-semantics.md` | `docs/plans/admin-security-mfa-hardening/phases/01-operator-semantics.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/phases/02-audit-integrity.md` | `docs/plans/admin-security-mfa-hardening/phases/02-audit-integrity.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/phases/03-mfa-integrity.md` | `docs/plans/admin-security-mfa-hardening/phases/03-mfa-integrity.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/phases/04-observability-web-hardening.md` | `docs/plans/admin-security-mfa-hardening/phases/04-observability-web-hardening.md` | Move |
| `docs/proposals/admin-security-mfa-hardening/phases/05-end-to-end-verification.md` | `docs/plans/admin-security-mfa-hardening/phases/05-end-to-end-verification.md` | Move |

### 2.4 活跃 Billing 修复计划

| Source | Target | Action |
| --- | --- | --- |
| `docs/proposals/subscription-billing-centralization/agent-handoff.md` | `docs/plans/subscription-billing-centralization/agent-handoff.md` | Move |
| `docs/proposals/subscription-billing-centralization/d3-lifecycle-explained.md` | `docs/plans/subscription-billing-centralization/d3-lifecycle-explained.md` | Move |
| `docs/proposals/subscription-billing-centralization/decision-options-d1-d3.md` | `docs/plans/subscription-billing-centralization/decision-options-d1-d3.md` | Move |
| `docs/proposals/subscription-billing-centralization/design.md` | `docs/plans/subscription-billing-centralization/design.md` | Move |
| `docs/proposals/subscription-billing-centralization/plan.md` | `docs/plans/subscription-billing-centralization/plan.md` | Move |
| `docs/proposals/subscription-billing-centralization/README.md` | `docs/plans/subscription-billing-centralization/README.md` | Move |
| `docs/proposals/subscription-billing-centralization/repair-issues.md` | `docs/plans/subscription-billing-centralization/repair-issues.md` | Move |
| `docs/proposals/subscription-billing-centralization/repair-matrices.md` | `docs/plans/subscription-billing-centralization/repair-matrices.md` | Move |
| `docs/proposals/subscription-billing-centralization/verification-record.md` | `docs/plans/subscription-billing-centralization/verification-record.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/00-repair-baseline-and-gates.md` | `docs/plans/subscription-billing-centralization/phases/00-repair-baseline-and-gates.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/01-global-catalog-and-contract-foundation.md` | `docs/plans/subscription-billing-centralization/phases/01-global-catalog-and-contract-foundation.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/02-redemption-v2-and-term-semantics.md` | `docs/plans/subscription-billing-centralization/phases/02-redemption-v2-and-term-semantics.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/03-billing-core-and-afdian-checkout.md` | `docs/plans/subscription-billing-centralization/phases/03-billing-core-and-afdian-checkout.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/04-webhook-order-processing-and-billing-entitlement.md` | `docs/plans/subscription-billing-centralization/phases/04-webhook-order-processing-and-billing-entitlement.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/05-reconciliation-observability-and-central-admin.md` | `docs/plans/subscription-billing-centralization/phases/05-reconciliation-observability-and-central-admin.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/06-consumer-sdk-and-reference-template.md` | `docs/plans/subscription-billing-centralization/phases/06-consumer-sdk-and-reference-template.md` | Move；文件名是历史阶段名，不改写历史 |
| `docs/proposals/subscription-billing-centralization/phases/07-final-verification-cleanup-and-doc-sync.md` | `docs/plans/subscription-billing-centralization/phases/07-final-verification-cleanup-and-doc-sync.md` | Move |
| `docs/proposals/subscription-billing-centralization/phases/08-admin-billing-repair.md` | `docs/plans/subscription-billing-centralization/phases/08-admin-billing-repair.md` | Move |

迁移完成后 `docs/proposals/` 应不存在；如果仍有文件，P8 必须停止并重新分类。

## 3. Billing 历史 Archive → 活跃 Plan 的 `history/`

`subscription-billing-centralization` 当前修复计划仍直接依赖这些历史设计/验证，所以**不删除**。把历史资料完整移入当前计划目录，令“计划 + 它的历史输入”成为一个自包含工作包。

| Source | Target | Action |
| --- | --- | --- |
| `docs/archive/README.md` | **Extract + Delete** | 其“历史 Billing 仍被活跃计划依赖”的规则并入新 Plan README/本迁移表 |
| `docs/archive/subscription-billing-centralization/00-master-plan.md` | `docs/plans/subscription-billing-centralization/history/00-master-plan.md` | Move |
| `docs/archive/subscription-billing-centralization/afdian-checkout-link-analysis.md` | `docs/plans/subscription-billing-centralization/history/afdian-checkout-link-analysis.md` | Move |
| `docs/archive/subscription-billing-centralization/afdian-debug-reference.md` | `docs/plans/subscription-billing-centralization/history/afdian-debug-reference.md` | Move |
| `docs/archive/subscription-billing-centralization/agent-handoff.md` | `docs/plans/subscription-billing-centralization/history/agent-handoff.md` | Move |
| `docs/archive/subscription-billing-centralization/AisenFlow_Subscription_Billing_Architecture.md` | `docs/plans/subscription-billing-centralization/history/AisenFlow_Subscription_Billing_Architecture.md` | Move |
| `docs/archive/subscription-billing-centralization/design.md` | `docs/plans/subscription-billing-centralization/history/design.md` | Move |
| `docs/archive/subscription-billing-centralization/plan.md` | `docs/plans/subscription-billing-centralization/history/plan.md` | Move |
| `docs/archive/subscription-billing-centralization/README.md` | `docs/plans/subscription-billing-centralization/history/README.md` | Move |
| `docs/archive/subscription-billing-centralization/verification-record.md` | `docs/plans/subscription-billing-centralization/history/verification-record.md` | Move |
| `docs/archive/subscription-billing-centralization/phase-2/01-afdian-oauth-and-unlinked-order-claim.md` | `docs/plans/subscription-billing-centralization/history/phase-2/01-afdian-oauth-and-unlinked-order-claim.md` | Move |
| `docs/archive/subscription-billing-centralization/phase-2/02-provider-expansion-refunds-and-suite-entitlements.md` | `docs/plans/subscription-billing-centralization/history/phase-2/02-provider-expansion-refunds-and-suite-entitlements.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/01-global-catalog-and-contract-foundation.md` | `docs/plans/subscription-billing-centralization/history/phases/01-global-catalog-and-contract-foundation.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/02-redemption-v2-and-term-semantics.md` | `docs/plans/subscription-billing-centralization/history/phases/02-redemption-v2-and-term-semantics.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/03-billing-core-and-afdian-checkout.md` | `docs/plans/subscription-billing-centralization/history/phases/03-billing-core-and-afdian-checkout.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/04-webhook-order-processing-and-billing-entitlement.md` | `docs/plans/subscription-billing-centralization/history/phases/04-webhook-order-processing-and-billing-entitlement.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/05-reconciliation-observability-and-central-admin.md` | `docs/plans/subscription-billing-centralization/history/phases/05-reconciliation-observability-and-central-admin.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/06-consumer-sdk-and-reference-template.md` | `docs/plans/subscription-billing-centralization/history/phases/06-consumer-sdk-and-reference-template.md` | Move |
| `docs/archive/subscription-billing-centralization/phases/07-final-verification-cleanup-and-doc-sync.md` | `docs/plans/subscription-billing-centralization/history/phases/07-final-verification-cleanup-and-doc-sync.md` | Move |

迁移完成后 `docs/archive/` 应不存在。历史资料是否最终删除，必须等当前 Billing Plan 完成且长期事实进入 Architecture/Spec 后再次审查。

## 4. `docs/reference` → `docs/architecture/reference`

这些文件是精确技术参考，不是过程文档。本轮不压缩、不删除；迁入 Architecture 内的 Reference 子层，并在移动前后修正已确认的事实漂移与相对链接。

| Source | Target | Action |
| --- | --- | --- |
| `docs/reference/api.md` | `docs/architecture/reference/api.md` | Move + Normalize |
| `docs/reference/configuration.md` | `docs/architecture/reference/configuration.md` | Move + Normalize |
| `docs/reference/contract-consumer-matrix.md` | `docs/architecture/reference/contract-consumer-matrix.md` | Move |
| `docs/reference/contract-consumers.json` | `docs/architecture/reference/contract-consumers.json` | Move；机器可读数据完整保留 |
| `docs/reference/contracts.md` | `docs/architecture/reference/contracts.md` | Move + Normalize |
| `docs/reference/data-model.md` | `docs/architecture/reference/data-model.md` | Move |
| `docs/reference/maintenance-callers.md` | `docs/architecture/reference/maintenance-callers.md` | Move |
| `docs/reference/toolchain.md` | `docs/architecture/reference/toolchain.md` | Move + Normalize |

已在 P7 移动前修正的已知漂移包括：OpenAPI 当前为 Account 40 / Admin 76、Admin recent-MFA proof 最长 30 分钟、Feedback Submit 非终态附件规则、多管理员 security status、Billing DB Cron 与其他 `schedule.json` 证据分级、System Admin membership/readiness 术语。

## 5. `docs/decisions` → `docs/architecture/decisions`

ADR 是长期架构决策历史，应完整保留，包括 Superseded 状态；不因“已被替代”删除。

| Source | Target | Action |
| --- | --- | --- |
| `docs/decisions/README.md` | `docs/architecture/decisions/README.md` | Move + link fix |
| `docs/decisions/0001-platform-account-boundaries.md` | `docs/architecture/decisions/0001-platform-account-boundaries.md` | Move |
| `docs/decisions/0002-development-release-environments.md` | `docs/architecture/decisions/0002-development-release-environments.md` | Move；Superseded 历史保留 |
| `docs/decisions/0003-local-verification-release-gates.md` | `docs/architecture/decisions/0003-local-verification-release-gates.md` | Move；Superseded 历史保留 |
| `docs/decisions/0004-local-only-test-acceptance.md` | `docs/architecture/decisions/0004-local-only-test-acceptance.md` | Move |

## 6. `docs/reviews` → `docs/review`

| Source | Target | Action |
| --- | --- | --- |
| `docs/reviews/admin-frontend-architecture-audit-2026-10-15.md` | `docs/review/admin-frontend-architecture-audit-2026-10-15.md` | Move |

P8 新增 `docs/review/README.md` 作为审查索引，并保持“事实进 Architecture、问题/评分/建议留 Review”的边界。已从工作区删除的旧静态 Review 不恢复为当前文档；其长期事实已经完成模块 parity，需要历史原文时由 Git 追溯。

## 7. 后续授权：`docs/guides` 收敛到 `docs/development`

用户在 P9 完成后进一步明确允许“先把内容收敛到 `development`，后续再重建”。因此原 Keep Transitional 结论被覆盖，5 个 Guide 保留内容并直接迁移：

| Source | Final path | Action |
| --- | --- | --- |
| `docs/guides/development-release-workflow.md` | `docs/development/development-release-workflow.md` | Move |
| `docs/guides/development.md` | `docs/development/development.md` | Move |
| `docs/guides/operations.md` | `docs/development/operations.md` | Move |
| `docs/guides/platform-onboarding.md` | `docs/development/platform-onboarding.md` | Move |
| `docs/guides/testing.md` | `docs/development/testing.md` | Move |

同时新增 `docs/development/README.md` 作为统一入口，并移除 `.gitkeep`。本轮只做归属和链接收敛，不宣称这些指南已经完成后续内容重建。

## 8. 后续授权：文档治理进入 `development`

`docs/agents.md` 迁移为 `docs/development/documentation-governance.md`。根 `AGENTS.md` 与所有当前可执行入口改为引用新位置；文档治理仍是规则来源，不因为路径迁移改变其授权边界。

## 9. P8 目录后置条件

后续收敛完成后，Git 文档树顶层应为：

```text
docs/
├─ spec/
├─ architecture/
│  ├─ decisions/
│  └─ reference/
├─ development/
├─ plans/
├─ review/
└─ README.md
```

以下旧顶层目录/文件应退出 Git 文档树：`proposals / archive / reference / decisions / reviews / guides / agents.md`。空目录不进入 Git；本机若仍因外部 Windows 句柄残留空目录，不影响 GitHub 最终树，但必须在交接中说明。

## 10. P8 验证门槛

移动后必须执行：

1. `pnpm docs:check`；
2. `pnpm contracts:check`；
3. `git diff --check`；
4. 搜索 `docs/proposals/`、`docs/archive/`、`docs/reference/`、`docs/decisions/`、`docs/reviews/` 的**当前导航/说明**残留；历史 verification 的 inline old-path 证据允许保留，但不得存在坏 Markdown link；
5. 检查 `docs/proposals`、`docs/archive`、`docs/reference`、`docs/decisions`、`docs/reviews` 均不存在；
6. 检查两个 active plans、Billing `history/`、8 个 Architecture Reference、4 个 ADR、当前 Review 均完整存在；
7. 重新跑 Requirement 结构 gate，确保目录移动没有破坏 spec/architecture 链。
