# Phase 07 — Consumer Experience 与 Registry Adoption

> FE-R1（2026-09-09）：按本地 main@b563a98 校准，Auth 已实施；本期默认简体中文。执行须读取 [FE-R1 执行合同](references/fe-r1-execution-contracts.md) 和 [中文 UI 合同](references/chinese-ui-contract.md)。本修订替代旧快照中的冲突描述；产品实施仍未开始。

> 状态：**未开始**  
> 前置：Phase 01–03 已交付并 push；若 Authentication & Session Consumer adoption 尚未交付，相关 session transport 工作等待上游，不复制实现。  
> 可与 Phase 04、05、06 并行，但共享 `packages/ui` contract 只能由 Integrator 修改。

## 1. 目标

把 Admin 已冻结的基础状态语义迁到 `apps/template-preview` 与 Registry，而不把 Admin 的高密度运维视觉直接复制给 Consumer：

```text
Consumer protected shell
├─ Account Overview
├─ Subscription
├─ Files
├─ Profile / Preferences
└─ Security
```

目标：

- Consumer loading/empty/error/retry/pending/session/reauth 使用统一 shared primitives；
- 文案更面向普通用户，technical details 默认折叠；
- Profile/Preferences 412 conflict 有正式恢复流程；
- Subscription redeem 的 logical intent/idempotency key 不因 retry 每次重新创建；
- Files 不再 page-level busy，binary upload 永不 auto replay；
- account close/global delete 采用正式 confirm/reauth/accepted 语义；
- Registry templates 与实际 Consumer routes/行为同步；
- 不把任何后端业务算法复制进模板。

## 2. 必读

- Phase 01/03 contracts + record
- Auth Session 前一计划 Consumer phase/verification
- `docs/api-sdk.md` Registry/Consumer contract
- `docs/config-files.md`
- `docs/subscription-redemption.md`
- `apps/template-preview/AGENTS.md` + 本地 Next docs
- 当前 `account/page.tsx`、`subscription/page.tsx`、`files/page.tsx`、auth pages、`globals.css`
- `registry/manifest.json`、`registry/templates.json`、相关 registry tests

## 3. 早期依赖核对：Consumer `@kit/ui`

当前研究快照 `apps/template-preview/package.json` 也没有 `@kit/ui`。Phase 01 已解决 Admin toolchain，但 Consumer app 仍必须独立验证：

- workspace dependency；
- shared semantic style entry；
- build；
- mobile styles；
- 不复制 Admin shell CSS；
- 不新增第二 UI framework。

如果 Phase 01 的 app setup 可直接复用，提取最小 shared base；如果仅 Admin-specific，不强行共用 layout。

## 4. Consumer Visual / Copy Contract

共享状态语义，不共享相同密度和技术暴露。

Admin 可以：

> Account API 暂时不可用 · Request ID ...

Consumer 默认：

> 暂时无法加载账户信息，请稍后重试。

Technical details：折叠显示 code/request ID，便于支持，但不让普通用户先看到内部 code。

Consumer 导航 task-oriented；不使用 Admin 两层 sidebar。Desktop 可 top/side nav，mobile 适合 compact header/sheet，按当前设计系统实现。

## 5. Consumer Protected Shell

建议 protected routes共享 layout：

```text
Account Overview / Profile
Subscription
Files
Security
```

Public auth/pricing 页面保持更轻，不因 protected shell 重构强行套 sidebar。

Session authority 只来自 Auth shared runtime；logout 清理相关 sensitive query state。若 Auth plan未交付，页面不新造 SessionManager。

## 6. Account / Profile / Preferences

当前 `account/page.tsx` 同时读取 profile/preferences，并用一个 status string。

目标：

- Account overview independently surfaces profile/preferences/security；
- profile/preferences load 状态可独立；
- editing draft 与 server data 分开；
- field validation；
- Save button local pending；
- success update authoritative ETag/version；
- no whole-page busy。

### If-Match 412 / 428

冻结流程：

```text
Edit based on row_version/ETag N
 → PATCH If-Match N
 → 412 PRECONDITION_FAILED
 → do not overwrite local/server silently
 → show conflict state
 → offer Reload latest
 → after reload compare/reapply user draft manually
```

