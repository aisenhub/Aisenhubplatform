# Phase 08 — Responsive、Accessibility、Integration 与 Legacy Cleanup

> FE-R1（2026-09-09）：按本地 main@b563a98 校准，Auth 已实施；本期默认简体中文。执行须读取 [FE-R1 执行合同](references/fe-r1-execution-contracts.md) 和 [中文 UI 合同](references/chinese-ui-contract.md)。本修订替代旧快照中的冲突描述；产品实施仍未开始。

> 状态：**未开始**  
> 前置：Phase 04、05、06、07 全部必要代码已 push；Integrator 核对 remote commits 后才能开始。  
> 本阶段是本期最终收口，结束后停止，不自动实施 Future diagnostics。

## 1. 目标

进行跨 Admin/Consumer 的最终真实浏览器验收与旧路径退出：

- 320 / 375 / 390 / 768 / desktop 1280–1600+；
- keyboard/focus/dialog/drawer/table/ARIA/live region/reduced motion；
- dark/light/theme（若当前产品支持 theme；没有则不为了测试引入新 theme）；
- semantic token consistency；
- route deep-link/back/forward；
- state/error/mutation/secret/security语义；
- legacy flat nav/manual ID/status/busy/window.confirm/CSS/duplicate mutation UI 清理；
- final regression；
-所有阶段 Git delivery 与 verification record一致。

## 2. 前置整合

Integrator 先核对：

```bash
git status --short
git log --oneline --decorate -n 20
git branch --show-current
git rev-parse HEAD
git rev-parse @{u}   # 有 upstream 时
```

并对照 `verification-record.md`：

- Phase 04/05/06/07 commits 都在当前分支；
- 无并行 agent 未提交/未合流修改；
- shared `packages/ui` contract没有分叉；
- routes没有重复实现；
- Auth upstream状态一致。

若 record与 Git不一致，先修正事实记录再继续。

## 3. Responsive Matrix

### Desktop

至少在一个 1280–1600 范围和一个更宽 viewport验收：

- Sidebar expanded/collapsed；
- data tables viewport利用合理；
- form/detail阅读宽度；
- Inspector不挡主要上下文；
- sticky header/action不遮内容。

### Tablet 768

- Sidebar collapsed/Sheet策略；
- two-column detail → single column；
- toolbar wrap；
- Dialog/Drawer width；
- table actions可触达。

### Mobile 390 / 375 / 320

- sidebar → Sheet；
- topbar保留 context/navigation；
- PlatformSwitcher可用；
- data table condensed rows/cards，或 audit/log等高密度表允许可理解的横向滚动；
-重要 2–3字段优先；
- secondary fields进 Inspector；
- row actions menu；
- high-risk Dialog采用适合 full-screen/large Sheet的布局；
- IDs break/copy；
- primary sticky action不覆盖内容；
- OTP/reauth输入软键盘/autofill基本可用；
- one-time secret在窄屏可复制且不横向破版。

不要要求 mobile 与 desktop相同信息密度，但核心任务不能不可用。

## 4. Accessibility Gate

目标方向 WCAG 2.2 AA。实际本期至少人工/自动覆盖：

1. 全站 keyboard-only基本导航；
2. visible focus；
3. Sidebar/Command/Dropdown/Sheet/Dialog focus trap；
4. close 后 focus restoration；
5. semantic `<table>` 优先，若自定义 grid必须有合理 semantics；
6. field label/description/error关联；
7. icon-only accessible name；
8. pending/disabled可被辅助技术理解；
9. initial/section/mutation status适当 `aria-live`；
10. critical failure `role=alert`；
11. StatusBadge不能只靠颜色；
12. contrast按当前 token/theme验证；
13. reduced-motion；
14. mobile touch target合理；
15. copy/secret controls可键盘操作。

如果仓库已有 accessibility test工具则复用；不为本阶段随意新增大型测试服务。人工验证必须在 record写明 browser/viewport/步骤。

## 5. Global State Contract Regression

### Remote data

抽样覆盖 Admin Audit、Platforms、Accounts、Files、Consumer Account：

- initial loading；
- success；
- true empty；
- filter empty；
- recoverable error；
- access error；
- background refresh；
- Error never displays Empty。

### Mutation

抽样覆盖：

- account close/suspend；
- key revoke；
- plan archive；
- subscription command；
- redemption batch；
- file delete；
- deletion job retry；
- Consumer redeem/file delete。

验证 idle/pending/double click/success/business rejection/session/recent MFA/network/unknown/accepted（适用）。

## 6. Security / Secret Regression

- no secret/token/proof/OTP in URL；
- no localStorage secret；
- no console/log plaintext key/redemption code/MFA secret；
- OneTimeSecret acknowledged后 DOM/state按合同清理；
- logout清 sensitive UI/query state；
- client permissions不作为 authorization；
- BFF仍是 Admin/Consumer业务入口；
- file binary upload不 auto replay；
- recent MFA不被 UI timer替代。

## 7. Legacy Scan

执行 agent 应使用当前仓库可用 `rg`/等价工具实际扫描并人工判定。建议模式：

