# Authentication & Session Upgrade — Agent Handoff

> 用途：这是本计划包的稳定执行入口，不是日常进度日志。  
> 执行 agent 必须结合 `00-master-plan.md`、`frontend-integration-contract.md`、对应阶段计划、`verification-record.md` 和实际代码开展工作，无需重新进行整轮架构讨论。

## 1. 可直接复制给执行 Agent 的完整提示词

```text
你是本仓库 Authentication & Session 优化的执行 agent。请在本地 Aisenhubplatform 仓库中严格按 docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/ 的计划实施。

【首先确认输入】
- 项目绝对路径：E:\Projects\Aisenhubplatform（其他机器执行时以实际目录替换）
- 计划目录：docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/
- GitHub 仓库：先用 git remote -v 实际确认；研究时参考为 aisenhub/Aisenhubplatform
- 工作分支：沿用本任务已有工作分支；若没有，按仓库规范创建 codex/auth-session-upgrade（如果仓库当前规范要求其他命名，以实际 AGENTS.md 为准）
- 本期范围：01 Authentication & Session，严格按 00-master-plan.md 与 Phase 01–05
- 暂不实施：00-master-plan.md 的 Non-goals 以及各阶段明确排除项

【执行前必须做】
1. cd 到项目绝对路径。
2. 阅读根 AGENTS.md；进入 apps/admin 或 apps/template-preview 修改前，再读各自 AGENTS.md。
3. 阅读 docs/architecture.md、docs/auth-security.md、docs/api-sdk.md、docs/development/contracts.md。
4. 阅读 docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/00-master-plan.md。
5. 阅读 docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/frontend-integration-contract.md；它冻结 Auth 与 Frontend Experience 的消费边界，不允许页面自行发明 session/UI/replay 语义。
6. 快速检查 docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/architecture-coverage-matrix.md，确认当前阶段承接和明确非目标。
7. 阅读 docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/verification-record.md，并核对实际 Git/代码；记录与代码不一致时，先查清并修正记录。
8. 阅读当前要执行的阶段文档及所有上游阶段交接信息。
9. apps/admin/AGENTS.md 与 apps/template-preview/AGENTS.md 要求以本地安装的 Next.js 为准：写 Next.js 代码前阅读 node_modules/next/dist/docs/ 中相关当前版本文档，不凭训练记忆猜 API。
10. 任何 Supabase Auth/MFA/SSR API 变更都要按项目 Supabase 技能规则核对当前 changelog/docs；不要因文档示例与本地锁定版本不一致而盲改。
11. 先运行并记录：pwd、git remote -v、git branch --show-current、git status --short、git rev-parse HEAD、git log -1 --oneline、node --version、pnpm --version。不要覆盖归属不明的用户修改。

【架构决定已冻结，不重新发散】
A. Browser Session runtime 不保存 access token、refresh token、CSRF token、recent-auth proof、OTP 或授权结果；HttpOnly session material 继续由服务端 Cookie 管理。
B. SessionSnapshot 额外携带独立 stepUp（admin_mfa/admin_recent_mfa/consumer_recent_auth/null）；普通 GET 成功不得清除它。SessionState 唯一状态语义：unauthenticated / authenticating / authenticated / refreshing / mfa_required / expired。unresolved 初始状态不能被当成确定未登录触发错误 redirect。
C. 401 触发同一 browser document 内 single-flight refresh；同时发生的受保护请求只共享一个 refresh Promise。不要实现跨 Tab refresh mutex。
D. ReplayPolicy 唯一规则：
   - safe-read：GET/HEAD 可在 refresh 成功后自动 replay 1 次；
   - never：所有 mutation 默认，refresh 成功后不自动重放，让用户重新提交；
   - idempotent-mutation：只有 caller 明确标记、保留同一已有 Idempotency-Key、body 可重复且非 binary/stream 时，最多自动 replay 1 次；
   - 二进制/stream upload 永不自动 replay；If-Match 本身不构成 replay 许可；auth refresh/logout/MFA/OTP 不走通用 replay。
E. 403/MFA_REQUIRED/RECENT_MFA_REQUIRED 不触发 refresh；权限失败不变成登录问题。
F. Refresh 401 是确定 session terminal：服务端清理本地 auth material，client state=expired；Refresh 503/network failure 是 transient，不得清掉可能有效 refresh cookie，也不得标 expired。
G. Logout：请求通过 Origin+CSRF 后尝试 remote revoke；无论 remote revoke confirmed/not_required/unavailable，本次本地 logout 都必须清除本应用 auth cookies。response 明确 remote_revocation 状态，不把 unavailable 伪装成远端撤销成功。禁止为了重试 remote revoke 保存 token/建立持久队列。
H. Auth JSON 使用已有 packages/domain 的 ApiResponse/ApiErrorResponse 思路，auth/session route 统一 error envelope、request_id body + X-Request-Id、no-store；本期不重构全项目 API error taxonomy。
I. Admin MFA：factors 200+[] 是真实空态；factor GET 首次 401 先 refresh，只有 refresh 401 才 expired；429=rate limit；503=服务故障。首次 TOTP enrollment verify 已是一次真实 MFA 验证并提升 AAL2，必须复用同一 server recent-proof helper，在同一次 verify 后签发绑定当前 session 的 5 分钟 proof；不要要求第二个 OTP 仅为重复签 proof。
J. 如果 enrollment factor verify 成功但 recent-proof 签发失败，不能声称“绑定失败”或重新 enroll。重新加载 factors，显示 factor 已 verified，并允许通过 existing factor verify 再获取 proof。
K. recent-auth proof 仍为 HttpOnly、绑定 user/session/factor、5 分钟；session refresh 不延长其有效期。
L. Multi-tab 只通过 BroadcastChannel 广播 scope + logged_out/session_expired + 无敏感 sourceId；Consumer/Admin scope 分离。不得广播 token/CSRF/proof/factor/user/authorization/idempotency data。没有 BroadcastChannel 时安全降级为单 Tab，不新增 localStorage token/event 兼容层。
M. 服务端权限、RLS、Origin、CSRF、MFA、recent-auth、Idempotency、If-Match、输入校验、no-store、persistent session checks 不得为了体验/性能而放宽、缓存授权结果或跳过验证。
N. Frontend consumption：resolved=false 是 auth resolving，不是未登录；refreshing 保留 last-known protected data；refresh 503/network 是 recoverable，不得标 expired 或 terminal purge。
O. Auth error 不直接成为普通用户主文案：稳定 code/request_id 供 Error Presenter 分类；MFA/RECENT_MFA 是 step-up state，permission 403 不触发 refresh。
P. SessionRetryRequiredError 表示 refresh 成功但 replay:never mutation 没有被重发。UI 回到可确认/可提交状态；如果副作用是否发生不确定，则走业务 unknown_outcome，不允许当成安全重试。
Q. Step-up/reauth intent 只保留当前内存中的非敏感 resource/action/reason/returnTo context；不得持久化 token/proof/OTP/secret/完整 destructive request。MFA 成功后先 refetch authoritative resource state，再重新确认，不盲目重放旧 POST/PATCH/DELETE。
R. safe returnTo 复用 shared helper，只恢复同源应用 path/query/deep-link；external URL、token、OTP、proof、CSRF、secret、mutation body 不得进入 returnTo。
S. logout 或 definitive expired 后，app 必须清 sensitive/private client state、resource detail、one-time secret、high-risk intent、sensitive dialog/drawer。refresh 503/network 不做 terminal purge。
T. Multi-tab matching-scope logged_out/session_expired 必须让另一个 Tab 停止 protected UI并清敏感 state；不得只 Toast 后继续操作，不得事件回声式再 broadcast/logout/refresh。
U. Admin Security 只是 Auth 展示面；browser recent-MFA indicator/countdown、factor count、隐藏按钮都不构成授权权威，server proof validation 始终为准。
V. MFA enrollment QR/manual secret 遵守 one-time sensitive UX：不进 URL/Toast/analytics/log/browser persistence，proof issuance 失败后不重复 enroll 第二个 factor。
W. 本期不实施完整 Frontend Experience redesign，但所有直接触及的 Login/MFA/Session Recovery/Logout surface 必须完成 320/375/390/768/1440px 和 keyboard/focus/error announcement 等基础验收。

【阶段顺序】
必须串行：Phase 01 → Phase 02。
Phase 02 完成并推送后：默认依次执行 Phase 03 Consumer、Phase 04 Admin；只有用户另行要求并行才启用多 agent 所有权规则。
Phase 05 必须等待 Phase 03 与 04 全部必要提交已推送并由集成负责人核对后才能开始。
不要跳过阶段完成门槛。

【每阶段工作方式】
1. 开始前核对实际代码、当前分支、HEAD、工作区和 verification-record；不把研究快照 SHA 当成你的实际基线。
2. 只修改阶段文档列出的范围及实际必须的直接依赖；如果实际代码与计划不一致，以代码事实为准，并在 verification-record 写清偏差。
3. 复用已有 packages/account-auth、packages/account-auth-nextjs、packages/domain；禁止在 Consumer/Admin 各造第二套 session manager、CSRF helper、error contract。
4. 对计划中“建议新增”的文件，先确认当前分支是否已有等价实现；有则复用，不为了文件名对齐复制代码。
5. 每个用户/系统行为都实现真实闭环，不加假按钮、假 loading、假数据；Auth UI 状态遵守 frontend-integration-contract，不用一个 status 字符串混合 unresolved/refreshing/MFA/expired/permission/service unavailable。
6. 按阶段列出的测试运行实际命令。记录日期、被验证 commit、环境、命令、退出码、结果摘要。失败必须保留失败记录、修复和复测，不把历史失败擦掉。
7. 浏览器验证按阶段要求执行，并记录截图/日志路径；包含 Auth 直接改动面的响应式与 keyboard/focus/alert 验证。若环境不具备，写“未验证/阻塞”和原因，不能声称通过。
8. 验证后若相关代码继续变化，重新跑受影响测试，或明确把旧结果标成不再覆盖当前代码。
9. 阶段收尾检查 git diff / git status，只包含阶段及必要依赖，不提交密钥、.env、用户媒体、缓存或无关修改。
10. 更新 verification-record.md。
11. 创建含义明确的 commit；一个阶段允许多个有意义 commit。
12. push 到同一任务分支，并确认远程分支实际包含对应 commit。
13. 在 verification-record 保存 branch、代码 commit SHA、push 结果、GitHub 链接。记录最终 SHA 可用后续单独 docs commit 记录，不要反复 amend 追逐自身 SHA。
14. 只有“实施完成 + 必要验收实际通过 + 相关提交成功 push”三者同时满足才能把阶段标记为“已交付”。
15. 推送失败时保留本地成果、记录原因并停止进入下一阶段；修复推送后再继续。

【Git 约束】
- 本提示已授权各阶段正常 commit + push，无需每阶段再次询问。
- 不 force push、不 rebase/重写他人已发布历史、不自动合并 main、不创建 Release、不部署。
- 如果远程仓库不存在、没有访问权限或分支规范与计划发生实质冲突，再提出具体问题。
- 多 agent 并行时不要在别人的归属文件上顺手重构；共享文件冲突交给集成负责人。

【多 Agent 文件所有权】
- Shared/Integrator：packages/account-auth/**、packages/account-auth-nextjs/**、packages/domain 中本期 auth contract、shared docs、verification-record 的最终集成、Phase 01/02/05。
- Consumer Agent：apps/template-preview/** 与直接相关 Consumer tests，Phase 03。
- Admin Agent：apps/admin/** 与直接相关 Admin tests，Phase 04。
- Phase 03/04 若发现 shared runtime 缺陷：不要各自复制 workaround；记录复现与所需 shared 变更，交由 shared/integration owner 修改并提供 commit，再继续消费。
- 并行期间 verification-record.md 应由集成负责人合并更新，或各 agent 把结构化记录交给集成负责人，避免同文件冲突。

【停止边界】
完成 Phase 05 并把必要 commit/record push 后停止。不要因为本计划引用 Frontend Experience 就自动实施完整类别 02 UI 重构，也不要自动做类别 04/05/06/07/08 的扩大改造，不部署、不 merge main。把后续事项记录在交接信息。

R1 必须读取 master §2.10 和阶段末尾 R1 任务：scoped Cookie/30天 CSRF、local revoke 分类/5秒预算、服务端 fence/ack、epoch/generation、隐式刷新收口、MFA 部分成功、ASU-V01～16。未通过必要用例不可已交付。所有 Cookie/gate 消费者和独立 SDK/Registry 安装测试必须同步。

现在开始时：先不要直接改代码。先完成上述基线核对，读取 verification-record 与当前阶段，然后按阶段计划执行。
```

