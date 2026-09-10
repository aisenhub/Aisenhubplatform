# Phase 03 — High-risk Interaction、Mutation State 与 Secret Flow

> FE-R1（2026-09-10）：按当前 `main@2cd5aff` 维护；Auth 已实施，本期默认简体中文。Phase 03 代码批次已交付；FE-D02 与高风险故障矩阵仍开放，详见 [verification-record.md](verification-record.md)。

> 状态：**进行中**（代码批次已交付；FE-D02 与完整故障矩阵仍开放）  
> 前置：Phase 01、02 已验证、commit、push。  
> 本阶段冻结所有后续高风险资源页必须使用的唯一交互合同。

## 1. 目标

建立并验证：

- `confirm_required / step_up_required / pending / accepted / success / failure / unknown_outcome`；
- `ConfirmActionDialog`；
- `MutationButton` / action-scoped pending；
- `OneTimeSecretPanel`；
- `ResourceInspector` / Danger Zone；
- recent-MFA 正式 UI presentation；
- Admin Security 页面/入口；
- 用 **Accounts status action + Platform API Key lifecycle** 两条真实高风险纵切验证 contract。

本阶段不是重做 Auth server。所有 SessionManager、MFA proof、replay 规则消费 `references/auth-session-upstream-contract.md` 和实际 Auth 交付。

## 2. 前置读取

- Phase 01/02 handoff + `verification-record.md`
- Auth 计划 master/verification，确认 shared SessionManager 是否真实可用
- `apps/admin/app/admin/mfa/page.tsx`、login、auth routes
- `apps/admin/app/admin/platforms/page.tsx` 当前 account/key 逻辑
- `docs/api-sdk.md` 中 Admin Key/account status/error/idempotency/recent MFA
- `packages/ui/AGENTS.md`
- 本地 Next docs（Dialog/route/client boundary涉及的当前用法）

## 3. 冻结 Mutation Intent Contract

页面/组件职责必须分开：

```ts
interface MutationIntent<TPayload = unknown> {
  kind: string;              // UI operation kind，非授权事实
  targetId: string;
  payload: TPayload;
  idempotencyKey?: string;   // 只有业务/API contract需要时持有
  operationId?: string;      // 同上
}
```

具体字段可按实际类型实现，但语义固定：

- intent 在用户第一次开始一个逻辑操作时创建；
- 同一逻辑操作需要 retry 时，若 API 要求 same key/operation_id，必须复用同一值；
- 首次提交前cancel可销毁intent；提交后pending/accepted/unknown关闭Dialog不取消服务端操作，必须保留原安全恢复线索；终态或已按领域合同处置后才销毁；
- secret/token/proof 不进入通用 intent；
- Dialog 不自己生成第二个业务 operation 来绕过错误；
- 若 Auth refresh 成功但 ReplayPolicy=`never`，intent 保留并等待用户再次确认/提交，原 mutation 不自动重发。

## 4. ConfirmActionDialog

跨 Admin 通用组合优先放 `packages/ui/src/makerkit`，但先搜索是否已有等价 `use-async-dialog`/AlertDialog 包装可直接扩展。

必须支持：

```text
Action title
Target identity
Impact / consequence
Reversible? yes/no
Async? yes/no
History retained?
Reason field（仅 action contract要求）
Step-up note
Cancel / Confirm
```

### 禁止

- generic “Are you sure?” 作为唯一说明；
- `window.confirm`；
- Confirm button 在 pending 后仍能 double click；
- Dialog 关闭后丢失 unknown outcome 所需 intent；
- 用 red button 隐藏所有业务说明。

## 5. Recent MFA / Step-up Presentation

### 权威来源

API/Auth 层返回 `RECENT_MFA_REQUIRED` / Session runtime `mfa_required`。

UI 不计算：

- proof 5 分钟是否过期；
- AAL 是否足够；
- factor 是否代表授权。

### 流程

```text
confirm intent
 → submit
 → API returns RECENT_MFA_REQUIRED
 → preserve safe intent
 → open/route to existing Admin MFA step-up
 → MFA success
 → return to intent surface
 → 根据 ReplayPolicy：
      never => 用户显式再次提交
      explicit idempotent-mutation => 只有上游 runtime允许才继续
```

