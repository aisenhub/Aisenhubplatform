# Frontend Experience & State Upgrade — Agent Handoff

> FE-R1（2026-09-09）：按本地 main@b563a98 校准，Auth 已实施；本期默认简体中文。执行须读取 [FE-R1 执行合同](references/fe-r1-execution-contracts.md) 和 [中文 UI 合同](references/chinese-ui-contract.md)。本修订替代旧快照中的冲突描述；产品实施仍未开始。

> 用途：稳定执行入口，不是日常进度日志。  
> 执行 agent 必须结合 `00-master-plan.md`、当前阶段文档、`verification-record.md` 和实际代码工作，无需重新做整轮架构讨论。

## 1. 可直接复制给执行 Agent 的完整提示词

```text
你是 Aisenhub Frontend Experience & State 优化的执行 agent。请在本地 Aisenhubplatform 仓库中严格按照 docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/ 的计划实施。

【FE-R1 必须先读】
- references/fe-r1-execution-contracts.md：能力矩阵、FE-D01～03、恢复与安装合同、FE-V01～16。
- references/chinese-ui-contract.md：默认简体中文，必要技术英文保留；适用于Admin、Consumer公开/受保护页面和安装产物。
- 本提示只在用户明确派发产品实施时生效；文档修订不是执行Phase01～08的授权。默认串行，多Agent仅在明确派发后启用。

【首先确认输入】
- 项目绝对路径：<执行环境中的 Aisenhubplatform 绝对路径>
- 计划目录：docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/
- GitHub 仓库：先用 git remote -v 实际确认；研究时参考为 aisenhub/Aisenhubplatform
- 工作分支：沿用本任务已有工作分支；若没有，按实际 AGENTS.md/仓库规范创建本次 Frontend 专用 task branch；各 Phase 在同一任务分支连续推进，除非采用下述多 Agent 并行方案
- 本期范围：Frontend Experience & State Phase 01–08
- 暂不实施：future/01-diagnostics-search-alerts.md、00-master-plan.md Non-goals

【执行前必须做】
1. cd 到项目绝对路径。
2. 阅读根 AGENTS.md；修改 apps/admin、apps/template-preview、packages/ui 前分别读取适用 nested AGENTS.md。
3. 阅读 docs/architecture.md、docs/api-sdk.md、docs/development/contracts.md；当前阶段涉及文件/权益/Auth 时再读对应专题。
4. 阅读 docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/00-master-plan.md。
5. 阅读 docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/verification-record.md，并核对实际 Git/代码；记录与代码不一致时先查清并修正记录。
6. 阅读当前阶段文档及所有上游阶段交接/commit。
7. 修改 Next.js 代码前，根据 apps/admin/AGENTS.md 与 apps/template-preview/AGENTS.md，读取本地 node_modules/next/dist/docs/ 当前版本相关文档；不要凭训练记忆猜 Next API。
8. 读取 Authentication & Session 优化计划的实际 verification record。如果 shared SessionManager/replay/MFA contract已交付，直接消费；如果尚未交付，不要在本任务复制第二套实现。
9. 先实际记录：pwd、git remote -v、git branch --show-current、git status --short、git rev-parse HEAD、git log -1 --oneline、node --version、pnpm --version；有 upstream 再记录 git rev-parse @{u}。
10. 核对 apps/admin/package.json、apps/template-preview/package.json、packages/ui/package.json、root package.json，计划命令/依赖若已漂移，以当前代码为事实并在 verification-record 写偏差。

【架构决定已冻结，不重新发散】
A. Admin 信息架构是 Global Control Plane + Platform Workspace。不得引入 Organization/Workspace/Team/RBAC 产品模型。
B. Platform context 唯一权威是 URL `/admin/platforms/[platformId]/...`；PlatformSwitcher 只负责导航，不是 authorization state；不得用全局 React store/localStorage 覆盖 URL。
C. URL 同时是 q/filter/sort/cursor/deep-link tab 的权威来源；只显示 API 真实支持的 filter，不计算不存在的总页数。
D. Server data 的唯一业务事实来自 API。Client/query cache只改善体验，不能缓存 authorization/MFA/permission 成为授权依据；logout 后清敏感 Admin client data；安全关键 mutation server result first。
E. Remote data 页面行为统一为 loading / success / empty / recoverable_error / access_error。Error绝不能通过 set [] 伪装为 Empty；background refresh failure保留 last-known data + warning + retry。
F. Empty至少区分 true empty / filter empty / context missing；No Permission不是 empty。
G. Mutation统一语义：idle / confirm_required / step_up_required / pending / accepted / success / failure / unknown_outcome。pending只锁冲突 action/row；202/长任务是 accepted/running，不是 success；unknown outcome先查 authoritative state再决定 retry。
H. destructive action统一 ConfirmActionDialog：展示 target、consequence、reversible、async、history retention、reason；不使用 window.confirm。
I. recent MFA/Session状态由 Authentication & Session/API 返回；UI不自己计算 proof TTL，不把 MFA_REQUIRED当401 refresh，不用 client flag代替服务端授权。Replay严格服从 Auth计划：mutation默认 never；binary stream永不 auto replay；same logical idempotent retry保持 same key/operation_id。
J. One-time Secret唯一生命周期 not_generated -> generating -> presented_once -> acknowledged。Platform Key/Redemption Codes只在专用 Panel/Dialog当前响应显示；不得放 URL、toast、普通 status、localStorage、analytics、console/log；refresh/离开后不得假恢复明文。
K. API Key真实生命周期：create -> one-time secret -> deploy -> confirm deployment(server persisted) -> old key revocable -> revoke。
L. Files：write_outcome=unknown 时预算保持；deleting不代表容量释放；DELETE 202显示 accepted；binary upload失败不自动重发，先GET state；UI不直连Storage。
M. Profile/Preferences If-Match 412不静默覆盖。显示 conflict，reload latest，再由用户决定如何重应用 draft。
N. Subscription/Redemption logical intent中需要 Idempotency-Key/operation_id时，一个逻辑操作在uncertain retry中复用原值；不要每次 retry重新 random UUID造成第二业务操作。
O. Error Presenter主文案人类可读，technical code/request ID可折叠；401/session、recent MFA、403、409、412、429、5xx、unknown mutation必须分别表达。
P. Toast只用于已完成普通 mutation/copy/background notice；首次load failure、field error、secret、destructive confirm不用toast替代正确surface。
Q. UI技术栈保持 Next.js/TypeScript/Tailwind/Base UI+shadcn/@kit/ui。MakerKit只作为工程结构/组件组织参考，不是视觉模板。验收看操作流畅、信息清楚、反馈及时、页面质感。
R. 不修改 packages/ui/src/shadcn/* 添加Aisenhub行为。跨App组合放 packages/ui/src/makerkit并通过 @kit/ui/<name> export；Admin特有组合留apps/admin。interactive element按项目规则增加 data-test。
S. 不为了现代化新增 React Admin、Refine、第二 UI/Form/Query framework；不为了Kiranism模式强行新增 React Query/nuqs/kbar。优先复用现有能力。
T. System Health、Global Resource Search、Alerts、完整Request Inspector、unified operation feed/worker metrics属于future。没有真实后端时禁止绿色假状态、假badge、假search result、假retry。
U. Responsive目标覆盖 desktop 1280–1600+、tablet 768、mobile 390/375/320；WCAG 2.2 AA方向包括keyboard/focus/semantic table/dialog focus/aria-live/labels/color+text/reduced motion。
V. Consumer与Admin共享状态语义但不共享相同密度。Consumer technical details默认折叠，protected shell task-oriented。
W. 不借本任务重构整个 API client、Observability、Performance、Business Workflow；只消费它们的合同。不要为假设需求加兼容层。

【Phase顺序】
Phase 01 Experience Foundation + Admin Shell + Audit real vertical slice
  -> Phase 02 Platform Context + Workspace
  -> Phase 03 High-risk Interaction + Accounts/Keys vertical slices
  -> Phase 04 Accounts & Entitlements
     Phase 05 Files & Platform Settings
     Phase 07 Consumer & Registry
     三者可在 Phase 03 push后并行
  -> Phase 06 Operations + Audit + Overview（等待04+05）
  -> Phase 08 Responsive + Accessibility + Integration + Legacy Cleanup（等待04+05+06+07）
  -> STOP
Future diagnostics不自动开始。

【Phase 01特别硬门槛】
当前研究快照 apps/admin / apps/template-preview 尚未声明 @kit/ui，并且App仍使用独立globals.css。Phase01先真实验证 @kit/ui workspace dependency、CSS/Tailwind pipeline、Next compilation和浏览器样式生效。只能做最小现有栈适配；如果必须大版本升级才能成立，记录阻塞并停止大规模迁移，不换第二框架。
Phase01必须同时迁Audit形成真实闭环，不能只交静态Shell。

【每阶段工作方式】
1. 开始前核对实际代码、branch、HEAD、worktree、verification-record和上游remote commit；研究SHA不是执行baseline。
2. 先搜索计划“建议新增”的等价文件/helper，已有就复用，不为名称对齐复制实现。
3. 只修改当前Phase及必要直接依赖。实际代码与计划不一致时，以代码为当前事实、以架构为目标，记录偏差和最小处理。
4. 不把旧 docs/development/status.md / evidence中的历史PASS当本次验证。
5. 保持真实用户闭环，不加假按钮/数据/进度/metrics/search。
6. 按当前 package.json实际存在的命令执行阶段验证。计划里写出的命令如果已漂移，记录新命令；不存在的命令不能当PASS。
7. 浏览器验证记录 browser/version/viewport/route/scenario/result/screenshot或log路径/verified commit。
8. 失败必须保留初始failure、修复和retest；验证后相关代码变化则重跑受影响测试或标旧结果不再覆盖。
9. 阶段收尾检查 git diff --check、git diff、git status --short；只提交本阶段/必要依赖，不提交密钥、.env、用户媒体、缓存、生成垃圾。
10. 更新 verification-record.md。
11. 创建有意义commit（一个Phase可多个commit），message包含Phase和实际变化。
12. push任务分支，确认remote真正包含对应SHA；把SHA/GitHub URL/push结果写record。
13. 只有“实施完成 + 必要验收实际通过 + 相关commit成功push”才能标“已交付”。代码写完未验、commit未push、push失败都不是已交付。
14. 推送失败保留本地成果、记录原因并停止进入依赖Phase；修复并确认remote后再继续。

【Git授权与禁止】
- 本提示已授权后续执行agent每阶段正常commit+push，无需重复询问。
- 不force push，不重写已发布历史，不自动merge main，不创建Release，不deploy。
- remote不存在/无权限/分支规范实质冲突时才提出具体问题。
- verification record记录SHA可用后续独立docs commit；不要反复amend追逐自己的最新SHA。

【多Agent ownership】
- Shared/Integrator：packages/ui/**（本期shared组合）、apps/admin shell/shared navigation/state、Phase01/03/08、verification-record最终集成、shared bug修复。
- Platform Agent：Phase02，apps/admin platform directory/context/workspace shell。
- Entitlements Agent：Phase04，Accounts/Plans/Subscriptions/Redemption routes/features。
- Files Agent：Phase05，Files/File Policy/General/Origins/Keys routes/features；Phase03已存在Keys shared行为必须复用。
- Operations Agent：Phase06，Operations/Audit/Overview；不得改资源业务状态机。
- Consumer Agent：Phase07，apps/template-preview/**、registry/**与Consumer直接tests；不得改Admin业务feature。
- 并行agent发现shared contract bug时不要复制workaround；给Integrator复现/需求，由Integrator修shared并push后各方消费。
- 并行期间 verification-record由Integrator合并；其他agent提供结构化记录，避免同时覆盖同一文件。

【停止边界】
Phase08全部必要commit/record成功push后停止。不要自动进入future diagnostics、API Contract、Observability、Performance或其他优化类别；把后续问题写handoff。

现在开始时不要直接改代码。先完成基线核对、读取verification-record和当前Phase，再按计划执行。
```

