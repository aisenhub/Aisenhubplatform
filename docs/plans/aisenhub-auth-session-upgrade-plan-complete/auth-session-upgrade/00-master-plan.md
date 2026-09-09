# 00 — Authentication & Session 总执行计划

> 当前计划目录：`docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/`  
> 目标模块：`01. Authentication & Session`  
> 本文状态：**产品代码已按 Phase 01–05 实施；Local 单测、类型、合同、SDK 与真实 Supabase 浏览器回归见 verification-record.md；Staging/生产仍单列**  
> 研究仓库：`https://github.com/aisenhub/Aisenhubplatform`  
> 远端产品代码研究快照：`main@362db831d49308d0e5ca84965af80d86e944f56c`（2026-09-09）  
> 最新文档决定核对：`main@0d42b4cd44a2c17777c33f616bd393c22ee78f16`；该提交相对上述代码快照仅修改文档，没有实施本计划产品代码。  
> 新增上游输入：`Aisenhub_Frontend_Experience_State_Architecture.md`，用于冻结 Auth 与 UI 的消费合同。  
> 注意：上述 SHA 都只是本轮制定计划时核实的远端事实，不代表后续实施时的本地起始 SHA。

## 0. 使用前必填输入

执行 agent 开始任何产品代码改动前，必须把下列值写入 `verification-record.md`：

- 项目绝对路径：`E:\Projects\Aisenhubplatform`（本次审查已核对；迁移机器时重新核实）
- GitHub 仓库：预期 `aisenhub/Aisenhubplatform`，执行前以 `git remote -v` 核实
- 工作分支：沿用产品实施任务已有分支；若没有，创建 `codex/auth-session-upgrade`。先确保分支含本次 R1 文档提交，不把文档修订分支误当已实施的产品分支
- 起始 commit：执行前以本地 `git rev-parse HEAD` 核实
- 工作区已有修改：执行前以 `git status --short` 核实，不覆盖用户已有工作
- 本计划保存目录：`docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/`，不建立第二份

本计划不假设用户本地路径、分支、依赖安装状态、Local Supabase 状态或现有未提交修改。

---

## 1. 用户问题与目标行为

当前 Auth/Sessions 的服务端安全基础已经较成熟，但 Browser → Next BFF → Supabase/Auth → Account API 之间缺少统一的浏览器会话编排，导致：

1. Login、Refresh、Logout、MFA 页面各自直接 `fetch`、各自解析响应。
2. Login 与部分 MFA 路由使用 `{data:{code}}` 表达失败，而 Refresh/BFF 已使用 `{error:{code,message}}`，与项目既定 `ApiErrorResponse` 不一致。
3. 多个并发 401 没有统一 single-flight refresh；页面也没有统一“refresh 成功后可否重放”的规则。
4. Logout 在 Supabase revoke 暂时失败时会在清理本地 Cookie 前直接返回 503，用户仍停留在本地登录状态。
5. Admin MFA 的“无已验证 factor”与“factor API 失败”在 UI 中被合并成同一种状态。
6. Admin 首次绑定 TOTP 后，`enroll/verify` 已完成真实 challenge 并取得 AAL2 session，但当前 UI 还要求再次输入一个 OTP 才调用 recent-proof 签发流程。
7. Consumer/Admin 业务页面各自处理 CSRF、401、错误码和 logout，后续很容易出现语义漂移。
8. 多 Tab logout/session-expired 没有统一的浏览器内协调提示。

本期目标是形成一个**统一、可预测、可恢复且不削弱安全边界的 Authentication & Session 闭环**。

最终用户行为：

```text
Login
  ↓
authenticated / mfa_required
  ↓
Protected request
  ├─ 2xx → 正常
  ├─ 401 → single-flight refresh
  │          ├─ 成功 → 按冻结 replay policy 处理
  │          ├─ 401 → expired
  │          └─ 503 → 暂时不可用，不伪造会话失效
  ├─ MFA_REQUIRED / RECENT_MFA_REQUIRED → mfa_required
  └─ 其他业务错误 → 原样进入业务错误处理

Logout
  ↓
校验 Origin + CSRF
  ↓
尝试远端 revoke
  ↓
始终清除当前浏览器本地会话材料
  ↓
返回明确 remote_revocation 结果
```

---

## 2. 已确定的架构决定

以下为本任务跨阶段唯一权威契约。实施 agent 不得自行另起一套设计。

### 2.1 Token 与 Cookie 所有权

- Access token、refresh token 继续保存在现有 HttpOnly Cookie 中。
- Browser SessionManager **不得持久化、复制或暴露 access/refresh token**。
- 不把 token 写入 LocalStorage、SessionStorage、React state、BroadcastChannel、日志或 URL。
- CSRF Cookie 保持可读、按 scope 隔离，有效期覆盖 refresh Cookie 的 30 天窗口；用于同源 mutation header，不是认证凭据。
- Admin 与 Consumer 继续使用不同 access/refresh cookie 前缀。
- recent-auth proof 改为 scope 专属 HttpOnly Cookie（§2.10），5 分钟窗口不变。
- 普通 refresh **不得延长 recent-auth proof**。

### 2.2 Session 状态契约

使用现有架构方向中的状态：

```ts
type SessionState =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'refreshing'
  | 'mfa_required'
  | 'expired';
```

为避免首次加载时误把“尚未观察到 Cookie 状态”当成确定未登录，状态快照必须另外带：

```ts
type SessionSnapshot = {
  state: SessionState;
  resolved: boolean;
  stepUp: null | 'admin_mfa' | 'admin_recent_mfa' | 'consumer_recent_auth';
};
```

