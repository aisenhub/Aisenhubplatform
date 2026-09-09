# 04 — Admin MFA 与 Session Adoption

> 上游：[02-shared-session-runtime.md](./02-shared-session-runtime.md)  
> 跨阶段消费合同：[frontend-integration-contract.md](./frontend-integration-contract.md)  
> 可与 Phase 03 并行  
> 文件所有权：`apps/admin/**` + Admin 对应测试片段  
> 状态：**未开始**

## 1. 目标

完成 Admin 认证闭环：

- password login → MFA required
- factor list 的 empty/error/session-expired 分离
- existing factor TOTP verify → AAL2 + server recent proof
- first enrollment verify → 同一次有效 MFA 事件直接签 recent proof
- shared session manager 处理 refresh/logout
- Admin protected fetch 不因 session expiry 各自实现不一致逻辑

不降低任何 Admin 安全要求。


新增 Frontend Integration 目标：

- factor `loading / true empty / recoverable error / expired / rate-limited` 不再混为单一 status。
- `mfa_required` / `RECENT_MFA_REQUIRED` 是正式 step-up surface，不用普通 failure toast 表达。
- MFA enrollment QR/manual secret 按一次性敏感信息 UX 处理，不进入 URL、Toast、日志或持久存储。
- Admin login/MFA 成功使用 shared safe-returnTo 恢复安全 deep-link；step-up intent 只保留非敏感上下文。
- step-up 成功后先重新读取 authoritative resource state，不自动重发旧 destructive mutation。
- logout/definitive expired 清 Admin private client state；remote revoke unavailable 不能谎称远端撤销已确认。
- Admin Security 只是 Auth 展示面：任何 recent-MFA indicator 都不替代 server proof validation。
- Login/MFA/session recovery 做 320/375/390/768/1440px 与 keyboard/focus/alert 基础验收。

## 2. 前置条件

- Phase 01、02 已交付并 push。
- 读取 Admin AGENTS + Next 本地文档。
- 重读 `docs/auth-security.md`、`docs/architecture.md`、`frontend-integration-contract.md`、Frontend Experience 架构中 Admin Security/Mutation/Error/Responsive/Accessibility 相关章节、Admin auth routes、login/MFA 页面、`tests/spikes/e2e/t12-r2-admin.mjs`。
- 核对 Account API recent-proof endpoint 的实际合同未漂移。

## 3. 已核实调用链

### Password Login

```text
/admin/login
  → POST /api/auth/login
  → write admin AAL1 session
  → /admin/mfa
```

### Existing Factor

```text
/admin/mfa
  → GET /api/auth/mfa/factors
  → setRequestAuthSession
  → list verified TOTP factors

OTP submit
  → POST /api/auth/mfa/verify
  → set current session
  → challengeAndVerify
  → elevated AAL2 session
  → Account API /admin/api/v1/auth/recent-proof
  → proof_id
  → write elevated admin cookies
  → write 5m HttpOnly recent proof
```

### Enrollment

```text
POST /api/auth/mfa/enroll
  → get QR/secret

POST /api/auth/mfa/enroll/verify
  → challengeAndVerify
  → elevated AAL2 session
  → 当前只写 elevated cookies
  → UI 再要求第二次 OTP
```

## 4. 目标 Server Helper

在 Admin Auth shared lib 抽出**唯一 recent-proof issuance helper**。

建议职责：

```ts
issueAdminRecentProof({
  elevatedAccessToken,
  factorId,
  requestId
})
  → { proofId }
```

实际返回以 Account API 当前代码为准，不编造额外字段。

不变量：

- 只接受服务端刚完成 challengeAndVerify 的 elevated token。
- factorId 必须是当前已验证 factor。
- Account API 继续再次验证 Admin/AAL2/session。
- proof cookie 继续 server-set HttpOnly。
- helper 不接受浏览器传 proofId。
- helper 失败时不能把 Admin 当近期 MFA 已完成。

## 5. 文件

### 建议新增

- `apps/admin/app/_lib/auth-session-client.ts`
  - Admin scope manager instance。

