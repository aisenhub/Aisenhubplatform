# Phase 05 — Integration, Multi-tab, Validation & Legacy Cleanup

> 本阶段是本期 Authentication & Session 优化的集成收尾阶段。必须等待 Phase 03 与 Phase 04 的必要代码、验证记录和 GitHub 推送均完成后再进入。  
> 跨阶段消费合同：[frontend-integration-contract.md](./frontend-integration-contract.md)。  
> 状态：**未开始**。  
> 本阶段不部署、不合并主分支、不创建 Release；完成标准是：本分支上的本期 Auth/Session 改造形成单一运行路径，并通过与风险匹配的本地/CI 可执行验证。

## 1. 目标与前置条件

### 1.1 目标

本阶段必须完成以下真实闭环：

1. 将 Admin 中尚未迁移的受保护业务请求接入 Phase 02/04 已建立的统一 Session runtime，而不是继续各页面自行处理 401/CSRF/session expiry。
2. 加入**仅用于会话失效通知**的多 Tab 协调：logout 与明确 session expired 可以传播到同应用其他 Tab；不得通过 BroadcastChannel 共享 token、CSRF、recent proof 或授权结果。
3. 扫描并退出本期应淘汰的旧认证路径，避免 shared runtime 与页面内手写 refresh/logout/error parse 两套实现长期并存。
4. 对 Consumer + Admin 进行完整失败路径、并发、恢复、浏览器、多 Tab 与构建回归验证。
5. 收口 Auth ↔ Frontend 合同：terminal cache cleanup、deep-link returnTo、RetryRequired/step-up、multi-tab UI reaction、Auth responsive/a11y 都有证据。
6. 同步本期 Authentication & Session 相关稳定文档，并完成 GitHub 阶段提交与推送记录。

### 1.2 前置条件

进入本阶段前，`verification-record.md` 必须证明：

- Phase 01 已交付：统一 auth route envelope/request-id 基线与 logout 新语义已经实施、验证并推送。
- Phase 02 已交付：shared browser Session runtime、single-flight refresh、replay policy 已实施、验证并推送。
- Phase 03 已交付：Consumer 受保护请求已迁移到 shared runtime。
- Phase 04 已交付：Admin login/MFA/session 主链路已迁移，首次 enrollment verify 能完成 AAL2 + recent proof 闭环。
- 当前工作区不存在归属不明的未提交修改。

如果 Phase 03 与 Phase 04 是由不同 agent 并行完成，集成负责人先核对：

```bash
git status --short
git branch --show-current
git log --oneline --decorate -12
git rev-parse HEAD
git rev-parse @{u}   # 仅当 upstream 已设置
```

若记录与实际 Git 不一致，先修正记录再继续。

---

## 2. 必读文档

按顺序阅读：

1. 仓库根 `AGENTS.md`。
2. `apps/admin/AGENTS.md`、`apps/template-preview/AGENTS.md`。
3. 本地已安装 Next.js 对应 `node_modules/next/dist/docs/` 中与 App Router、Route Handler、Client/Server boundaries、cookies/cache 相关的当前版本说明。
4. `docs/architecture.md`。
5. `docs/auth-security.md`。
6. `docs/api-sdk.md`。
7. `docs/development/contracts.md`。
8. 本计划目录 `00-master-plan.md`。
9. `verification-record.md` 当前真实记录。
10. `frontend-integration-contract.md`。
11. `references/Aisenhub_Frontend_Experience_State_Architecture.md` 中与 Auth 直接消费有关的 RemoteData、Mutation、Error、State Ownership、Responsive、Accessibility 章节。
12. Phase 01–04 文档及其交接记录。

若 Supabase Auth API 或 SSR 行为在 Phase 04 后又被相关代码触及，实施 agent 必须按仓库技能规则再次核对当前 Supabase changelog/docs，不凭记忆修改 API 用法。

---

## 3. 已核实的相关代码与调用链

本计划研究时已核实的 `main` 快照为：

