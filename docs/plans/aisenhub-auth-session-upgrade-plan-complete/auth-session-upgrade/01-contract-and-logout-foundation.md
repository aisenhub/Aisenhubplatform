# 01 — Auth Contract 与 Logout Foundation

> 上游：[00-master-plan.md](./00-master-plan.md)  
> 跨阶段消费合同：[frontend-integration-contract.md](./frontend-integration-contract.md)（本阶段只冻结 logout/错误输出供后续 UI 消费，不实施完整 UI）  
> 状态：**已实施；验证结果见 verification-record.md**  
> 本阶段是第一批真实功能闭环，不允许只交文档或静态 UI。

## 1. 目标

完成两个 P0 基础闭环：

1. Authentication JSON route 收敛到项目已经冻结的 `data/error + request_id` 合同，使后续 SessionManager 不再兼容两套错误 envelope。
2. Consumer/Admin logout 在通过本地 Origin+CSRF 后，无论远端 revoke 是否暂时可用，都清除当前浏览器会话，同时明确返回 remote revoke 状态。

阶段结束时，现有 login/logout/refresh 仍可独立工作，不依赖后续 SessionManager。

## 2. 前置条件

执行 agent 必须先：

1. 读取根/嵌套 `AGENTS.md`、`docs/architecture.md`、`docs/auth-security.md`、`docs/api-sdk.md`、`docs/development/contracts.md`、总计划、`frontend-integration-contract.md` 和 verification record。
2. 核对本地 HEAD/branch/worktree/remote。
3. 检查 `packages/account-auth*`、两个 app auth route 是否仍与研究快照一致。
4. 写 Next.js 代码前按嵌套 AGENTS 读取本地安装版本 `node_modules/next/dist/docs/` 的相关说明。
5. 再次确认当前 Supabase changelog / sign-out / refresh 资料，记录访问日期。

## 3. 已核实调用链

### Consumer login

```text
/login/page.tsx
  → POST /api/auth/login
  → createRequestAuthClient
  → Supabase signInWithPassword
  → writeAuthSessionCookies(consumer)
```

### Admin login

```text
/admin/login/page.tsx
  → POST /api/auth/login
  → Supabase signInWithPassword
  → writeAuthSessionCookies(prefix=admin)
  → redirect /admin/mfa
```

### Refresh

```text
Browser
  → POST /api/auth/refresh
  → Origin + CSRF
  → refresh cookie
  → refreshAuthSession()
  → success: rotate/write cookies
  → auth failure: clear auth cookies + 401
```

### 当前 logout

```text
Browser
  → POST /api/auth/logout
  → Origin + CSRF
  → access cookie
  → revokeSupabaseSession()
       ├─ success → clear cookies
       └─ throw   → 503，当前不会 clear cookies
```

## 4. 修改文件

### 4.1 已有文件：应修改

Shared：

- `packages/domain/src/contracts/api.ts`
  - 仅在没有等价 DTO 时增加 `LogoutResultDto`。
  - 不重排/重命名已有业务 DTO。
- `packages/account-auth-nextjs/src/index.ts`
  - 保留 `revokeSupabaseSession` 的“失败可检测”能力。
  - 如当前注释暗示调用方必须保留 Cookie，改成中性语义：helper 只负责远端 revoke，不决定本地清理政策。
  - 可增加无 credential 持久化的 attempt helper，返回 remote result。
- `packages/account-auth-nextjs/tests/adapter.test.ts`
  - 保留“上游 503 不得被当作 revoke 成功”的测试。
  - 增加/调整 logout outcome 单测。

Consumer：

- `apps/template-preview/app/api/auth/_lib.ts`
  - 成为 Consumer Auth route 的唯一 response/config/security helper。
  - 增加统一 request-id / success / error response。
- `apps/template-preview/app/api/auth/login/route.ts`
- `apps/template-preview/app/api/auth/refresh/route.ts`
- `apps/template-preview/app/api/auth/logout/route.ts`
- `apps/template-preview/app/login/page.tsx`
  - 从 `payload.error.code` 解析失败，不再依赖 `data.code`。

Admin：

- `apps/admin/app/api/auth/login/route.ts`
- `apps/admin/app/api/auth/refresh/route.ts`
- `apps/admin/app/api/auth/logout/route.ts`
- `apps/admin/app/admin/login/page.tsx`

Docs：

- `docs/auth-security.md`
- 必要时 `docs/api-sdk.md`
- 若 domain public contract 实际影响 OpenAPI，按 repo contract 规则同步；先核实，不凭猜测改 OpenAPI。

### 4.2 建议新增

- `apps/admin/app/api/auth/_lib.ts`
  - Admin 对应的 config/request-id/response/origin/csrf helper。
  - 消除 admin auth route 重复实现。
  - 不依赖 Consumer app 文件。