FE-R1固定采用当前操作界面内的MFA组件，复用原BFF；验证成功后保留原intent/receipt，用户显式再次提交。不使用整页跳转作为敏感流程continuation，不新建tokenized secret continuation。

## 6. `accepted` 与 `unknown_outcome`

### accepted

- HTTP 202 / job queued：显示“请求已接受，正在处理”；
- 显示 job/operation link（真实存在才显示）；
- authoritative state 从 job/resource GET 获取；
- 不发 success toast“已删除”。

### unknown_outcome

适用于 network disconnect / response lost / backend explicit unknown。

UI：

1. 保持当前 intent 和 target；
2. 显示 warning，而不是 failure；
3. 禁止立即启动第二个相同高风险操作；
4. 提供 `Check current state`；
5. refetch authoritative resource/job；
6. 按FE-R1操作恢复矩阵判断；当前资源状态未必能证明原operation是否执行，证据不足保持unknown；
7. retry 若要求 same idempotency/operation ID 则复用。

## 7. OneTimeSecretPanel

建议跨 Admin/Consumer 通用，复用 existing CopyToClipboard/Alert/Card/Button。

```text
not_generated
  ↓
generating
  ↓
presented_once
  ↓
acknowledged
```

### 显示规则

- 一次性警告；
- monospace plaintext；
- Copy；
- “请保存到受控位置”说明；
- explicit acknowledge；
- 离开/关闭有 draft loss warning（只有 plaintext 仍 present 时）；
- acknowledged 后清内存 state；
- 不在 toast/URL/status/localStorage/analytics/console；
- 不提供 “show again” 假按钮。

## 8. 真实纵切 A — Accounts actions

从 legacy `platforms/page.tsx` 中迁出 account actions，最终 route 由 Phase 04 完善，但本阶段至少完成一个可验证 Account inspector/action surface，建议直接建立最终 `/admin/platforms/[platformId]/accounts` 基础页，Phase 04 在此扩展 table details。

### list/read

- 使用 Platform URL context；
- remote data 五态；
- row click → Account Inspector；
- Account ID/User ID safe copy；
- status badge。

### suspend / restore / close

每个 action：

- 独立 intent；
- reason 只存在该 Dialog，不能共享 page-level input；
- close 放 Danger Zone；
- recent MFA 由 API 指示；
- row/action pending，不锁其他 account；
- success authoritative refetch；
- conflict/permission/error 使用 Error Presenter；
- unknown result 先 refetch Account status。

不在前端复制 account transition 合法状态机；API rejection 是最终权威。

## 9. 真实纵切 B — Platform API Key lifecycle

建议直接建立最终 `/admin/platforms/[platformId]/settings/keys`，Phase 05 再完成 Settings 导航/视觉收尾。

真实流程：

```text
Create new key
 → recent MFA if required
 → server response plaintext exactly once
 → OneTimeSecretPanel(presented_once)
 → operator saves/deploys
 → acknowledge
 → metadata row = active, deployment not confirmed
 → Confirm Deployment dialog
 → server persists deployment_confirmed_at
 → old key revocable
 → Revoke dialog + recent MFA
 → authoritative refetch
```

### 不变量

- 不显示 key secret 在 status；
- key list只显示 prefix/suffix/name/status/deployment metadata；
- confirm deployment 不能由纯前端 boolean 代替服务器持久记录；
- revoke 失败不把 row optimistic 标 revoked；
- create response lost 时不能自动生成第二把 key；先通过 metadata/operation contract确认，若 API 无法确认则保持 unknown，并给人工恢复说明；
- 不把 key secret写进 inspector technical metadata。

## 10. Admin Security

建立 `/admin/security` 或实际约定 route，作为展示层整合：

- current admin identity（已有安全可读数据才显示）；
- Session state；
- MFA factor summary；
- recent MFA status **只有 Auth/API真实可提供时**；
- logout；
- recovery/rotation 未来能力只标 planned，不放假按钮。

如果当前没有“recent MFA expires_at”读接口，不做 5 分钟倒计时。可以显示“敏感操作需要近期 MFA；系统会在需要时要求重新验证”。

## 11. 建议文件

共享（先查等价实现）：

```text
packages/ui/src/makerkit/
  confirm-action-dialog.tsx
  mutation-button.tsx
  one-time-secret-panel.tsx
  resource-inspector.tsx
```

