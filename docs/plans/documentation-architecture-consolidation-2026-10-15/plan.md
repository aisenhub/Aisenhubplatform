# 文档架构收敛与知识迁移计划（2026-10-15）

## 0. 计划定位

- **Status**: In Progress
- **Type**: Documentation architecture / knowledge migration
- **Product Requirement Change**: None；不得改变任何 Active `REQ-*` 的业务含义
- **Primary Inputs**: `docs/spec/**`、`docs/architecture/**`、当前源码/迁移/OpenAPI/测试、Git 基线中的历史 Proposal/Review、两个活跃 Proposal
- **Target Documentation Model**: `spec / architecture / development / plans / review / README.md`
- **Safety Rule**: 任何历史来源在内容 parity 完成前，不以“目录整洁”为理由最终删除

本计划负责把当前散落在 Architecture、Reference、Guides、Proposal、Review、Archive、源码和测试中的长期事实整理成可维护的模块化知识库。它不修改产品代码，不改变业务需求，不部署服务，不创建生产配置。

`development` 按用户要求暂不重建内容。本轮可以建立目标目录和迁移边界，但不得把现有 guides 未经重新设计直接搬成新的开发指南。因而“只剩六个顶层入口”的最终物理收敛，必须在后续 development 重建后才能完全关闭；本计划先完成其余可安全部分。

---

## 1. 总目标

完成后必须满足：

1. 每个项目模块都有一份足够详细的长期 Architecture 文档，可直接用于开发、审查和排障。
2. `spec` 中的 Active Requirement 能追踪到对应 Architecture；Partial/Planned 不被写成已实现事实。
3. 历史 Proposal/Review 中仍有效的状态机、字段语义、限制、安全边界、恢复语义和验证结论已经被长期文档吸收或明确保留。
4. Review 只保留审查结论、问题、评分、风险和建议，不再承担“当前系统事实库”职责。
5. Plan 只保存一次变更的目标设计与实施顺序，不再成为唯一需求或长期架构来源。
6. Reference/Decision/Archive 中有长期价值的资料都有明确最终归属；不能因迁目录损失精确数据。
7. 所有链接、合同、Requirement ID 和文档导航通过自动检查。
8. 上一轮未提交的历史删除只有在对应 parity 已完成后才可成为最终删除；否则必须恢复或继续保留为迁移输入。

---

## 2. 不可违反的事实优先级

判断“当前系统实际上如何工作”时按以下顺序：

1. canonical PostgreSQL migration / constraint；
2. Account/Admin canonical OpenAPI；
3. 当前运行源码；
4. 当前测试与验证脚本；
5. 当前 Architecture；
6. Reference / Guide；
7. Proposal / Review / Archive / Git 历史。

判断“系统应该满足什么”时，以 Active Requirement、用户明确要求和已接受 Decision 为准。实现与 Requirement 不一致时，标记 `Partial/Planned` 或缺口，不允许用当前缺陷反向改写 Requirement。

---

## 3. Parity 核对方法

每个模块都必须按同一检查表执行，不能只做摘要对比。

### 3.1 输入集合

- 当前模块 Architecture；
- 对应 Spec 与 Requirement；
- Git 基线中被删除/待删除的历史 Proposal、Review、Intake；
- 当前 Reference / Guide / Decision；
- canonical migration；
- OpenAPI / shared contract；
- 当前 runtime source；
- SQL/unit/E2E/contract tests。

### 3.2 必核对类别

逐项检查：

- 模块职责与边界；
- 表、关键字段、复合 FK、唯一约束；
- 状态机与合法转换；
- API method/path/query/body/header/status/error；
- 鉴权、租户、MFA/recent-auth；
- Idempotency / operation identity；
- cursor pagination / filter / ordering；
- 并发、lease、fence、unknown outcome；
- Storage / Provider / Auth 外部副作用；
- 配置项、Secret、限额和默认值；
- 失败、降级、恢复和删除语义；
- Admin / Consumer UI 对领域事实的表达；
- 自动测试真正覆盖的边界；
- 只有计划存在、尚未实现的目标。

### 3.3 输出分类

每个发现必须落入四类之一：