```bash
rg "AdminNav|admin-nav" apps/admin
rg "window\.confirm" apps/admin apps/template-preview
rg "Platform ID|platform-id" apps/admin/app/admin
rg "setStatus\(|const \[status, setStatus\]" apps/admin apps/template-preview
rg "const \[busy, setBusy\]" apps/admin apps/template-preview
rg "\.panel|\.data-list|wide-shell|eyebrow" apps/admin/app apps/template-preview/app
rg "aisenhub-csrf" apps/admin apps/template-preview
rg "localStorage" apps/admin apps/template-preview packages/ui
```

**扫描命中不等于自动删除。** 分类：

- 必须退出的旧路径；
- auth/shared helper仍合法；
- public page尚可保留的样式；
- false positive。

目标：

- no legacy flat `AdminNav`；
- no destructive `window.confirm`；
- no manual Platform ID primary UX；
- no migrated page用单 `status`承载全部状态；
- no page-level global busy for independent rows；
- no duplicated real mutation UI；
- legacy hard-coded CSS只剩明确未纳入本期的 public surface，且不再扩张；
- repeated CSRF helper若 Category04/Auth shared helper已交付则退出；若未交付，记录为上游待办而不是创建第三套 helper。

## 8. Route/Redirect Regression

验证：

- `/admin`；
- `/admin/platforms`；
- every `[platformId]` resource route；
- `/admin/operations`；
- `/admin/audit`；
- `/admin/security`；
- old `/admin/entitlements`、`/admin/subscriptions`、`/admin/files`、`/admin/deletion-jobs`；
- valid/invalid platform ID；
- no redirect loop；
- no auto choose first platform when context missing unless explicitly designed and safe；
- copied deep link works after reload/session restore。

## 9. Planned-only Negative Verification

必须证明本期**没有**伪实现：

- System Health green cards；
- Global Resource Search fake results；
- Alerts unread badge without backend；
- Request Inspector fake trace；
- unified retry button for unsupported operation；
- Organization/RBAC/Checkout/SQL/API Shell。

可保留非点击的 roadmap/document link；产品导航最好不显示不可用主功能。

## 10. Performance Smoke（不做性能专题）

不编造跨设备指标。本阶段只观察明显退化：

- route navigation不因全局 client bundle导致明显大块重载；
- background refresh不清整个页面；
- tables不无界拉取；
- no obvious N+1 per row fetch introduced；
- images/QR/secret surface没有巨大布局跳动；
- mobile interaction无明显阻塞。

如果发现真实性能问题，记录复现条件和后续 Performance专题，不借本阶段大范围优化。

## 11. 最终验证命令

执行时从当前 scripts核对。建议完整 gate：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm contracts:check
pnpm --filter admin build
pnpm --filter template-preview build
pnpm test:e2e:t12-r2
pnpm test:e2e:t16-r2
pnpm test:registry:m5-04
pnpm test:consumer:m5-05
pnpm build
```

根据 Files/Entitlements 实际变更补对应 API/DB tests。根 `pnpm test:api` 若仍为 not-enabled placeholder，**不要运行它然后写 PASS**；运行具体已存在命令。

如果完整 build/test受环境基线阻塞：

- 证明是环境/历史还是本期回归；
- record真实命令/exit code；
- 能完成的独立验收继续；
-关键风险未验证则 Phase 08不能标已交付。

## 12. 浏览器验收记录要求

`verification-record.md` 必须逐 viewport记录：

```text
browser/version
viewport
target route
scenario
result
screenshot/video/log path
verified commit SHA
```

测试截图不得包含真实 secret/用户敏感信息；使用 local/test fixtures。

## 13. 文档/Registry 收口

只更新与本实现直接相关稳定文档：

- route/UX说明；
- plan record；
- Registry mapping；
- 不把动态进度写回架构文档当“已实现”，架构保持目标合同。

Future diagnostics仍留 `future/`。

## 14. 最终完成门槛与 Git

本期只有同时满足才能结束：

- Phase 01–08 所有必要功能实际完成；
- legacy scan达到目标或每个剩余项明确 owner/non-goal；
- responsive/a11y矩阵必要项目实际验证；
-完整静态/build/unit/contracts/E2E风险匹配验证完成；
- no fake planned capability；
- `verification-record.md` 最终与 Git/remote一致；
- `git diff --check` + final diff/secret review；
- commit，例如：`frontend: phase 08 finalize responsive accessibility and legacy cleanup`；
- push + remote branch确认；
- 必要的 record 更新可作为后续独立 docs commit并 push，不反复 amend追自己的 SHA；
- 不 merge main、不 release、不 deploy。

完成后停止，将 Future diagnostics 和其他类别作为后续任务交接。

## FE-R1 阶段补充：中文与安全最终验收

- 将FE-V01～16逐一对应具体测试/手工步骤、被测SHA、环境和脱敏证据。静态检查不替代浏览器运行，历史PASS不自动覆盖新布局。
- 中文人工走查Admin与Consumer公开/受保护主流程、错误恢复、危险操作、组件默认文案、aria-label/live region；英文残留逐条分类，不用“英文字符为零”机械验收。
- 五档尺寸验证中文字体/换行/按钮表头/长ID复制/日期时区/单位。重要后果说明不能被截断，必要英文标识复制保持原值。
- 核对FE-D01～03和各资源恢复矩阵闭环、legacy能力不丢、无重复mutation；独立Consumer产物也通过中文验收。
- 未运行项目保持NOT_RUN/阻塞，不放宽授权/删除失败断言或用旧英文locator要求覆盖新中文需求。