Admin：

```text
apps/admin/features/accounts/*
apps/admin/features/platform-keys/*
apps/admin/app/admin/security/page.tsx
```

若 Phase 01 已有 `ResourceInspector`/MutationButton，请扩展而非新增同名另一套。

## 12. 状态/并发/恢复测试

### 通用

1. confirm cancel 不发请求；
2. confirm double click 只发一次；
3. pending only action scope；
4. recent MFA required 不变成 generic error；
5. MFA failure/cancel 保留安全 context；
6. Auth refresh 成功 + replay never 不自动 mutation；
7. 409/412/429/503 分别呈现；
8. network response lost → unknown，不立即 second mutation；
9. authoritative refetch 发现已成功 → 收敛 success；
10. refetch 发现未执行且 contract允许 retry → 同 intent retry；
11. request ID technical details 可复制。

### Account

- suspend reason required；
- restore；
- close Danger Zone；
- another row remains interactive；
- server rejects invalid transition 不被前端覆盖；
- target/platform mismatch 仍由 server 拒绝。

### Key

- create → secret once；
- refresh/route leave 后没有 recover plaintext；
- copy action不泄露 analytics/log；
- confirm deploy persist；
- old key revoke only after server-confirmed deployment；
- revoke pending row-level；
- secret never in DOM after acknowledge（除非当前 flow需要短暂显示）；
- keyboard/focus in Dialog/Secret panel。

## 13. 验证命令

按实际依赖：

```bash
pnpm --filter @kit/ui typecheck
pnpm --filter @kit/ui test:unit
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:e2e:t12-r2
```

如果 Account/Key API contract 没有改，不需要修改 OpenAPI；但推荐运行现有管理 API回归以证明 UI 没误用接口：

```bash
pnpm test:api:t16-m2-management
pnpm contracts:check
```

命令实际可运行性以执行时 package.json 为准。

## 14. 旧路径退出

完成后：

- legacy Platform page 的 account reason input / account actions 删除或 redirect 到 Accounts；
- key plaintext-in-status 删除；
- legacy key confirm/revoke `window.confirm` 删除；
- Admin Security 不复制 login/MFA auth route 实现；
- 后续资源页只能使用本阶段 Confirm/Mutation/Secret contract。

## 15. 完成门槛与 Git

- 两条真实纵切通过浏览器验证；
- shared high-risk contract 单测/behavior tests 实际运行；
- no secret leak 检查；
- record 更新；
- `git diff --check` + diff/secret review；
- commit，例如 `frontend(admin): phase 03 standardize high-risk interaction states`；
- push 并确认 remote；
- Phase 04/05/07 只有在 Phase 03 remote commit 可见后才能并行开始。

## 16. 多 Agent 交接

向后续阶段冻结：

- ConfirmActionDialog props/behavior；
- MutationState；
- intent/idempotency owner；
- Step-up continuation behavior；
- OneTimeSecretPanel lifecycle；
- ResourceInspector conventions；
- request-id/Error Presenter integration；
- shared commit SHA。

后续 agent 不得各自复制 Confirm/Secret/unknown-outcome 实现。

## FE-R1 阶段补充：同页验证与按操作恢复

- MFA改为复用现有表单与BFF的同页交互，保留原认证路由；不能通过整页跳/admin实现高风险continuation。stepUp区分初次AAL2、近期MFA、Consumer近期认证。
- 以执行合同§4恢复矩阵替代通用“GET后推断执行成功”。提交后的payload/key冻结；关闭弹窗不取消服务端操作；accepted/unknown不能因关闭而自动销毁原安全intent。
- 秘密/receipt仅在当前专用flow内存，不进通用intent；终态会话清理优先于保留草稿；敏感流程MFA后仍显式确认提交。
- 执行FE-D02重复批次创建风险核验并保留失败用例。批次创建固定replay never，不以幂等参数存在推导明文可恢复。
- 所有高风险说明、一次性保存提示、再次验证、请求受理/结果未确认文案中文优先；技术原值只在安全详情提供。
- 验收 FE-V01、FE-V03、FE-V06～08、FE-V13、FE-V16；FE-D02未闭环则后续批次创建完整交付受阻。