如需要 route Vitest，优先使用 `apps/template-preview` 已有 Vitest；本阶段不为 Admin 新增测试框架依赖。

## 5. 应复用、不允许复制

必须复用：

- `authCookieNames`
- `writeAuthSessionCookies`
- `clearAuthSessionCookies`
- `revokeSupabaseSession`
- domain `ApiErrorCode` / `ApiResponse` / `ApiErrorResponse`

禁止：

- 每个 route 重新定义 cookie names。
- 新建第二套 ApiErrorCode。
- route 直接复制 raw Supabase logout fetch。
- 浏览器自行删除 HttpOnly auth Cookie。
- 为 revoke retry 把 token 放 LocalStorage/日志/队列。

## 6. 冻结接口

### Auth success

```json
{
  "data": {},
  "request_id": "uuid"
}
```

### Auth failure

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "UNAUTHORIZED"
  },
  "request_id": "uuid"
}
```

### Headers

```text
Cache-Control: no-store
X-Request-Id: <same request_id>
```

### Logout

```json
{
  "data": {
    "authenticated": false,
    "remote_revocation": "confirmed | not_required | unavailable"
  },
  "request_id": "uuid"
}
```

HTTP 语义：

- Origin/CSRF 等本地安全校验失败：对应 4xx，**不 clear**。
- 已接受 logout 且完成本地清理：2xx，即使 remote status 为 `unavailable`。
- `unavailable` 不得改写成 `confirmed`。
- UI 可以认定“当前浏览器已退出”，但不得说“远端/所有会话已撤销”。
- `remote_revocation` 必须是稳定、机器可判定字段，供 Phase 03/04 映射为用户可理解文案；route 不返回 raw provider error。

## 7. 实施步骤

1. 对比 domain API contract，确认是否只需增加 `LogoutResultDto`。
2. 在 Consumer `_lib.ts` 收敛 response helper。
3. 新建 Admin `_lib.ts`，只放 Admin auth route 共享逻辑。
4. 改 login route：保持 password sign-in；失败改标准 envelope；success 增 request_id；保持 no-store。
5. 改 refresh route：保持 Origin+CSRF、refresh token、cookie rotation；明确 refresh auth failure 清 cookies + 401；infra 503 不清有效 refresh cookie。
6. 改 logout route：
   - 先 config/origin/csrf。
   - 读取本 scope access/refresh 的存在性，按 master §2.10 映射撤销结果。
   - 尝试 remote revoke并映射 status。
   - 在已通过安全校验后，无论 revoke 结果都调用 scoped terminal-clear helper：清认证材料/ack并写 fence（不能删除 fence）。
   - 返回 `LogoutResultDto`。
7. 同步两个 login page 的新 envelope parser。
8. 更新 `docs/auth-security.md` 的 local logout / remote revocation 双结果语义。
9. 如 shared contract public export 变化，检查 consumers/tests。
10. 增单测/route integration/fault-path 回归。

## 8. 用户状态

### Login

- Idle：输入可编辑。
- Pending：不可重复提交。
- 401：credential 错误。
- 503：服务暂不可用。
- Success：Consumer 按既有目标跳转；Admin → `/admin/mfa`。

### Logout

- Pending：不可重复提交。
- `confirmed` / `not_required` / `unavailable`：本地都已退出。
- CSRF/Origin fail：logout 请求失败，不绕过安全校验。

## 9. 恢复与失败边界

- Remote revoke 失败后不保存 token 用于后台重试。
- Local clear 失败属于实现/框架故障，不能伪造成功。
- Refresh 503 不删除 refresh cookie。
- Refresh 401 清 access/refresh/csrf/recent proof。
- 不修改 Supabase server-side session schema。

## 10. 相邻模块影响

- BFF `/api/v1` 授权不变。
- Files/Subscription 本阶段不改 replay。
- Admin MFA 可复用新 response helper，但完整 MFA 留 Phase 04。
- 如果 response contract 改动导致页面 parser 失败，必须同阶段修复，不能保留双 envelope。

## 11. 旧路径退出

阶段完成时：

- login route 不再返回 `data.code` 错误。
- logout route 不再“revoke throw → 直接返回且 Cookie 未清”。
- 不同时返回 `data.code` 和 `error.code` 做临时兼容。
- 页面临时兼容 parser 必须阶段结束前移除。

## 12. 测试与验收

计划执行：

```bash
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm --filter @kit/account-auth-nextjs typecheck
pnpm --filter template-preview test:unit
pnpm --filter template-preview typecheck
pnpm --filter admin typecheck
pnpm format:check
pnpm lint
pnpm typecheck
```

必要 browser regression：

```bash
pnpm test:e2e:t12-r2
pnpm test:e2e:t16-r2
```

如 OpenAPI/shared contract 实际受影响：

```bash
pnpm contracts:check
```

必须覆盖：

1. Login bad credential → 标准 error + request_id。
2. Login upstream unavailable → 503 标准 envelope。
3. Refresh success → cookie rotated。
4. Refresh invalid → 401 + cookies 清。
5. Refresh infra unavailable → 503，不伪造 401。
6. Logout revoke success → cookies 清 + `confirmed`。
7. Logout access/refresh 均不存在且本地校验通过 → cookies 清 + `not_required`；仅 access 缺失而 refresh 尚存 → `unavailable`。
8. Logout revoke 503/throw → cookies 仍清 + `unavailable`。
9. Logout CSRF mismatch → 403，不进入 revoke/clear。
10. Admin/Consumer cookie prefix 正确。
11. Auth JSON no-store + header/body request_id 一致。
12. 响应/日志无 token、OTP、MFA secret。
13. `unavailable` 与 `confirmed` 可被上层无歧义区分，且没有 raw provider detail。

## 13. 阶段完成门槛

只有全部满足才能进入 Phase 02：

- 实施完成。
- 必要验证实际运行并记录。
- `verification-record.md` 更新真实结果。
- `git diff` 只含本阶段及必要依赖。
- 无 secret/env/user media/cache。
- commit，例如：`auth(session): phase 01 normalize auth contracts and logout`
- push 成功并确认 remote 含 SHA。
- SHA、branch、GitHub link 写入 verification record。
- push 失败时不能标“已交付”。

## 14. 交给下一阶段

必须提供：

- 最终 Auth envelope。
- `LogoutResultDto` 形态。
- Consumer/Admin auth helper 路径。
- request_id helper。
- refresh/logout 的已验证行为。
- 给 Frontend 的 logout machine contract：local logout completed 与 remote revoke status 分离。
- 尚存任何基线失败。

## 15. R1 必须实施的安全基础（ASU-01）

以 master §2.10 A/B/C/E 为唯一合同。本阶段文件范围补充：两个 app 的 `/api/v1/[...path]/route.ts`、全部 auth/callback/password/reauth/MFA Cookie 消费点、shared cookie/security helper、现有 callback state/PKCE helper、对应测试及 `docs/development/contracts.md`。只改 Cookie/gate/refresh 所需代码，不改业务算法。Admin MFA 完整 UI 留 ASU-04。

实施顺序：先记录固定 SDK 和 Auth 服务版本及全部 `setRequestAuthSession/setSession`、Cookie writer/clear 调用点；再写失败用例；落地 scoped Cookie 与 30 天 CSRF；实现 fence/ack 和 BFF gate；修正 local revoke、5 秒预算和错误分类；移除非 refresh 路径的隐式刷新；同步旧测试的 Cookie 名称与 login parser。新登录清 step-up proof，不能复用旧 proof。缺少新 scoped CSRF 的旧浏览器走一次重新登录，不设置免 CSRF 的 refresh 旁路。

新增必须通过的用例：

| ID | 条件与断言 |
|---|---|
| ASU-V01 | access 与旧 CSRF 自然到期场景可复现；新 CSRF 在 access 到期后仍有效，refresh 成功；伪造/缺少 CSRF 仍拒绝 |
| ASU-V02 | 同用户两独立 session；local logout 仅撤销目标；过期 access/普通 401/403 不伪报 confirmed；仅 refresh 存在返回 unavailable；Provider 挂起最多 5 秒后清理 |
| ASU-V03 | 同 hostname 不同端口 Admin/Consumer：登录、refresh、logout 均不删除/覆盖另一个 scope 的 CSRF/proof |
| ASU-V04 | 真实浏览器延迟 refresh 响应至 logout 之后；即使 token Cookie 迟到回写，下一 BFF/refresh/MFA 被 fence 阻断，reload 后仍退出；remote revoke 故障也成立 |
| ASU-V05 | logout 前开始的 login/callback 延迟完成不能确认新 fence；新用户登录后旧 refresh 迟到不能恢复旧 session；缺失/错误 session-bound ack 被拒绝；单测涵盖 31 天 fence/30 天 ack/refresh 与重新登录边界 |
| ASU-V06 | refresh error 对象、throw、429、5xx 分类正确；只有确定无效才清理；所有 Cookie 写入点清单齐全 |

ASU-V04/05 属于 Phase 01 的必要 browser/API 测试，不推迟到 Phase 05 才发现协议不可行。callback 流程用本地可控 fixture 验证状态绑定；真实 Provider/SMTP 另列 Staging NOT_RUN。若固定 SDK 无法实现可靠绑定或 gate，不得伪报完成或移除安全要求，记录具体缺口后修订合同。
