# Phase 04 — Accounts 与 Entitlements 资源页

> FE-R1（2026-09-10）：按当前 `main@2cd5aff` 维护；Auth 已实施，本期默认简体中文。Phase 04 代码批次已交付；FE-D02 与完整资源状态矩阵仍开放，详见 [verification-record.md](verification-record.md)。

> 状态：**进行中**（代码批次已交付；FE-D02 消费与完整资源矩阵仍开放）  
> 前置：Phase 01–03 已交付并 push。  
> 可与 Phase 05、Phase 07 并行。  
> 文件所有权建议：`apps/admin/features/accounts|plans|subscriptions|redemption/**`、对应 nested routes；不要改 Files/Consumer/shared UI contract，shared bug 交 Integrator。

## 1. 目标

完成 Platform Workspace 中高价值业务资源页面：

```text
Accounts
Plans
Subscriptions
Redemption Batches
```

并退出旧的：

```text
/admin/entitlements       # Plans + Batches mega-page
/admin/subscriptions      # manual platform/account ID operations page
```

不能丢失已有真实 Plan/Batch/Subscription/Account 功能；只是重新组织页面、状态和操作流程。

## 2. 必读

- `00-master-plan.md`、Phase 02/03、record
- `docs/subscription-redemption.md`
- `docs/api-sdk.md`
- `docs/development/contracts.md`
- 当前：
  - `apps/admin/app/admin/entitlements/page.tsx`
  - `apps/admin/app/admin/subscriptions/page.tsx`
  - Phase 03 Accounts route
- 相关 OpenAPI/Account API routes（只为核实字段/filters/status，不复制业务算法）
- 本地 Next docs

## 3. 现有能力保留清单

### Accounts

来自旧 Platform Operations：

- list/search；
- suspend/restore/close；
- reason；
- platform scoping。

Phase 03 已迁 high-risk action contract；本阶段主要补 table/inspector/detail。

### Plans

现有：

- list；
- create；
- active/archive；
- free/paid kind；
- default Free set/clear；
- server domain rule：default Plan archive 等约束。

### Redemption Batches

现有：

- list；
- create pending_delivery；
- plaintext codes + delivery receipt only in create response；
- confirm delivery；
- batch lifecycle；
- no re-export plaintext。

### Subscriptions

现有：

- read projection；
- command action pause/resume/grant/revoke/correct；
- required reason；
- operation_id；
- 409 conflict；
- recent MFA requirement。

## 4. Accounts 完整资源页

Route：`/admin/platforms/[platformId]/accounts`

### Table

只展示 API 当前真实字段。建议：

- Platform Account ID；
- User ID（safe copy，必要时默认截断）；
- status；
- entitlement summary **只有 list API 已返回或有 bounded detail fetch 策略时**；
- actions。

不要做 N+1 请求拉每个 account subscription/file summary 只为了表格好看。

URL：`q/status/cursor` 只按 API 支持程度启用。

### Inspector

```text
Summary
Status
Subscription link/details（可真实读取才显示）
Files link/summary（可真实读取才显示）
Activity（Phase 06 capability成立后）
Technical metadata
Danger Zone
```

Phase 03 suspend/restore/close 流程继续复用；不重做 Dialog。

## 5. Plans

Route：`/admin/platforms/[platformId]/plans`

### Table

- code/name；
- kind；
- status；
- default Free badge；
- description/features summary（避免巨大 JSON 直接塞列）；
- edit/archive actions。

### Create/Edit

- 2–4 简单字段可 Drawer；若 features schema 实际复杂则 Full Page/structured editor；
- 不把未经 schema 的任意 JSON 当“更专业”；按照实际 contract字段；
- server authoritative；
- success refetch；
- 归档使用 Phase 03 ConfirmActionDialog；
- 默认 Free 的特殊状态明确 badge；
- 不复制“默认 plan 能否 archive”的完整业务算法。可以做明显 UX guard，但 server rejection 必须被正确展示。

### Stale/conflict

若 endpoint 有 ETag/version：按 412 contract；如果 Plan API 当前没有 version contract，不擅自增加本地 optimistic version。

## 6. Subscriptions

Route：`/admin/platforms/[platformId]/subscriptions`

### 关键前置验证