规则：

- 初始为 `{ state: 'unauthenticated', resolved: false, stepUp: null }`。
- `resolved: false` 不得触发自动登出或登录页重定向。
- 当前会话代次的成功 login / protected request 可确认会话存在；不得覆盖更新的终态或清除已有 stepUp。只有对应的显式认证完成事件可清除 stepUp，详见 §2.10。
- Admin 密码登录后 → `mfa_required, resolved:true, stepUp:'admin_mfa'`。
- 原请求 401 → `refreshing`。
- Refresh 明确返回 401 → `expired, resolved:true`，服务端同时清理本地 auth Cookie。
- Refresh 返回 503 → 不把会话伪造为“已过期”；恢复到 refresh 前已解析状态并向调用方返回 `AUTHORIZATION_UNAVAILABLE`。
- `MFA_REQUIRED` / `RECENT_MFA_REQUIRED` 不触发 refresh；按 scope 设置 stepUp，进入兼容展示态 `mfa_required`。Consumer 使用邮件 reauth，不能被引导至 TOTP。
- Logout 本地清理成功 → `unauthenticated, resolved:true`。

Browser state 只是交互编排，不是授权事实。服务端仍为唯一权限判定权威。

### 2.3 401 与 Single-flight Refresh

- 同一浏览器文档中，同时出现多个 401 时只能有一个 `/api/auth/refresh` in-flight Promise。
- 其他请求等待同一个 refresh 结果。
- Refresh endpoint 自身绝不能再次经过自动 refresh wrapper，避免递归。
- 一次原请求最多触发一次 refresh，最多自动 replay 一次。
- 不允许 refresh loop。

### 2.4 Replay Policy

统一三档：

```ts
type ReplayPolicy =
  | 'never'
  | 'safe-read'
  | 'idempotent-mutation';
```

冻结规则：

| 请求 | 默认策略 | refresh 成功后的行为 |
|---|---|---|
| GET / HEAD | `safe-read` | 自动重放一次 |
| POST/PATCH/PUT/DELETE | `never` | 不自动重放；返回“session 已恢复但需要用户重新提交”的客户端结果 |
| 明确幂等 mutation + 同一 `Idempotency-Key` | 调用方显式 `idempotent-mutation` | 仅满足可重复 body 时自动重放一次 |
| Binary / stream / 文件 content PUT | **必须 `never`** | 永不自动重传 |
| 仅有 `If-Match`、无幂等键的 mutation | `never` | 不自动重放 |
| 登录/refresh/logout/MFA/OTP 发送 | `never` | 不由 wrapper 自动重放 |

额外不变量：

- 自动 replay 时不得生成新的 Idempotency-Key。
- 对 `ReadableStream`、文件字节流或不能安全 clone 的 body，manager 必须拒绝 `idempotent-mutation` 自动 replay。
- 上传断线或 401 后继续沿用项目既有“先查询状态，再由用户明确重试”的语义。
- 不把“401 一定发生在副作用之前”作为安全假设。

### 2.5 Logout 语义

本期采用前序架构讨论已经确定的方向：

1. 请求先通过 Origin + CSRF 校验；校验不通过时不执行 logout。
2. 有 access token 时显式调用 Supabase `/auth/v1/logout?scope=local`；无 access 但有 refresh 时本期不为 logout 另行刷新，返回 unavailable。撤销调用必须有有界超时（默认 5 秒），超时仍完成本地退出。
3. 无论远端 revoke 成功还是暂时不可用，只要本地安全校验已通过，都清除：access cookie、refresh cookie、CSRF cookie、recent-auth proof cookie。
4. **绝不把远端 revoke 失败伪装成 revoke 成功。**

Auth route 成功响应冻结为：

```ts
type LogoutResult = {
  authenticated: false;
  remote_revocation: 'confirmed' | 'not_required' | 'unavailable';
};
```

- `confirmed`：Provider 成功响应已确认 local revoke，或固定版本的可验证错误语义明确证明目标 session 已不存在；不得把任意 401/403 当成功。
- `not_required`：请求进入时 access 与 refresh Cookie 均不存在；这只表示本浏览器没有待撤销材料，不证明其他 Provider session 不存在。
- `unavailable`：远端撤销调用失败/不可用，但本地会话已清除。
- 本期不增加持久化 revoke retry queue，不保存 refresh/access token 用于后台重试。
- 若实施时发现仓库已经存在“不依赖浏览器 token、可按 session_id 完成中央撤销”的正式能力，先在阶段记录中给出证据，再由集成负责人决定是否复用；不得假造该能力。

安全残余必须如实记录：远端 revoke 在故障时未确认，Provider 侧 session 可能继续存在至服务端后续判定/生命周期结束。本项目现有敏感请求仍必须执行 session 状态检查，不能因此放宽。

### 2.6 Auth JSON Envelope

项目既有 `packages/domain/src/contracts/api.ts` 与 `docs/api-sdk.md` 已冻结：

成功：

```ts
{ data: T; request_id: string }
```

失败：

```ts
{
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string>;
  };
  request_id: string;
}
```

本期只统一 Authentication & Session 相关的 JSON route；不借机重构所有业务 API。

所有相关 JSON response：

- `Cache-Control: no-store`
- `X-Request-Id` 与 body `request_id` 一致
- UI 机器判断只看 `error.code`
- 不把 raw Supabase error、SQL、token、MFA secret 写入响应

### 2.7 MFA

