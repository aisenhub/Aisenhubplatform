# Requirement Traceability

本表提供项目级需求追踪入口。详细 Requirement 在各 spec 文件中，详细实现事实在 architecture 中；本表不复制完整需求正文。

## 规则

1. Requirement 是 WHAT/WHY 的权威源。
2. Architecture 文档至少在开头列出 `Requirements`，并可在章节中引用具体 Requirement ID。
3. 新 Design/Plan 必须列出本次覆盖的 Requirement ID；一个计划可以覆盖多条需求，一条需求也可以跨多个计划完成。
4. Verification/Review 必须指出验证了哪些 Requirement，不能只写“测试通过”。
5. `Delivery=Implemented` 必须能找到实现与验证证据；代码存在但缺少关键边界验证时可以保持 `Partial`。
6. 不要求为了格式统一给每条稳定基线 Requirement 复制一份低价值 Acceptance；但 P0/高风险、Partial/Planned、以及任何新 Design/Plan 用作完成门槛的 Requirement 必须有可判定 Acceptance。领域级 `Domain Verification` 用于给同域稳定 Requirement 提供当前实现/测试入口，不能替代某条需求特有的验收条件。

## 当前成熟度快照（2026-10-16）

- Requirement：112；重复 ID：0；核心 metadata 缺失：0。
- Delivery：112 `Implemented`、0 `Partial`、0 `Planned`。
- 当前没有 Active Requirement 处于非完整交付状态；真实 Hosted / Provider / Retention / Consumer / Production 环境事项仍按 Runbook/TODO 单独留证，不能由 `Implemented` 外推为环境 PASS。
- 12/12 个需求域现在都提供领域级验证入口；这表示“知道去哪里验证”，不表示 112 条 Implemented 已各自完成一次新的全量测试运行。
- 当前独立 Acceptance 覆盖 30 条 Requirement；其余为已经存在的稳定 baseline statement，后续一旦进入新 Plan 或发生语义变化，必须在该变更中补充可判定 Acceptance。

## 当前追踪矩阵

| Requirement group | Delivery snapshot | Architecture | Design/Plan | Verification |
| --- | --- | --- | --- | --- |
| `REQ-SYS-*` | 9 Implemented | `architecture/README.md` + 各基础设施/模块 | 按变更计划引用 | contracts/db/security/e2e/ops gates |
| `REQ-PLT-*` | 8 Implemented | `architecture/modules/platform-tenancy.md` | Platform 接入/治理计划 | platform/API/security/integration tests |
| `REQ-IAM-*` | 11 Implemented | `architecture/modules/identity-security.md` | 新变更进入 `plans` | Auth/MFA/security SQL + browser E2E + factor probe |
| `REQ-ADM-*` | 10 Implemented | `architecture/modules/admin-console.md` | 新变更进入 `plans` | Admin unit + browser E2E + current review |
| `REQ-ACC-*` | 8 Implemented | `architecture/modules/accounts-profile.md` | 新变更进入 `plans` | Admin/API/SQL/account lifecycle/workbench tests |
| `REQ-COM-*` | 7 Implemented | `architecture/modules/commerce-catalog.md` | 商业化变更计划 | contract + canonical commerce SQL tests |
| `REQ-BIL-*` | 10 Implemented | `architecture/modules/billing-settlement.md` | 新变更进入 `plans` | webhook/jobs/settlement/refund/cron tests；Hosted 另取环境证据 |
| `REQ-ENT-*` | 10 Implemented | `architecture/modules/entitlements-redemption.md` | Entitlement/Redemption 变更计划 | ledger/correction/API/redemption/concurrency tests |
| `REQ-CFG-*` | 10 Implemented | `architecture/modules/config-storage.md` | Config 变更计划 | API/SQL/storage/recovery tests |
| `REQ-FBK-*` | 9 Implemented | `architecture/modules/feedback-support.md` | Feedback 变更计划 | API/storage/privacy/Admin tests |
| `REQ-OPS-*` | 9 Implemented | `architecture/modules/audit-lifecycle-operations.md` | Delete/maintenance/recovery 计划 | SQL/worker/recovery/ops probes |
| `REQ-API-*` | 11 Implemented | `architecture/modules/consumer-api-integration.md` | Contract/Consumer 变更计划 | contracts + harness + package integration |

本表给出组级入口与当前 Delivery 快照；具体高风险/未完成 Requirement 的 gap 和 Acceptance 保留在对应 spec。新计划关闭时必须记录实际运行的 command/test/review 证据，不能只引用本矩阵中的宽泛“tests”字样。
