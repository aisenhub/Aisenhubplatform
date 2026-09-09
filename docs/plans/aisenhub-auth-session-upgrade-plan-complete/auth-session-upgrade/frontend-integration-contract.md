# Authentication & Session ↔ Frontend Experience Integration Contract

> 用途：冻结 Authentication & Session 与 Frontend Experience & State 之间的产品消费边界。  
> 状态：**仅计划，未实施、未验证**。  
> 权威关系：本文件补充 `00-master-plan.md`，不取代 Auth 的安全合同，也不把 Frontend UI 变成授权权威。  
> 参考：`references/Aisenhub_Frontend_Experience_State_Architecture.md`。

---

## 1. 为什么需要这份合同

Authentication & Session 计划已经冻结了 session lifecycle、single-flight refresh、replay、logout、MFA、recent proof 与 multi-tab 安全边界；Frontend Experience & State 又进一步冻结了 RemoteData、Mutation、Error Presentation、URL context、Dialog/Drawer、responsive 与 accessibility 语义。

如果缺少中间合同，后续 agent 很容易出现以下漂移：

- 页面把 `refreshing` 当成重新加载，清空已有数据回 Skeleton；
- `RECENT_MFA_REQUIRED` 被当成普通失败 Toast；
- refresh 成功后偷偷重发原 mutation；
- logout 只清 Cookie，却继续在屏幕上保留敏感 Admin data；
- MFA 完成后自动执行一个已经过时的 destructive intent；
- session expired 后丢失深层 URL，用户被送回首页；
- BroadcastChannel 收到 logout 只显示 Toast，但 protected UI 仍可见；
- Browser 根据 MFA 倒计时或本地 boolean 自行判断授权。

本文件只解决这些**消费语义**，不重新设计 Auth 核心。

---

## 2. 权限与状态所有权

唯一权威来源冻结如下：

| 领域 | 唯一权威 | Frontend 可做 | Frontend 不可做 |
|---|---|---|---|
| Session lifecycle | Authentication & Session | 订阅状态、呈现恢复 UI | 自造 `isLoggedIn` 权威状态 |
| Authorization / Admin / RLS | Server / Account API / DB | 呈现 permission result | 根据隐藏按钮代替服务端授权 |
| Recent MFA | Server proof validation | 呈现 step-up 状态 | 用本地时间倒计时授权 |
| API envelope / error code / request id | API Contract | 分类为 PresentedError | 发明第二套 error taxonomy |
| Resource lifecycle | Business Workflow | 映射成人类文案 | 改写 resource state machine |
| Idempotency / replay safety | Auth/API/Business contract | 保存当前 intent context | 擅自决定 POST 可安全重放 |
| URL context | Frontend Experience | 保留 route/query/deep link | 把 token/secret/OTP 放 URL |
| Ephemeral UI state | 页面/组件 | dialog/drawer/draft/focus | 变成业务事实或授权依据 |

### 2.1 明确不新增的“权威层”

本期不新增：

- 全局 auth Redux/Zustand store；
- 第二个 session manager；
- 页面级 refresh coordinator；
- Browser authorization cache；
- 前端 recent-MFA authority；
- “为了 UI 顺滑”而存在的 mutation replay layer。

---

## 3. SessionSnapshot → UI 状态映射

Auth runtime 冻结：

```ts
type SessionState =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'refreshing'
  | 'mfa_required'
  | 'expired';

type SessionSnapshot = {
  state: SessionState;
  resolved: boolean;
  stepUp: null | 'admin_mfa' | 'admin_recent_mfa' | 'consumer_recent_auth';
};
```

Frontend 必须采用以下等价行为：