- Admin 服务端 AAL2 + Admin 身份仍为授权硬条件。
- recent proof 必须服务端签发，绑定当前 user/session/factor，5 分钟。
- 浏览器不能自行构造 proof。
- Factor list：200 + `factors=[]` 才是“没有已验证因子”；factor GET 的首次 401 先刷新并最多重读一次；仅 refresh 明确 401 才是会话终态；429 是 rate limit；503 是服务不可用。
- 当前 `enroll/verify` 已执行 `challengeAndVerify` 并获得 elevated AAL2 session。官方 Supabase 当前文档也明确 enrollment verify 会把当前 session 提升为 AAL2。因此首次绑定成功后，应复用同一个 server-side recent-proof 签发 helper，在**同一次已验证 MFA 事件**上签发 proof，不要求用户再输第二个 OTP。
- 这不是降低验证强度；是移除同一安全事件后的重复输入。

### 2.8 Multi-tab

- 使用 `BroadcastChannel` 只传递会话生命周期提示，不传 token/proof/CSRF。
- 事件必须带 `scope: 'consumer' | 'admin'`。
- 至少支持 `logged_out`、`session_expired`。
- Broadcast 不是授权来源；收到提示也不能跳过服务端验证。
- 本期只保证**单 Tab** single-flight refresh；不实现跨 Tab 分布式 refresh lock。

### 2.9 Auth ↔ Frontend Experience 消费合同

新的 Frontend Experience 架构不改变以上 Auth 安全核心，但增加一个跨阶段唯一权威：

- 详见 [`frontend-integration-contract.md`](./frontend-integration-contract.md)。
- `resolved:false` 是 auth resolving，不得显示成“未登录”或触发错误 redirect。
- `refreshing` 必须保留 last-known protected data，不把页面清空回 initial Skeleton。
- refresh 503/network 是 recoverable state，不得伪造 `expired`。
- `MFA_REQUIRED` / `RECENT_MFA_REQUIRED` 是正式 `step_up_required` UI 状态，不是普通 failure toast。
- `SessionRetryRequiredError` 表示 session 已恢复但原 unsafe mutation 不可自动重放；UI 回到可确认/可提交状态。
- MFA/reauth 成功后先恢复 route/context、重新读取 authoritative resource state，再决定是否由用户重新确认；禁止无条件重发旧 destructive request。
- safe returnTo 要尽可能保留同源 deep-link/query，但不得在 URL 放 token、OTP、proof、CSRF、secret 或 mutation body。
- logout / definitive expired 必须清理 sensitive client cache、resource detail、one-time secret 和高风险 intent；refresh 503 不做 terminal purge。
- matching-scope multi-tab terminal hint 必须停止 protected UI、清敏感状态并进入恢复界面；不能只 Toast 后继续操作。
- Admin Security 是 Auth 的展示面，不是新的授权实现；Browser recent-MFA indicator 永远不替代 server proof validation。
- Auth 页面本身需要覆盖 320/375/390/768/1440px 的响应式与 keyboard/focus/alert 基础可访问性。

Auth、Frontend、API、Business Workflow 的所有权边界冻结为：

```text
Authentication & Session → session lifecycle / refresh / logout / MFA / replay permission
Frontend Experience       → UI surface / pending / dialog / responsive / accessibility / URL context
API Contract              → envelope / error code / request_id / DTO / idempotency contract
Business Workflow         → resource lifecycle / operation semantics / retry safety
```

Frontend 不得为了体验再造第二套 refresh、authorization cache 或 replay layer。

---

### 2.10 R1 审查后冻结的补充合同（ASU-R1，2026-09-09）

本节为待实施设计，不宣称现有代码已经具备这些能力。Phase 01–05 的任务 ID 固定为 ASU-01～ASU-05；本轮文档修订为 ASU-R1。同一规则以本节为准，阶段文档负责实施与验收。原架构的领域授权不变量继续有效。

#### A. Cookie 生命周期与部署隔离

| 材料 | Consumer | Admin | 生命周期 |
|---|---|---|---|
| access | `aisenhub-session` | `aisenhub-admin-session` | 保留现有 access TTL |
| refresh | `aisenhub-refresh-token` | `aisenhub-admin-refresh-token` | 30 天 |
| CSRF | `aisenhub-consumer-csrf` | `aisenhub-admin-csrf` | 30 天，成功 refresh 续期并保留当前值 |
| recent proof | `aisenhub-consumer-recent-auth-proof` | `aisenhub-admin-recent-auth-proof` | 5 分钟；refresh 不写入、不延长 |
| logout fence | `aisenhub-consumer-logout-fence` | `aisenhub-admin-logout-fence` | 31 天，只有 terminal clear 写入新的随机值 |
| login acknowledgement | `aisenhub-consumer-login-ack` | `aisenhub-admin-login-ack` | 最长 30 天，只有新登录成功写入 |

统一通过 shared cookie-name helper 获取名称。Cookie 均为 host-only、Path=/；生产 Secure，CSRF 可读，其余 HttpOnly；proof 使用 SameSite=Strict，其他至少 Lax。不设置共享父域 Domain。不同端口不隔离 Cookie：验收必须包含同 hostname 不同端口的 Admin/Consumer；不同 Consumer 平台使用不同 hostname，不承诺同 hostname 部署多个 Consumer。

旧共享 `aisenhub-csrf` / `aisenhub-recent-auth-proof` 不再被新消费者读取；不能把旧 proof 复制到新 scope。升级已有浏览器允许一次明确重新登录，登录后生成 scoped CSRF。缺少新 CSRF 时提示重新登录，不删除其他应用 Cookie、不跳过 CSRF、不反复 refresh。本期不做双 Cookie 协议长期兼容。更新两个 BFF、auth/callback/password/reauth/MFA、SDK tests、全部 E2E fixture 中的名称引用。

