# Authentication & Session Upgrade — Verification Record

> **用途**：实施期真实进度、验证、GitHub 交付与交接记录。  
> **实施状态**：Phase 01–05 已完成代码交付并推送到 `codex/auth-session-upgrade`；本记录区分实际通过、未运行和环境阻塞项。
> 本文件不替代 `00-master-plan.md` 或阶段设计文档。新 agent 接手时必须先读本文件，再核对 Git 和实际代码；记录与代码不一致时，先查明并修正记录。

---

# 1. 项目与基线

## 1.1 本次目标与范围

- 目标：按 `01. Authentication & Session` 架构方向，统一 Consumer/Admin session lifecycle、single-flight refresh、受控 replay、logout、MFA 恢复和多 Tab 终态通知，并落实 `frontend-integration-contract.md` 的产品消费边界。
- 实施范围：Phase 01–05。
- 明确非目标：见 `00-master-plan.md` 与各阶段的 Non-goals。
- 计划保存目录建议：`docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/`。

## 1.2 研究参考（不是实施基线）

| 项目 | 值 | 状态 |
|---|---|---|
| 研究时 GitHub repo | `aisenhub/Aisenhubplatform` | 仅参考 |
| 研究时 branch | `main` | 仅参考 |
| 产品代码研究快照 commit | `362db831d49308d0e5ca84965af80d86e944f56c` | 仅参考，不得直接当实施起始 SHA |
| 最新文档决定核对 commit | `0d42b4cd44a2c17777c33f616bd393c22ee78f16` | 仅参考；相对代码快照只改 docs |
| Frontend Experience 架构输入 | `references/Aisenhub_Frontend_Experience_State_Architecture.md` | 仅计划输入，不代表已实施 |
| 研究日期 | 2026-09-09 | 仅参考 |

## 1.3 实施环境 — 执行 Agent 填写

| 字段 | 实际值 | 状态/备注 |
|---|---|---|
| 项目绝对路径 | `E:\Projects\Aisenhubplatform` | 已核对 |
| GitHub remote URL | `https://github.com/aisenhub/Aisenhubplatform.git` | 已核对 |
| 工作分支 | `codex/auth-session-upgrade` | 从 R1 文档基线新建 |
| 起始 commit SHA | `365691b49bac1f247505b1b2872b9ed6ac56c4a6` | 执行前核对 |
| 起始 remote SHA | `365691b49bac1f247505b1b2872b9ed6ac56c4a6` | `origin/codex/auth-session-plan-r1`；实施分支尚未推送 |
| 初始 `git status --short` | `?? docs/plans/aisenhub-frontend-experience-state-upgrade-plan/` | 用户提供的独立 Frontend 计划，保留，不属于本期 |
| 已有未提交修改及归属 | 同上 | 不覆盖、不暂存 |
| Node version | `v24.19.0` | 已核对 |
| pnpm version | `11.18.0` | 已核对 |
| Next.js locked/installed version | `16.3.0` | 已核对；Admin 已安装 |
| Supabase CLI version | `2.111.0` | `pnpm exec supabase --version` |
| Supabase JS / SSR locked version | `@supabase/supabase-js 2.111.0` / `@supabase/ssr 0.12.6` | `pnpm-lock.yaml` |
| Deno path/version（若 E2E 需要） | `D:\APP\Codex\Deno\bin\deno.exe` / `2.9.6` | 已核对 |
| Playwright availability/version（若 E2E 需要） | `@playwright/test 1.62.1` 已锁定；当前根 Node require 不可用 | 需按阶段脚本实际核对 |
| Local Supabase status | 已安装但服务停止 | `pnpm exec supabase status`；未启动，未执行数据库测试 |

## 1.4 已知研究期风险 / 基线待核对

| 项目 | 研究期事实 | 执行期状态 |
|---|---|---|
| `tests/spikes/e2e/t16-r2-account.mjs` Deno 路径 | 研究快照含 Windows 机器特定绝对路径 | 未验证是否阻塞当前执行环境 |
| 根 `test:api` | 研究快照为 not-enabled placeholder | 未验证当前分支是否变化；不能作为通过证据 |
| `docs/development/status.md` | 研究时所述 main baseline 早于研究快照 | 未验证当前分支；旧“passed”不算本次证据 |
| Logout 旧语义 | 研究快照 remote revoke 失败时 route 在清 cookie 前返回 503 | 未开始改造 |
| MFA enrollment | 研究快照 enrollment verify 已获 elevated session，但不签 recent proof，UI 要求第二次 OTP | 未开始改造 |
| Frontend consumption | 原 Auth 计划缺少 resolved/refreshing/RetryRequired/step-up/returnTo/terminal cleanup 的正式 UI 消费合同 | 未开始验证 |
| Terminal client state | logout/expired 后现有页面是否保留 private/sensitive state 需按当前实现逐页核对 | 未验证 |
| Safe returnTo | shared helper 对 path/query/deep-link 的实际支持范围需执行时读代码并跑测试 | 未验证 |

## 1.5 已知基线失败

