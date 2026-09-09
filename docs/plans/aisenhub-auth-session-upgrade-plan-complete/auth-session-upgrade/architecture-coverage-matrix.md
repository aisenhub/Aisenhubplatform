# Authentication & Session Upgrade — Architecture Coverage Matrix

> 用途：证明本计划包对 Authentication & Session 架构以及后续 Frontend Experience 补充合同有明确实施承接。  
> 状态：**计划映射，不代表已实施或已验证**。

## 1. 权威输入

| 输入 | 本计划用途 |
|---|---|
| `00-master-plan.md` | 本期范围、核心安全合同、阶段依赖 |
| `references/Aisenhub_Platform_Optimization_Architecture.md` | Authentication & Session 在总体优化架构中的上位目标 |
| `references/Aisenhub_Frontend_Experience_State_Architecture.md` | Auth 被 UI 消费时的 RemoteData/Mutation/Error/returnTo/cache/responsive/a11y 语义 |
| `frontend-integration-contract.md` | 两个架构之间的唯一跨阶段交接合同 |
| 实际仓库代码 | 执行时当前实现事实；若与文档冲突，代码为当前事实 |

## 2. Auth 核心覆盖

| 架构内容 | 冻结合同/实施阶段 | 最终验收 |
|---|---|---|
| Login 正常/credential failure/service unavailable | Phase 01 contract；Phase 03 Consumer；Phase 04 Admin | 对应 browser/E2E + request_id/error envelope |
| Safe returnTo | Phase 02 shared helper；Phase 03/04 consume；Phase 05 negative regression | same-origin deep-link 恢复；external/敏感 URL 拒绝 |
| Session states | Phase 02 | state machine unit + app browser consumption |
| unresolved initial state | Phase 02 contract；Phase 03/04 UI；Phase 05 | 不误显示未登录/不错误 redirect |
| Single-flight refresh | Phase 02；Phase 05 concurrency | 同 document 并发 401 恰好一次 refresh |
| Refresh success | Phase 02 + app adoption | safe read replay once |
| Refresh definitive 401 | Phase 01 route + Phase 02 state + app cleanup | expired + cookies cleared + terminal UI |
| Refresh 503/network | Phase 01/02 + app UI | 不清 session、不 expired、保留 last-known data |
| Mutation replay default never | Phase 02；Phase 03/04 call sites | 不自动第二次 mutation |
| Explicit idempotent mutation | Phase 02 + caller mapping | same key + repeatable body + max once |
| Binary/stream no replay | Phase 02 + Consumer Files | no automatic byte replay |
| If-Match not replay permission | Phase 02 + Consumer Profile/Prefs | 401 后 RetryRequired，不自动 PATCH |
| Auth endpoints no generic replay | Phase 02 | refresh/logout/MFA/OTP dedicated flow |
| Logout local vs remote revoke | Phase 01 | `authenticated:false` + explicit remote status |
| Logout remote unavailable | Phase 01; Phase 03/04 UI; Phase 05 multi-tab | local logout complete; honest remote warning |
| Admin AAL2 | Phase 04 | server authorization regression |
| MFA factor empty/error split | Phase 04 | 200+[] only true empty; 401/429/503 distinct |
| Enrollment single-TOTP closure | Phase 04 | AAL2 + recent proof after first valid TOTP |
| Proof issuance failure recovery | Phase 04 | verified factor preserved; existing verify recovery |
| Recent proof HttpOnly / 5min | Phase 04/05 | refresh does not extend proof |
| Ordinary Consumer reauth | Phase 03 | existing event-session + server proof preserved |
| Multi-tab logout | Phase 05 | matching scope terminal UI reaction |
| Multi-tab session expired | Phase 05 | only definitive refresh 401 broadcasts |
| No cross-tab refresh mutex | Master/Phase 05 non-goal | no hidden distributed lock introduced |
| No auth credential broadcast | Phase 05 | event payload negative tests |

## 3. Frontend Integration 补充覆盖

| Frontend 架构内容 | Auth 计划承接 | 非本期部分 |
|---|---|---|
| RemoteData: loading vs refreshing | Integration Contract + Phase 03/04/05 | 全产品通用 AsyncState 组件由 Frontend 计划实施 |
| Empty vs Auth error | Phase 04 factors；Phase 03 protected data | 全资源页 EmptyState 统一由 Frontend 计划实施 |
| PresentedError | Integration Contract：Auth 输出稳定 code/request id；app 映射 surface | 全项目 ErrorPresenter 组件/类型由 Frontend/API 计划负责 |
| Permission != session failure | Phase 02/03/04/05 | 业务 permission 页面设计由 Frontend 计划负责 |
| Mutation `step_up_required` | Phase 03/04 | 其他业务 mutation 由 Business Workflow/Frontend 计划负责 |
| Mutation RetryRequired | Phase 02/03/04 | 业务 `accepted`/`unknown_outcome` 的全资源治理属于 Business Workflow/Frontend |
| Step-up intent recovery | Integration Contract + Phase 03/04/05 | 其他非 Auth high-risk flows 在 Frontend Phase 03+ 实施 |
| URL/deep-link | Auth safe returnTo | Platform workspace URL IA 属于 Frontend 计划 |
| Terminal cache cleanup | Phase 03/04/05 | 全产品 query architecture 不在本期重构 |
| Multi-tab UI reaction | Phase 05 | 其他跨 Tab业务同步不在本期 |
| Admin Security surface | Phase 04 提供安全 Auth 状态边界 | 完整 Admin Security 页面 IA/视觉在 Frontend 计划 |
| One-time sensitive UX | Phase 04 MFA enrollment | API Key/Redemption secret UI 在 Frontend 计划 |
| Toast/Alert boundary | Auth error/remote revoke 不使用误导性 Toast | 全产品 Toast rules 在 Frontend 计划 |
| Responsive | Phase 03/04/05 Auth surfaces | 全 Admin/Consumer 响应式改造在 Frontend 计划 |
| Accessibility | Phase 03/04/05 Auth surfaces | 全产品 WCAG 审计在 Frontend 计划 |