如果 Phase 01 已新增 `apps/admin/app/api/auth/_lib.ts`：

- 优先把 recent-proof helper 放入该 server-only lib。
- 只有职责明显过重才新增 `apps/admin/app/api/auth/_recent-proof.ts`。

### 修改

- `apps/admin/app/admin/login/page.tsx`
- `apps/admin/app/admin/mfa/page.tsx`
- `apps/admin/app/api/auth/mfa/factors/route.ts`
- `apps/admin/app/api/auth/mfa/enroll/route.ts`
- `apps/admin/app/api/auth/mfa/enroll/verify/route.ts`
- `apps/admin/app/api/auth/mfa/verify/route.ts`
- refresh/logout route（仅 shared contract 接入所需）
- `tests/spikes/e2e/t12-r2-admin.mjs`

剩余 protected page 的 transport 全量收尾放 Phase 05。

## 6. Frontend surface 与一次性敏感信息边界

### Factor RemoteData

Admin MFA factor 读取至少等价区分：

```text
loading
success(factors)
true empty → enrollment
recoverable error (429/503/network)
expired / unauthenticated
```

禁止继续：

```text
!response.ok || factors.length === 0
  → “没有 factor”
```

### Enrollment Secret

QR / manual TOTP secret 只在当前 enrollment flow 显示：

- 明确一次性绑定信息警告；
- manual secret 可复制但不写 URL/Toast/analytics/console；
- 页面离开后不从浏览器存储恢复；
- mobile 不溢出；
- 不能因为 proof issuance 失败而重新生成第二个 factor secret。

### Admin Security

如果本阶段需要向后续 Frontend Admin Security 页面提供 Auth 展示数据：

- 只暴露安全的 identity/session/factor 状态；
- 不增加 token/proof getter；
- 不用 browser countdown 作为 recent-MFA authority；
- 服务端 recent proof 校验仍是唯一权限事实。

## 7. MFA Error Mapping

服务器至少区分：

| 场景 | HTTP/code |
|---|---|
| 请求格式错误 | 400 `INVALID_INPUT` |
| session 缺失/失效 | 401 `UNAUTHORIZED` |
| OTP/factor 未满足 | 403 `MFA_REQUIRED` |
| recent proof 需要重新认证 | 403 `RECENT_MFA_REQUIRED` |
| Provider rate limit | 429 `RATE_LIMITED` |
| Provider/Account Auth 不可用 | 503 `AUTHORIZATION_UNAVAILABLE` |

不能把所有非 5xx MFA error 都压成 `MFA_REQUIRED`，尤其是可识别 429。

UI：

- 200 + [] → enrollment。
- factor GET 首次 401 → shared refresh → 最多重读一次；只有 refresh 401 → expired/login。OTP/verify 的 401 走专用恢复，不自动重发验证码。
- 429 → 稍后重试，保留 context。
- 503 → 服务暂不可用，保留 context，可显式重试。
- wrong OTP → 保留 factor/enrollment 流程，不因 API 错误错误地重启 enrollment。
- 技术 code 不作为普通用户主文案；request id 可在 support/technical detail 中保留。

## 8. Enrollment 一次验证闭环

目标：

```text
生成 enrollment
  ↓
用户扫码并输入第一个 6 位码
  ↓
server challengeAndVerify
  ↓
AAL2 elevated session
  ↓
复用 issueAdminRecentProof（捕获成功/失败；失败也回写已确认 elevated session）
  ↓
write elevated session cookies
  ↓
write recent proof cookie (5m)
  ↓
redirect /admin
```

不再：

```text
enroll verify → “已绑定” → 再输入一个 OTP → second challenge
```

### Proof issuance 失败恢复

如果 factor challenge 已成功、但 recent-proof Account API 失败：

- factor 已可能成为 verified；不能伪造“绑定失败”。
- UI 表达：“认证器已绑定，但近期认证证明获取失败，请重新验证该 factor”。
- 重新加载 factors 后应看到 verified factor。
- 用户通过 existing factor verify 获得 proof。
- 不自动重新 enroll 第二个 factor。