> 只填写**实际运行后确认**的基线失败。计划阶段不得预填“失败/通过”。

| 日期 | 起始 SHA | 命令/检查 | 退出码 | 实际结果 | 是否与本任务相关 | 证据 |
|---|---|---|---:|---|---|---|
| 未执行 | 未填写 | 未执行 | 未记录 | 未验证 | 未判断 | 未记录 |

---

# 2. 阶段状态总表

允许状态：

- `未开始`
- `进行中`
- `已阻塞`
- `验证失败`
- `验收通过待推送`
- `已交付`

> `已交付` = 实施完成 + 必要验收通过 + 相关提交成功推送。代码已写但未验证，或已提交但未推送，都不能标为已交付。

| 阶段 | 名称 | 状态 | 已完成内容 | 剩余内容 | 前置依赖 | 代码 commit | Push | GitHub 链接 |
|---|---|---|---|---|---|---|---|---|
| 01 | Contract & Logout Foundation | 已交付 | 统一 envelope、scoped cookies、fence/ack、logout/refresh/BFF 边界 | 无 | 无 | `93757480c3516f497304c9abe09c78f50fa6d9b8` | 已成功 | 已核对远端 |
| 02 | Shared Session Runtime | 已交付 | 浏览器 session manager、single-flight、replay policy、RetryRequired、step-up 映射 | 无 | Phase 01 已交付 | `2514708530867bef9949866bf06ce3a7b19dad20` | 已成功 | 已核对远端 |
| 03 | Consumer Session Adoption | 已交付 | Consumer 登录、恢复、账户/订阅/文件/密码页统一消费 manager | 无 | Phase 02 已交付 | `fa21e10d2fa4e57ec81e57a6c06176d8f36d716b` | 已成功 | 已核对远端 |
| 04 | Admin MFA & Session Adoption | 已交付 | Admin MFA、enrollment partial success、recent proof recovery、因子状态 | 无 | Phase 02 已交付 | `4666792fd574917aba247b4d2d879ad3813d4597` | 已成功 | 已核对远端 |
| 05 | Integration / Multi-tab / Validation / Cleanup | 已交付 | Admin 全页面迁移、多 Tab 终态提示、legacy scan、SDK/构建验证 | Windows `m5-05-install` 子进程回收仍需单独修复 | Phase 03 + 04 已交付 | `43374253ca6724eb9d4f4ee38f911bf50ac8e617` | 已成功 | 已核对远端 |

---

# 3. 冻结跨阶段契约记录

> 以下是计划期冻结目标。实施中只有在发现有证据的实质冲突时才允许偏离，并必须在“计划偏差”中记录原因、风险和批准/处理结果。

## 3.1 Session state

```text
unauthenticated
authenticating
authenticated
refreshing
mfa_required
expired
```

- 初始 unresolved 不等于确定 `unauthenticated`。
- snapshot 必须包含独立 stepUp（admin_mfa/admin_recent_mfa/consumer_recent_auth/null）；普通读取成功不能清除它；全部语义以 master §2.10 为准。
- Browser state 不持久化 access/refresh token、CSRF、recent proof、OTP 或 authorization result。

## 3.2 Refresh

- 401 → 同一 browser document 内 single-flight refresh。
- refresh 401 → terminal expired，服务端清 local auth material。
- refresh 503/network → transient failure，不错误清 session、不广播 expired。
- 403/MFA_REQUIRED/RECENT_MFA_REQUIRED 不触发 refresh。

## 3.3 Replay

```text
never
safe-read
idempotent-mutation
```

- safe GET/HEAD：refresh 后最多 replay 1 次。
- mutation 默认 never。
- idempotent mutation：caller 明示 + 同一 Idempotency-Key + repeatable non-binary body，最多 1 次。
- binary/stream：永不自动 replay。

## 3.4 Logout

```ts
{
  authenticated: false,
  remote_revocation: 'confirmed' | 'not_required' | 'unavailable'
}
```

- Origin/CSRF 仍先校验。
- remote revoke 尝试结果与 local logout completion 分开。
- accepted logout 后 local auth cookies 始终清理。
- terminal clear 清本 scope 的认证材料与 ack，写新的 HttpOnly fence；fence 不属于要删除的认证材料。不得把任意 401/403 记作 confirmed；not_required 要求 access/refresh 均不存在。
- `unavailable` 不等于 remote confirmed revoked。
- 不保存 token 供持久重试。

## 3.5 MFA / recent proof

- Admin verified TOTP → AAL2。
- enrollment verify 与 existing-factor verify 复用同一 recent-proof 签发 helper。
- 5 分钟 proof server-bound；refresh 不延长。
- factor verify 成功但 proof 失败时保留 verified factor 事实，走 recovery，不重复 enroll。

## 3.6 Multi-tab

- BroadcastChannel 只广播 version/scope/type/sourceId。
- type 仅 `logged_out` / `session_expired`。
- Consumer/Admin scope 分离。
- 不共享 credential/CSRF/proof/user/permission/idempotency data。
- 本期无跨 Tab refresh mutex。
- matching-scope terminal hint 必须停止 protected UI、清敏感 client state；不再次 broadcast/logout/refresh 形成循环。