- **Current Fact**：当前实现已确认，写入 Architecture；
- **Active Requirement Gap**：需求有效但实现未完整，Spec 标 `Partial/Planned`，Architecture 写当前限制；
- **Review Finding**：技术债、风险、评分、优化建议，进入 Review；
- **Historical Process Only**：只描述实施过程，无长期独有事实，完成 parity 后可删除并由 Git 历史追溯。

---

## 4. 阶段顺序

阶段严格串行执行。后阶段不能以“应该已经吸收”为前提跳过前阶段验收。

| Phase | 内容 | 状态 | 退出条件 |
| --- | --- | --- | --- |
| P0 | 计划冻结与安全基线 | **Completed** | 本计划进入导航；旧删除继续未提交；检查当前工作区 |
| P1 | Feedback 全量 parity | **Completed** | Feedback 历史/实现/spec/architecture 全面对齐 |
| P2 | Audit / Operations 全量 parity | **Completed** | Audit/Delete/Retention/Job/Backup/Recovery 对齐 |
| P3 | Platform / Consumer Integration 全量 parity | **Completed** | Platform/Origin/Key/readiness/OpenAPI/Integration/Harness 对齐 |
| P4 | Identity / MFA 全量 parity | **Completed** | Auth/Admin membership/MFA/recent proof/recovery 对齐，活跃 MFA gap 清晰 |
| P5 | Admin Console 全量 parity | **Completed** | 前端审查事实全部归位，建议留 Review，真实缺口反映到 Spec |
| P6 | 全局 Requirement / Architecture Traceability | **Completed** | Active REQ 全覆盖、无重复 ID、Implemented/Partial 有证据 |
| P7 | 长期资料归属与目录迁移设计复核 | **Completed** | 每个旧顶层目录的文件都有保留/合并/迁移/删除结论 |
| P8 | 可安全执行的顶层收敛 | **Completed** | `plans`/`review` 等完成迁移；当前导航/执行路径完成迁移，历史证据保留；development 保持待重建边界 |
| P9 | 全量验证与交接 | **Completed** | docs/contracts/diff/requirements/hygiene 已核验，未决事项明确 |
| P10 | Development 临时收敛 | **Completed** | 旧 guides/governance 完整迁入 `development`，所有当前入口与检查器切换到最终路径 |

---

## 5. P0 — 计划冻结与安全基线

### 输入

- 当前脏工作区；
- 145 个左右上一轮未提交 tracked 删除；
- 新增 Architecture/Spec；
- 两个仍活跃 Proposal。

### 工作

1. 建立 `docs/plans` 与本计划。
2. 更新 `docs/README.md` 和 `docs/agents.md`：新计划从现在起进入 `plans`，旧 `proposals` 只作为过渡来源。
3. 不提交、不 push、不继续扩大历史删除。
4. 保存当前 docs/contracts 校验结果作为阶段基线。

### Exit

- 本计划可从 docs 总入口访问；
- `docs:check` 通过；
- 工作区删除项仍可从 Git 基线读取；
- 无产品代码变更。

---

## 6. P1 — Feedback 全量 parity

### 重点来源

- `architecture/modules/feedback-support.md`；
- `spec/feedback-support.md`；
- 历史 `platform-feedback-system` Proposal；
- `architecture/modules/files-jobs.md` 中 Feedback 相关内容；
- canonical migration；
- `supabase/functions/account-api/feedback.ts`、binary/files handler、maintenance files；
- Admin Feedback feature；
- Feedback SQL/E2E tests。

### 必须确认

- draft → attachment → submit 状态机；
- attachment status 与 write outcome；
- bucket/path/MIME/magic/size/count 限制；
- snapshot identity/contact/client context；
- labels/internal notes/events；
- Admin server-side filtering、CSV、batch delete；
- delete/privacy minimization、Global Delete、retention、backup barrier；
- Account 360 摘要边界；
- unknown Storage write/reconcile 行为。

### 输出

- 补全 Feedback Architecture；
- 修正 Feedback Spec Delivery/Acceptance/Verification；
- 历史 Proposal 标记 parity complete。

---

## 7. P2 — Audit / Operations 全量 parity

### 重点来源

- `architecture/modules/audit-lifecycle-operations.md`；
- `spec/audit-lifecycle-operations.md`；
- 历史 `admin-global-audit-center`、identity lifecycle、prelaunch remediation；
- current `reference/maintenance-callers.md`、operations guide；
- migration / maintenance runtime / deletion tests。