| Session snapshot | UI 含义 | 页面数据 | 允许动作 |
|---|---|---|---|
| `resolved:false` | Auth resolving | 可显示 protected shell skeleton；不得显示“未登录” | 不做基于未登录的 destructive redirect |
| `authenticating` | 登录提交中 | 登录表单保留输入 | 只锁登录提交，不锁无关 UI |
| `authenticated` | Session 可用于请求 | 正常显示 | 服务端仍逐请求授权 |
| `refreshing` | Session 正在恢复 | **保留 last-known data**，显示 subtle refreshing | 暂停需要新凭据的冲突动作；不清空整页 |
| `mfa_required` | 需要 MFA / recent MFA | 可保留安全的上下文数据 | 进入 step-up；不得当普通 403/Toast |
| `expired` | 确定 session terminal | 立即停止展示 protected sensitive surfaces，并执行清理 | 进入 login/session recovery |
| `unauthenticated,resolved:true` | 当前无登录会话 | 不展示 protected content | public/login flow |

### 3.1 `refreshing` 不等于 Initial Loading

```text
已有资源数据
  + access token 过期
  + single-flight refresh
  = last-known data 继续可见 + subtle refresh indicator
```

禁止：

```text
401 → 清表格 → 全页 Skeleton → refresh
```

因为这会把可恢复 session 事件错误地呈现成资源重新加载，并造成明显闪烁。

### 3.2 `expired` 与 transient unavailable 必须分离

- refresh definitive 401 → `expired`。
- refresh 503/network → transient recoverable error；不得进入 `expired`。
- transient error 时，如果页面已有数据，按 Frontend contract 保留数据并显示 Inline warning / Retry。

---

## 4. Auth Error → PresentedError → UI Surface

Frontend 不直接把底层 code 当用户主文案。

目标链路：

```text
Api/Auth Error
  ↓
稳定 code / status
  ↓
Error classification
  ↓
PresentedError
  ↓
Page / Inline / Step-up / Session Recovery surface
```

最小映射：

| Auth/API 结果 | Frontend surface | Retry / recovery |
|---|---|---|
| 401 `UNAUTHORIZED`（普通 request） | 先进入 shared refresh orchestration | 不由页面直接跳 login |
| refresh 401 | Session Expired | login / safe returnTo |
| 403 `MFA_REQUIRED` | MFA flow | 用户验证后恢复上下文 |
| 403 `RECENT_MFA_REQUIRED` | 按 scope 的 Step-up flow | Admin recent MFA；Consumer 邮件 recent-auth；不盲目 replay mutation |
| 403 permission/admin/domain deny | Permission / Domain access state | 不触发 refresh |
| 429 `RATE_LIMITED` | Recoverable warning/error | 保留当前 MFA/form context，遵守 retry timing |
| 503 `AUTHORIZATION_UNAVAILABLE` | Recoverable service error | 安全时 Retry；不伪造 expired |
| Logout `remote_revocation: unavailable` | Logout completed + remote warning | 不恢复 authenticated |
| `SessionRetryRequiredError` | Session 已恢复，但 intent 需重新确认 | 回到可提交状态；不作为普通 failure |

### 4.1 技术信息

可以在折叠 technical details 中显示：

- stable code；
- request id / support id；
- 当前 recovery action。

不得显示：

- raw provider error；
- token / cookie value；
- OTP；
- MFA secret；
- proof；
- SQL/provider credential。

---

## 5. `SessionRetryRequiredError` → Mutation 状态合同

Frontend Mutation 架构冻结：

```text
idle
confirm_required
step_up_required
pending
accepted
success
failure
unknown_outcome
```

Auth runtime 的 `replay:'never'` 与它的关系必须固定。

### 5.1 非自动重放 mutation

```text
User confirmed intent
  ↓
pending mutation
  ↓
401
  ↓
single-flight refresh
  ↓
refresh success
  ↓
NO replay
  ↓
SessionRetryRequiredError
  ↓
回到可确认/可提交状态
  ↓
提示：会话已恢复，请确认后重新提交
```

该结果不是：

- `success`；
- `accepted`；
- `unknown_outcome`（除非底层调用本身已经无法判断副作用是否发生）；
- 普通业务 `failure`。

### 5.2 与 `unknown_outcome` 的边界