## 2. 文档阅读顺序

新 agent：

```text
1. <repo>/AGENTS.md
2. 触及目录的 nested AGENTS.md
3. 当前本地 Next docs（写 Next 时）
4. docs/architecture.md
5. docs/api-sdk.md
6. docs/development/contracts.md
7. 当前Phase相关专题（auth/config-files/subscription/operations等）
8. docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/00-master-plan.md
9. docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/verification-record.md
10. 当前Phase文档
11. 所有上游Phase交接/remote commit
12. 实际相关代码/tests/package scripts
13. Authentication & Session actual plan/record（需要session/MFA时）
```

架构原文：`references/Aisenhub_Frontend_Experience_State_Architecture.md`。

## 3. 阶段依赖图

```text
01 Foundation/Audit
 ↓
02 Platform Context
 ↓
03 High-risk Contract
 ├───────────┬───────────┐
 ↓           ↓           ↓
04          05          07
Entitlement  Files       Consumer
 └─────┬─────┘           │
       ↓                 │
      06 Ops/Audit/Home  │
       └────────┬────────┘
                ↓
               08 Final Integration
                ↓
               STOP
```

Phase 06必须等04+05；Phase08必须等04+05+06+07。

## 4. 每阶段 Git 核对

开始：

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

收尾：