### 必须确认

- audit actor/scope/target/outcome projection；
- outcome 缺失语义；
- request ID vs operation/job ID；
- ordinary/admin idempotency；
- identity deleting gate；
- deletion request/job checkpoint；
- retention policy 的显式来源与 fail closed；
- files/identity/billing maintenance token capability split；
- job lease/fencing；
- backup barrier / deletion tombstone / restore；
- schedule metadata 与真实 scheduler 证据边界。

---

## 8. P3 — Platform / Consumer Integration 全量 parity

### 重点来源

- Platform 与 Consumer Architecture/Spec；
- 历史 onboarding、consumer-lab、remove-sdk、integration-surface Proposal；
- `platform-integration/**`；
- Account/Admin OpenAPI；
- consumer harness / compatibility checks；
- Origin/Key/Principal runtime 与 tests。

### 必须确认

- Platform/Global Identity/Account 三层作用域；
- Origin/callback 精确规则；
- Key 一次性明文、HMAC、deployment confirmation、revoke/rotation；
- central readiness 与 target Consumer readiness 区分；
- standard HTTP + OpenAPI + capability index，不存在 runtime SDK；
- auth ownership；
- retry / binary / body budget / no-store / error envelope；
- contract breaking rules；
- Harness 能证明什么、不能证明什么。

---

## 9. P4 — Identity / MFA 全量 parity

### 重点来源

- Identity Architecture/Spec；
- 活跃 `admin-security-mfa-hardening`；
- 历史 `system-admin-resilience`、identity governance、安全 Review；
- Auth adapters、server auth、BFF、MFA API、private SQL、tests。

### 必须确认

- JWT + active session；
- Global Identity / Platform Principal；
- system admin pending/active membership；
- active admin floor / dual TOTP readiness；
- AAL2 与 recent MFA 区分；
- attestation → recent proof 绑定；
- user reauth 与 Admin MFA 分离；
- factor add/remove/last-factor protection；
- factor 变化后的 proof invalidation；
- offline recovery 边界；
- 统一安全 error semantics；
- 浏览器安全头/CSP 当前实现状态。

未落地目标只能保持 `Partial/Planned`，并继续由活跃计划承担。

---

## 10. P5 — Admin Console 全量 parity

### 重点来源

- `architecture/modules/admin-console.md`；
- `spec/admin-console.md`；
- Admin frontend architecture review；
- 历史 Admin navigation/overview/workbench/audit/UIUX Proposal/Review；
- `apps/admin` current source/tests；
- `packages/ui` actual imports and design docs。

### 必须确认

- 技术栈实际版本与 direct vs workspace-only dependencies；
- App Router/client-heavy/BFF/session manager；
- Global/Platform IA；
- PlatformSwitcher keyboard/a11y 当前边界；
- Async/Mutation/Confirm/Inspector 等语义组件；
- Design token/layout/responsive/accessibility；
- Account 360 / Overview / Audit / Billing / Config / Feedback 页面语义；
- 技术债只留 Review：巨型组件、query abstraction、form/data-grid、CSS drift、dark mode、timezone 等。

---

## 11. P6 — 全局 Traceability 与需求成熟度

逐条扫描全部 `REQ-*`：

1. ID 唯一；
2. Status / Delivery / Priority / Type 合法；
3. 至少有 Statement；
4. 用于冻结设计或验收的 Requirement 必须有 Acceptance；
5. Architecture 映射存在；
6. Implemented 不能只有文档声称，至少有 migration/OpenAPI/source/test 中一类证据；
7. Partial/Planned 必须有对应 Plan/Review gap；
8. Retired/Superseded 不继续被新计划当作 Active 目标。

更新 `spec/traceability.md`，把模块级状态从“第一轮已建立”升级为可审查的 parity 状态。

---

## 12. P7 — 长期资料归属与目录迁移设计复核

对当前顶层目录逐一给最终归属：