- **401 在请求结果明确返回前由 manager 拦截，且合同能确认原 mutation 未被安全重放**：可用 RetryRequired 语义。
- **网络断开/response 丢失/服务端可能已经提交**：必须进入业务 `unknown_outcome`，先查 authoritative state。
- Auth 层不得把不确定副作用简化成“会话已恢复，请重试”。

### 5.3 Idempotent mutation

只有既有 Auth/API 合同允许的 `idempotent-mutation` 才能在 refresh 后自动 replay 一次，并保持：

- 同一 Idempotency-Key；
- 同一逻辑 operation；
- body 可重复读取；
- 非 binary/stream；
- 最多一次 replay。

---

## 6. Step-up MFA 与 Mutation Intent 恢复

### 6.1 intent 可以保存什么

当前页面内存中可以暂存：

```ts
type StepUpIntentContext = {
  resourceId: string;
  actionKind: string;
  reason?: string;
  nonSensitiveDraft?: unknown;
  returnTo: string;
};
```

这只是职责示意，不要求机械建立同名类型。

### 6.2 禁止保存

不得因“验证回来继续操作”而持久化：

- access/refresh token；
- CSRF token；
- recent proof；
- OTP；
- MFA secret / QR payload；
- credential；
- authorization result；
- secret redemption/key material；
- binary body；
- 未经合同允许自动重放的完整 mutation request。

默认不将高风险 intent 写入 localStorage/sessionStorage。

### 6.3 Step-up 成功后的唯一恢复顺序

```text
MFA/recent MFA success
  ↓
Session state restored
  ↓
return to originating route/surface
  ↓
refetch authoritative resource state
  ↓
validate intent still makes sense
  ↓
409/412/state changed? → show conflict / refresh context
  ↓
否则由用户重新确认，或仅在既有安全 replay contract 明确允许时继续
```

禁止：

```text
MFA success → 直接重发旧 destructive POST
```

### 6.4 页面关闭/刷新

如果 intent 仅存在内存，刷新后丢失是允许的安全降级；页面应要求用户重新发起操作，而不是为“无缝恢复”引入敏感持久化。

---

## 7. Deep-link / Safe ReturnTo

Frontend Platform workspace 与筛选状态逐步 URL 化，因此 Auth 恢复必须尽可能保留安全 deep link。

示例：

```text
/admin/platforms/<platformId>/files?q=unknown&status=deleting
```

session expired → login/MFA → 成功后，应在安全校验通过时回到原 route/query，而不是无条件回 `/admin`。

规则：

1. 继续复用 `packages/account-auth` 已有 safe-returnTo 能力；若实际 helper 语义与计划不完全一致，以代码为准并记录偏差。
2. 只允许同源、应用内安全路径；不接受任意外部 URL。
3. 不把 token、OTP、proof、CSRF、MFA secret、one-time secret 放 query/hash。
4. 不把 destructive mutation body 放 returnTo。
5. 普通 session login returnTo 与 step-up intent context 分工明确：URL 保存导航位置，内存 intent 保存非敏感操作上下文。
6. returnTo 失效或目标资源已不存在时，降级到安全父级页面并呈现 Not Found/Permission，不循环 redirect。

---

## 8. Logout / Expired 的 UI 与 Client Cache Cleanup

### 8.1 Terminal transition

以下属于 terminal local transition：

- local logout accepted；
- refresh definitive 401 → `expired`；
- matching-scope multi-tab `logged_out` / `session_expired` hint 被当前 tab 接收并随后进入 terminal UI。

Frontend 必须清理：

- Admin sensitive query/cache data；
- Consumer account/private cache；
- resource detail/drawer 中的 private data；
- current high-risk mutation intent；
- one-time secret UI state；
- sensitive dialog/sheet；
- session-bound transient form data（确有敏感性时）。

清理机制可以使用现有 query cache/provider 或 app state；不要求为了本期引入新全局状态库。

### 8.2 不应清理的情况

refresh 503/network transient failure：

- 不执行 terminal cache purge；
- 不广播 `session_expired`；
- last-known data 可继续显示；
- 用户得到可恢复错误。