## 9. Session Manager 接入

### Login

password success：

```text
state = mfa_required
redirect /admin/mfa
```

不能标成 fully authorized Admin。

### MFA Success

只有 recent proof 签发成功后：

```text
state = authenticated
redirect /admin
```

如果 login/MFA/step-up 起点存在合法 same-origin returnTo：

- 使用 Phase 02 shared safe-returnTo 恢复 deep-link；
- URL 只恢复导航位置，不携带 token/proof/OTP/secret/mutation body；
- 对高风险 step-up intent，回到原 resource surface 后先 refetch authoritative state，再允许用户重新确认；禁止直接重发旧 destructive request。

### Refresh

- Admin 401 → shared single-flight refresh。
- Refresh 401 → expired。
- Refresh success 不延长 recent proof。
- `RECENT_MFA_REQUIRED` → mfa_required，引导 MFA；不自动重放高风险 mutation。

### Logout

走 Phase 01/02 manager contract。remote unavailable 不恢复本地 Admin session。

本 Tab logout/definitive expired 必须清理 Admin private data、sensitive drawer/dialog、pending high-risk intent、one-time enrollment secret surface；refresh 503/network 不做 terminal purge。remote unavailable 的 UI 只能说明“当前浏览器已退出，远程撤销暂时无法确认”的等价语义。

## 10. Protected Admin 不变量

- 管理路由/server action 的 Admin session/AAL2 校验继续 server-side。
- 高风险动作 recent proof 继续 server-side。
- manager `authenticated` 不能替代 authorization。
- 不根据浏览器 factor 数量授权。
- 不缓存 proof。
- 不延长 proof TTL。
- 不把 MFA_REQUIRED 变成 401 refresh loop。
- 不把 Browser recent-MFA indicator/countdown 当授权依据。
- 不为 step-up 恢复持久化 destructive request、OTP、proof 或 secret。
- `resolved:false` 不得触发错误 login redirect；refreshing 不应清空已有安全上下文。

## 11. 实施步骤

1. 接入 Admin manager instance。
2. 迁移 login。
3. 修 factors API/UI 状态分离。
4. 抽 recent-proof issuance helper。
5. existing factor verify 改用 helper并保持原安全语义。
6. enrollment verify 在 AAL2 后直接调用同 helper。
7. 实现 enrollment proof-failure 恢复状态。
8. 迁移 MFA fetch 到 shared auth client；OTP submit `never`；factor loading/empty/error/expired 分离。
9. 将 enrollment QR/manual secret 接入一次性敏感信息展示规则，并验证 mobile/keyboard/focus。
10. 接入 safe returnTo 与 step-up intent 恢复：proof success 后 refetch authoritative resource state，不自动重放旧 destructive request。
11. 迁移 logout，并建立本 Tab terminal cleanup。
12. 检查 Admin landing/核心 read 的 expiry/refreshing 恢复；剩余列 Phase 05。
13. 扩展 t12 browser E2E，并补 320/375/390/768/1440px Login/MFA/session-recovery 手工/自动浏览器验收。

## 12. 必测场景

1. Admin password login → MFA；AAL1 不能做 protected Admin action。
2. factors 200 empty → enrollment。
3. factors 首次 401 → refresh/reload；refresh 401 才 expired，不显示 empty；refresh 503 保留可恢复错误。
4. factors 503 → unavailable，不显示 empty。
5. factors 429（可控时）→ rate-limit。
6. enrollment QR/secret 只在当前流程显示，不进日志。
7. enrollment wrong code → context 保留。
8. enrollment success → 一次 OTP 得到 AAL2 + recent proof → Admin。
9. enrollment success但 proof issuance fail → factor 保持 verified，可 existing verify恢复。
10. existing factor wrong code → MFA_REQUIRED。
11. existing factor success → proof 5m。
12. refresh 后 proof expiry 不延长。
13. high-risk action 无 proof → RECENT_MFA_REQUIRED。
14. proof expired → 重新 MFA。
15. logout confirmed/unavailable 都清本地 Admin session。
16. Admin/Consumer cookies 不串用。
17. unresolved 初始状态不误跳 login；refreshing 不把已有安全页面上下文清空。
18. MFA/login 成功恢复合法 deep-link；external/敏感 returnTo 被拒绝。
19. recent MFA step-up 成功后先 refetch authoritative resource state，不自动提交旧 destructive intent。
20. logout/expired 清 Admin private state；refresh 503 不做 terminal purge。
21. remote revoke unavailable 的文案不声称远端 revoke confirmed。
22. enrollment secret 不进入 URL/log/toast/持久存储。
23. Admin Security 相关 UI indicator 不替代 server proof validation。
24. 320/375/390/768/1440px MFA QR/OTP 无溢出，keyboard/focus/error announcement 可用。