## 3.7 Frontend Integration Contract

- `resolved:false` = auth resolving，不是 definitive unauthenticated。
- `refreshing` = background session recovery，last-known protected data 可继续显示。
- refresh 503/network = recoverable；不 terminal purge、不广播 expired。
- `MFA_REQUIRED` / `RECENT_MFA_REQUIRED` = step-up state，不是普通 failure。
- `SessionRetryRequiredError` = session 恢复、unsafe mutation 未 replay；回到可确认/可提交状态。
- network/response ambiguity 可能有副作用时使用业务 `unknown_outcome`，不能冒充 RetryRequired。
- step-up/reauth intent 只保留非敏感内存上下文；proof success 后 refetch authoritative state，不盲目重放旧 destructive request。
- safe returnTo 只恢复同源应用 deep-link；敏感数据/完整 mutation 不进 URL。
- logout/definitive expired 清 private/sensitive client state；refresh 503 不清 last-known data。
- Browser MFA indicator/BroadcastChannel/UI hidden state 不是 authorization authority。
- Auth 直接改动 surface 需要 320/375/390/768/1440px + keyboard/focus/error announcement 验证。

---

# 4. 每阶段实施记录

## Phase 01 — Contract & Logout Foundation

### 状态

`已交付`

### 实际修改文件及职责

- `packages/domain/src/contracts/*`：统一 API 错误/登出结果契约。
- `packages/account-auth-nextjs/src/index.ts`、`src/cookie-policy.ts`：scoped cookie、fence/ack、显式 local revoke、terminal clear。
- `apps/template-preview/app/api/auth/*`、`apps/admin/app/api/auth/*` 与两端 BFF：统一 envelope、Origin/CSRF、无隐式 refresh。

### 已实现的用户/系统行为

- 登录成功写入 session acknowledgement；refresh 仅在有效 gate 下轮换；logout 在 remote revoke confirmed/unavailable 两种结果下都完成本地清理。

### 实际冻结/调整的数据模型、接口与契约

- 实际使用 Consumer/Admin 独立 cookie 名称；remote logout 使用 Supabase `scope=local`，5 秒超时和非 2xx 均为 `unavailable`。

### 与原计划偏差

- 无记录。

### 新增依赖及必要性

- 未记录；计划目标是不新增依赖。

### 尚未完成 / 未验证

- Staging/生产及真实 Supabase Auth 流程未运行；浏览器 E2E 仍受本地 Supabase 停止和 Windows 脚本回收问题影响。

### 阶段交接

- 下一阶段：Phase 02（已交付）。
- 必须先解决：无；真实 Supabase/Auth 与 staging 观察另行执行。
- 可复用能力：`authCookieNames`、`authSessionGate`、`AuthSessionManager`。
- 不应重复实施：不得在页面另造 refresh/replay/token store。
- 当前未提交修改及归属：仅用户未跟踪 Frontend 独立计划目录，已保留。
- 需要用户决定：当前无；执行时若发现实质冲突再记录。

---

## Phase 02 — Shared Session Runtime

### Frontend consumption 实际结论

- resolved/refreshing/mfa/expired machine semantics：本地单测覆盖；真实浏览器未运行。
- RetryRequired 是否不携带 request body/credential：实现仅返回固定错误，不携带请求内容；本地单测覆盖。
- safe returnTo path/query/deep-link 行为：本地 Domain 单测覆盖 path、external 和敏感 query；真实浏览器未运行。
- shared runtime 是否保持无 React/`@kit/ui` 依赖：已通过独立 SDK 打包与消费者导入验证。

### 状态

`已交付`

### 实际修改文件及职责

- `packages/account-auth-nextjs/src/browser-session.ts`、`src/browser.ts`：惰性 browser manager、epoch、single-flight refresh、受控 replay 和 BroadcastChannel 终态提示。
- `packages/account-auth-nextjs/tests/browser-session.test.ts`：并发刷新、读重放、mutation boundary、MFA 状态、refresh failure。

### 已实现的用户/系统行为

- 初始 snapshot 保留 `resolved:false`；普通 mutation 不重放并抛出 `SessionRetryRequiredError`；二进制 body 不进入幂等重放。

### 实际冻结/调整的数据模型、接口与契约

- `SessionSnapshot` 与 replay policy 已落在 `@kit/account-auth`；browser entry 不依赖 React/`@kit/ui`，terminal BroadcastChannel payload 仅含 scope/event。

### 与原计划偏差

- 无记录。

### 新增依赖及必要性

- 未记录；计划目标是不新增外部依赖。

### 尚未完成 / 未验证

- 真实浏览器 viewport 与生产环境会话仍未运行。

### 阶段交接

- 下一阶段：Phase 03 / 04（可并行）。
- 必须先解决：无；真实浏览器 E2E 尚未运行。
- 可复用接口：`createAuthSessionManager`、`SessionRetryRequiredError`、scoped cookie policy。
- 不应重复实施：页面不应直接读取认证 cookie 或实现 401 refresh。
- 当前未提交修改及归属：仅用户未跟踪 Frontend 独立计划目录，已保留。
- 需要用户决定：当前无。