### 8.3 Logout 文案

`remote_revocation:'confirmed'`：可以说明当前远端 session revoke 已确认。  
`not_required`：本地退出完成，无当前 access session 需要 revoke。  
`unavailable`：必须表达：

> 当前浏览器已退出，但远程会话撤销暂时无法确认。

不得表达：

> 所有会话均已安全撤销。

也不得因为远端 unavailable 把本地 UI 恢复成 authenticated。

---

## 9. Multi-tab Terminal Hint → UI Reaction

BroadcastChannel 仍只传无敏感 hint。

收到 matching scope `logged_out`：

1. 不把 event 当授权证据；
2. 本地进入 terminal unauthenticated UI；
3. 清 private/sensitive client state；
4. 关闭 sensitive drawer/dialog；
5. 停止发起新的 privileged mutation；
6. 路由到 login/session recovery（按 app 当前路由和 safe returnTo 规则）；
7. 不再次广播同一事件形成回声风暴。

收到 matching scope `session_expired`：

1. 进入 expired recovery；
2. 清敏感 client state；
3. 不自动执行 logout 网络请求作为事件响应；
4. 不继续展示可交互的 protected data；
5. 不把另一个 scope 的事件应用到当前 app。

BroadcastChannel 不支持时：安全降级为当前 Tab；不新增 localStorage credential/event fallback。

---

## 10. Admin Security 页面边界

Frontend 架构规划 `Admin Security` 展示：

- 当前管理员 identity；
- session state；
- MFA factor；
- recent MFA 提示；
- logout。

该页面是 Auth 的**展示面**，不是新 Auth 实现。

规则：

- identity/factor/session 来自既有服务端/Auth contract；
- 浏览器可显示“需要近期验证”“刚完成验证”等提示，但不能把本地倒计时视为权限事实；
- recent proof 是否有效仍由 server-side proof validation 决定；
- refresh 不延长 proof；
- 页面不能导出 proof/token getter；
- 不因为 UI 显示 factor verified 就绕过 AAL2/recent proof server checks。

若当前后端没有安全的“proof expires at”展示 DTO，本期不为了倒计时新增授权 API；可以只显示说明性状态。

---

## 11. MFA Enrollment One-time Secret UX

MFA enrollment secret/QR 与 API Key/Redemption Code 不属于同一业务，但共享一次性敏感展示原则。

状态语义：

```text
not_generated
  ↓
generating
  ↓
presented_once
  ↓
verified / abandoned
```

UI 要求：

- 明确“一次性绑定信息，请勿分享”；
- QR 在移动端不溢出；
- manual secret 可复制；
- secret 使用 code/monospace 呈现；
- 不进 URL；
- 不进 Toast；
- 不进 analytics payload；
- 不进 console/server log；
- 离开页面后不假装可从浏览器恢复原 secret；
- enrollment verify 失败但 factor 已 verified 时，遵循 Auth recovery contract，不重新显示/生成第二个 factor secret。

---

## 12. Auth 页面的 Responsive / Accessibility 最低验收

本期不是 UI Design System 改造，但 Auth 页面自身必须达到 Frontend Experience 的基础状态质量。

### 12.1 Responsive

至少检查：

- 320px；
- 375/390px；
- 768px；
- Desktop Chromium。

重点：

- Login form 不横向溢出；
- MFA OTP 在软键盘下仍可操作；
- QR/manual secret 不溢出；
- action button 不被 viewport 覆盖；
- error/technical detail 可换行；
- Session Expired / MFA recovery 关键 CTA 可达。

### 12.2 Accessibility

必须覆盖：

- form label / description / error association；
- wrong credential / OTP 使用可感知 error surface；
- pending/result 使用 `aria-live` / `role=status` 的等价语义；
- critical failure 可被 `role=alert` 等方式读到；
- visible focus；
- keyboard-only 登录/MFA/logout；
- Dialog/Sheet 若用于 step-up，focus trap + close/restore focus；
- OTP `autocomplete="one-time-code"`（现有流程适用时）；
- icon button accessible name；
- disabled/pending 不只靠颜色；
- reduced motion。