#### B. Local logout 与可信撤销结果

revoke helper 显式 local scope；全局删除等全局操作保持独立入口。只有 access 缺失但 refresh 尚存时仍返回 unavailable。Provider 401/403 必须按固定版本 code/语义分类，过期 JWT、无权限或无法证明 session 已撤销均为 unavailable；严禁仅凭 HTTP 状态宣称 confirmed。不新增持久 token 队列。

本地 Origin/CSRF 校验通过后，在 5 秒撤销预算内完成尝试；不论远端结果，清本 scope 的 access/refresh/CSRF/proof/login-ack，写入 logout fence。无材料的请求仍遵循安全校验；校验失败不得清 Cookie。

#### C. 退出与迟到 Set-Cookie 的服务端屏障

仅丢弃 JS 响应或 AbortController 不能阻止浏览器应用迟到 Set-Cookie。本期采用不新增数据库表的 scoped HttpOnly fence/ack 协议，并在 Phase 01 完成共享 helper 和所有 BFF gate：

1. terminal clear（接受的 logout、确定无效 refresh）生成不可预测 fence F，清 login-ack；不得删除已有 fence 来表示退出。
2. ack 是服务器写入的 HttpOnly 结构，绑定 `{ fence: 登录开始时的值或无屏障标记, session_id: 新登录已验证会话ID }`，不存 token。每次受保护 BFF、refresh、MFA、reauth、password/session mutation 在调用上游前检查 ack 存在且其 fence 与当前 fence（或无屏障标记）一致，否则拒绝、不转发 token、不尝试刷新。对 access 的真正验证还必须确认 session_id 与 ack 绑定一致。仅 refresh Cookie 尚存时，可以在 fence 匹配后调用 Auth refresh，但必须验证返回的 session_id 与 ack 一致后才写回 Cookie。任何不匹配均 fail-closed，不能改写 ack 来适应迟到 token。匹配只解除本地退出屏障，绝不代替服务器 JWT/session/AAL2/proof 授权。
3. 普通 refresh、MFA、reauth 的成功响应绝不写、清或续期 fence/ack。它们即使在 logout 后迟到并写回 token，下一请求仍被屏障拒绝。
4. 只有用户明确发起的新登录成功，才能把**该登录请求开始时观察到的 fence 和本次已验证 session_id**写到 ack，不能删除 fence。没有 fence 的登录仍写带无屏障标记的 session-bound ack，不能解除未来 fence。旧登录响应携带的是旧 fence，不能解除后来 logout 写入的新 fence。ack 不包含 access/refresh/proof 或用户资料。ack 不返回 JSON、不广播、不写日志。
5. 已有 OAuth/email/password-recovery callback 若能够建立新会话，必须绑定认证流程开始时服务器记录的 fence；不能在 callback 到达时读取最新 fence并直接确认。重用已有 PKCE/state 的服务器绑定能力；缺少可靠绑定则拒绝旧 callback，提示重新发起登录。普通 reauth 的临时事件不是新登录，不能确认 fence。
6. fence 保留时间必须长于此前可迟到 session 的最长 Cookie 有效期及网络预算。当前固定为 31 天（refresh 30 天）；ack 最长 30 天且不由 refresh 续期，故本协议也要求最长 30 天重新登录，不能声称浏览器会话无限滑动。修改 TTL 时联动验证。过时失败响应允许 fail-closed，但不得解除屏障或恢复旧身份。测试必须包含 logout→新用户登录→旧 refresh 迟到：旧 token 的 session_id 不匹配新 ack，不能恢复旧用户权限。
7. fence/ack 是本 BFF 浏览器退出屏障，不是 Provider 远端撤销。remote unavailable 仍如实提示；不得宣称已经让被复制的外部 token 失效。

同 Tab 的 login/refresh/MFA/logout 等会写 Cookie 的专用操作由 manager 排序；logout pending 阻止新的 protected request，等待有界的在途认证操作收口后清理。认证 route 总上游预算默认 15 秒，logout revoke 子预算 5 秒；超时不声称远端取消已完成。跨 Tab 不新增 refresh mutex：依靠上述服务端 gate 保障退出后不可恢复授权；仅有 BroadcastChannel 不算完成。必须用真实浏览器延迟响应验证 Cookie 写回顺序，不能只用 mock fetch。

#### D. Runtime 并发与状态合并

- manager 内部维护 document-local sessionEpoch 和 refreshGeneration，均不是 token、session_id 或授权结果。每个请求捕获二者。
- 新登录开始、logout 开始、明确 expired、matching-scope terminal hint 增加 sessionEpoch。旧 epoch 的响应不改 snapshot、不返回可写入当前页面的数据、不触发 replay。页面在解析 body/更新 state 时再次核对 epoch；销毁订阅同样丢弃迟到结果。
- 同一 refreshGeneration 的 401 共用一个 refresh 结果。刷新完成后迟到的旧 generation 401 使用已完成的结果，不再发新 refresh；safe-read 至多 replay 一次，never 返回 RetryRequired。只保留当前 epoch 必要的有界结果，不保留 request body。
- replay 再次 401 时停止，返回原 request_id/error 给恢复界面，不能循环、继续显示 authenticated 成功或广播“refresh 已判无效”。只有 refresh 明确 401 才做 expired 广播。
- refresh 503/network/429 不做 terminal purge；保留原 stepUp 与最近已确认状态，返回暂时错误/限流（429 保留 Retry-After）。初次尚未 resolved 的请求失败显示可恢复错误，不永远 Skeleton。
- stepUp 为独立约束。`mfa_required` 是兼容展示态；普通成功 GET、factor 200、refresh success 都不能清除 stepUp。Admin login 置 admin_mfa；Admin MFA/proof 成功事件清对应约束；Consumer RECENT_MFA_REQUIRED 置 consumer_recent_auth，仅普通 proof 成功清除。权限拒绝不触发 refresh。
- `request()` 只接受本应用同源、显式允许的 BFF 路径；不得向任意 URL 自动附 CSRF 或转发凭据。auth mutation 专用、不自动 replay；factor GET 是明示的 safe-read 例外。取消 mutation 不证明服务端未执行，仍遵循 unknown_outcome。