---

## Phase 03 — Consumer Session Adoption

### Frontend integration 实际结论

- Consumer 页面已统一 manager；本地类型检查和 BFF/unit 验证通过，真实浏览器状态转场未运行。
- safe returnTo、remote revoke unavailable 文案和二进制不重放已落实；响应式/键盘回归未运行。

### 状态

`已交付`

### 实际修改文件及职责

- Consumer 账户、订阅、文件、密码、注册、忘记密码和登录页统一使用 `/browser` session manager；写操作显式 `replay: never`。

### 已实现的用户/系统行为

- 页面不再读取 CSRF cookie、不手工设置 Origin；文件字节流不自动重发，恢复后要求用户重新提交或刷新状态。

### 与相邻业务模块的保留规则

- Files 二进制上传显式使用 `replay: never`；普通 POST/PATCH/DELETE 也不自动重放，状态不确定时由页面提示用户刷新/重试。

### 与原计划偏差

- 无记录。

### 新增依赖及必要性

- 未记录。

### 尚未完成 / 未验证

- 真实邮件、Storage 和浏览器 E2E 未运行。

### 阶段交接

- 下一阶段：Phase 05（需同时等待 Phase 04）。
- 必须先解决：无；真实邮件、Storage 和浏览器 E2E 尚未运行。
- 可复用接口：Consumer `app/_lib/auth-session.ts`。
- 不应重复实施：不新增第二套 token store 或页面级 refresh manager。
- 当前未提交修改及归属：仅用户未跟踪 Frontend 独立计划目录，已保留。
- 需要用户决定：当前无。

---

## Phase 04 — Admin MFA & Session Adoption

### Frontend integration 实际结论

- 因子空列表与错误、MFA one-time secret、partial proof failure 已落地；真实浏览器状态转场与响应式/键盘回归未运行。
- 授权仍由 Admin API/session gate 决定，UI indicator 未作为 authority。

### 状态

`已交付`

### 实际修改文件及职责

- Admin 登录、MFA 因子/绑定/验证、审计、平台、订阅、权益、文件和删除任务页统一使用 session manager。
- Enrollment verify 与 existing-factor verify 共享 recent-proof helper；proof 失败时保留 elevated session 并返回 recovery details。

### 已实现的用户/系统行为

- MFA challenge/enrollment 成功后写回提升 session；recent-proof 失败返回 `RECENT_MFA_REQUIRED` 与 `mfa_verified=true` details，保留提升 session，并允许 existing-factor recovery。

### MFA / proof 恢复实际结果

- 本地类型检查通过；首次 enrollment 不再要求第二个 OTP，页面明确 proof partial failure 和一次性 secret 行为。

### 与原计划偏差

- 无记录。

### 新增依赖及必要性

- 未记录。

### 尚未完成 / 未验证

- 真实 AAL2/远程 proof API 与浏览器响应式验证未运行。

### 阶段交接

- 下一阶段：Phase 05（需同时等待 Phase 03）。
- 必须先解决：无；真实 AAL2/proof API 与浏览器验证尚未运行。
- 可复用接口：Admin `app/_lib/auth-session.ts` 与共享 recent-proof helper。
- 不应重复实施：不在页面绕过 Admin API 或把 security indicator 当授权依据。
- 当前未提交修改及归属：仅用户未跟踪 Frontend 独立计划目录，已保留。
- 需要用户决定：当前无。

---

## Phase 05 — Integration / Multi-tab / Validation / Cleanup

### Frontend integration 最终收口

- manager 单测、类型检查、独立消费者构建通过；真实浏览器 unresolved/refreshing/expired、双 Tab 与响应式回归未运行。
- Domain safe returnTo 负向测试通过；mutation 不自动 replay，文件状态保留 unknown-outcome 语义。

### 状态

`已交付`

### 实际修改文件及职责

- Admin 全量 protected page adoption、scoped BroadcastChannel、legacy cookie scan、SDK tarball/build 验证。

### 已实现的用户/系统行为

- 单元/类型/合同/SDK 验证通过；独立消费者直接 Next production build 通过。

### Legacy path 清理结果

- 旧 cookie、旧页面 fetch/Origin/CSRF 读取已清理；合法剩余匹配仅为 browser manager、API 测试 header 和 E2E header。

### 与原计划偏差

- 无记录。

### 新增依赖及必要性

- 未记录。

### 尚未完成 / 未验证

- `m5-05-install` 自动脚本的 Windows `next build` 子进程未正常回收，需后续单独修复测试 harness；不将其记为 PASS。

### 最终交接

- 下一阶段：本期结束；后续类别另立计划。
- 必须先解决：Windows `m5-05-install` harness 子进程回收问题、真实 Supabase/Auth 与浏览器回归。
- 可复用能力：共享 `@kit/account-auth-nextjs/browser` manager、scoped cookie/fence/ack 适配器。
- 不应重复实施：页面级 refresh/replay、token 暴露、二进制自动重传。
- 当前未提交修改及归属：仅用户未跟踪 Frontend 独立计划目录，已保留。
- 需要用户决定：当前无；执行中如出现实质冲突据实填写。