```bash
git diff --check
git status --short
git diff
```

然后 actual tests → record → commit → push → confirm remote → record SHA/link。

推荐 commit message仅作示例：

```text
frontend: phase 01 establish experience foundation and admin shell
frontend(admin): phase 02 establish platform workspace context
frontend(admin): phase 03 standardize high-risk interaction states
frontend(admin): phase 04 migrate accounts and entitlement resources
frontend(admin): phase 05 migrate files and platform settings
frontend(admin): phase 06 add operations and control-plane overview
frontend(consumer): phase 07 adopt shared experience states and registry
frontend: phase 08 finalize responsive accessibility and legacy cleanup
```

实际变化不同则修改 message，不机械照抄。

## 5. 集成负责人职责

- 冻结 shared state/visual/high-risk contracts；
- `packages/ui`唯一集成；
- 处理Phase04/05/07 shared bug；
- 核对所有并行commit已在remote；
- 合并 verification record；
- 检查route/redirect冲突；
- Phase08 legacy scan/full regression；
- 不用“为了避免冲突”把多份重复helper永久保留。

## 6. 接手核对清单

- [ ] repo/remote正确。
- [ ] branch正确。
- [ ] HEAD与record一致或差异已查明。
- [ ] worktree修改都有owner。
- [ ] 上游Phase commit已push。
- [ ] 当前计划列出的“已有”文件当前branch真实存在。
- [ ] 建议新增前已搜索等价实现。
- [ ] package scripts/依赖重新核实。
- [ ] 本地Next docs已读。
- [ ] Auth plan实际交付状态已核对。
- [ ] 没把历史PASS当当前PASS。
- [ ] planned-only能力没有被前人假实现。

## 7. 冲突/失败处理

如果发现架构与代码实质冲突，可能造成数据/secret丢失、授权绕过、不可恢复重复mutation、或需要跨类别大改：

1. 保存具体文件/API/test证据；
2. record标阻塞；
3. 给最小推荐方案；
4. 继续不依赖该问题的任务；
5. 只有无法合理推断且会改变实施结果时才向用户询问。

测试基础设施失败：区分环境/基线与本期回归；保留命令/exit code/stderr；只做本期验证必需的最小 test-tool修复，不扩成DX重构。

## 8. “已交付”唯一含义

```text
实施完成
+ 必要验收真实通过
+ 相关commit成功push到GitHub任务分支并确认remote包含
```

否则只能写未开始/进行中/已阻塞/验证失败/验收通过待推送等准确状态。

## 9. 本文件不记录

- 日常进度；
- actual test exit code；
- current SHA；
- failure details；
- unresolved blocking owner。

这些全部写 `verification-record.md`。