不要求本期一次完成整个产品 WCAG 审计；只对 Auth/Session 直接改动面做真实浏览器验证。

---

## 13. Phase 映射

| 合同内容 | 实施阶段 |
|---|---|
| SessionSnapshot → UI state | Phase 02 定义；Phase 03/04 消费；Phase 05 回归 |
| Error → Presented surface | Phase 02 分类边界；Phase 03/04 页面消费 |
| RetryRequired → Mutation | Phase 02 runtime；Phase 03/04 调用点 |
| Step-up intent recovery | Phase 04 为 Admin 核心；Phase 03 ordinary reauth；Phase 05 集成 |
| deep-link / safe returnTo | Phase 03/04 实施；Phase 05 回归 |
| terminal cache cleanup | Phase 03/04 app 接入；Phase 05 全量检查 |
| multi-tab UI reaction | Phase 05 |
| Admin Security ownership | Phase 04 只提供 Auth surface 基础；完整 IA 归 Frontend 计划 |
| MFA one-time secret UX | Phase 04 |
| Auth responsive/a11y | Phase 03/04；Phase 05 final regression |

---

## 14. 本合同不改变的核心 Auth 决定

以下保持原计划不变：

- same-document single-flight refresh；
- mutation 默认 `replay:'never'`；
- binary/stream 永不自动 replay；
- `If-Match` 本身不授权 replay；
- MFA / RECENT_MFA 403 不触发 refresh；
- refresh 401 与 503 明确区分；
- local logout 与 remote revoke 结果解耦；
- recent proof HttpOnly / server-authoritative；
- Admin AAL2；
- BroadcastChannel 只发无敏感 terminal hint；
- 不缓存 authorization；
- Browser UI 不成为授权依据。

---

## 15. 完成验收

本合同只有在以下行为均有实际证据时才视为落地：

1. unresolved 不被显示为未登录。
2. refresh 时 last-known protected data 不被无条件清空。
3. refresh 503 不变成 expired。
4. RetryRequired 不自动重发 unsafe mutation。
5. Recent MFA 能恢复操作上下文，但不盲目 replay 旧 destructive request。
6. login/MFA 后安全 returnTo 可恢复 deep link。
7. logout/expired 清理 sensitive client state。
8. remote revoke unavailable 的 UI 不谎称全量 revoke 成功。
9. multi-tab terminal event 会停止 protected UI 且不形成广播循环。
10. MFA enrollment secret 不进入 URL/log/toast/持久存储。
11. Auth 页面完成要求尺寸和 keyboard/focus/alert 验证。
12. 所有服务端 authorization / recent proof / RLS / CSRF / Origin 安全检查无弱化。

## 16. R1 消费合同修订

以 master §2.10 为准。普通成功读取只证明该请求成功，不能解除既有 stepUp；factor GET 首次 401 先 refresh，只有 refresh 确定 401 才 expired。`stepUp:consumer_recent_auth` 使用普通邮件 proof 协议，`mfa_required` 不意味着 Consumer 必须 TOTP。

UI 在 fetch 与 body 解析完成后、每次写 state/cache 前校验 epoch；logout/expired/new login 后旧响应不能重建敏感视图。refresh transient failure 保留数据与 stepUp。服务端 fence gate 防止迟到 Set-Cookie 恢复权限，不能用前端清状态替代；fence/ack 都不暴露给浏览器 JS。

MFA proof 失败且 error.details.mfa_verified="true" 时展示已完成验证、proof 待恢复；enrollment_verified="true" 时不重复 enroll。details 为非敏感字符串字段，完整协议见 master §2.10 E；普通 error presenter 保留真实 code/request_id。

完整 Frontend 计划已存在，后续使用此 Auth 实现交接，无需本轮新增完整 UI 计划或执行 Admin Shell 改造。Auth 消费适用范围统一 320/375/390/768/1440px。