---

## 2. 文档阅读顺序

每个新 agent 接手都按以下顺序：

```text
1. <repo>/AGENTS.md
2. 触及 app 的 nested AGENTS.md
3. 当前 Next.js 本地 docs（若写 Next 代码）
4. docs/architecture.md
5. docs/auth-security.md
6. docs/api-sdk.md
7. docs/development/contracts.md
8. docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/00-master-plan.md
9. docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/frontend-integration-contract.md
10. docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/architecture-coverage-matrix.md
11. docs/plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/verification-record.md
12. 当前阶段文档
13. 所有上游阶段的交接记录 / commit
14. 实际相关代码与 tests
```

参考架构快照位于：

- `references/Aisenhub_Platform_Optimization_Architecture.md`
- `references/Aisenhub_Frontend_Experience_State_Architecture.md`

它们用于解释本类别在全局优化体系中的位置以及 Frontend 消费语义；不替代本期冻结的 master、frontend integration contract 和 phase contracts。

---

## 3. 阶段依赖与停止边界

```text
Phase 01  Contract + Logout P0 Closure
   ↓
Phase 02  Shared Session Runtime
   ↓
   ├──────────────┐
   ↓              ↓
Phase 03        Phase 04
Consumer        Admin + MFA
   └──────┬───────┘
          ↓
Phase 05  Integration + Multi-tab + Regression + Legacy Cleanup
```