#### E. 刷新所有权与 MFA 部分成功

显式 token refresh 的唯一入口为两个应用各自 `/api/auth/refresh`，共享 adapter。`setSession()` 可能隐式刷新，不能把它当纯读取。Phase 01 盘点所有调用，Phase 04 完成 MFA 收口；普通 BFF/GET factors/reauth/password 不得隐式轮换 token。对已过期或缺失 access 返回可恢复 401；对有效 access 使用固定 SDK 已验证的不会隐式刷新的路径，仍保留真正的服务端身份验证。无论 SDK 返回 error 对象还是 throw，都按 401/403/429/503 分类，不得把服务故障清成失效。

MFA challengeAndVerify 是显式授权升级，可产生新 session material，不属于重复 refresh；在专用操作中排序，MFA/session writer 不确认 logout fence。使用新 elevated tokens 时不得再调用会隐式刷新的 setSession；按固定 SDK 返回类型验证/构建 Cookie 写入数据，并验证其 session_id 与当前 ack 一致。固定版本若在 refresh/MFA 改变 session_id，先记录真实行为并修订绑定协议，不能静默改 ack 绕过屏障。

MFA 部分成功冻结如下：challenge 成功后，已确认的 elevated session 必须在最终成功或 proof 故障响应中回写；proof 只有签发成功才写。proof 失败时清该 scope 旧 proof，返回标准错误 envelope，在 `error.details` 中使用字符串 `mfa_verified: "true"`、`proof_issued: "false"`、`recovery: "verify_existing_factor"`，enrollment 路径另加 `enrollment_verified: "true"`。不在错误体回传 token、proof ID、QR 或 secret。上游拒绝/故障沿用真实 401/403/429/503；UI 不误报绑定失败，重读 verified factors 后由用户再次验证。成功但响应丢失属于未知结果，通过读取 factor 状态恢复，不能自动再 enroll。

#### F. 交付与后续 Frontend

所有必要本地测试必须实际 PASS 才能 DONE；必要项 NOT_RUN/FAIL 时为 PARTIAL 或 BLOCKED。Staging/生产仍单列，不继承 Local 结果。Phase 05 增加 SDK tarball、browser exports、Registry 和独立 Consumer 安装回归，Auth 页面统一验收 320/375/390/768/1440px。

完整 Frontend 独立计划已由用户准备，待本 Auth 优化交付后另行执行。本期交接稳定 exports、stepUp/snapshot、Cookie/fence 契约、错误映射、测试证据及兼容注意事项，不重做 Admin Shell/Platform workspace/资源信息架构，不自动执行下一计划。

---

## 3. 本次范围

必须完成：

1. Auth 路由 envelope/request_id/no-store 收敛到现有项目合同。
2. Consumer/Admin logout 本地清除与远端 revoke 结果解耦。
3. 共享 Browser SessionManager。
4. 同 Tab single-flight refresh。
5. 冻结并实现 replay policy。
6. Consumer protected fetch 接入统一 session orchestration。
7. Admin login/MFA/session 接入统一 orchestration。
8. MFA factor 加载错误与空态分离。
9. 首次 enrollment verify 直接复用 recent-proof 签发能力。
10. Admin/Consumer logout、expired session 的 multi-tab 广播。
11. 把当前 Auth/Session 相关旧直连路径退出，避免两套 401/refresh/logout 逻辑同时存在。
12. 针对上述行为补充现有 Vitest/Browser E2E 验证。
13. 更新本任务直接受影响的 `docs/auth-security.md` / `docs/api-sdk.md` / contracts 说明。
14. 每阶段完成并通过必要验证后 commit + push，写入 `verification-record.md`。
15. SessionSnapshot → UI state、Auth error → PresentedError、RetryRequired → Mutation state 的消费语义落地。
16. Login/MFA/session recovery 保留安全 deep-link / returnTo；不得把敏感 intent 放 URL。
17. logout/definitive expired 清理 sensitive client cache、drawer/dialog、one-time secret 与高风险 intent。
18. Step-up MFA/reauth 完成后先重新读取 authoritative state，不盲目重放旧 destructive mutation。
19. Auth 页面覆盖本计划要求的 responsive/accessibility browser 验收。

## 4. 明确非目标

- 不改变 RLS、Principal、Admin 身份模型或 Account API 授权规则。
- 不缓存 authorization / entitlement / principal。
- 不增加 all-devices logout。
- 不新增 OAuth/SSO/passkey/短信 MFA/recovery-code 产品能力。
- 不重构全站 UI Design System；但本期直接触及的 Login/MFA/Session Recovery/Logout surface 必须服从 `frontend-integration-contract.md` 的状态、响应式与可访问性要求。
- 不完成类别 04 的全 API Contract 治理，只处理 Auth/Session 必需范围。
- 不完成完整 logging/tracing/metrics 平台。
- 不把现有 spike E2E 整体迁移成正式 Playwright test suite。
- 不处理整个 DX 清理，除非现有脚本直接阻塞本期必要验证且只能做最小修复。
- 不做性能专项。
- 不新增数据库表或 migration，除非实际代码证明目标合同缺少已声明能力；此时先记录并阻塞相关子项。
- 预期无需新外部依赖。

