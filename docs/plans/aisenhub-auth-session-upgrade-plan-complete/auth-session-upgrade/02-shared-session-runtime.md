# 02 — Shared Browser Session Runtime

> 上游：[01-contract-and-logout-foundation.md](./01-contract-and-logout-foundation.md)  
> 跨阶段消费合同：[frontend-integration-contract.md](./frontend-integration-contract.md)  
> 状态：**未开始**

## 1. 目标

在 shared auth package 建立唯一 Browser session orchestration：

- `SessionState + resolved`
- `AuthSessionManager`
- single-flight refresh
- replay policy
- CSRF mutation helper
- typed “refresh 已成功，但原 mutation 不可自动重放”结果
- 为 Frontend 提供稳定的 terminal/session/retry 机器语义，不依赖 React 或 `@kit/ui`
- 单测冻结状态机、并发行为与 UI 消费边界

本阶段主要是共享 runtime；不进行全站页面迁移。

## 2. 前置条件

Phase 01 必须已验收、commit、push，record 有最终合同和 SHA。

重读：

- `packages/account-auth/src/index.ts`
- `packages/account-auth-nextjs/src/index.ts`
- `packages/account-auth-nextjs/src/browser.ts`
- 两包 tests
- `docs/auth-security.md`
- `docs/api-sdk.md`
- `frontend-integration-contract.md`
- `references/Aisenhub_Frontend_Experience_State_Architecture.md`（只读消费相关章节）
- Phase 01 record/handoff

## 3. 已核实事实

已有：

- pure AuthSession/RecentAuthProof/safe-returnTo。
- server/per-request Supabase auth helpers。
- cookie write/clear。
- refresh/revoke/MFA wrappers。
- browser Supabase client factory。

缺少：

- browser session state machine。
- shared 401 handling。
- single-flight refresh。
- retry/replay policy。
- multi-page request wrapper。

## 4. 修改/新增文件

### 修改

- `packages/account-auth/src/index.ts`
  - 导出 frozen `SessionState` / `SessionSnapshot` / `ReplayPolicy` framework-agnostic type。
  - 不加入 browser/Next 实现。
- `packages/account-auth/tests/auth.test.ts`
  - 可加入纯合同测试；若明显过大才新增专用测试。
- `packages/account-auth-nextjs/src/browser.ts`
  - 导出 browser-session runtime。
  - 保留已有 browser Supabase factory。
- `packages/account-auth-nextjs/tests/adapter.test.ts`
  - 保留 server adapter tests。

### 建议新增

- `packages/account-auth-nextjs/src/browser-session.ts`
  - Browser-only manager。
  - 不 import server cookie writer。
  - 不存 token。
- `packages/account-auth-nextjs/tests/browser-session.test.ts`
  - 用现有 Vitest/mock fetch 测并发、状态、replay。

如 pure state cases 很多，可新增 `packages/account-auth/tests/session-state.test.ts`；不要为凑文件拆层。

## 5. 唯一 Runtime Contract

### 5.1 Config

```ts
type AuthScope = 'consumer' | 'admin';

type BrowserAuthConfig = {
  scope: AuthScope;
  loginUrl: string;
  refreshUrl: string;
  logoutUrl: string;
};
```

路径由 app 实例化传入，manager 不读 server env。

### 5.2 Snapshot

```ts
type SessionSnapshot = {
  state:
    | 'unauthenticated'
    | 'authenticating'
    | 'authenticated'
    | 'refreshing'
    | 'mfa_required'
    | 'expired';
  resolved: boolean;
  stepUp: null | 'admin_mfa' | 'admin_recent_mfa' | 'consumer_recent_auth';
};
```

### 5.3 Public API

以职责为准，不要求机械同名，但不得缺失等价能力：

```ts
getSessionState()
subscribe(listener)
login(...)
refresh()
logout()
request(input, init, { replay })
markStepUpRequired(kind)
completeAuthentication(kind) // 只由对应服务端认证成功结果调用，不由任意 GET 调用
destroy()
```

禁止导出 token/proof getter。

### 5.4 CSRF

- Browser helper 只读取现有 CSRF cookie。
- Mutation request 自动附 `X-CSRF-Token`。
- 不手工伪造 `Origin`；真实浏览器 Origin 由 User Agent 产生，服务端继续校验。
- Node E2E probe 可按测试需要显式 Origin。

### 5.5 Single-flight

```text
request
  ↓
401?
  no → return
  yes
  ↓
already refreshPromise?
  yes → await same promise
  no  → create one refreshPromise
  ↓
refresh result
  ├─ success
  │    ├─ safe-read → replay once
  │    ├─ valid idempotent mutation → replay once
  │    └─ never → RetryRequired
  ├─ 401 → expired
  └─ 503 → restore prior resolved state + surface unavailable
```

`refreshPromise` 必须在 `finally` 中释放。

### 5.6 RetryRequired

对于 `replay:'never'`：