不要自动把用户 draft 覆盖到新 version。若 API 返回 428，提示缺少 precondition 并按 client bug/refresh处理。

### Preferences JSON

架构不要求长期把 JSON textarea 作为产品最佳 UX。如果 schema/feature keys 目前不稳定，可以暂时保留 JSON editor，但：

- error field-level；
- dirty state；
- valid object；
- server Merge Patch authoritative；
- 不把 preferences 当授权。

## 7. Consumer Security / Reauth

当前 account page 有 email reauth token_hash 输入、close account、global delete request。

目标：

- dedicated Security section/page；
- recent reauth 是正式 action-required state；
- token_hash 处理遵守 Auth plan，不在 localStorage/URL/log；
- close account：ConfirmActionDialog + reauth + result；
- global delete request：Confirm + reauth + `accepted/pending_admin` 等真实 server状态；
- 不显示“删除完成”除非 authoritative state如此；
- logout 使用 shared Auth manager contract。

如果 Auth plan已经重新设计 reauth页面/return flow，直接迁其实现，不维持旧 token_hash UI 第二条路径。

## 8. Subscription / Redemption

当前 `subscription/page.tsx`：

- GET entitlement；
- redeem；
-每 submit 新 `crypto.randomUUID()` 作为 Idempotency-Key；
- one status string。

### Remote state

- entitlement initial/success/error/access；
- `none`/free/suspended按 API contract显示；
- expired 不作为有效 current status；
- current_period_end按用户 locale/timezone显示，但不改变 UTC 业务语义。

### Redeem logical intent

目标：

```text
用户输入 code
 → 创建一次 redemption intent + idempotencyKey
 → submit
 → success: clear code + key, refetch entitlement
 → stable business rejection: retain code or clear按 UX，intent完成
 → network/503 uncertain: 不创建新 key
 → check/refetch / allow explicit retry with same key
```

Auth plan replay rules仍有效；不能把任何 mutation默认 auto replay。

用户重复输入同码作为**新显式业务动作**时是否创建新 key由业务合同决定；不要把 UI retry 和新业务操作混为一谈。

## 9. Consumer Files

当前有真实 Budget、upload intent、binary PUT、delete、download。

### 状态

- Budget/Files 可独立；
- Active/Receiving/Storing/Deleting/Deleted/Unknown human copy；
- unknown/deleting保留预算说明；
- page-level `busy` 移除，改 row/action/upload scope pending。

### Upload

```text
select file
 → create upload intent (idempotency contract)
 → PUT bytes
 → success => refetch
 → byte upload network failure => do NOT resend automatically
 → GET file authoritative state
 → unknown => show “正在确认上传结果”
 → explicit recovery follows file business contract
```

注意当前旧实现 upload-intent 与 byte PUT分别生成 random idempotency key；执行 agent必须核对真实 BFF/API contract后保持正确 key作用域，不能凭 UI猜它们应相同。

### Delete

- Confirm；
- 202 accepted；
- row `deleting`；
- budget仍占用；
- retry先查状态；
- row pending；
- no fake released quota。

### Download

- safe read/session refresh according Auth；
- binary stream失败不自动重发 mutation语义；
- human error + support ID。

## 10. Public Auth / Pricing Pages

本期不重做 Auth protocol，但视觉/state adoption包括：

- login/signup/forgot/update-password field/pending/error；
- session/auth error human presentation；
- MFA/reauth按 Auth计划；
- Pricing true public plan load error/empty；
- 不把 plan displayed 当 entitlement granted。

公开认证与套餐页面的中文适配也是Phase07必交付范围，与受保护页面及Registry安装产物一起验收，不能因范围过大延期。

## 11. Registry 同步

当前 registry templates包含 auth、pricing、profile/preferences、subscription/redeem、config-files-manager、user-menu。

本阶段必须：

- 核对实际 Consumer route变化与 `registry/templates.json`；
- 更新 template references/manifest only when真实输出结构需要；
- template复制 UI/route/BFF glue，不复制 entitlement/quota/authz算法；
- registry仍 local-only则不得写成 published；
- SDK兼容信息按实际 package build，不伪造版本；
- 新 protected shell如果属于模板，应确保 clean consumer安装测试可使用。