---

## 5. 当前代码事实

产品代码研究基准：远端 `main@362db831d49308d0e5ca84965af80d86e944f56c`。最新文档决定核对至 `0d42b4cd44a2c17777c33f616bd393c22ee78f16`；比较结果显示该提交只修改 `docs/**`，没有改变下述产品代码事实。

### 5.1 治理与架构文档

已核实：

- `AGENTS.md`
- `apps/admin/AGENTS.md`
- `apps/template-preview/AGENTS.md`
- `docs/architecture.md`
- `docs/auth-security.md`
- `docs/api-sdk.md`
- `docs/development/README.md`
- `docs/development/contracts.md`
- `docs/development/status.md`
- `references/Aisenhub_Frontend_Experience_State_Architecture.md`（本计划包内架构输入）

关键事实：

- Root AGENTS 要求代码事实优先、不得削弱 authorization、每个可独立验收阶段小提交并 push。
- 两个 Next app 的嵌套 AGENTS 要求：实施 agent 在写 Next.js 代码前先读取本地已安装 Next 版本对应的 `node_modules/next/dist/docs/` 相关说明。
- `docs/auth-security.md` 已要求 per-request client、no-store、Origin/CSRF、AAL2/recent MFA、protected failure fail-closed。
- `docs/api-sdk.md` 已要求标准 `data/error + request_id` envelope，且上传流不自动重传。
- `docs/development/status.md`
- `references/Aisenhub_Frontend_Experience_State_Architecture.md`（本计划包内架构输入） 的 main 基线落后于本轮研究的远端 main；不能把其中“已完成/已验证”当本次实际验收证据。

### 5.2 Shared Auth

已核实：

- `packages/account-auth/src/index.ts`：已有 `AuthSession`、`RecentAuthProof`、safe returnTo、session/proof verifier。
- `packages/account-auth/tests/auth.test.ts`
- `packages/account-auth-nextjs/src/index.ts`：已有 per-request Supabase client、cookie names/write/clear、login/refresh/setSession/MFA/reauth/revoke wrappers。
- `packages/account-auth-nextjs/src/browser.ts`：当前只有 Browser Supabase client factory；**没有** Browser AuthSessionManager / single-flight refresh。
- `packages/account-auth-nextjs/tests/adapter.test.ts`：已有 per-request/no-store/cookie/MFA/revoke 单测。

### 5.3 Consumer

已核实：

- `apps/template-preview/app/api/auth/_lib.ts`
- login/refresh/logout/reauth/callback/signup/forgot-password/password auth routes
- `apps/template-preview/app/login/page.tsx`
- `apps/template-preview/app/account/page.tsx`
- `apps/template-preview/app/files/page.tsx`
- `apps/template-preview/app/subscription/page.tsx`
- signup/forgot-password/update-password 页面
- `apps/template-preview/app/api/v1/[...path]/route.ts`

当前事实：

- login error 为 `{data:{code}}`。
- refresh error 为 `{error:{code,message}}`。
- logout revoke 失败时在 Cookie 清理前返回 503。
- protected 页面直接 fetch BFF，没有统一 browser refresh orchestration。
- BFF 已有 Origin/CSRF/idempotency/If-Match/no-store 约束。
- config-file binary PUT 不应自动重传。

### 5.4 Admin

已核实：

- login/refresh/logout auth routes
- MFA factors/enroll/enroll-verify/verify routes
- `apps/admin/app/admin/login/page.tsx`
- `apps/admin/app/admin/mfa/page.tsx`
- protected sections：`admin/page.tsx`、`audit/`、`deletion-jobs/`、`entitlements/`、`files/`、`platforms/`、`subscriptions/`

当前事实：

- factor 页面把非 2xx 和空 factor 混成“没有可用 MFA 因子”。
- enroll verify 已 challenge-and-verify 并写 elevated admin session，但不签 recent proof。
- existing-factor verify 会调用 Account API `/admin/api/v1/auth/recent-proof` 并写 5 分钟 proof cookie。

### 5.5 Existing Tests / Commands