- `spec`：保留为需求权威；
- `architecture`：保留；必要时吸收 `reference` / `decisions` 的稳定长期资料为其子目录或模块章节；
- `development`：仅建立目标入口，不迁旧 guides，等待后续用户指定的新开发指南重建任务；
- `plans`：新计划权威；两个活跃 `proposals` 在引用/链接修正后迁入；
- `review`：由现有 `reviews` 迁入，审查只保留结论/风险/建议；
- `reference`：不能直接删；逐文件决定“并入模块架构 / architecture reference 子层 / 后续 development”；
- `decisions`：长期有效 ADR 可迁到 `architecture/decisions`，保留 Accepted/Superseded 历史关系；
- `archive`：活跃 Billing 仍依赖的历史资料迁到对应 Plan 的 `history/` 或保持过渡，解除依赖后再删；
- `guides`：本轮不粗暴迁移，直到 development 重建任务开始；
- `agents.md`：在 development 治理重建前继续作为过渡治理入口，最终再决定并入 `README` 或 development governance。

此阶段必须先出逐文件迁移表，再执行文件移动。

---

## 13. P8 — 可安全执行的顶层收敛

按 P7 迁移表执行，优先完成没有知识风险的变化：

1. `reviews` → `review`；
2. 新增/活跃计划进入 `plans`；
3. Proposal 模板和 plan-writing 迁入 `plans/_template` / `plans/plan-writing.md`；
4. 修正所有 Requirement/Architecture/README 链接；
5. 对已经 parity complete 且无独有事实的历史过程文档执行最终删除；
6. 保持 `development` 不承载未经重建的旧 Guide 内容；
7. 对因 development 尚未重建而必须暂留的 `guides`/治理入口明确标记 transitional，不伪报最终结构完成。

不允许为了达到目录数量目标，把未吸收的 Reference/Guide 内容删除。

---

## 14. P9 — 全量验证与完成标准

至少执行：

- `pnpm docs:check`；
- `pnpm contracts:check`；
- `git diff --check`；
- Requirement 结构/重复 ID/链接检查；
- 搜索旧 `proposals/`、`reviews/`、被删除路径的残留引用；
- workspace hygiene；
- 工作区变更总览人工复核。

完成报告必须明确区分：

- 已完成 parity 的模块；
- 已迁移目录；
- 已删除且可由 Git 历史追溯的过程资料；
- 仍因 active plan 或 development 后续重建而保留的过渡资料；
- 未完成 Requirement / 当前 gap；
- 未执行的 commit/push/deploy。

---

## 15. 回滚与安全边界

- 原计划执行期间不提交、不 push；用户在 P9 后已明确授权完成剩余收敛后创建任务分支、提交、推送、合并 `main` 并删除已合并分支。本授权不等于单独执行生产部署。
- 不修改产品代码来“让文档看起来正确”；发现真实实现缺口只更新 Spec/Architecture/Review/Plan 状态。
- 不删除 active Billing/MFA 仍依赖的历史输入。
- 文件移动前先修引用或在同一事务中完成。
- 对上一轮已经从工作区删除但尚未提交的文档，Git `HEAD` 是可读取的完整历史来源；parity 未完成前不把其删除视为最终决定。
- 任何验证失败先修文档结构/引用，再进入下一阶段。

---

## 16. 当前执行记录