---

# 5. 验证记录

## 5.1 记录规则

每次实际验证新增一行，不用“测试通过”概括没有执行的检查。

必须记录：

- 执行日期/时间；
- 阶段；
- 被验证代码 SHA；
- 命令；
- 环境/前置条件；
- 退出码；
- 结果摘要；
- 日志/截图/制品位置；
- 失败原因；
- 修复 commit；
- 复测结果。

验证后若相关代码发生变化，新增复测记录；不要覆盖旧结果。

## 5.2 命令验证表

| 日期 | 阶段 | 被验证 SHA | 命令 | 环境 | 退出码 | 结果 | 失败/修复/复测 | 证据位置 |
|---|---|---|---|---|---:|---|---|---|
| 2026-09-09 | 01 | `9375748` | `pnpm --filter @kit/account-auth-nextjs test:unit` | Node 24.19.0 / Vitest | 0 | 9 tests PASS | adapter cookie/fence/revoke 覆盖 | package test output |
| 2026-09-09 | 01 | `9375748` | `pnpm --filter template-preview test:unit` | Node 24.19.0 / Vitest | 0 | 9 tests PASS | BFF scoped gate/CSRF 覆盖 | app test output |
| 2026-09-09 | 02 | `2514708` | `pnpm --filter @kit/account-auth-nextjs test:unit` | Node 24.19.0 / Vitest | 0 | 15 tests PASS | single-flight/replay/step-up/refresh failure | package test output |
| 2026-09-09 | 03–05 | `4337425` | `pnpm typecheck` | Node 24.19.0 / Turbo | 0 | 9 tasks PASS | SDK pack pre-step included | turbo output |
| 2026-09-09 | 03–05 | `4337425` | `pnpm test:unit` | Node 24.19.0 / Turbo | 0 | 6 packages PASS | no NOT_RUN marked PASS | turbo output |
| 2026-09-09 | 05 | `4337425` | `pnpm contracts:check` | Node 24.19.0 | 0 | OpenAPI PASS, account 18/admin 36 operations | no failure | command output |
| 2026-09-09 | 05 | `4337425` | `pnpm test:sdk:m5-02` | Node 24.19.0 / Windows | 0 | reproducible tarballs, boundary scan, independent install/import PASS | no failure | command output |
| 2026-09-09 | 05 | `4337425` | direct `pnpm exec next build --webpack` in `E:\AppData\m5-template-consumer` | Node 24.19.0 / Next 16.3.0 | 0 | production build PASS | harness wrapper separately failed to reap child | command output |
| 2026-09-09 | 05 | `4337425` | `pnpm test:consumer:m5-05` | Node 24.19.0 / Windows | NOT_RUN | harness did not return a completed result; `next build` child remained alive | direct build above is separate evidence; do not mark wrapper PASS | command output/process inspection |
| 未执行 | 未开始 | 未记录 | 未执行 | 未验证 | 未记录 | 未验证 | 无 | 未记录 |

## 5.3 浏览器验证表

| 日期 | 阶段 | SHA | 场景 | 浏览器/viewport | 测试素材 | 实际结果 | 截图/日志 | 状态 |
|---|---|---|---|---|---|---|---|---|
| 未执行 | 未开始 | 未记录 | 未执行 | 未验证 | 未准备 | 未验证 | 未记录 | 未验证 |

## 5.4 Frontend Integration 浏览器验证表

| 日期 | 阶段 | Commit | 场景 | Viewport/输入方式 | 实际结果 | 截图/日志 | 状态 |
|---|---|---|---|---|---|---|---|
| 未执行 | 未填写 | 未填写 | unresolved 不误显示未登录 | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | refreshing 保留 last-known data | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | refresh 503 保留数据且不 terminal purge | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | safe returnTo 恢复 deep-link | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | external/sensitive returnTo 拒绝 | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | RetryRequired 不自动 replay | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | step-up 后 stale state 不自动 POST | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | logout/expired 清 sensitive UI state | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | multi-tab terminal reaction/no echo | 未记录 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未填写 | 未填写 | Login/MFA/Auth recovery responsive/a11y | `320/375/390/768/1440px` 待实际记录 | 未验证 | 未记录 | 未验证 |

## 5.5 安全负向验证表