当前 root 已存在：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm contracts:check
pnpm test:e2e:t12-r2
pnpm test:e2e:t16-r2
pnpm test:api:t12-ordinary-proof
pnpm healthcheck
```

包级已存在：

```bash
pnpm --filter @kit/account-auth test:unit
pnpm --filter @kit/account-auth typecheck
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm --filter @kit/account-auth-nextjs typecheck
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter admin typecheck
```

注意：

- root `test:api` 当前是 not-enabled 占位，**不得作为实际通过证据**。
- `tests/spikes/e2e/t12-r2-admin.mjs` 已直接使用 Playwright Chromium。
- `tests/spikes/e2e/t16-r2-account.mjs` 也直接使用 Playwright，并依赖 Local Supabase；研究快照中该文件还含硬编码 Deno 路径。本期不做通用 DX 重构；如果它直接阻塞必须的 Auth E2E，只做最小必要修正并记录计划偏差。

---

## 6. 文档与代码差异

### D1 — status 文档基线落后

处理：实施前重新核对 local HEAD / remote / workspace；旧测试必须重新实际运行。

### D2 — API envelope 目标已冻结，Auth route 尚未统一

处理：不重新设计新 envelope；本期让 Auth/Session route 服从既有合同。

### D3 — Logout 当前实现与本次目标冲突

处理：保留 revoke 失败可检测性；route 层仍清本地会话，并显式返回 `remote_revocation:'unavailable'`；同步修订安全文档。

### D4 — Enrollment MFA 已 AAL2，但 UI 要第二次 OTP

处理：抽取已有 recent-proof issuance 步骤，供 enrollment verify 与 existing-factor verify 共用；不降低 AAL2/recent-proof 校验。

### D5 — 原 Auth 计划缺少产品消费层合同

Frontend Experience 架构进一步冻结了 RemoteData、Mutation、PresentedError、URL context、cache cleanup、multi-tab UI reaction、responsive/accessibility。原 Auth 计划的安全核心无需改写，但如果不补充消费合同，页面仍可能各自解释 `refreshing`、MFA、RetryRequired、logout/expired。

处理：新增 [`frontend-integration-contract.md`](./frontend-integration-contract.md)，并把对应职责分别并入 Phase 02–05；该合同不让 Browser UI 成为 authorization 权威。

### D6 — 最新 main 追加 UI 评审原则，但未实施产品改造

`0d42b4cd...` 相对代码研究快照只修改文档，正式确认 MakerKit 不作为视觉模板，UI 以顺畅、信息清楚、反馈及时和页面质感验收。

处理：本计划接受该目标原则，但不把文档提交当成 Auth/UI 已实施或测试通过的证据。

---

## 7. Supabase 当前资料核实结论

本轮按项目规则核实了当前 Supabase changelog 与官方 Auth 文档：

- `mfa.challengeAndVerify()` 是 challenge + verify 官方 helper。
- MFA enrollment verify 后当前 session 会提升至 `aal2`。
- SSR Auth 使用 cookie session；refresh 后必须更新 cookie，Auth response 应避免缓存。
- `refreshSession` 在 refresh token 无效时返回错误。
- Sign out 支持 current/local session scope；access JWT 在撤销后可能继续有效至自身 expiry，因此本项目继续依赖已有 persistent session validation，不能只看 JWT。
- 当前 2026 breaking-change 列表中，没有发现要求本期重写 MFA/refresh API 的直接 breaking change；self-hosted `API_EXTERNAL_URL` `/auth/v1` 变化只在对应环境采用该配置时相关。

实施 agent 在真正写 Supabase/Next Auth 代码前仍须按 lockfile 版本重新查当前官方资料。

---

## 8. 阶段划分与依赖

```text
Phase 01
合同冻结 + Logout 正确性闭环
        ↓
Phase 02
Shared Browser Session Runtime
        ↓
   ┌────┴──────────┐
   ↓               ↓
Phase 03        Phase 04
Consumer        Admin + MFA
   └────┬──────────┘
        ↓