- 原请求 401。
- manager 可以 refresh。
- refresh 成功后**不发送第二次 mutation**。
- 调用方得到明确 client orchestration 类型，例如 `SessionRetryRequiredError`。
- 页面提示用户重新提交，而不是误导为“请重新登录”。
- 该 client error 不进入 server `ApiErrorCode`。

### 5.7 Idempotent Mutation

只有全满足才可 auto replay：

1. caller 显式 `idempotent-mutation`。
2. 非 auth endpoint。
3. `Idempotency-Key` 已存在且不变。
4. body 可重复读取。
5. 非 binary/file stream。
6. 原请求最多 replay 一次。

caller 错标 binary 时 manager 必须 fail-fast，不能二次发送。

### 5.8 Frontend 消费边界

Shared runtime 不直接依赖 React、Next page component、`@kit/ui`、Toast 或任何视觉组件。它只输出稳定、可测试、无敏感数据的机器语义。

#### SessionSnapshot

Frontend 必须能仅通过 `subscribe/getSessionState` 区分：

```text
resolved=false      → auth resolving
refreshing          → background session recovery
mfa_required        → step-up required
expired             → terminal session recovery
unauthenticated     → resolved logged-out
```

runtime 不提供诸如 `showSpinner`、`redirectNow`、`isAuthorized` 的 UI/授权 shortcut。

#### RetryRequired

`SessionRetryRequiredError` 或等价结果：

- 只表达“refresh 成功，但原 `replay:never` mutation 未被重放”；
- 不携带完整 request body、token、cookie、proof、OTP、secret；
- 可以包含非敏感、诊断所需的 stable reason/request id（仅当现有 contract 安全提供）；
- 由 app 映射到 Frontend Mutation 的“重新确认/重新提交”状态，不等价于 business failure。

#### Terminal transition

runtime 必须让 app 能稳定观察：

- logout accepted → `unauthenticated,resolved:true`；
- refresh definitive 401 → `expired,resolved:true`；
- refresh 503/network → 不发生 terminal transition。

app 据此执行 sensitive cache cleanup；runtime 本身不直接清 React Query/页面业务 cache。

#### MFA / Permission distinction

- `MFA_REQUIRED` / `RECENT_MFA_REQUIRED` → `mfa_required`。
- 普通 permission/domain 403 不得误标成 session expired，也不得触发 refresh。
- stable server error code 必须继续可供上层 Error Presenter 分类。

### 5.9 ReturnTo 边界

Shared package 已有 safe-returnTo primitives；本阶段必须核对并冻结其真实语义供 Phase 03/04 使用：

- same-origin/application path 安全约束；
- 可恢复 path/query/deep link 的能力以现有代码为准；
- 不接受任意 external URL；
- 不传 token、OTP、proof、CSRF、secret 或 mutation body。

若现有 helper 不支持 Frontend 所需的安全 path+query 语义，先用纯函数单测明确缺口，再做最小扩展；不得在两个 app 各写一套 returnTo sanitizer。

## 6. 状态流转不变量

- 初始 `resolved:false` 不触发 redirect。
- login pending → `authenticating`。
- 当前 epoch 的 protected success 只确认会话存在，保留已有 stepUp；不能覆盖新终态。
- Admin password login 的最终状态由 app 标 `mfa_required`，不能 manager 擅自视为 fully authorized。
- 401 → `refreshing`。
- refresh 401 → `expired,resolved:true`。
- refresh 503 → 不变成 definitive expired。
- MFA/RECENT_MFA code → `mfa_required`，不 refresh。
- logout accepted → `unauthenticated,resolved:true`。
- `resolved:false` 不允许被上层解释成 definitive logged-out。
- `refreshing` 必须是可区分的 background recovery state，不能强制上层清空 last-known data。
- terminal state 与 transient unavailable 必须可被 app 无歧义区分。

## 7. 实施步骤

1. 在 pure package 冻结 state/replay types。
2. 先写 browser-session failing unit cases。
3. 实现 snapshot + subscribe。
4. 实现 login 状态转换。
5. 实现 refresh single-flight。
6. 实现 request 401 interception。
7. 实现 safe-read replay once。
8. 实现 explicit idempotent guard + replay。
9. 实现 RetryRequired。
10. 实现 logout 调 Phase 01 contract。
11. 实现 MFA code → state 映射。
12. 收敛 CSRF header 构造。
13. 冻结 SessionSnapshot → Frontend consumption、RetryRequired、terminal transition 的无 UI 依赖机器语义。
14. 核对/补齐 safe returnTo pure helper 的 deep-link 安全语义；不在 app 复制 sanitizer。
15. 确认 browser bundle 不引用 Node/server-only module，也不依赖 React/`@kit/ui`。
16. 运行 package unit/typecheck。

## 8. 必测并发和边界