`362db831d49308d0e5ca84965af80d86e944f56c`

执行时仍必须以本地分支实际代码为准。

### 3.1 Admin 尚需覆盖的页面范围

研究快照中 `apps/admin/app/admin/` 已存在以下受保护区域：

```text
apps/admin/app/admin/page.tsx
apps/admin/app/admin/audit/
apps/admin/app/admin/deletion-jobs/
apps/admin/app/admin/entitlements/
apps/admin/app/admin/files/
apps/admin/app/admin/platforms/
apps/admin/app/admin/subscriptions/
```

Phase 04 优先处理 login/MFA/session 主链路；本阶段负责逐一检查以上页面是否仍存在：

- 直接 `fetch('/api/...')` 且自行处理 401；
- 每页复制 `document.cookie` / `aisenhub-csrf` 解析；
- 手动拼 `Origin` / `X-CSRF-Token`；
- 自己调用 `/api/auth/refresh`；
- 收到 401 后无统一恢复或重复刷新；
- 用裸 `status` 文本把过期 session、MFA、权限与服务故障混在一起。

只有实际扫描确认存在时才修改，不因为计划列出了目录就强制触碰所有文件。

### 3.2 现有强安全边界必须保留

Consumer BFF 已核实包含：

- Origin + CSRF；
- HttpOnly session cookie；
- `no-store`；
- `request_id`；
- Idempotency-Key；
- If-Match；
- 有界上传体；
- 文件二进制上传不应自动重传。

Admin/Account API 的 AAL2、recent proof、服务端授权也必须保持。Browser Session runtime 只是会话恢复/请求编排层，不能成为授权权威。

### 3.3 已有测试入口

研究快照中已核实存在：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm healthcheck
pnpm contracts:check
pnpm build

pnpm --filter @kit/account-auth test:unit
pnpm --filter @kit/account-auth typecheck
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm --filter @kit/account-auth-nextjs typecheck
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter admin typecheck