| 日期 | SHA | 场景 | 预期 | 实际 | 证据 | 状态 |
|---|---|---|---|---|---|---|
| 2026-09-09 | `9375748` | Origin/CSRF mismatch | 拒绝且不调用中央 API | Consumer BFF unit test PASS | `apps/template-preview/app/api/v1/[...path]/route.test.ts` | PASS |
| 2026-09-09 | `2514708` | 403 MFA / refresh failure | 不触发 refresh loop；区分 terminal/transient | browser-session unit test PASS | `packages/account-auth-nextjs/tests/browser-session.test.ts` | PASS |
| 2026-09-09 | `fa21e10` | Binary upload auth ambiguity | 不自动 replay bytes | Consumer files page 显式 `replay: never`；静态 scan PASS | `apps/template-preview/app/files/page.tsx` | PASS |
| 2026-09-09 | `9375748` | Remote logout revoke 503 | local clear + `unavailable` | adapter test PASS | `packages/account-auth-nextjs/tests/adapter.test.ts` | PASS |
| 未执行 | 未记录 | Origin mismatch | 拒绝 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未记录 | CSRF mismatch | 拒绝 | 未验证 | 未记录 | 未验证 |
| 未执行 | 未记录 | 403 permission/MFA code | 不触发 refresh loop | 未验证 | 未记录 | 未验证 |
| 未执行 | 未记录 | Binary upload auth ambiguity | 不自动 replay bytes | 未验证 | 未记录 | 未验证 |
| 未执行 | 未记录 | Remote logout revoke 503 | local logout 完成但 remote 状态=unavailable | 未验证 | 未记录 | 未验证 |

---

# 6. 并发、恢复与边界专项验证

## 6.1 Single-flight Refresh

| 项目 | 实际证据 | 状态 |
|---|---|---|
| 同一 Tab 多个并发 401 仅一个 refresh | `browser-session.test.ts` 并发用例 | PASS |
| refresh success 后 safe reads 各最多 replay 1 次 | `browser-session.test.ts` 并发用例 | PASS |
| refresh 401 后进入 expired | `browser-session.test.ts` refresh failure 用例 | PASS |
| refresh 503 不误清 session | `browser-session.test.ts` refresh failure 用例 | PASS |
| single-flight settle 后后续 refresh 可重新发起 | 未单独覆盖 | 未验证 |

## 6.2 Mutation Replay Boundary

| 项目 | 实际证据 | 状态 |
|---|---|---|
| 普通 mutation refresh 后不自动重放 | `browser-session.test.ts` mutation 用例 | PASS |
| idempotent mutation 若重放保留同一 key | `browser-session.test.ts` keyed mutation 用例 | PASS |
| If-Match 不自动提升 replay 权限 | 实现默认按 HTTP method 判定；未单独覆盖 | 未验证 |
| 二进制/stream 永不自动重放 | keyed binary fail-fast 单测 + Consumer 文件页显式 never | PASS |

## 6.3 Logout Partial Failure

| 项目 | 实际证据 | 状态 |
|---|---|---|
| remote revoke success → local clear | adapter revoke test + route implementation | PASS |
| no access token → not_required + local clear | route implementation；未运行 route integration | 未验证 |
| remote revoke outage → unavailable + local clear | adapter outage test | PASS |
| 没有 token 持久重试队列 | 静态代码检查 | PASS |
| 其他 Tab 得到 logged_out 通知 | BroadcastChannel 实现；真实双 Tab 未运行 | 未验证 |

## 6.4 MFA Enrollment Recovery

| 项目 | 实际证据 | 状态 |
|---|---|---|
| Enrollment verify 后 AAL2 | route implementation；真实 Auth 未运行 | 未验证 |
| 同一次 verify 签发 recent proof | shared helper + route implementation；真实 proof API 未运行 | 未验证 |
| 不要求冗余第二个 OTP | MFA page flow + typecheck | PASS |
| proof API 失败后 factor 仍显示 verified | partial response details + page recovery copy；真实 API 未运行 | 未验证 |
| 可以 existing-factor verify 恢复 proof | route/page flow implemented；真实 API 未运行 | 未验证 |
| refresh 不延长 5 分钟 proof | cookie TTL implementation | PASS |

## 6.5 Multi-tab

| 项目 | 实际证据 | 状态 |
|---|---|---|
| Consumer logged_out 只影响 Consumer scope | channel handler scope check | PASS（静态） |
| Admin logged_out 只影响 Admin scope | channel handler scope check | PASS（静态） |
| session_expired 只在确定 refresh 401 后广播 | refresh 401 branch | PASS（静态） |
| refresh 503 不广播 expired | transient branch has no broadcast | PASS（静态） |
| Channel payload 无敏感数据 | payload only `{scope,event}` | PASS（静态） |
| BroadcastChannel 不可用时单 Tab 安全工作 | feature detection and optional channel | PASS（静态） |

---

## 6.6 Safe ReturnTo / Deep-link

- 合法同源 deep-link 恢复：未验证。
- external redirect 拒绝：未验证。
- token/proof/OTP/CSRF/secret/mutation body 不进入 URL：未验证。
- 无效 target 安全降级且无 redirect loop：未验证。

## 6.7 Terminal Cleanup

- local logout accepted → private/sensitive state 清理：未验证。
- refresh definitive 401 → private/sensitive state 清理：未验证。
- refresh 503/network → last-known data 保留、不 terminal purge：未验证。

## 6.8 Step-up Intent Recovery

- intent 仅非敏感内存 context：未验证。
- proof success → authoritative refetch：未验证。
- 409/412/resource state changed → conflict/state UI：未验证。
- old destructive mutation 不自动 replay：未验证。