1. 三个并发 GET 同时 401 → `/refresh` 恰好一次。
2. 三个请求等待同一 refresh Promise。
3. refresh success → safe reads 各 replay 最多一次。
4. replay 再 401 → 停止并返回明确恢复错误，不再 refresh，不作为成功；只有 refresh 明确 401 广播 expired。
5. refresh 401 → expired。
6. refresh 503 → 不清成 definitive expired，不 redirect loop。
7. MFA_REQUIRED/RECENT_MFA_REQUIRED → mfa_required，无 refresh。
8. mutation 默认 never。
9. idempotent mutation 没 key → 拒绝 replay。
10. idempotent mutation同 key → replay 一次且 key 不变。
11. binary/stream → 拒绝 replay。
12. `/refresh` 自身失败不递归。
13. unsubscribe/destroy 后不再接收状态。
14. manager 不包含 token 字段。
15. error/console 不打印 credential。
16. `resolved:false` 不触发 terminal/redirect callback。
17. refresh 503 不触发 terminal state；上层可保留 last-known data。
18. RetryRequired 不携带原 mutation body/credential。
19. permission 403 不误进入 refresh/expired。
20. safe returnTo 拒绝 external URL 和敏感参数场景；有效 app deep-link 行为按实际 helper 合同测试。

## 9. 测试命令

```bash
pnpm --filter @kit/account-auth test:unit
pnpm --filter @kit/account-auth typecheck
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm --filter @kit/account-auth-nextjs typecheck
pnpm format:check
pnpm lint
pnpm typecheck
```

本阶段不要求完整 E2E，因为尚未全面接入 app；package-level concurrency tests 必须实际运行。

## 10. 旧路径退出要求

本阶段不删除 app 直连 fetch，但必须冻结：

- SessionManager 是后续唯一目标实现。
- 不保留第二个 `authFetch` prototype。
- Phase 03/04 不得各写一套 refresh Promise。
- app-specific 行为通过 manager option/明确调用点表达，而不是复制 manager。

## 11. 阶段完成门槛

- shared runtime unit tests 实际通过并记录。
- Frontend consumption contract 的 resolved/refreshing/MFA/expired/RetryRequired/terminal cases 有单测证据。
- safe returnTo 的实际支持范围已测试并交接，两个 app 不需各写 sanitizer。
- browser boundary 无 server-only import、无 React/`@kit/ui` 依赖。
- 无新外部依赖，或偏差记录说明必要性。
- `verification-record.md` 更新，并据实记录实际命令、退出码、commit/push。
- diff 检查。
- commit，例如：`auth(session): phase 02 add single-flight browser session runtime`
- push 成功并记录 SHA/链接。
- 进入 Phase 03/04 前 remote branch 已含 Phase 02。

## 12. 交接

向 Consumer/Admin 阶段提供：

- manager import/export 路径。
- app config 参数。
- frozen SessionSnapshot。
- ReplayPolicy。
- RetryRequired 类型。
- error→state 映射。
- Frontend consumption mapping：resolved/refreshing/mfa/expired/RetryRequired/terminal。
- safe returnTo helper 的实际语义与测试结果。
- CSRF helper 用法。
- 不得修改的 shared contract。

## 13. R1 Runtime 收口（ASU-02）

实现 master §2.10 D：epoch/generation、迟到响应丢弃、专用认证写操作排序、logout pending gate、独立 stepUp、同源请求白名单。`subscribe/getSessionState` 的 snapshot 保持稳定引用直到实际变化；构造与 SSR import 不访问 window/document，浏览器实例延迟建立，避免服务端进程共享 singleton。测试覆盖 Strict Mode 重挂载与 destroy。

同代次 refresh 成功后的迟到 401 使用该结果；503/429 不触发连续自动重试，用户显式 retry 才开启下一恢复尝试。异常、abort、logout 拒绝时均释放 pending 状态；logout 本地校验失败保留服务端实际会话并展示错误，但旧 epoch 请求仍不可回填。

新增接口提供非敏感响应代次校验，供页面在 await body 后、写 cache/state 前检查；不能只在 fetch Promise 返回时检查。epoch 是 UI 并发控制，不是服务器会话证明。401 safe-read 例外只包括 protected BFF GET/HEAD 和 MFA factors GET；login/refresh/logout/MFA verify/OTP mutation 不经通用 replay。

| ID | 必须实际运行的用例 |
|---|---|
| ASU-V07 | 三个 401 同时/错峰到达（包括 refresh finally 后）；同 generation 只刷新一次；每个 read 最多重放一次 |
| ASU-V08 | logout、expired、重新登录、destroy 后旧 fetch/body decode 完成：不更新 snapshot/cache，不重放；logout pending 不启动新的 mutation |
| ASU-V09 | factor GET/其他 GET/refresh 成功不清 admin_mfa/admin_recent_mfa；Consumer recent-auth 进入邮件 flow；只有相应认证完成清 stepUp |
| ASU-V10 | refresh 503/network/429 恢复原约束、可 retry、不 terminal；replay 401 无循环；外部 URL 不携带 CSRF、不发送请求 |

包产物 exports 指向 dist：首次依赖检查/新导出消费前先运行 `pnpm sdk:pack`，不能用旧 dist 的 typecheck 代替源码构建。Node ESM 相对导入使用构建可重写的明确扩展名，浏览器 entry 不引入 server-only 代码。