当前旧页面要求手输 account ID 并读取单个 subscription。架构目标希望列表，但**执行 agent 必须先核对 Admin API 是否已有 subscription list endpoint**。

#### 如果已有真实列表

实现 URL-based table：

- account；
- effective plan；
- source；
- state；
- expiry；
- last change（API 有才显示）；
- actions。

#### 如果只有单条 read

不要造假列表。实现：

- 从 Accounts inspector 进入 `/subscriptions?account=<id>` 或 nested detail route；
- Platform route 已固定，无手输 Platform ID；
- 可保留 account search/picker only if Account API search 能真实支持；
- 文档记录“subscription list 等 backend contract”。

### Command intent

现有旧页的 operation_id 是函数局部变量，network failure 后用户难以真正复用。目标：

```text
用户打开 command dialog
 → 创建 logical intent + operation_id
 → reason/action
 → submit
 → success => discard intent
 → 409 => refetch + ask re-confirm; 是否继续同/新 operation按 API contract
 → network/unknown => 保留 same operation_id
 → check authoritative subscription
 → safe retry 时复用 same operation_id
```

不让每次 click 自动生成第二个业务 operation。

### State

- pause/resume/grant/revoke/correct 具体合法性由 API；
- recent MFA → Phase 03 step-up；
- 409 → Conflict surface + refetch；
- failure 不 optimistic 改 Projection；
- expiry 统一 UTC ISO → display timezone；不要改变业务时间语义。

## 7. Redemption Batches

Route：`/admin/platforms/[platformId]/redemption-batches`

### Table

- name；
- plan；
- quantity；
- status；
- expiry；
- delivery state；
- created time（API 有才显示）；
- details/action。

### Create flow

Dedicated flow，不再普通 form + status string：

```text
Choose Plan
Batch metadata
Quantity / duration / expiry (按真实 contract)
Review
Create pending_delivery
 → generating
 → plaintext codes + receipt presented_once
 → copy/save
 → confirm delivery
 → acknowledged
 → clear plaintext/receipt
```

### 关键恢复

- create response lost：禁止自动 create 第二批；按 API 的 operation/idempotency contract 查询原 operation/batch；若当前 API 不能恢复，显示 Unknown Outcome + 支持流程，不生成假 codes；
- confirm delivery failure：plaintext/receipt 当前内存还在时允许按真实 contract retry；必须复用同 receipt，不重新生成；
- refresh 后 plaintext 不可恢复；页面只能显示 batch metadata 状态。

### Batch disable/codes

如果当前 API 已支持 disable/masked codes，可在 Inspector 中真实实现；如果旧 UI 未实现但 contract 已有，属于本期 Entitlements 管理范围，可以增加，但必须经过 Phase 03 high-risk/recent MFA。若 API仍 contract-only，页面不放可操作假按钮。

## 8. Data Table / URL rules

四类资源都遵守 Phase 01/02：

- URL authority；
- server search/filter 优先；
- filter chips/reset；
- cursor；
- row inspector；
- row-level pending；
- background refresh 保留 last-known data；
- mobile details 交 Phase 08 收口，但本阶段至少不产生不可访问 overflow。

不要为了统一外观计算 total pages。

## 9. Form / Error / Toast

- Field validation → field error；
- initial load failure → ErrorState；
- background refresh failure → Inline Alert；
- completed ordinary mutation → Toast + authoritative content；
- destructive confirm 不 toast 替代 Dialog；
- secret 永不 toast；
- 409/412 放上下文内 conflict，不只短暂 toast；
- request ID 可折叠复制。

## 10. 文件职责建议

```text
apps/admin/app/admin/platforms/[platformId]/accounts/page.tsx
apps/admin/app/admin/platforms/[platformId]/plans/page.tsx
apps/admin/app/admin/platforms/[platformId]/subscriptions/page.tsx
apps/admin/app/admin/platforms/[platformId]/redemption-batches/page.tsx

apps/admin/features/accounts/*
apps/admin/features/plans/*
apps/admin/features/subscriptions/*
apps/admin/features/redemption/*
```

每 feature 只在需要时拆：components / loader/query / mutation / columns / schemas / presentation。不要复制 DTO，如果 `packages/domain` 已有稳定 type，复用；不要让 browser import server-only SDK。