- Phase 01、02 必须串行。
- Phase 03、04 可并行，但都只能基于已 push 的 Phase 02 shared contract。
- Phase 05 由集成负责人串行收口。
- Phase 05 后停止；后续类别另开计划。

---

## 4. 每阶段 Git Commit / Push 要求

### 开始阶段前

至少记录：

```bash
pwd
git remote -v
git branch --show-current
git status --short
git rev-parse HEAD
git log -1 --oneline
```

如已有 upstream：

```bash
git rev-parse @{u}
```

### 阶段收尾

1. 运行该阶段必要验证。
2. `git diff --check`。
3. 审查 `git diff` 和 `git status --short`。
4. 更新 `verification-record.md`。
5. 创建阶段 commit。
6. push 当前任务分支。
7. 通过 Git / GitHub 实际确认 remote 含该 commit。
8. 写入真实 SHA、链接、push 状态。

推荐 commit 前缀：

```text
auth(session): phase 01 normalize auth contracts and logout
auth(session): phase 02 add single-flight browser session runtime
auth(consumer): phase 03 adopt shared session orchestration
auth(admin): phase 04 unify mfa and session flow
auth(session): phase 05 finalize session integration and regression
```

实际内容若不同，应让 commit message 反映真实变更，不机械照抄。

---