- P0：Completed。`plans` 已成为新计划入口，总导航/治理规则已更新，`pnpm docs:check` 基线通过。
- P1：Completed。Feedback 历史 OPT-008、canonical SQL、Account/Maintenance runtime 与测试完成 parity；修正 Submit 对终态附件的精确语义，并补齐标签、Client Context、CSV、batch delete、Overview 聚合等长期事实。
- P2：Completed。Audit v2、Retention、Global Delete、Job lease/fence、Backup Barrier、Maintenance capability 和调度证据完成 parity；明确 Billing DB Cron 与其他 `schedule.json` metadata 的证据等级差异。
- P3：Completed。Platform readiness、11 个 Integration capabilities、runtime SDK 移除、Harness 预算/证据等级和 breaking checker 完成 parity；确认历史 `/admin/consumer-lab` 已不在当前实现，并清理根 README/formatter 的残留引用。
- P4：Completed。System Admin membership/readiness、security status、Provider TOTP challenge、60 秒 attestation、30 分钟 recent proof 与当前 step-up 范围完成 parity；发现 MFA 页面仍显示“5 分钟 proof”，与服务端事实不一致。因本计划不修改产品源码，该 UI 漂移已转入活跃 MFA Plan 跟踪。确认第二 verified factor 可添加，但 verified factor 删除/最后因子保护仍未实现，`REQ-IAM-011` 保持 Partial；原生 Supabase 删除到 0 的已验证风险继续保留。
- P5：Completed。当前 Admin 技术栈、Shell/BFF/Auth、Global/Platform IA、UI semantic layer、响应式/a11y 与历史 Review 完成 parity；明确 PlatformSwitcher 键盘缺口、跨页面错误分类尚未完全收敛、全局 CSP 未实现、时区显示未统一，技术债优先级继续留在 Review。
- P6：Completed。机器核对 112 Requirements、0 重复、0 核心 metadata 缺失；当前为 107 Implemented / 4 Partial / 1 Planned。12/12 需求域补齐 Domain Verification 入口，并冻结 Acceptance 成熟度规则；5 个非完整交付项保持显式，不为统计结果伪造完成状态。
- P7：Completed。建立 [逐文件迁移表](migration-map.md)：35 个 Proposal 文件进入 `plans`、18 个 Billing 历史输入进入 active plan 的 `history/`、8 个 Reference 进入 `architecture/reference`、5 个 ADR 进入 `architecture/decisions`、当前 Review 进入 `review`；旧目录 README 的独有规则先提取后删除。`guides` 5 个和 `agents.md` 因 development 尚待用户后续重建而明确保留为 transitional。
- P8：Completed。`proposals/archive/reference/decisions/reviews` 的文档内容已分别收敛到 `plans`、Billing plan `history/`、`architecture/reference`、`architecture/decisions`、`review`；`development` 只保留空占位，`guides` 与 `agents.md` 继续作为明确 transitional。深层 Markdown 链接已按新位置重算，计划模板/active plan 当前执行入口完成路径 rebaseline；`docs:check`、`contracts:check`、`git diff --check` 均通过。物理文件系统仍存在一个 **0 文件、非 Git 内容** 的空 `docs/reviews` 目录，Windows 报被外部进程占用；未提升权限或终止未知进程，留作 P9 hygiene caveat，不影响导航、Git 或构建。
- P9：Completed。最终 `pnpm docs:check` 为 **111 documents PASS**；`pnpm contracts:check` 为 **Account 40 operations / Admin 76 operations / Platform Integration 11 capabilities / Consumer compatibility 3 contracts、30 fields PASS**；`git diff --check` PASS。Requirement gate 为 **112 Requirements / 0 duplicate / 0 structure issue / 12/12 Domain Verification / 107 Implemented / 4 Partial / 1 Planned**，非完整项仍是 `REQ-ACC-004`、`REQ-ADM-008`、`REQ-ADM-009`、`REQ-ADM-010`、`REQ-IAM-011`。Workspace hygiene 没有临时文件、secret-like path 或大文件异常，唯一 warning 是预期中的 dirty worktree；当前没有 staged change、没有 commit、没有 push。本轮未保留产品源码改动；发现的 MFA 5/30 分钟 UI 漂移已经转入活跃安全 Plan。新目标树完整存在：2 个 active Plan、Billing `history/` 18 文件、Architecture Reference 8 文件、ADR 5 文件、Review 2 文件、空 `development/.gitkeep`。旧 `proposals/archive/reference/decisions` 物理目录已不存在；旧 `reviews` 只剩一个 **0 文件、非 Git 内容** 的空目录，Windows 外部句柄拒绝删除且 `openfiles` 查询需要管理员权限，因此没有提升权限或终止未知进程。历史 Billing phase/verification 中的旧路径作为当时执行证据保留；当前模板、active plan 根执行入口和导航均已 rebaseline 到新路径。
- P10：Completed。按用户后续授权，将 5 个 `guides` 文件与文档治理规则完整迁入 `docs/development`，新增统一索引，并切换根 README、AGENTS、Admin 集成页、ADR/架构链接与 `docs:check` required entries。首次收敛后 `pnpm docs:check` 为 **112 documents PASS**；`pnpm contracts:check` PASS；`pnpm format:check` 在修正 contract-consumer checker 的格式后 PASS；`pnpm lint` 0 warnings / 0 errors；`pnpm typecheck` PASS；`pnpm build` PASS；`pnpm --filter admin test:unit` 为 **14 files / 69 tests PASS**。内容重建留给后续任务，本轮完成最终归属、兼容链接和质量门槛。
