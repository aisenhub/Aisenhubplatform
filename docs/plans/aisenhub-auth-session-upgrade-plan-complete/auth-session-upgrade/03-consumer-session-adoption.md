# 03 — Consumer Session Adoption

> 上游：[02-shared-session-runtime.md](./02-shared-session-runtime.md)  
> 跨阶段消费合同：[frontend-integration-contract.md](./frontend-integration-contract.md)  
> 可与 Phase 04 并行  
> 文件所有权：`apps/template-preview/**` + Consumer 对应测试片段  
> 状态：**已实施；Consumer 页面与浏览器回归见 verification-record.md**

## 1. 目标

把 Consumer 的 login、protected requests、reauth、logout 全部接到 Phase 02 shared runtime，使真实用户能够：

- 正常登录。
- access token 过期时自动 single-flight refresh。
- safe reads 自动恢复。
- 不安全 mutation 不被偷偷重放。
- 幂等 mutation 仅按冻结规则重放。
- refresh 失效时进入 expired 并回到 login。
- logout 后稳定退出。
- protected service 暂时不可用时不误报成“未登录/未激活”。

本阶段不重做 Files/Subscription 产品 UI，只改 Auth/Session 编排所需行为。


新增 Frontend Integration 目标：

- `resolved:false` 只显示 auth resolving，不显示“请先登录”。
- `refreshing` 保留 last-known account/subscription/file data；不退回整页 initial loading。
- `MFA_REQUIRED` / ordinary recent-auth requirement 使用明确 step-up/action-required surface，不当普通失败。
- `SessionRetryRequiredError` 回到可提交状态，提示 session 已恢复后由用户重新确认。
- logout/definitive expired 清 private component/cache state；refresh 503 不清 last-known data。
- login/session recovery 用 shared safe-returnTo 恢复同源 deep-link；不把敏感 intent 放 URL。
- 本阶段不重做完整 Consumer 视觉系统，只保证 Auth/Session 直接影响的状态、文案、响应式与可访问性达到新合同。

## 2. 前置条件

- Phase 01、02 已交付并 push。
- 当前分支包含 Phase 02 remote commit。
- 读取 `apps/template-preview/AGENTS.md`。
- 写任何 Next 代码前读取本地 Next 版本适用文档。
- 阅读 `frontend-integration-contract.md` 与 Frontend Experience 架构中 Consumer、RemoteData、Mutation、Error、Responsive、Accessibility 相关章节。
- 核对 Phase 02 safe-returnTo、RetryRequired、terminal transition 的实际导出/测试结果。
- 核对下列文件与调用链当前真实状态。

## 3. 已核实相关文件和调用链

页面：

- `apps/template-preview/app/login/page.tsx`
- `apps/template-preview/app/account/page.tsx`
- `apps/template-preview/app/files/page.tsx`
- `apps/template-preview/app/subscription/page.tsx`
- `apps/template-preview/app/signup/`
- `apps/template-preview/app/forgot-password/`
- `apps/template-preview/app/update-password/`

Auth route：

- `apps/template-preview/app/api/auth/_lib.ts`
- login/refresh/logout routes
- `apps/template-preview/app/api/auth/reauth/start/`
- `apps/template-preview/app/api/auth/reauth/verify/`
- callback/signup/forgot-password/password routes

BFF：

- `apps/template-preview/app/api/v1/[...path]/route.ts`

测试：

- `apps/template-preview` 现有 Vitest
- `tests/spikes/e2e/t16-r2-account.mjs`
- `tests/spikes/api/t12-ordinary-proof.mjs`

## 4. 新增/修改文件

### 建议新增

- `apps/template-preview/app/_lib/auth-session-client.ts`
  - browser-only module。
  - 只实例化 Phase 02 manager：scope consumer、login/refresh/logout URL。
  - module-level singleton 只用于同一浏览器文档协调 refresh Promise/state。
  - 不保存 token。