## 5. 多 Agent 协作规则

### 5.1 文件所有权

| Owner | 主要范围 |
|---|---|
| Shared / Integrator | `packages/account-auth/**`, `packages/account-auth-nextjs/**`, 本期必要 `packages/domain/**`, shared docs/Frontend integration contract, Phase 01/02/05 |
| Consumer | `apps/template-preview/**`, Consumer 直接测试，Phase 03 |
| Admin | `apps/admin/**`, Admin 直接测试，Phase 04 |

### 5.2 不允许的并行方式

- Consumer 和 Admin agent 各自复制 SessionManager。
- 两个 agent 同时改 shared session contract 后各自 push 不兼容实现。
- 页面为绕过 shared bug 私自实现第二套 refresh。
- Consumer/Admin 各自写一套 returnTo sanitizer、RetryRequired 解释或 terminal cleanup 语义。
- 为了 step-up 后“无缝继续”持久化 destructive request/secret 或自动 replay unsafe mutation。
- 并行 agent 同时重写 `verification-record.md` 导致记录丢失。

### 5.3 集成负责人职责

- 冻结 shared contract；
- 处理 shared runtime bug；
- 负责 Phase 03/04 合流后的冲突处理；
- 核对 remote commit；
- 合并/校正 verification record；
- 负责 Phase 05 legacy scan、Frontend integration contract 全量收口和完整回归。