pnpm test:api:t12-ordinary-proof
pnpm test:e2e:t12-r2
pnpm test:e2e:t16-r2
```

注意：

- 根 `test:api` 在研究快照中是 `not-enabled`，不能把它写成实际通过证据。
- `tests/spikes/e2e/t16-r2-account.mjs` 在研究快照中含机器特定 Deno 路径。是否会阻塞执行环境必须实际验证；不能提前声称失败或已修复。

---

## 4. 本阶段文件范围

### 4.1 预计修改：以实际扫描结果为准

候选文件包括：

```text
apps/admin/app/admin/page.tsx
apps/admin/app/admin/audit/**
apps/admin/app/admin/deletion-jobs/**
apps/admin/app/admin/entitlements/**
apps/admin/app/admin/files/**
apps/admin/app/admin/platforms/**
apps/admin/app/admin/subscriptions/**
```

以及 Phase 02/04 已建立的、**唯一** shared runtime / Admin adapter 文件。

如果 Phase 03/04 已建立 app 级 terminal cleanup / session recovery adapter，本阶段只复用并补齐覆盖；不要为 Admin remaining pages 再建第二套。

不要在这些页面各自新增新的 auth helper。

### 4.2 建议仅在确有需要时新增

如果 Phase 02 尚未提供跨 Tab 通知 primitive，可在 shared browser auth 层增加一个最小模块，例如：

```text
packages/account-auth-nextjs/src/auth-broadcast.ts
packages/account-auth-nextjs/tests/auth-broadcast.test.ts
```

如果 Phase 02 已将该能力放入 `browser-session.ts` 且职责清晰，则直接复用，不再新增文件。

### 4.3 文档

根据实际改动同步：

```text
docs/auth-security.md
docs/api-sdk.md              # 仅当公开/稳定 auth contract 有变
packages/account-auth/README.md
packages/account-auth-nextjs/README.md
```

以及本计划目录：

```text
verification-record.md
```

不要把动态实施状态重新写进稳定架构文档。

---

## 5. 冻结的跨 Tab 契约

### 5.1 唯一用途

多 Tab 通道只广播“本地会话已经发生终态变化”，用于其他 Tab 及时清除 UI 状态或导航。

建议稳定事件：

```ts
type AuthBroadcastEvent =
  | {
      version: 1;
      scope: 'consumer' | 'admin';
      type: 'logged_out';
      sourceId: string;
    }
  | {
      version: 1;
      scope: 'consumer' | 'admin';
      type: 'session_expired';
      sourceId: string;
    };
```

`sourceId` 只用于防止同一 document 回环处理，可以是当前 document 随机 ID；不得是 user/session/token/proof ID。

推荐 channel 名：

```text
aisenhub-auth-session-v1
```

### 5.2 禁止广播

绝不广播：

- access token；
- refresh token；
- session cookie 值；
- CSRF token；
- recent-auth proof；
- factor ID；
- OTP；
- 用户资料；
- entitlement/permission/authorization result；
- idempotency key。

### 5.3 作用域

- Consumer 只响应 `scope: 'consumer'`。
- Admin 只响应 `scope: 'admin'`。
- Admin logout 不应自动把 Consumer 会话解释为已注销，反之亦然；两者使用不同 access/refresh cookie 前缀。
- 本期**不实现跨 Tab refresh mutex**。single-flight 只保证同一 document 内一次 refresh。

### 5.4 降级行为

若运行环境没有 `BroadcastChannel`：

- 单 Tab 会话行为必须仍正确；
- 不新增 localStorage token/event 兼容层；
- 多 Tab 即时同步属于能力降级，不得导致授权放宽。

### 5.5 Matching-scope UI reaction

收到 `logged_out`：

- 当前 Tab 停止展示 protected content；
- 清 private/sensitive client state、resource detail、high-risk intent、one-time secret surface；
- 关闭 sensitive drawer/dialog/sheet；
- 不再发起新的 privileged mutation；
- 进入 login/unauthenticated surface；
- 不再 broadcast 同一事件形成回声；
- 不自动调用远端 logout。

收到 `session_expired`：

- 进入 expired recovery；
- 执行同等级 terminal cleanup；
- 使用 safe returnTo 保留安全 deep-link；
- 不把事件当服务端 authorization 证据；
- 不触发第二次 refresh/logout loop。

wrong scope / malformed / self source → ignore。

---

## 6. Replay 与受保护请求的最终规则

所有 Admin remaining pages 必须按照 Phase 02 唯一 replay matrix 迁移：

| 请求类型 | 自动 refresh | refresh 后自动 replay | 规则 |
|---|---:|---:|---|
| GET / HEAD | 是 | 是，最多 1 次 | `safe-read` |
| 普通 POST/PATCH/DELETE | 是 | 否 | `never`，session 恢复后提示用户重新提交 |
| 明确幂等 mutation | 是 | 条件允许，最多 1 次 | 只有 caller 明示 `idempotent-mutation`，保留同一 Idempotency-Key，body 可重复 |
| 二进制/stream 上传 | 是 | **永不** | `never`；恢复 session 后由业务状态查询/用户明确重试 |
| auth refresh/logout/MFA verify/enroll/OTP mutation | 不由通用 401 replay 驱动 | 否 | 专用 auth flow；factors GET 为 safe-read 例外 |

额外冻结：

- `If-Match` 本身不等于允许自动 replay。
- `RECENT_MFA_REQUIRED` / `MFA_REQUIRED` 是权限/认证升级状态，不触发 refresh 循环。
- 403 不作为 token refresh 触发器。
- 429 不自动重试，除非业务已有明确 Retry-After 策略；本期不另加。

---

## 7. 具体实施步骤

### Step 1 — 接手与基线核对

先更新 `verification-record.md` 的“项目与基线”，实际记录：

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

如果工作区有未提交改动：

- 判断归属；
- 不覆盖、不 stash 不属于本任务的用户修改，除非仓库/负责人明确要求；
- 在记录中写清归属和处理方式。

### Step 2 — 扫描旧 auth/session 路径

在本地使用项目可用搜索工具（例如 `rg`）扫描，至少覆盖：

```text
/api/auth/refresh
/api/auth/logout
payload?.data?.code
payload.data.code
aisenhub-csrf
X-CSRF-Token
x-csrf-token
AUTHORIZATION_UNAVAILABLE
UNAUTHORIZED
MFA_REQUIRED
RECENT_MFA_REQUIRED
response.status === 401
response.status === 403
```

同时扫描所有受保护 Admin 页面中的 `fetch(`。

把结果分三类记录：

1. 必须迁移的浏览器业务请求；
2. 必须保留的 Route Handler / E2E 显式安全头代码；
3. 与本期无关的代码。

不要机械删除所有 `aisenhub-csrf` 字符串：服务端验证、测试和唯一 shared adapter 仍然需要。

### Step 3 — 迁移 Admin remaining protected fetch

逐页处理实际存在的直接请求：

1. 从 Phase 04 的 Admin auth/session client 导入统一请求入口。
2. 为每个请求明确指定 replay policy；默认 `never`。
3. GET 读取使用 `safe-read`。
4. 高风险 mutation 若现有 API 已要求 Idempotency-Key，并且 body 可确定重放，则由 caller 明确启用 `idempotent-mutation`；否则 `never`。
5. `SessionRetryRequiredError`（或 Phase 02 最终命名）必须变成“会话已恢复，请重新提交操作”类可恢复状态，回到 confirm/submit-ready，而不能假装 mutation 成功或 generic failure。
6. `MFA_REQUIRED` / `RECENT_MFA_REQUIRED` 使用 Admin 已有 MFA/step-up 导航；保存的 intent 只含非敏感上下文。
7. step-up success 后先 refetch authoritative resource state；若 409/412/状态变化，显示 conflict/domain state，不直接重发旧 destructive request。
8. 读取请求处于 `refreshing` 时保留 last-known data；refresh 503/network 显示 recoverable warning，不清表格/详情。
9. 权限拒绝、业务冲突、validation failure 不触发 refresh。

### Step 4 — 多 Tab logout/session-expired 通知

在 shared browser 层实现或确认：

- `publishAuthEvent(event)`；
- `subscribeAuthEvents(handler)`；
- 无 BroadcastChannel 时安全 no-op；
- 监听器可销毁；
- event runtime validation（至少 version/scope/type）防止错误输入破坏状态；
- 收到自身 `sourceId` 时忽略；
- 收到 matching scope `logged_out`：本地 state 进入 `unauthenticated`，执行 terminal cleanup，关闭 sensitive surfaces，取消/终止后续受保护 UI 行为并导航到对应 login；
- matching scope `session_expired`：进入 `expired`，执行 terminal cleanup，保留安全 returnTo 后导航/显示 session expired 路径；
- 不调用远端 logout、不重复 refresh、不写 token。

#### Logout 广播时机

仅当本地 logout Route 已完成本地 cookie 清除并返回本期冻结的 completed-local-logout 成功响应后广播 `logged_out`。

远端 revoke 为 `unavailable` 时也仍是本地 logout 完成，因此广播 `logged_out`；UI 可以记录/展示“远端撤销未确认”的非敏感支持信息，但不能把用户留在已登录界面。

#### Session-expired 广播时机

只有 refresh 得到**确定性终态 401**、服务端已清除本地 session material 后广播 `session_expired`。

refresh 503/网络暂时失败不得广播 expired。

### Step 5 — 收口 Frontend Integration Contract

逐项核对 Phase 03/04 已交付行为，并补齐 remaining Admin pages：

1. `resolved:false` 只呈现 auth resolving，不误 redirect。
2. `refreshing` 保留 last-known data，禁止全页清空回 Skeleton。
3. refresh 503/network → recoverable error；不 terminal purge、不广播 expired。
4. refresh 401/logout → terminal cleanup：private cache/data、sensitive drawer/dialog、one-time secret、high-risk intent。
5. safe returnTo 恢复合法同源 path/query；external/敏感 URL 被拒绝。
6. `SessionRetryRequiredError` 与 business failure/unknown_outcome 分开。
7. MFA/recent-MFA 成功后 authoritative refetch，再重新确认 high-risk intent。
8. Browser recent-MFA indicator、BroadcastChannel、隐藏按钮均不作为授权权威。
9. Error 主文案不直接暴露 raw auth code；request id 可放 support/technical detail。
10. Auth 直接改动 surface 完成 320/375/390/768/1440px + keyboard/focus/alert/reduced-motion 基础回归。

不要借此 Phase 05 扩成完整 Frontend Experience UI 重构；只完成 Auth/Session 直接消费边界。

### Step 6 — 退出旧路径

完成迁移后再次扫描。

本期目标是：

- 页面层不再直接调用 `/api/auth/refresh`；
- 页面层不再复制 CSRF cookie parser；
- 页面层不再各自实现“401 → refresh → retry”；
- Consumer/Admin auth route envelope 不再同时长期依赖 `{data:{code}}` 和 `{error:{code}}` 两套失败解析；
- logout 页面不再无条件 redirect 而忽略本地 logout 是否真实完成；
- Admin MFA 页面不再把 factors API 故障显示成“没有因子”。

允许保留：

- shared auth adapter 内唯一 CSRF 提取；
- Route Handler 的 Origin/CSRF 校验；
- E2E 中为了负向安全测试而显式构造头；
- 服务端 Account API/BFF 授权判断。

### Step 7 — 文档同步

只更新已成为真实行为的稳定合同：

- logout 的 local-complete / remote-revocation status；
- browser session single-flight 范围；
- replay matrix；
- multi-tab 仅通知终态、不共享 credential；
- MFA enrollment verify → AAL2 + recent proof 的闭环；
- 5 分钟 recent proof 不因 refresh 延长。

不要把“测试已通过”“部署完成”等动态事实写进架构文档；这些只写 `verification-record.md`。

---

## 8. 用户操作流程与状态验收

### 8.1 Consumer — access token 过期

```text
Protected GET
 → 401
 → current tab state = refreshing
 → exactly one /api/auth/refresh
 → refresh succeeds
 → original GET replay once
 → state = authenticated
 → last-known data never had to be cleared
 → data renders
```

并发 3–10 个 GET 同时 401 时，同一 document 只允许一个 refresh 请求；其余请求等待同一 Promise/结果。

### 8.2 Consumer — refresh token 已失效

```text
Protected GET
 → 401
 → refresh
 → refresh 401 + cookies cleared
 → state = expired
 → broadcast session_expired
 → current/other Consumer tabs enter expired/login path
```

不得无限 retry。

### 8.3 Consumer/Admin — refresh 服务暂时 503

```text
Protected request
 → refresh attempted
 → refresh 503/network failure
 → transient auth error
```

要求：

- 不清除可能仍有效的 refresh cookie；
- 不广播 session expired；
- 不继续原受保护操作；
- 已有页面数据继续显示（若安全且存在），配合 recoverable warning/retry；
- 用户可明确重试。

### 8.4 Mutation 遇到过期 access token

```text
POST/PATCH/DELETE
 → 401
 → refresh succeeds
 → replay policy = never
 → no mutation replay
 → UI: session recovered, return to confirm/submit-ready, resubmit action
```

数据库/服务端不得出现双写。

### 8.5 文件二进制上传

```text
PUT content
 → auth failure/network ambiguity
 → never automatic replay body
 → use existing file status/read path or explicit user retry
```

不得为了“会话顺滑”自动重新发送原始字节流。

### 8.6 Multi-tab logout

```text
Tab A logout
 → origin/csrf valid
 → remote revoke attempted
 → local cookies cleared
 → route returns local logout complete
 → Tab A terminal cleanup + broadcasts logged_out
 → Tab B matching scope receives event
 → Tab B terminal cleanup
 → Tab B leaves protected UI
```

验证 Consumer 与 Admin scope 互不误伤；远端 revoke unavailable 时两个 Tab 都保持本地 logged-out，但 UI 不声称远端 revoke confirmed。

### 8.7 Deep-link session recovery

```text
/admin/platforms/<id>/files?q=unknown&status=deleting
 → session expired
 → login/MFA
 → safe returnTo
 → same deep-link restored
```

验证：

- external URL 被拒绝；
- token/proof/OTP/secret/mutation body 不进入 URL；
- target 不存在/权限变化时安全降级，不 redirect loop。

### 8.8 Step-up intent stale-state recovery

```text
destructive intent
 → RECENT_MFA_REQUIRED
 → step-up
 → proof success
 → refetch resource
 → resource/version changed
 → conflict/state-changed UI
 → no automatic old POST replay
```

---

## 9. 并发、失败与恢复专项

### 9.1 并发 refresh

必须有可重复的测试证明：

- 同一 document 只有一个 refresh Promise；
- refresh success 时等待者恢复；
- refresh 401 时等待者统一 expired；
- refresh 503 时等待者统一收到 transient failure；
- settling 后 single-flight 引用被清理，下一次未来 refresh 可重新发起。

### 9.2 Logout partial failure

模拟 upstream revoke 503：

- 本地 auth cookies 仍必须被清除；
- response 明确 `remote_revocation: 'unavailable'`；
- UI 进入 logged out；
- 不能声称 remote session 已确认 revoked；
- 不创建包含 access token 的重试队列。

### 9.3 MFA enrollment recovery

模拟：factor TOTP verification 已成功、recent-proof API 随后失败。

要求：

- UI 不显示“认证器绑定失败”导致用户重复 enroll；
- 重新读取 factors 能看到 verified factor；
- 用户可以走 existing-factor verify 再获取 recent proof；
- 不绕过 AAL2/recent proof。

### 9.4 Browser channel 生命周期

验证：

- listener cleanup；
- same source ignored；
- wrong scope ignored；
- malformed/unknown version ignored；
- matching terminal event 清 sensitive UI state；
- event handler 不再次 broadcast/refresh/logout 形成循环；
- unsupported BroadcastChannel 环境单 Tab 不崩溃。

### 9.5 Terminal cleanup vs transient failure

分别制造：

- logout accepted；
- refresh definitive 401；
- refresh 503/network。

前两者必须清 private/sensitive client state；第三种必须保留 last-known data，证明没有把 recoverable outage 错当 logout/expired。

### 9.6 RetryRequired vs Unknown Outcome

至少构造：

- 明确 401 → refresh success → `replay:never`：没有第二次 mutation，UI 可重新确认；
- response/network ambiguity：进入业务 unknown-outcome/state-query path，不提示“安全重试”替代 authoritative check。

---

## 10. 测试与验证计划

> 下列是**计划执行的测试**，不是本轮计划生成阶段已经运行的结果。实施 agent 只有实际运行后才能在 `verification-record.md` 中写退出码和结果。

### 10.1 静态与单元测试

优先运行受影响包：

```bash
pnpm --filter @kit/account-auth test:unit
pnpm --filter @kit/account-auth typecheck
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm --filter @kit/account-auth-nextjs typecheck
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter admin typecheck
```

然后全仓：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm healthcheck
```

如果本阶段实际改变了 OpenAPI/稳定 API contract：

```bash
pnpm contracts:check
```

若未改变，也可运行作为最终回归，但记录它验证的具体版本。

### 10.2 Auth/API/E2E

执行环境满足前置条件后：

```bash
pnpm test:api:t12-ordinary-proof
pnpm test:e2e:t12-r2
pnpm test:e2e:t16-r2
```

如既有脚本被机器特定 Deno 路径阻塞：

1. 在验证记录中保存真实错误；
2. 先确认仓库当前是否已有 portable Deno helper/环境变量；
3. 仅当它直接阻塞本期必要 auth E2E，做最小测试工具修复；
4. 不借机展开整个 DX 重构；
5. 修复后重新运行并保留失败→修复→复测链路。

### 10.3 Build

```bash
pnpm build
```

Build 是最终交付门槛之一，但如果仓库已有与本任务无关、可证明的基线失败，必须在记录中区分“基线失败”与“本阶段回归”，不能伪称通过。

### 10.4 浏览器手工验证

至少使用真实 Chromium/项目已有浏览器测试工具验证：

- Consumer desktop 登录→受保护页面；
- Consumer 320px、375px、390px、768px 与 1440px 登录/session expired/reauth；
- Admin 320px、375px、390px、768px 与 1440px 登录→MFA existing factor；
- Admin first enrollment → 单次 OTP → Admin；
- Admin MFA factors 500/503 不显示 empty-factor 文案；
- 两个 Consumer tab logout；
- 两个 Admin tab logout；
- Consumer logout 不误关闭 Admin scope；
- DevTools Network 中同一波并发 401 只有一个 refresh；
- response 包含约定的 `request_id` / `X-Request-Id`；
- HttpOnly access/refresh token 不进入 browser JS state/localStorage/sessionStorage；
- recent proof 仍为 HttpOnly，且 refresh 不延长 5 分钟窗口；
- Login/MFA/session-recovery keyboard-only 可完成，focus 恢复合理，错误/pending 可被 live region/alert 等价感知；
- MFA QR/manual secret 不溢出，不进入 URL/log/toast/persistent browser storage；
- refreshing 时 last-known data 保留，terminal cleanup 与 transient 503 行为可区分；
- safe returnTo deep-link 恢复与 external redirect 拒绝；
- step-up stale resource 不自动重发 destructive request。

截图/日志位置写入 `verification-record.md`；计划本身不预填。

---

## 11. 旧路径退出验收扫描

阶段收尾时重新搜索并逐条解释剩余匹配：

```bash
rg -n "/api/auth/refresh|/api/auth/logout|payload\?\.data\?\.code|payload\.data\.code" apps packages tests
rg -n "aisenhub-csrf|X-CSRF-Token|x-csrf-token" apps packages tests
rg -n "AUTHORIZATION_UNAVAILABLE|UNAUTHORIZED|MFA_REQUIRED|RECENT_MFA_REQUIRED" apps/admin apps/template-preview
```

验收不是“零匹配”，而是**每个剩余匹配都有正确归属**：

- shared adapter；
- Route Handler security validation；
- contract/error mapping；
- E2E/negative tests；
- 明确不在本期范围的页面。

浏览器业务页面不得残留第二套 session orchestration。

---

## 12. 本阶段明确不实施

以下内容放入后续专题，不因本阶段收尾而扩 scope：

- 跨 Tab distributed refresh lock/mutex；
- Service Worker auth coordinator；
- 全项目 API Client / ErrorPresenter / Admin/Consumer visual redesign 的完整统一（属于类别 04/02）；本期只实现 Auth 直接消费边界；
- 全项目结构化日志、metrics、trace（类别 05）；
- 正式重构所有 spike E2E 为 Playwright test runner（类别 06）；
- 修复所有本地启动/环境变量/Deno 可移植性问题（类别 07）；
- 权限结果缓存、JWT-only fallback、减少授权检查等任何安全降级；
- WebAuthn、SMS MFA、recovery codes 等新 MFA 产品能力；
- 部署、Release、main merge。

---

## 13. 阶段完成门槛

只有同时满足以下条件，Phase 05 才能标为“已交付”：

1. Phase 03/04 集成后无归属冲突，工作区差异已审查。
2. Admin remaining protected requests 中本期适用路径都接入唯一 session runtime。
3. Multi-tab logout/session-expired 通知按冻结 contract 生效且不传敏感数据；matching-scope UI terminal cleanup 生效且无事件回声。
4. `frontend-integration-contract.md` 的 resolved/refreshing/error/RetryRequired/step-up/returnTo/cache-cleanup/Auth responsive-a11y 适用项均有验证证据。
5. 旧页面手写 refresh / CSRF parser / 401 orchestration 已退出，剩余匹配均有合理归属。
6. Consumer/Admin 正常、401→refresh、refresh 401、refresh 503、MFA、logout remote outage、mutation no-replay、binary no-replay 所有必要 Local 用例均有实际 PASS 证据；任一必要项 NOT_RUN/FAIL 时只能 PARTIAL/BLOCKED，不得已交付。Staging/生产可单列 NOT_RUN，不能推定通过。
7. 受影响包测试、全仓健康检查、必要 E2E/build 实际运行；任何失败都据实记录，不得用“计划通过”代替实际结果。
8. 稳定文档只记录真实最终合同。
9. `verification-record.md` 已更新：实际修改、命令、退出码、失败/修复、浏览器证据、commit/push 信息均据实填写。
10. 检查 diff，确保没有 secret、`.env`、用户媒体、缓存、无关改动。
11. 创建有意义的本阶段 commit，例如：

```text
auth(session): phase 05 finalize session integration and regression
```

12. push 到本任务同一工作分支。
13. 确认远程分支包含对应代码 commit，并在记录中保存 branch、commit SHA、GitHub 链接与推送结果。
14. 若记录 commit 需要单独提交，允许追加一个 docs/record commit；不要为了让文件包含自身最终 SHA 反复 amend。

任何必要代码未验证、commit 未成功 push、或远程分支不含阶段提交时，都不能标为“已交付”。

---

## 14. 最终交接

本阶段完成后，向用户/集成负责人交付：

- 本期最终分支名；
- Phase 01–05 各代码 commit SHA；
- verification-record commit SHA；
- GitHub 远程链接；
- 实际执行的测试与剩余未验证项；
- 已知基线失败；
- 仍存在但属于后续类别的事项；
- 未提交工作区修改及其归属；
- 需要用户决定的事项，没有则写“无”。

到此停止。**不要自动合并 main、不要部署、不要创建 Release。**

## 15. R1 最终门槛（ASU-05）

回归 ASU-V01～ASU-V13；新增 ASU-V14：双 Tab terminal hint、迟到 refresh/MFA/login/callback、logout remote outage、reload 后 fence gate、同 hostname Admin/Consumer Cookie 隔离。BroadcastChannel 不可用时也须证明服务器 gate 正确；不要求即时清另一 Tab，但恢复焦点/下一请求时验证终态并清理，不把广播当授权。

新增 ASU-V15 安装产物验收，顺序执行：

```bash
pnpm sdk:pack
pnpm test:sdk:m5-02
pnpm test:registry:m5-04
pnpm test:consumer:m5-05
```

核对并按新合同更新这些已有测试的 Cookie/导出/fixture 预期；禁止删负向断言。scope 加入 `registry/**`、三个测试及必要 SDK packaging adapter。独立 Consumer 必须来自本次 tarball并复制新 helper，不能依赖 monorepo 源码路径或旧 dist。若通用 SDK 测试未调用新 browser export，补真实导入/构建用例；必要时修复模板文件清单与兼容说明，不发布 npm/Registry。

新增 ASU-V16：两个应用 Auth surface 在 320/375/390/768/1440px 验证无横向溢出、键盘可完成、focus/alert/pending 正确。测试矩阵记录实际 viewport，不能用 desktop 截图替代。

最终交接向用户已有完整 Frontend 计划提供：本次真实代码 SHA、包 exports、SessionSnapshot/stepUp、epoch 使用方式、scoped Cookie 与 fence 协议、proof 部分成功、错误/RetryRequired 映射、通过用例及 Staging 缺口。下一计划以这些实现结果为上游；旧 Auth 快照须在其开始时核对，不能复制旧合同。本阶段完成后停止，不自动执行 Frontend 计划。