如果 app 已有等价 client lib 目录，复用现有目录，不为路径整齐多建层。

### 修改

- `apps/template-preview/app/login/page.tsx`
- `apps/template-preview/app/account/page.tsx`
- `apps/template-preview/app/files/page.tsx`
- `apps/template-preview/app/subscription/page.tsx`
- Consumer auth recovery 页面中直接解析旧 envelope 的代码
- Consumer reauth UI/route parser（以实际文件为准）
- 直接承载 login/session recovery 的 layout/navigation 状态文件（仅实际需要时）
- `tests/spikes/e2e/t16-r2-account.mjs`
- 必要的 Consumer unit tests

默认不修改 `packages/account-auth*`；若发现 Phase 02 shared bug，先交给集成负责人修 shared，不在 app 复制 workaround。

## 5. 页面调用规则

### 5.1 Login

- 调 manager `login`。
- pending 期间禁重复提交。
- success → 使用 shared safe-returnTo 恢复当前既定同源 return target/deep-link；非法/失效目标安全降级。
- 401 → credential 错误。
- 503 → auth service unavailable。
- 页面不再手写 fetch + envelope parsing。

### 5.2 Account GET

- `safe-read`。
- 401 → manager refresh → replay once。
- definitive expired → login。
- refresh 503 → 保留上下文和 last-known data，显示可恢复错误/Inline warning，不声称“账户未激活/未登录”。

### 5.3 Account Mutation

- 有 `Idempotency-Key` 且 body 可重放的 explicit action 才可 `idempotent-mutation`。
- 只有 `If-Match` 的 profile/preferences PATCH：`never`。
- 401 后 refresh 成功 → `SessionRetryRequiredError` 映射为“会话已恢复，请重新提交”，回到可提交状态，不自动第二次 PATCH。
- 如果 mutation 的响应本身丢失、服务端副作用是否发生不确定，则按业务 `unknown_outcome` 处理，不能误用 RetryRequired。

### 5.4 Subscription

- GET → `safe-read`。
- redeem：
  - 当前 request 如果已经带 Idempotency-Key，manager 的自动 replay 必须保留原 key。
  - 不在 auth 改造中为同一次 replay 生成新 key。
  - 用户主动再次点击后的 key 生命周期完整治理留 Business Workflow 专项。

### 5.5 Files

- list/get → `safe-read`。
- upload-intent → 当前 request 有 Idempotency-Key 时可显式 idempotent。
- delete → 当前 request 有 Idempotency-Key 时可显式 idempotent。
- **content PUT → `never`，无条件禁止自动重放。**
- content PUT 401 后 refresh 成功：不能自动再发 bytes；按当前 file status 能力恢复，不伪造成功。

### 5.6 Ordinary Recent Auth

- `/reauth/start` 会触发邮件/认证事件，必须 `never`。
- `/reauth/verify` 必须 `never`。
- reauth intent 只保留当前页面内存中的非敏感 action/resource/reason context；不持久化 token、proof、完整 destructive request。
- reauth 成功后先重新读取当前 account/principal/resource authoritative state；如果状态变化/冲突，要求用户重新确认，不直接自动调用旧 sensitiveAction。
- 继续现有 temporary event-session + server proof 流程。
- 不改成 access-token iat 推断。
- 不用 browser boolean 代替 proof。

### 5.7 Logout

- 只调用 manager logout。
- Phase 01 response 成功后 local state → unauthenticated。
- `remote_revocation=unavailable` 不恢复 authenticated，并显示“当前浏览器已退出，远程撤销暂时无法确认”的等价诚实文案。
- logout accepted 后清理 Consumer private data、sensitive dialog/draft、reauth intent、one-time sensitive surface。
- definitive expired 同样执行 terminal cleanup；refresh 503/network 不执行。
- BroadcastChannel 跨 Tab 传播留 Phase 05，但本 Tab terminal reaction 必须本阶段完成。