## 11. 相邻模块与保留规则

- 不修改 Entitlement SQL/Projection 算法；
- 不直接 PATCH subscription projection；
- 不改变 batch code plaintext storage contract；
- 不改变 Account status server authorization；
- 不因为 UI filter 隐藏 server records 而当成授权；
- 不修改 Consumer subscription 逻辑（Phase 07）；
- Phase 05 不应修改这些 routes，避免并行冲突。

## 12. 旧路径退出

当新页面全部验证后：

- `/admin/entitlements` → redirect 到当前/可选择 Platform 的 Plans 或 `/admin/platforms`；不能保留第二套 Plan/Batch mutation UI；
- `/admin/subscriptions` → redirect 到 Platform workspace；不能保留 manual Platform ID/account operation page；
- legacy components/state 删除；
- old `status/busy/window.confirm` 对这些资源全部退出；
- redirect 规则需避免在没有 platform context 时猜第一个平台，优先去 platform directory。

## 13. 测试矩阵

### Accounts

- initial/success/true empty/filter empty/error/permission/background refresh；
- inspector；
- suspend/restore/close reason/MFA/double click/unknown；
- one row pending leaves other rows usable。

### Plans

- create；
- default Free badge；
- archive confirm；
- server rejection preserved；
- filter/cursor URL；
- error != empty。

### Subscriptions

- list-or-detail capability chosen based on actual API；
- command success；
- 409 conflict + refetch；
- network unknown retains operation_id；
- same logical retry same operation_id；
- MFA required；
- no direct projection edit。

### Redemption

- create pending batch；
- secret codes visible exactly once；
- copy/ack；
- confirm delivery；
- confirm failure retains current receipt safely；
- refresh after presented_once cannot re-show；
- lost response does not generate second batch；
- no secret in URL/log/toast。

## 14. 验证命令

```bash
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm contracts:check
```

按涉及行为复用当前 API/DB/browser tests，例如执行时仍存在：

```bash
pnpm test:api:t16-m2-management
pnpm test:e2e:t12-r2
```

M3/Entitlements 当前真实 API/DB test 命令应从执行时 `package.json` / evidence 中核对后运行；本计划不编造一个尚未核实的 `test:m3` shortcut。必要时扩展现有 Playwright E2E 覆盖新 routes。

## 15. 浏览器验收

至少 Desktop Chromium：

- 从 Platform Workspace 导航四资源；
- URL deep-link/back/refresh；
- Accounts action；
- Plan create/archive；
- Subscription command conflict/recovery；
- Redemption one-time secret + confirm；
- old routes redirect；
- no duplicate mutation surfaces。

390px 做本阶段 smoke；完整尺寸在 Phase 08。

## 16. 完成门槛与 Git

- 四资源按实际 API 能力完成；Subscription list 若后端缺失必须明确采用 detail 方案并记录，不能假实现；
- 旧 Entitlements/Subscriptions mutation UI 退出；
- high-risk/shared contracts复用；
- 所有必要验证实际运行；
- `verification-record.md` 据实更新；
- `git diff --check` + diff/secret review；
- commit，例如：`frontend(admin): phase 04 migrate accounts and entitlement resources`；
- push 并确认远程；
- 把真实 route/API capability 交 Phase 06/08。

## FE-R1 阶段补充：资源能力与恢复落点

- 本地已确认无subscription list：采用Accounts→/subscriptions?account=<id>详情，不再让实施Agent重新二选一；列表属于后续合同任务。
- 批次列表当前platform_id/limit，不支持cursor且无creation_operation_id字段；不通过名称/时间猜测丢失响应对应的批次。沿用FE-D02结果与恢复矩阵。
- 订阅投影/last_event_sequence不能证明某operation执行。原operation_id和已提交payload保持一致，按领域合同显式重试；不自动新建command。
- 确认交付需要同页MFA恢复并保留原receipt；复制/本地ack不代表服务端确认，成功后再清明文。FE-D02安全验收未闭环不标批次创建完成。
- 套餐、权益、订阅、兑换码批次统一中文术语，raw status、代码、ID保留原值；验收FE-V06～08、FE-V11、FE-V13、FE-V16。