不要把 Admin components暴露为 Consumer registry依赖。

## 12. 文件职责建议

```text
apps/template-preview/app/(protected)/...   # 实际 route-group 是否采用由当前 Next docs/现有结构决定
apps/template-preview/components/*
apps/template-preview/features/account/*
apps/template-preview/features/subscription/*
apps/template-preview/features/files/*
apps/template-preview/features/security/*
registry/templates.json
registry/manifest.json       # 只有必要时
```

不要为目录图强制 route-group rename 导致大规模链接 churn；以真实业务路径兼容为先。

## 13. 旧路径退出

- protected pages不再每页各有 status string；
- repeated CSRF/fetch helper：若 Auth/Category04 shared helper已交付则迁出；否则不要新复制更多，保留最小调用并记录待 Category04；
- page-level busy退出；
- logout direct fetch退出到 Auth manager（上游已交付时）；
- reauth旧路径与 Auth新路径只能保留一套；
- registry不能引用已删除的 hash/route。

## 14. 测试矩阵

### Account/Profile/Preferences

- load success/error/session/access；
- independent section loading；
- save pending；
- field validation；
- 412 conflict → reload/recovery，不 silent overwrite；
- dirty state/close dialog。

### Subscription

- free/term/perpetual/none/suspended display；
- redeem success/invalid/disabled/expired/already redeemed；
- network uncertain same idempotency key；
- session refresh retry-required；
- no duplicate entitlement effect。

### Files

- real budget；
- upload intent failure；
- byte upload disconnect no auto replay；
- unknown state；
- delete 202/deleting/budget retained；
- row pending；
- download。

### Security

- reauth required/success/failure；
- close；
- global delete request accepted；
- logout；
- no token_hash/secret persistence。

### Registry

- manifest/templates consistency；
- clean consumer typecheck/build/browser tests according existing scripts。

## 15. 验证命令

当前已核实：

```bash
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter template-preview build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm contracts:check
pnpm test:e2e:t16-r2
pnpm test:api:t12-ordinary-proof
pnpm test:registry:m5-04
pnpm test:consumer:m5-05
```

Files/API测试按改动风险从 root现有 scripts选择。注意 `test:e2e:t16-r2`/consumer install可能依赖本地 Supabase/Deno环境；若环境阻塞据实记录，不改写为 PASS。

## 16. Browser / Responsive smoke

本阶段至少 Desktop + 390px：

- protected navigation；
- account edit/conflict；
- redeem；
- file upload/delete/unknown；
- security/reauth；
- logout/session expired；
- technical details folded。

Phase 08 执行完整 320/375/390/768/a11y。

## 17. 完成门槛与 Git

- core Consumer protected flow真实迁移；
- Registry与 route行为一致；
- no second SessionManager/API business logic；
- binary no-replay、If-Match、idempotency状态正确；
- actual tests/browser evidence记录；
- `verification-record.md` 更新；
- `git diff --check` + diff/secret review；
- commit，例如 `frontend(consumer): phase 07 adopt shared experience states and registry`；
- push + remote confirmation；
- 向 Phase 08交付 Consumer legacy CSS/state清单和任何环境阻塞。

## FE-R1 阶段补充：中文Consumer与安装产物

- Auth上游已交付，直接复用现有manager/reauth/BFF，不保留“上游未交付则复制最小helper”的新实施路径。
- 继承FE-D03确定的UI分发方案，更新必要安装脚本、依赖/exports、CSS和Registry产物。独立目录不可引用workspace或仓库绝对路径；不默认公开发布。
- 登录/注册/找回密码/更新密码/公开套餐以及受保护页面均须中文适配；原§10允许范围过大时延期的例外取消。
- 复用中文状态语义，普通用户不必理解proof/receipt/projection等术语；必要技术详情折叠，原DTO/错误码/用户输入不翻译。
- 412保留草稿与中文冲突恢复；兑换same-key、文件no-replay及会话终态清理保留。验收FE-V03、FE-V07、FE-V09～10、FE-V14～16。