## 6. 实施步骤

1. 新增 Consumer manager instance，并建立 app 级 terminal cleanup 入口；优先复用现有 state/query 能力，不为此引入新全局 store。
2. 迁移 Login：pending/error/request-id/safe returnTo；unresolved 不触发错误 redirect。
3. 迁移 Account read/logout/reauth：区分 refreshing/expired/recoverable unavailable，冻结 reauth intent 恢复顺序。
4. 迁移 Subscription GET/redeem 的 auth transport，并把 RetryRequired 与业务 failure/unknown outcome 分开。
5. 迁移 Files list/delete/upload-intent/content，并明确每个 replay policy；refresh 时保留 last-known list/budget。
6. 在 logout/definitive expired 时清理 private local state；refresh 503 不清理。
7. 搜索 `apps/template-preview` 剩余：
   - `/api/auth/refresh`
   - `/api/auth/logout`
   - CSRF cookie parser
   - page-level 401 redirect
   - `payload.data.code`
8. public unauthenticated page 只做必要 envelope parser，不强行套 protected manager。
9. 保留业务数据/布局，不顺带实施完整 Consumer redesign；但 Auth error 主文案不得直接暴露技术 code，request id 可作为 support detail。
10. 对 Login/reauth/session-recovery surface 做 320/375/390/768/1440px 与 keyboard/focus/alert live-region 验证。
11. 扩展 unit/E2E。

## 7. 用户操作状态

### Protected Read

```text
loading
  → 200 success
  → 401 → refreshing → replay once
                ├─ success
                ├─ refresh 401 → expired/login
                └─ refresh 503 → recoverable service error
```

### Non-replay Mutation

```text
submit
  → 401
  → refresh success
  → 原 mutation 不重放
  → 提示“会话已恢复，请重新提交”
```

### Binary Upload

- 不能自动重传。
- 用户必须看到真实 file record/status。
- 无法确认结果时保持未知/失败，不创造“上传完成”。

### Session Recovery UI

```text
resolved=false
  → auth resolving / protected skeleton

已有数据 + refreshing
  → last-known data + subtle refreshing

refresh 503
  → last-known data + recoverable warning + retry

refresh 401
  → expired → terminal cleanup → login/recovery with safe returnTo
```

### Ordinary Reauth / Step-up

```text
sensitive intent
  → recent auth required
  → reauth flow
  → proof success
  → refetch authoritative account/resource state
  → state still valid?
       yes → user reconfirms / explicitly submits
       no  → conflict/domain state surface
```

不自动调用之前保存的 destructive `fetch`。

## 8. 持久化、并发、恢复

- Token 仍只在 HttpOnly Cookie。
- single-flight 只在当前 browser document。
- page remount 不应创建多个并行 manager instance。
- refresh 401 后 current page 不循环 retry。
- refresh 503 允许用户显式重试，但不后台快速循环。
- upload bytes 失败后优先状态查询/明确用户动作。
- returnTo 只使用 shared safe helper，不自写开放重定向 sanitizer。
- high-risk/recent-auth intent 默认只在页面内存，不写 localStorage/sessionStorage。
- logout/expired 清 private state；refresh unavailable 保留 last-known data。

## 9. 旧路径退出

阶段完成时 Consumer：

- 页面不能自行实现 refresh Promise。
- protected page 不再一见 401 就直接 login，必须先按 manager 合同尝试一次 refresh。
- 不能有第二套 page CSRF mutation helper。
- login/logout 不再解析旧 `data.code`。
- binary upload 调用点明确 `never`。

允许保留：

- public page 普通 fetch。
- E2E Node-side explicit Origin/CSRF。
- server BFF 的现有 Origin/CSRF validation。

## 10. 测试场景

必须覆盖：