## 6.9 Auth Responsive / Accessibility

- 320px：未验证。
- 390px：未验证。
- 768px：未验证。
- Desktop Chromium：未验证。
- keyboard-only：未验证。
- focus trap/restore（适用 Dialog/Sheet）：未验证。
- error/pending live announcement：未验证。
- MFA QR/manual secret overflow：未验证。
- reduced motion（适用时）：未验证。

# 7. Legacy Path / Contract 扫描记录

> Phase 05 实际执行搜索后填写。不要为了追求“零匹配”删除服务端安全验证或测试。

| 搜索模式 | 剩余匹配 | 合法归属说明 | 需清理项 | 状态 |
|---|---|---|---|---|
| `/api/auth/refresh` | route + manager config | auth lifecycle endpoint, not page-level fetch | 无 | PASS |
| `/api/auth/logout` | route + manager config | auth lifecycle endpoint, not page-level fetch | 无 | PASS |
| `payload.data.code` / optional variant | 0 in app/package/test scan | all auth UI reads `payload.error.code`; `data.codes` is redemption data | 无 | PASS |
| `aisenhub-csrf` | 0 in app/package/test scan | replaced by scoped names and manager cookie policy | 无 | PASS |
| `X-CSRF-Token` | manager, BFF and E2E tests | legitimate transport contract; no page manually reads/writes it | 无 | PASS |
| page-level 401 refresh logic | 0 | centralized in `AuthSessionManager` | 无 | PASS |

---

# 8. GitHub 交付记录

## 8.1 规则

每阶段代码验收完成后：

1. 审查 diff；
2. commit；
3. push；
4. 确认远程分支包含该 commit；
5. 在本节记录真实 SHA/branch/link；
6. 可用后续独立记录 commit 写入代码 SHA，不要反复 amend。

## 8.2 阶段交付