## 4. 状态所有权覆盖

| 状态/数据 | Authority | 本计划要求 |
|---|---|---|
| access/refresh token | HttpOnly server Cookie | Browser manager 不读取/持久化 token |
| recent proof | Server HttpOnly proof | Browser 不构造、不缓存、不用 countdown 授权 |
| session lifecycle | Shared Auth runtime | app 只消费 snapshot/event |
| URL returnTo | Shared safe helper + app route | only same-origin safe path/query |
| high-risk intent | page ephemeral memory | no sensitive persistence; refetch before submit |
| resource truth | API/Business Workflow | step-up 后 authoritative refetch |
| authorization | Server | UI state/hidden button/Broadcast 不是 authority |
| private client data | App UI/cache | terminal transition cleanup |

## 5. 错误与恢复覆盖

| 场景 | 正确结果 | 阶段 |
|---|---|---|
| Login bad credential | credential error，不是 service error | 01/03/04 |
| Login provider unavailable | recoverable unavailable | 01/03/04 |
| Protected 401 + refresh success | read replay / mutation RetryRequired | 02/03/04 |
| refresh 401 | expired + local cookie clear | 01/02/03/04/05 |
| refresh 503 | transient unavailable | 01/02/03/04/05 |
| MFA_REQUIRED | step-up | 02/04 |
| RECENT_MFA_REQUIRED | step-up intent | 02/03/04/05 |
| Permission 403 | permission/domain state | 02/03/04/05 |
| Rate limit | preserve context + retry timing | 04 |
| Remote revoke unavailable | logged-out locally + honest warning | 01/03/04/05 |
| Mutation response ambiguity | business unknown_outcome/state query | Integration Contract + 03/05 |
| RetryRequired | safe resubmit prompt, no replay | 02/03/04/05 |

## 6. 安全不变量覆盖

以下每项都必须在阶段计划和最终回归中保留：

- [ ] RLS / server authorization 不削弱。
- [ ] Origin / CSRF 不跳过。
- [ ] Admin AAL2 不跳过。
- [ ] recent proof 不由 Browser 生成/缓存。
- [ ] refresh 不延长 recent proof。
- [ ] authorization 不作为 client cache 权威。
- [ ] binary/stream 不自动 replay。
- [ ] If-Match 不被当成 replay permission。
- [ ] token/proof/OTP/secret 不进 URL/log/Broadcast/storage。
- [ ] remote revoke failure 不伪装 confirmed。
- [ ] step-up UX 不通过保存完整 destructive request 实现。
- [ ] multi-tab event 不作为 authorization evidence。

## 7. 阶段依赖覆盖

```text
Phase 01 Contract + Logout
   ↓
Phase 02 Shared Runtime + Frontend machine semantics
   ↓
   ├──────────────┐
   ↓              ↓
Phase 03        Phase 04
Consumer        Admin + MFA
   └──────┬───────┘
          ↓
Phase 05 Integration + Multi-tab + Frontend contract regression + cleanup
```

无循环依赖。

## 8. 后续 Frontend 计划的明确边界

完成本 Auth 计划后，不代表完整 Frontend Experience 已实施。以下仍按单独 Frontend 计划推进：

- Admin Shell / Sidebar / Platform workspace；
- DataTable/Inspector/Operations/Audit 信息架构；
- 全产品 RemoteData/Mutation 组合组件；
- API Key/Redemption one-time secret UI；
- 全 Admin/Consumer responsive/accessibility；
- System Health / Global Search 等规划能力。

Auth 计划只保证这些未来页面可以消费**一致、不会削弱安全边界的 session/error/step-up/terminal semantics**。

## 9. R1 审查闭环矩阵

| 审查项 | 合同 | 实施任务 | 必要验收 |
|---|---|---|---|
| CSRF 与 access 同期失效 | master §2.10 A | ASU-01 | ASU-V01 |
| local scope/撤销结果/超时 | master §2.10 B | ASU-01 | ASU-V02 |
| 同 hostname scope Cookie 隔离 | master §2.10 A | ASU-01/03/04 | ASU-V03 |
| 迟到 Cookie/旧登录 callback | master §2.10 C | ASU-01/02/05 | ASU-V04/05/14 |
| 隐式刷新/错误分类 | master §2.10 E | ASU-01/04 | ASU-V06/13 |
| 错峰 401/epoch/终态 | master §2.10 D | ASU-02/03/05 | ASU-V07/08/10/11 |
| MFA 401 与 stepUp 独立 | master §2.10 D/E | ASU-02/03/04 | ASU-V09/13 |
| MFA 部分成功 Cookie 与 proof | master §2.10 E | ASU-04 | ASU-V12 |
| SDK/Registry/独立安装 | master §2.10 F | ASU-05 | ASU-V15 |
| 响应式宽度统一 | master §2.10 F | ASU-03/04/05 | ASU-V16 |
| 文件展示状态不改变 SQL 枚举 | 总体架构 §5.1 | 本轮参考修订；后续 Frontend 消费 | 静态合同核对，不新增文件业务状态 |

本矩阵是任务映射，不是测试结果。所有 ASU-V01～16 都是 Local 必须通过项；按阶段归属执行，不能由记录 NOT_RUN 满足 DONE。未到位的真实 Provider/Staging 另列。完整 Frontend 改造由用户已有独立计划承接。