---

## 6. 接手任务时的核对清单

新 agent 不得只看上一位 agent 的文字结论。至少核对：

- [ ] 当前目录确为目标 repo。
- [ ] `git remote -v` 指向预期 GitHub 仓库。
- [ ] 当前 branch 是本任务 branch。
- [ ] `git rev-parse HEAD` 与 `verification-record.md` 最近交付记录一致，或差异已查明。
- [ ] `git status --short` 的修改均有归属。
- [ ] 上一阶段 code commit 已在远程分支。
- [ ] 阶段文档所称现有文件在当前分支真实存在；不存在时不编造。
- [ ] 新增文件计划前已搜索是否已有等价 helper。
- [ ] 实际 package scripts 与计划命令一致；若发生漂移，以当前 `package.json` 为准并记录。
- [ ] Next/Supabase API 用法已按当前版本核对。
- [ ] 已读取 frontend-integration-contract；当前阶段的 resolved/refreshing/MFA/RetryRequired/returnTo/terminal cleanup 职责已明确。
- [ ] Auth 直接改动 surface 的响应式/accessibility 验收条件已可执行。
- [ ] 没有把旧 `docs/development/status.md` 的历史“passed”当成本次验证。

---

## 7. 关键失败/冲突处理

### 架构与实际代码实质冲突

如果会导致：

- 数据/会话不可恢复丢失；
- 授权绕过；
- 无法实现冻结目标；
- 大规模超出本期范围；

则：

1. 保存文件/函数/测试等具体证据；
2. 在 verification record 标记阻塞；
3. 给出最小推荐处理；
4. 继续完成不依赖该冲突的工作；
5. 只有确实会改变实施结果且无法合理推断时再向用户澄清。

### 测试基础设施失败

- 先证明是基线/环境失败还是本期回归。
- 保留命令、退出码、stderr 摘要。
- 若必须最小修复才能完成本期 auth 验证，可以做直接必要的测试工具修复并记录偏差。
- 不借测试失败扩展成整个 DX 改造。

---

## 8. “已交付”的唯一含义

阶段只有同时满足：

```text
代码实施完成
+ 该阶段必要验收实际通过
+ 相关 commit 已成功 push 到 GitHub 远程任务分支
```

才可以写：`已交付`。

以下均不是“已交付”：

- 代码写完但未测试；
- 测试计划写好了但没运行；
- commit 了但没 push；
- push 失败；
- 只跑了部分关键测试而剩余风险未说明；
- 本地记录与 remote SHA 不一致。

---

## 9. 本文件不承担的职责

本文件不记录：

- 每日进度；
- 临时失败详情；
- 实际 SHA；
- 实际测试退出码；
- 当前阻塞。

这些全部进入 `verification-record.md`。

## 10. R1 执行约定

- 当前文档包目录以 PACKAGE-MANIFEST 为准；不要另建旧建议目录或复制第二份计划。任务分支默认 `codex/auth-session-upgrade`；本轮文档修订分支不是产品实施基线，执行前核对。
- ASU-01～ASU-05 依赖和 ASU-V01～16 一一映射见 coverage。先修 shared 合同再接入 app；所有 R1 内容为本期必要工作，不以“额外优化”跳过。
- 默认单 agent 串行执行 01→02→03→04→05。用户另行要求并行时才启用原并行所有权；共享 worktree 中只有集成人负责 git add/commit/push，子任务不得抢操作 index。
- 禁止把计划提示词中的执行授权用于本轮文档审查；只有用户派发产品实施时执行。完整 Frontend 计划已存在，本 Auth 验收交付后停止，将最终合同与 SHA交接，下一计划另行开始。
- 本期范围允许 Cookie/fence、两个 BFF gate、callback state 绑定、测试与包产物的必要同步，不允许新增领域模型、数据库表、支付、组织或部署。