1. 登录成功/错误。
2. protected GET access expiry → refresh success → 页面恢复。
3. 多个 Consumer GET 同时 401 → 一次 refresh。
4. refresh invalid → cookies 清，expired/login。
5. refresh 503 → 不显示“未激活/未登录”。
6. subscription GET 恢复。
7. redeem auto replay 保留同一 idempotency key。
8. profile/preferences mutation 不自动 replay。
9. file list 恢复。
10. upload-intent 按幂等规则恢复。
11. binary content PUT 不自动 replay。
12. logout confirmed。
13. logout remote unavailable 时 local state 仍退出。
14. ordinary reauth start/verify 不自动 replay。
15. recent proof 敏感操作仍由 server proof 控制。
16. unresolved 首次加载不误显示未登录/未激活。
17. refreshing 保留 last-known data；refresh 503 不清空页面。
18. safe returnTo 恢复合法 deep-link，拒绝 external/敏感 URL。
19. reauth success 后先 refetch authoritative state，不自动重放旧 close/delete request。
20. logout/expired 后 private data/sensitive intent 不继续留在 UI。
21. logout remote unavailable 的文案不声称远端 revoke 已确认。
22. 320/375/390/768/1440px Login/reauth recovery 无溢出；keyboard/focus/error announcement 可用。

## 11. 计划命令

```bash
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm test:api:t12-ordinary-proof
pnpm test:e2e:t16-r2
pnpm format:check
pnpm lint
pnpm typecheck
```

若 `t16-r2` 被研究快照中的硬编码 Deno 路径阻塞：

- 先记录真实失败。
- 不写“通过”。
- 只有它直接阻塞本阶段必要验收时，做最小测试工具修复并记录计划偏差。
- 不借机完成整个 DX 专项。

## 12. 阶段完成门槛

- Consumer 真实 browser flow 验收通过。
- `frontend-integration-contract.md` 中 Consumer 适用项有实际 browser/E2E 证据。
- unresolved/refreshing/expired/RetryRequired/reauth surface 的状态映射可审查。
- Replay matrix 在调用点可审查。
- binary upload 无自动 replay。
- ordinary recent-auth 没被改弱，step-up 后先 authoritative refetch，再由用户重新确认。
- safe returnTo 无开放重定向/敏感参数，deep-link 恢复有证据。
- logout/expired terminal cleanup 有证据；refresh 503 不误清 last-known data。
- Auth 直接改动 surface 的 responsive/accessibility 验收已记录。
- `verification-record.md` 更新，并据实记录实际命令、退出码、commit/push。
- commit，例如：`auth(consumer): phase 03 adopt shared session orchestration`
- push 成功，remote 含 SHA。
- 向 Phase 05 交接剩余 Consumer 直连扫描结果；没有则写“无”。

## 13. 并行约束

与 Phase 04 并行时：

- 不修改 `apps/admin/**`。
- 不私改 shared package contract。
- 不覆盖 Phase 04 的测试改动。
- 若 `t16-r2-account.mjs` 同时涉及 Admin fixture，先由集成负责人划分区段/所有权。

## 14. R1 Consumer 接入补充（ASU-03）

消费 master §2.10 的 scoped CSRF/proof、fence 拒绝与 stepUp。Consumer `RECENT_MFA_REQUIRED` 映射 consumer_recent_auth，不打开 TOTP；普通 proof 签发成功才清该约束。API/页面新增任何 response parser 时同步标准 error envelope。

所有 async 页面更新（包括 response.json/blob 后）检查 manager epoch，terminal cleanup 后不得被旧数据重新填充；Blob URL 在终态 revoke，文件上传取消仍按未知结果查询。恢复后重新读 authoritative state，用户再次确认敏感动作。

ASU-V11：真实浏览器覆盖旧页面 GET/上传响应迟到、退出后 reload、access 自然到期、Consumer 邮件 step-up、新 Cookie 一次重新登录迁移；验证没有过时数据复活或自动重传。共享 R1 修复从 ASU-01/02 消费，不在本 app 复制实现。