## 13. 计划命令

```bash
pnpm --filter admin typecheck
pnpm --filter @kit/account-auth-nextjs test:unit
pnpm test:e2e:t12-r2
pnpm format:check
pnpm lint
pnpm typecheck
```

如 shared contract 实际改变：

```bash
pnpm contracts:check
```

Admin app 当前没有已核实的 unit test script；不为本阶段单独引入新测试框架。纯逻辑优先放已有 shared Vitest，route/browser integration 用现有 Playwright E2E。

## 14. 旧路径退出

阶段结束：

- MFA page 不再用 `!response.ok || !factors.length` 合并 error/empty。
- enrollment 后不再要求第二个 OTP。
- enrollment/existing recent-proof issuance 不复制两套实现。
- OTP submit 不 auto replay。
- Admin login/logout 不手写另一套 session state。

## 15. 完成门槛

- Admin browser E2E 覆盖核心 MFA 闭环。
- `frontend-integration-contract.md` 中 Admin 适用项有实际证据：factor RemoteData、safe returnTo、step-up authoritative refetch、terminal cleanup、MFA one-time secret、responsive/a11y。
- 高风险授权无回归。
- record 据实更新。
- diff 只含 Admin 与必要 test/doc dependency。
- commit，例如：`auth(admin): phase 04 unify mfa and session flow`
- push 成功并记录 SHA/链接。
- 把剩余未迁移 Admin protected fetch 列表交 Phase 05。

## 16. 并行约束

- 不修改 `apps/template-preview/**`。
- 不私自改变 Phase 02 shared contract。
- shared bug 由集成负责人修并先 push。
- `verification-record.md` 并行时由集成负责人合并。

## 17. R1 MFA 部分成功与刷新所有权（ASU-04）

执行 master §2.10 E，不复用“proof 失败立即 return，丢弃 elevated session”的旧代码。提取一个统一响应 finalizer：challenge 成功后所有分支均按约定写 elevated Cookie；proof 成功写 5 分钟 proof，失败清旧 proof并附非敏感 details。finalizer 绝不写 fence/ack。

factor GET 使用不会隐式刷新的已验证 Auth 调用；过期 access 返回 401 给 manager，GET 重读成功只更新 factor 列表，不能 markAuthenticated 或清 stepUp。枚举 429、SDK 返回 error 与 throw。verify mutation 仍专用 never，MFA 会话更新与显式 refresh 排序，不靠多个 per-request setSession 竞争轮换。

ASU-V12：首次一个 OTP 完成 AAL2/proof；随后 fault-inject proof 503/429/403/响应丢失，分别验证 factor 仍 verified、正常可控失败响应回写 elevated Cookie、旧 proof 已清、UI 不重复 enroll、existing-factor 验证可恢复。用模拟等待越过 token reuse 容错窗口的场景验证新 Cookie 已可用，不能只靠紧邻请求偶然成功。

ASU-V13：factors 401→refresh→200 仍保持 admin_mfa；refresh 401 才终态；503/429 不变 empty；logout 与 MFA 迟到响应并发后 BFF gate 仍拒绝。所有成功/错误分支均无 token/QR/secret 泄漏，截图证据遮挡真实敏感材料。