Phase 05
全量迁移检查 + Multi-tab + 回归 + 旧路径退出
```

### 串行要求

- 01 必须先于 02。
- 02 必须先于 03/04。
- 05 必须等待 03、04 全部完成并 push。

### 可并行

默认串行执行 Phase 03、Phase 04。用户另行要求并行时可由不同 agent 执行，但必须满足：

- Phase 02 shared package 已完成并推送。
- Phase 03 只拥有 `apps/template-preview/**` 和 Consumer 测试片段。
- Phase 04 只拥有 `apps/admin/**` 和 Admin 测试片段。
- `packages/account-auth*` 在并行阶段默认冻结；必须改时由集成负责人统一处理。
- `verification-record.md` 由集成负责人统一写，避免并行冲突。
- shared docs 由 Phase 05 集成负责人汇总。

---

## 9. 阶段交付物

| 阶段 | 核心交付 |
|---|---|
| [01](./01-contract-and-logout-foundation.md) | Auth envelope/request-id；logout 本地清理与 remote revoke 状态解耦；首个 P0 真闭环 |
| [02](./02-shared-session-runtime.md) | Session state/replay contract；single-flight refresh；shared browser manager |
| [03](./03-consumer-session-adoption.md) | Consumer login/protected fetch/logout/reauth 接入 shared runtime |
| [04](./04-admin-mfa-session-adoption.md) | Admin login/MFA/session；factor 空态/错误分离；enrollment 直接签 recent proof |
| [05](./05-integration-validation-cleanup.md) | Admin remaining protected fetch；multi-tab；terminal cache cleanup；旧路径退出；完整回归/文档同步 |
| [Frontend Integration Contract](./frontend-integration-contract.md) | Session→UI、Error→Presented surface、Step-up intent、returnTo、cache cleanup、multi-tab reaction、Auth responsive/a11y 的跨阶段权威合同 |
| [Architecture Coverage Matrix](./architecture-coverage-matrix.md) | 将 Auth 核心与 Frontend 补充内容逐项映射到 Phase 01–05 和后续边界，防止遗漏/越界 |
| [交接](./agent-handoff.md) | 可直接复制给执行 agent 的完整入口指令 |
| [记录](./verification-record.md) | 实施期据实填写的进度、验证、GitHub 交付模板 |

---

## 10. 全局不变量

1. 不放宽 Authentication / Authorization / RLS。
2. 不缓存 authorization、principal、entitlement、recent proof。
3. 不跳过 Origin / CSRF。
4. protected upstream auth 不可用继续 fail-closed。
5. Admin server-side AAL2 / recent proof 要求继续存在。
6. ordinary-user recent auth 仍使用项目既有独立 email event-session 方案。
7. 不自动重传文件字节流。
8. 不为同一逻辑操作的自动 replay 生成新 Idempotency-Key。
9. 不记录 token、Cookie、OTP、MFA secret、redemption code、文件内容。
10. BrowserChannel 不是授权来源。
11. 不使用 shared singleton Supabase server client。
12. 所有 request-scoped auth client 继续 per request 创建。
13. 不把旧测试结果当本次通过证据。
14. 不覆盖用户已有工作，不 force push。
15. `resolved:false` 不等于未登录；`refreshing` 不等于 initial loading。
16. logout / definitive expired 清敏感 client state；transient refresh failure 不做 terminal purge。
17. Step-up 成功后不盲目重放 destructive intent；先重新读取 authoritative state。
18. Browser recent-MFA 指示、BroadcastChannel、隐藏按钮都不是授权权威。

---

## 11. 主要风险与处理

### R1 — Logout 的远端残余 session

- 显式标记 `remote_revocation:'unavailable'`。
- 不增加隐式 credential 持久化。
- 继续依赖服务端 persistent session validation + 短 access token 生命周期。
- 不把“本地已退出”写成“远端 session 已撤销”。

### R2 — Refresh token rotation 并发

- 单 Tab single-flight。
- 本期不引入跨 Tab 分布式锁。
- Multi-tab 只广播 logout/expired。
- 如果真实 E2E 暴露跨 Tab rotation 回归，Phase 05 标阻塞并记录证据；不能靠 auth cache/关闭安全校验绕过。

### R3 — Mutation replay 重复副作用

- 默认 never。
- 只有显式 `idempotent-mutation` + 原始同一 key + repeatable body 才允许。
- binary 永不 replay。

### R4 — MFA enrollment proof 提取造成权限弱化

- helper 只接受服务端刚验证过的 elevated session。
- recent-proof 仍由 Account API 校验/签发。
- proof cookie 仍 server-set HttpOnly。
- 5 分钟期限不变。

### R5 — Next / Supabase 版本漂移

- 实施前读 lockfile 版本。
- Next 修改前读本地 `node_modules/next/dist/docs/`。
- Supabase 修改前查当前 changelog + 官方 docs。
- 不安装 latest。

### R6 — 现有 E2E 环境依赖

- 先记录 Local Supabase、Deno、Playwright、依赖状态。
- 必要 E2E 无法运行时阶段不能标“已交付”。

### R7 — UI 为恢复体验错误重放高风险 intent

- Step-up / session recovery 只保存非敏感 intent context。
- MFA 完成后 refetch authoritative state，处理 409/412/状态变化，再让用户重新确认。
- 不把完整 destructive request 持久化，也不因为“无缝体验”改变 Auth replay contract。

### R8 — Terminal session 后敏感页面仍留存 client data

- Phase 03/04 在 app 接入 terminal cleanup；Phase 05 扫描全量 protected surface。
- logout/expired 清 private cache、sensitive drawer/dialog、one-time secret 与 intent。
- refresh 503/network 不误清 last-known data。

### R9 — Deep-link 恢复引入开放重定向或敏感 URL

- 继续复用已有 safe-returnTo 能力并执行 same-origin/app-path 约束。
- URL 只保存导航位置，不保存 token/proof/OTP/secret/mutation body。
- return target 失效时安全降级，不进入 redirect loop。

---

## 12. 全局完成标准

只有同时满足以下条件才算整体完成：

- 五阶段必须项全部实施。
- 所有阶段必要验证均对最终相关代码版本有效。
- Consumer/Admin 都只有一套 active browser session orchestration。
- concurrent 401 单 Tab 只发生一次 refresh。
- refresh 401 与 refresh 503 的语义可区分。
- 安全读取 replay 一次；不可安全 mutation 不被自动重放。
- binary upload 没有自动 replay。
- logout revoke outage 时浏览器本地已退出，但远端 revoke 未确认被如实表达。
- MFA factor service error 不显示成“没有 factor”。
- enrollment 成功的一次 TOTP verify 可直接获得 AAL2 + recent proof，不再要求第二次 OTP。
- recent proof refresh 后不会被延长。
- multi-tab logout/expired 提示生效且不传 credential；matching-scope tab 会停止 protected UI 并清敏感 client state。
- unresolved / refreshing / MFA / expired 在 UI 中按 `frontend-integration-contract.md` 呈现，Error 不被错误解释为空态或未登录。
- unsafe mutation 的 RetryRequired 不被自动 replay；step-up 成功后先重新读取 authoritative state。
- login/MFA/session recovery 能安全恢复 deep-link/returnTo，不产生开放重定向或敏感 URL。
- logout/expired 完成 sensitive cache cleanup；refresh 503 不做 terminal purge。
- Auth 页面已实际覆盖要求的 responsive 与 keyboard/focus/error live-region 验证。
- 受影响 docs 与代码一致。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、相关 unit、相关 E2E、最终 `pnpm build` 已实际运行并记录结果；未运行项不能标通过。
- 所有阶段代码 commit 均已 push 到任务远程分支，并在 `verification-record.md` 记录 SHA/链接。
- 无 force push、无 deploy、无 main merge、无 release。

---

## 13. 本轮计划生成状态

本轮只完成了远端代码/文档研究、Supabase 当前资料核实、Frontend Experience 架构交叉核对、目标契约冻结、分阶段实施计划、frontend integration contract、agent handoff 和 verification record 模板。

本轮**没有**修改仓库产品代码、安装依赖、启动服务、运行产品测试、执行 Git commit/push 或部署。