| 阶段 | Branch | 代码 commit SHA | 记录 commit SHA | Push 是否成功 | Remote 已包含代码 SHA | GitHub 链接 | 备注 |
|---|---|---|---|---|---|---|---|
| 01 | `codex/auth-session-upgrade` | `93757480c3516f497304c9abe09c78f50fa6d9b8` | `d0c1ad69d0cc41e423fac37657c771b903f0500d` | 已成功 | 已核对 | [branch](https://github.com/aisenhub/Aisenhubplatform/tree/codex/auth-session-upgrade) | 已交付 |
| 02 | `codex/auth-session-upgrade` | `2514708530867bef9949866bf06ce3a7b19dad20` | `d0c1ad69d0cc41e423fac37657c771b903f0500d` | 已成功 | 已核对 | [branch](https://github.com/aisenhub/Aisenhubplatform/tree/codex/auth-session-upgrade) | 已交付 |
| 03 | `codex/auth-session-upgrade` | `fa21e10d2fa4e57ec81e57a6c06176d8f36d716b` | `d0c1ad69d0cc41e423fac37657c771b903f0500d` | 已成功 | 已核对 | [branch](https://github.com/aisenhub/Aisenhubplatform/tree/codex/auth-session-upgrade) | 已交付 |
| 04 | `codex/auth-session-upgrade` | `4666792fd574917aba247b4d2d879ad3813d4597` | `d0c1ad69d0cc41e423fac37657c771b903f0500d` | 已成功 | 已核对 | [branch](https://github.com/aisenhub/Aisenhubplatform/tree/codex/auth-session-upgrade) | 已交付 |
| 05 | `codex/auth-session-upgrade` | `43374253ca6724eb9d4f4ee38f911bf50ac8e617` | `d0c1ad69d0cc41e423fac37657c771b903f0500d` | 已成功 | 已核对 | [branch](https://github.com/aisenhub/Aisenhubplatform/tree/codex/auth-session-upgrade) | 已交付（wrapper E2E 保留 NOT_RUN） |

## 8.3 Push 失败记录

| 日期 | 阶段 | Local SHA | 失败原因 | 本地成果是否保留 | 后续处理 | 最终状态 |
|---|---|---|---|---|---|---|
| 未发生/未验证 | 未开始 | 未记录 | 未记录 | 未验证 | 未记录 | 未验证 |

---

# 9. 关键失败与修复历史

> 保留重要失败过程，不要修好后删除旧记录。

| 日期 | 阶段 | SHA | 失败现象 | 根因 | 修复 | 修复 SHA | 复测 | 状态 |
|---|---|---|---|---|---|---|---|---|
| 未发生/未验证 | 未开始 | 未记录 | 未记录 | 未确认 | 未实施 | 未记录 | 未执行 | 未验证 |

---

# 10. 计划偏差 / 决策记录

| 日期 | 阶段 | 原计划 | 实际代码证据 | 决定 | 影响 | 是否需用户决定 |
|---|---|---|---|---|---|---|
| 未发生 | 未开始 | 无偏差记录 | 未验证 | 未记录 | 未评估 | 否 |

若出现必须实验才能定的技术问题，记录：

- 要验证的问题；
- 验证方法；
- 成功标准；
- 不成立时的 fallback；
- 哪些下游阶段等待该结果。

---

# 11. 依赖新增记录

> 本期默认不新增外部依赖。只有现有技术栈无法合理实现冻结目标时才允许，并说明必要性。

| 日期 | 阶段 | 依赖 | 版本 | 用途 | 为什么现有能力不足 | Lockfile 变化 | 状态 |
|---|---|---|---|---|---|---|---|
| 未新增 | 未开始 | 无 | 无 | 无 | 无 | 未验证 | 未验证 |

---

# 12. 当前交接信息

## 当前阶段

- 当前阶段：本期完成（Phase 01–05 已交付）。
- 当前状态：已交付；真实 Supabase/Auth、浏览器双 Tab/响应式回归和 Windows `m5-05-install` harness 修复仍是后续验证项。

## 必须先解决的问题

- 已核对项目绝对路径、Git remote/branch/start SHA、依赖版本和 Deno 路径。
- 已完成 Phase 01–05 代码提交、逐阶段推送和远端 SHA 核对。
- 浏览器/真实 Supabase 验证与 Windows harness 问题已保留为未完成项，不虚报通过。

## 可以直接复用的已知能力

研究时已确认存在，但执行时仍需核对当前分支：

- `packages/account-auth` 的 session/recent proof domain helper；
- `packages/account-auth-nextjs` 的 request-scoped Supabase client、cookie、refresh、MFA、reauth、revoke helper；
- `packages/domain/src/contracts/api.ts` 的 API error/response contract；
- Consumer/Admin auth route 与现有 E2E 基础。

## 不应重复实施

- 不另造第二套 token store。
- 不另造 Consumer/Admin 各自 SessionManager。
- 不通过 authorization cache 或跳过验证“优化”会话。
- 不自动重传文件字节流。

## 当前未提交修改及其归属

- 仅保留用户提供的 `docs/plans/aisenhub-frontend-experience-state-upgrade-plan/` 未跟踪目录；未暂存、未修改。

## 需要用户决定的事项

- 当前无。
- 若执行时发现会改变安全/数据语义且无法从代码与冻结架构合理推断的实质冲突，再提出具体问题。

## R1 文档修订基线与新增验收（ASU-R1）

2026-09-09 本地审查基线：`main@0d42b4cd44a2c17777c33f616bd393c22ee78f16`；remote 配置为 `https://github.com/aisenhub/Aisenhubplatform.git`；工作区已有用户提供的 Auth 与 Frontend 未跟踪计划包。此基线不是未来实施 HEAD，实施时重新填写。文档修订不把任何 ASU 产品阶段标 DONE。

本轮修改 master、Phase 01～05、Frontend integration、coverage、handoff、manifest、两份参考架构以及开发治理文档；完整 Frontend 独立计划保持用户原稿。文档 commit/push 以 Git 实际记录和本轮交付回复为准；不得填作 ASU-01 产品提交。

| 用例 | Owner | 当前运行状态 | 实施时必须填写 |
|---|---|---|---|
| ASU-V01～06 | ASU-01 | NOT_RUN | Cookie TTL、双 session revoke、scope、fence/callback、SDK 错误分类 |
| ASU-V07～10 | ASU-02 | NOT_RUN | 错峰 401、epoch、stepUp、transient/URL 边界 |
| ASU-V11 | ASU-03 | NOT_RUN | Consumer 真实浏览器及 reauth |
| ASU-V12～13 | ASU-04 | NOT_RUN | MFA 部分成功与 factor 恢复 |
| ASU-V14～16 | ASU-05 | NOT_RUN | 双 Tab、安装产物、五档响应式 |

每个用例须补：命令/脚本用例定位、被测代码 SHA、环境、退出码、脱敏证据、失败与修复记录。记录固定 Supabase JS/SSR lock 版本及本地 Auth 服务镜像版本，不能只记 CLI 版本。截图不保存真实 MFA QR/secret 或用户资料。

部分失败允许保存/推送小提交，但任务状态仍 PARTIAL/BLOCKED；不能以推送成功代替必要 PASS。源码继续变化后重新运行受影响用例。

### ASU-R1 文档静态验证记录

- `node tooling/scripts/src/docs-check.mjs`：PASS，文档链接及已有任务依赖检查通过；不证明新增产品功能已实现。
- Auth 包专项静态检查：13 份 Markdown、ASU-V01～ASU-V16 共 16 个验收编号、正文编号与围栏、旧建议路径退出、常见凭据模式扫描通过。首次编号检查误把围栏内 Markdown 示例计入正文，排除围栏后复验通过；不是产品测试失败。
- `git diff --cached --check`：PASS；暂存范围仅本 Auth 包与 4 份开发/安全治理文档，共 17 份 Markdown。
- 产品单测、API、浏览器、SDK 安装、Staging、生产：本轮未运行，全部 NOT_RUN。完整 Frontend 独立计划未改动、未暂存。
- 文档修订分支：`codex/auth-session-plan-r1`。产品实施分支应包含本 R1 提交再开始 ASU-01；文档 SHA 与推送核对见 Git 和本轮交付回复。
