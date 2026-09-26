# Admin 安全管理与 MFA 分阶段整改计划

状态：In Progress（`SEC-PROBE-00` Auth 行为已实测；`SEC-ADMIN-01`、`SEC-ADMIN-02` 本地检查完成，R3 CI/Git 交付待完成）  
制定日期：2026-09-21  
依据：[Admin 安全管理与 MFA 专项审查报告](../../reviews/admin-security-mfa-review-2026-09-21.md)  
执行规则：[Agent 开发与发布流程](../../guides/development-release-workflow.md)  
审查基线：`bf142bb51f2e62ad3ba964e2199d01955dd7bd10`  
关联：[优化设计](design.md) · [Agent 交接](agent-handoff.md) · [验证记录](verification-record.md)

## 1. 使用方式

本文把审查结论拆成可以单独验证、单独回退的任务。用户已派发按计划实施，并在 `SEC-PROBE-00`、`SEC-ADMIN-01` 后继续推进到 `SEC-ADMIN-02`；后续任务按依赖和实际验收推进，不把计划文字本身当作部署授权。具体步骤以阶段文件为准，本文保留跨阶段合同与任务边界。

生产部署、生产迁移、真实管理员恢复、真实会话撤销和其他生产操作仍需单独明确授权。

每个执行 Agent 开始前必须：

1. 阅读根 `AGENTS.md`、`docs/README.md`、`docs/architecture/overview.md`、`docs/agents.md`、`docs/guides/development-release-workflow.md`。
2. 阅读审查报告、本文、相关架构、reference、proposal 和实际源码。
3. 涉及 BFF、Auth、SDK、公共合同、Registry 或环境配置时，阅读 `docs/guides/platform-onboarding.md`。
4. 涉及 Supabase 时核对当前官方文档和仓库固定版本，并遵循 Supabase skill。
5. 报告任务标识、起始 HEAD、已有改动、风险分级、受影响消费者、本地验证、本地 Supabase 验证、生产门槛和授权边界。
6. 从最新已确认的 `main` 创建 `codex/<任务ID小写>` 短期分支；已有其他任务改动时先隔离或确认归属，不自动 stash、覆盖或混入提交。

## 2. 已冻结的整改原则

以下原则在本计划内视为已确定，执行 Agent 不应另起一套方案：

1. 保持当前单系统管理员模型，不新增 RBAC、角色、权限组或菜单权限配置。
2. 浏览器 UI 不作为授权边界；所有授权和近期 MFA 决策由服务端执行。
3. 所有 Admin 页面使用同一套认证和授权错误分类。
4. `MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED` 和真实 `FORBIDDEN` 必须具有不同 UI 语义。
5. Step-up 完成后不自动重放删除、付款、密钥轮换等副作用操作。
6. 中央 Account API 为每次请求产生规范 request ID；BFF 和 UI 透传上游 ID，同步审计可用该 ID 关联，异步最终事件以 operation/job ID 关联。客户端不能指定规范 ID。
7. 操作原因如果被 UI 收集，优先用服务端允许列表 `reason_code` 并进入审计；确需自由文本时限长、校验并限制投影，否则删除输入框。
8. Factor ID 只有在服务端验证归属与状态后才能作为审计证据。
9. 零 verified factor 的管理员允许受限首因子注册；已有因子时增删需现有因子的近期验证。应用在线流程拒绝删除最后一个已验证因子；本地实测原生 Supabase API 和双会话竞争均可删至零，故删除入口保持独立发布阻塞，不能声称全局原子保护。
10. 不新增依赖，除非现有平台能力、标准库和已安装依赖都无法完成，并在任务报告中单独说明。

本计划明确不包含：

- 多管理员 RBAC；
- Passkey/WebAuthn；
- 短信或邮件 OTP；
- 新的外部身份供应商；
- 自动化生产恢复；
- 未经单独授权的“注销所有真实设备”；
- 与 Admin 安全整改无关的导航、视觉重构或业务功能。

## 3. 阶段与依赖

| 阶段 | 任务 | 目标 | 风险级别 | 依赖 | 阶段计划 |
| --- | --- | --- | --- | --- | --- |
| 0 行为探针 | `SEC-PROBE-00` | 固定版本 MFA/Auth 边界和实际 HTTP 验证入口 | R0（独立探针），后续 Auth 候选仍按 R3 | 无 | [阶段 00](phases/00-auth-probe.md) |
| A 操作语义 | `SEC-ADMIN-01` | 统一错误分类与操作员提示 | R3 | 无 | [阶段 01](phases/01-operator-semantics.md) |
| A 操作语义 | `SEC-ADMIN-02` | 服务端权威安全状态与 Admin Shell Gate | R3 | `SEC-PROBE-00`、`SEC-ADMIN-01` | [阶段 01](phases/01-operator-semantics.md) |
| B 审计可信度 | `SEC-TRACE-03` | 统一 request ID 与审计关联 | R3 | 无 | [阶段 02](phases/02-audit-integrity.md) |
| B 审计可信度 | `SEC-ACTION-04` | 修正确认框和操作原因链路 | R3 | `SEC-TRACE-03` | [阶段 02](phases/02-audit-integrity.md) |
| C MFA 完整性 | `SEC-STEPUP-05` | Factor ID 校验与 Step-up 政策合同 | R3 | `SEC-TRACE-03` | [阶段 03](phases/03-mfa-integrity.md) |
| C MFA 完整性 | `SEC-MFA-06` | 第二因子、删除保护和会话刷新 | R3 | `SEC-PROBE-00`、`SEC-ADMIN-02`、`SEC-STEPUP-05` | [阶段 03](phases/03-mfa-integrity.md) |
| D 可观测性 | `SEC-AUDIT-07` | 审计结果、摘要与安全事件 | R3 | `SEC-ACTION-04`、`SEC-MFA-06` | [阶段 04](phases/04-observability-web-hardening.md) |
| D 浏览器加固 | `SEC-WEB-08` | Admin 响应安全头和 CSP | R3 | 无；与 MFA 在总体验收汇合 | [阶段 04](phases/04-observability-web-hardening.md) |
| E 总体验收 | `SEC-VERIFY-09` | 全链路回归、恢复演练与交接 | R0（验证任务），候选版本仍按 R3 | 以上全部 | [阶段 05](phases/05-end-to-end-verification.md) |

默认串行执行。不得为了赶进度并行修改同一认证、OpenAPI、迁移或审计文件。

---

## 4. 阶段 0：固定版本行为探针

`SEC-PROBE-00` 为独立 R0 验证任务；不修改生产 Auth、迁移或业务状态。按[阶段 00](phases/00-auth-probe.md)在固定 Supabase 2.111.0 和本地合成用户上验证：首因子/第二因子、两个独立会话删除竞争、原生 API 是否可绕过应用最后因子检查、删除后的 AAL/refresh、Auth audit 来源可用性、AAL1 管理员状态入口。环境不可用时记录 BLOCKED，保留可独立完成的代码和文档准备；R3 实施不得据此虚报实测。该任务产出 `verification-record.md` 中可复查的脱敏证据与后续设计边界。

## 5. 阶段 A：统一操作语义

## `SEC-ADMIN-01`：统一 Admin 认证与授权错误分类

### 目标

消除不同页面把同一个 403 分别解释为“无权限”或“需要 MFA”的问题，让操作员始终获得准确、可执行的下一步提示。

### 风险与消费者

- 分级：R3。
- 理由：虽然主要修改 Admin 前端，但会改变 Auth/MFA/权限失败时的控制流，并影响敏感管理操作。
- 消费者：全部 Admin 页面、近期 MFA 面板、登录/MFA 路由、操作员。

### 范围

- 复用并收敛 `apps/admin/features/resources/admin-resource-utils.ts`。
- 查找并移除页面内重复的 401/403/MFA 判断，至少覆盖 Billing、Audit、Security、Platform workspace 和其他 Admin mutation 页面。
- 统一处理 `401`、`MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`、其他 `403`、`409`、`429`、`5xx` 和网络失败。
- 保留安全的 `returnTo`，禁止开放重定向。
- Step-up 成功后恢复表单状态，但不自动重放副作用操作。
- 为共享分类器和至少两个现有错误调用方增加回归测试。

### 非范围

- 不新增 API 端点。
- 不改数据库、MFA 因子或审计 schema。
- 不重构整个 Admin 数据请求层。
- 不新增通知框架或状态管理库。

### 验收条件

- `MFA_REQUIRED` 提示完整 MFA 流程，不打开近期验证面板；统一入口跳转由 `SEC-ADMIN-02` 的 Shell Gate 实施。
- `RECENT_MFA_REQUIRED` 只打开近期验证流程。
- `ADMIN_REQUIRED` 明确显示当前账号不是系统管理员，并提供退出/切换账号动作。
- 真实 `403` 不再显示为 MFA。
- `5xx` 不触发退出登录，也不显示权限不足。
- 所有相关页面复用同一分类器，没有保留互相矛盾的分支。
- 敏感操作在 Step-up 后仍需要操作员再次确认。

### 最低验证

- `pnpm --filter admin test:unit`
- `pnpm lint`
- `pnpm typecheck`
- 真实浏览器检查：未登录、AAL1、AAL2、近期验证过期、非管理员、API 失败。
- 窄屏、键盘焦点、错误后恢复检查。

### 回退

回退本任务的共享分类器及调用方小提交；不涉及数据回退。

## `SEC-ADMIN-02`：服务端权威安全状态与 Admin Shell Gate

### 目标

在业务页面加载前，由服务端明确告诉 Admin 客户端当前登录、管理员、AAL、因子和近期验证状态，停止依赖子页面请求失败后再猜测。

### 风险与消费者

- 分级：R3。
- 理由：新增 Auth/BFF/API 合同，影响 Admin 登录和所有页面入口。
- 消费者：Admin Shell、Admin BFF、Account API、Supabase Auth、OpenAPI。

### 范围

- 设计一个只读、最小化的 Admin security status 响应。
- 最小合同：匿名 401，已登录非管理员 403 `ADMIN_REQUIRED`，管理员 200 `{ current_aal, recent_mfa_expires_at: timestamp | null }`；无当前会话有效 proof 时为 `null`。UI 从 HTTP 状态和错误码决定下一步。因子数复用现有 factor 列表接口，不复制进 status DTO。
- 服务端从真实 Auth Session、管理员记录、AAL 和近期验证记录计算状态；status 必须在全局 AAL2 门槛前通过身份与管理员校验。
- 不返回 Token、MFA Secret、完整 Cookie、原始恢复信息或不必要的用户数据。
- 更新 Admin OpenAPI、Account API、BFF allowlist/代理和 Admin Shell。
- 在状态未解析时显示稳定的 loading shell，避免先渲染敏感内容。
- 为状态组合增加 API 和 Admin 单元测试。

### 非范围

- 不增加角色/能力列表。
- 不把 JWT 客户端解析结果作为权威状态。
- 不实现全局设备管理。
- 不改变现有登录凭据格式。

### 验收条件

- 未登录访问普通 Admin 路由时直接进入登录流程。
- 普通 Supabase 用户不会先进入 MFA 注册再发现自己不是管理员。
- AAL1 管理员进入 MFA 流程。
- AAL2 管理员可以浏览普通页面。
- 近期验证过期只限制敏感动作，不阻止只读页面。
- 服务不可用时显示故障和 request ID，不误报权限问题。
- BFF 和 API 合同检查通过，旧客户端错误行为有明确兼容处理。

### 最低验证

- `pnpm contracts:check`
- `pnpm --filter admin test:unit`
- `pnpm --filter @kit/account-auth-nextjs test:unit`
- `pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts`
- `pnpm db:start`、`pnpm db:reset` 仅为本地环境准备，成功启动不等于身份矩阵 PASS。
- 合成管理员、普通用户、撤销 session 的本地 Supabase HTTP 验证。
- `pnpm test:e2e:t12-r2`，必要时扩展现有脚本而不是创建第二套框架。

### 回退

保持旧登录和 MFA 路由仍可用；回退时先回退 Admin Shell 消费，再回退兼容 API。不得留下客户端仍调用已删除端点的版本组合。

---

## 6. 阶段 B：恢复审计可信度

## `SEC-TRACE-03`：统一响应 request ID 与数据库审计 ID

### 目标

使浏览器显示的支持 ID、Account API 日志和数据库审计记录使用同一个规范 request ID。

### 风险与消费者

- 分级：R3。
- 消费者：Admin BFF、Account API、文件/Admin dispatch、数据库领域过程、审计查询、支持人员。

### 范围

- 由中央 Account API 对每次请求生成规范 request ID；忽略或拒绝客户端传来的规范 ID，避免审计关联被伪造。
- 将规范 ID 显式传入 dispatch、数据库上下文和所有受影响的审计追加过程。
- BFF 透传上游 `X-Request-Id`；代理自身 ID 如需保留，使用 `X-Proxy-Request-Id`。
- UI 优先显示规范上游 ID。
- 覆盖 Admin、文件和其他可能生成独立审计上下文的路径。
- 增加端到端断言：响应 ID 等于审计记录 `request_id`。

### 非范围

- 不引入分布式追踪平台。
- 不新增日志 SaaS 或遥测依赖。
- 不改变审计记录的保留策略。

### 验收条件

- 一次 Admin mutation 只有一个规范 request ID。
- BFF、API 响应、API 日志和数据库审计可用该 ID 串联。
- 外部 request ID 不作为规范值进入日志或数据库。
- 重试请求每次产生独立 request ID；业务幂等仍使用已有 operation/idempotency 机制，二者不混用。

### 最低验证

- `pnpm contracts:check`
- Account API Deno 测试。
- 本地 Supabase 实际 mutation + audit 查询。
- Admin BFF 单元测试。
- `pnpm test:db`

### 回退

数据库变更必须采用 forward-fix；API 兼容期允许审计参数为空时由服务端生成，但候选版本验收必须证明新链路完整。

## `SEC-ACTION-04`：修正确认框事实与操作原因链路

### 目标

删除确认框中的虚假承诺，并确保所有要求填写的原因代码都真正进入领域过程和审计允许列表投影。

### 风险与消费者

- 分级：R3。
- 理由：涉及敏感管理动作、公共确认组件、API DTO 和数据库审计。
- 消费者：文件、账户、Billing、平台、计划、兑换等 Admin 操作页面。

### 范围

- 盘点所有 `ConfirmActionDialog` 调用方。
- 删除共享组件中默认的 `asyncOperation=true` 和 `historyRetained=true`。
- 只有调用方明确提供真实值时才展示异步和历史信息。
- 对文件删除、账户生命周期及其他实际收集原因的动作逐项决定“贯通”或“删除输入框”。
- 需要原因的动作同步 OpenAPI、API 校验、数据库领域过程和审计投影。
- 优先改为服务端允许列表 `reason_code`；确需备注时执行 trim、长度限制、危险内容拒绝及最小投影，不能声称自由文本自动脱敏。
- 对 202 操作显示“已接受/待处理”，不显示“成功完成”。

### 非范围

- 不重新设计所有确认框视觉样式。
- 不为没有政策需求的操作强制增加原因。
- 不把异步任务状态复制到新的前端数据库。

### 验收条件

- 同步操作不显示“异步：是”。
- 没有可查询历史的操作不显示“保留历史记录：是”。
- UI 要求填写的原因可以从对应审计投影读取。
- UI 未要求原因的动作不发送空占位理由。
- 202、最终成功和最终失败在 UI 与审计中可区分。
- 所有调用方经过搜索和清单核对，没有只修审查报告点名页面的局部补丁。

### 最低验证

- 共享 UI 与 Admin 单元测试。
- `pnpm contracts:check`
- Account API Deno 测试。
- 本地 Supabase 文件删除和账户状态变更验证。
- 浏览器验证同步、202、失败和重复确认状态。

### 回退

UI 和 API 采用兼容扩展顺序；已应用迁移不修改原文件，问题使用新迁移 forward-fix。

---

## 7. 阶段 C：补齐 MFA 完整性

## `SEC-STEPUP-05`：Factor ID 归属校验与近期 MFA 政策合同

### 目标

确保近期 MFA 审计证据可信，并用合同固定哪些高风险操作必须执行近期验证。

### 风险与消费者

- 分级：R3。
- 消费者：MFA proof route、Supabase Auth、Account API、OpenAPI、高风险 Admin 操作和审计。

### 范围

- 服务端验证提交的 Factor ID 属于当前用户且处于 verified 状态。
- 如果当前 Supabase API 无法可靠证明本次挑战因子，则不在审计中声称具体 Factor ID，仅记录完成的 assurance level。
- 盘点全部 Admin mutation。
- Admin OpenAPI 每个 operation 明确填写布尔 `x-requires-step-up`，遗漏即合同检查失败；已知 `POST /platforms/{id}/plans` 等代码已有 Step-up 的操作不能缺标记。
- 至少覆盖平台密钥、Origin、平台禁用/激活策略、账户关闭、文件下载/删除、权益/额度、Billing 人工处理、MFA 因子变更和管理员恢复。
- 增加合同静态检查，并对每类标记为 true 的服务端路由执行实际 HTTP 无 proof 负例；静态源码搜索不能证明运行时 enforcement。

### 非范围

- 不改变普通 Consumer 用户的 MFA 政策。
- 不把近期 MFA 变成所有只读页面的硬门槛。
- 不在浏览器端信任 Factor ID。

### 验收条件

- 任意 UUID 不能作为合法 Factor 审计证据。
- 其他用户的 Factor ID 被拒绝。
- 未验证 Factor 被拒绝。
- 每个 `x-requires-step-up` 操作在服务端有真实校验。
- 新增高风险路由未声明 Step-up 政策时，合同检查失败。
- Step-up 失败不产生业务副作用。

### 最低验证

- 当前 Supabase 官方 MFA 文档核对记录。
- Account API Deno 正向和负向测试。
- `pnpm contracts:check`
- 本地 Supabase：本人因子、他人因子、未验证因子、过期 proof、撤销 session。
- `pnpm test:api:t12-ordinary-proof`

### 回退

安全校验不得为了兼容旧 UI 而静默放宽。需要兼容时先发布可接受不带具体 Factor ID 的服务端版本，再更新客户端。

## `SEC-MFA-06`：MFA 因子完整生命周期

### 目标

让单管理员能够安全配置备用因子、管理因子，并避免因删除或设备丢失导致无法恢复的在线锁死。

### 风险与消费者

- 分级：R3。
- 消费者：Admin Security/MFA 页面、Account Auth 适配、Admin BFF、Supabase Auth、会话和近期 MFA 凭证。

### 范围

- 已存在 verified factor 时仍可新增第二个 TOTP factor。
- 因子显示名称复用当前 Supabase `friendlyName`/`friendly_name`，不新增显示元数据表。
- 零 verified factor 的管理员仅能首因子注册；已有因子时新增和删除要求现有因子的近期验证。
- 本项目 UI/BFF 拒绝删除最后一个 verified factor；原生 Auth 端点和双会话已实测可删至零。删除入口须经独立发布决定，不把应用检查写成全局保证。
- recent-proof 仅保留当前用户/会话最新有效证明，新 proof 撤销旧 proof；因子、session 或管理员身份变化时失效，到期记录纳入现有维护清理。
- 删除因子后刷新/重新建立会话状态，并撤销现有近期 MFA proof。
- MFA enroll/challenge/verify 提交增加 pending 锁。
- 并发标签页注册时只清理当前流程明确拥有的未验证因子。
- 安全页面显示已验证因子数和备用因子状态；UUID 移入技术信息。
- 将离线恢复入口指向既有运维流程，不实现网页绕过。

### 非范围

- 不实现恢复码、Passkey、短信或邮件 OTP。
- 不在 UI 中提供“强制清空全部因子”。
- 不自动执行生产管理员恢复。

### 验收条件

- 管理员可添加并验证第二因子。
- 删除第二因子需要现有因子的近期验证。
- 本项目在线路由拒绝删除最后一个 verified factor；原生端点绕行和两个会话并发均已证实，删除入口在风险决策前不得发布。
- 删除因子后 AAL/next AAL 状态与 Supabase 官方行为一致。
- 旧近期 proof 在因子删除后失效。
- 双击和双标签页不会创建不可解释状态或删除另一流程的因子。
- 离线恢复文档与实际固定 Supabase CLI/API 版本一致。

### 最低验证

- `pnpm --filter admin test:unit`
- `pnpm --filter @kit/account-auth-nextjs test:unit`
- Account API Deno 测试。
- `pnpm contracts:check`
- 本地 Supabase：第一因子、第二因子、删除备用因子、删除最后因子、双击、双标签、会话刷新、旧 proof。
- 实际浏览器桌面、窄屏、键盘和二维码降级路径。

### 回退

先回退 UI 的新增/删除入口，再回退兼容 API。数据库扩展使用 forward-fix，不修改已应用迁移。已经添加的 Auth 因子不得由代码回退自动删除。

---

## 8. 阶段 D：审计可用性与浏览器加固

## `SEC-AUDIT-07`：可调查的 Admin 审计

### 目标

让审计页面能够回答“谁、何时、为什么、对什么做了什么、请求是否接受、最终结果如何”。

### 风险与消费者

- 分级：R3。
- 消费者：数据库审计、Account API、Admin Audit/Overview/Security 页面、运维和安全调查人员。

### 范围

- 明确区分 accepted、completed、failed；没有真实 outcome 时显示“已记录”。
- 提供允许列表控制的原因代码、目标和变更摘要；自由文本须单独限制和审查。
- 支持按规范 request ID 查询。
- 为本项目处理的 MFA 因子增删、近期验证、会话撤销、管理员恢复增加安全事件；Supabase Auth 原生事件作为独立来源先探测启用、读取权限和保留期，不把它默认写成 `public.audit_logs`。
- 异步任务关联请求事件和最终事件，不把 202 当成成功。
- 更新审计投影、API DTO、Admin 页面和测试。

### 非范围

- 不建立 SIEM。
- 不把所有 Auth 失败日志复制进事务审计表。
- 不显示 Token、Secret、完整 MFA 数据或未脱敏用户数据。

### 验收条件

- 已有空 metadata 记录不再误显示为失败。
- 新操作可以显示规范 request ID、操作原因和最终结果。
- 异步 accepted 与 completed/failed 可关联。
- 安全事件可按管理员、动作和时间查询。
- 权限和投影测试证明普通用户无法读取 Admin 审计。

### 最低验证

- `pnpm test:db`
- Account API Deno 测试。
- `pnpm contracts:check`
- Admin 单元测试和真实浏览器审计查询。
- 本地 Supabase 权限、脱敏和异步事件验证。

### 回退

先发布兼容投影和 DTO，再更新 UI。已应用审计迁移只做 forward-fix；不得删除历史记录以完成回退。

## `SEC-WEB-08`：Admin 浏览器响应安全头

### 目标

为 Admin 登录、MFA、密钥和管理页面提供可验证的浏览器侧防护，不破坏 Next.js、二维码和现有交互。

### 风险与消费者

- 分级：R3。
- 理由：CSP 等头部可能阻断 Auth/MFA/管理操作，必须按核心安全变更验证。
- 消费者：所有 Admin 页面、部署代理/CDN、浏览器和监控。

### 范围

- 先读取生产/候选环境现有响应头，避免重复或冲突。
- 先以实际生效的 `X-Frame-Options: DENY` 或最小强制 `frame-ancestors 'none'` 防止 framing；完整 CSP 先 Report-Only，验证后再考虑强制。
- 至少评估 `frame-ancestors 'none'`、`object-src 'none'`、`base-uri 'self'`、`form-action 'self'`、`X-Content-Type-Options`、Referrer-Policy、Permissions-Policy 和 HSTS。
- CSP 兼容 Next.js 实际版本、TOTP 二维码 `data:` 图片、必要的 API/Auth/静态资源。
- 不使用宽泛 `unsafe-*` 作为永久绕过；确需临时兼容时记录具体原因和收缩任务。
- 增加自动响应头测试和浏览器控制台检查。

### 非范围

- 不更换部署平台。
- 不引入第三方 CSP 服务。
- 不在未验证时直接部署强制 CSP 到生产。

### 验收条件

- 候选环境的真实响应头使 Admin 不可被第三方页面 frame；Report-Only 本身不能满足此项。
- 登录、MFA 二维码、Step-up、API 请求和静态资源正常。
- 浏览器控制台无未解释 CSP 阻断。
- 有报告接收端时记录 Report-Only 报告；没有接收端时记录浏览器控制台和手工验证，不声称生产报告观察。转强制策略有独立生产授权和回退方式。
- 部署层与 Next.js 不产生互相冲突的重复策略。

### 最低验证

- Admin build、typecheck、单元测试。
- 实际浏览器登录/MFA/业务页面检查。
- 对响应头执行自动断言。
- 候选部署或等价反向代理环境验证；只检查本地 dev server 不足以证明生产头部。

### 回退

保留可快速移除或恢复为 Report-Only 的配置；生产强制 CSP 必须有单独批准和明确回退提交/部署版本。

---

## 9. 阶段 E：总体验收与交接

## `SEC-VERIFY-09`：Admin 安全全链路验收

### 目标

对前述任务形成的 R3 候选版本执行一次统一验收，补齐跨任务状态、并发、恢复和操作员体验证据。

### 风险与消费者

- 本任务本身为 R0 验证/文档任务；被验证的整体候选版本仍按 R3 发布。
- 消费者：全部 Admin 操作员、Auth/API/数据库/审计和运维流程。

### 范围

- 按审查报告第 8 节执行身份、MFA、错误、审计和可用性矩阵。
- 使用现有 `tests/spikes/e2e/t12-r2-admin.mjs` 扩展全链路验证，不创建第二套 E2E 框架。
- 完成本地 Supabase 合成管理员、普通用户、双因子、撤销会话、过期 proof 和离线恢复演练。
- 检查 OpenAPI/消费者、数据库权限、迁移空库和旧数据升级。
- 完成桌面、窄屏、键盘和焦点恢复验收。
- 更新架构当前实现、运维流程和验证记录。
- 核对整组变更没有真实 Secret、Token、MFA Secret、恢复码或用户数据。

### 验收矩阵

至少包括：

- 未登录直接访问 Admin。
- 普通用户登录。
- 管理员 AAL1、AAL2、近期 proof 有效和过期。
- session 服务端撤销。
- 第一因子、第二因子、删除备用因子、拒绝删除最后因子。
- 双击和双标签并发 MFA。
- `MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`、真实 403、409、429、5xx。
- 原因从 UI 到审计。
- 响应 request ID 到审计。
- 同步、202、最终成功和最终失败。
- CSP/响应头下的登录、二维码和 API。
- 本地离线恢复及恢复后的 session/proof 状态。

### 最低验证命令

- `pnpm docs:check`
- `pnpm contracts:check`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:unit`
- `pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts`
- `pnpm db:start`、`pnpm db:reset`（环境准备，不能计入业务 PASS）
- `pnpm test:db`
- Admin 实际 HTTP 身份/Step-up 负例脚本（先实现可运行入口；通用 `pnpm test:api` 仅执行 Deno 单测，不计实际 HTTP PASS）
- `pnpm test:e2e:t12-r2`

命令必须以仓库实际存在为准；任何失败都记录为 FAIL，不通过删除测试、放宽授权或跳过断言来获得绿色结果。

### 生产门槛

- 完整执行 G0–G5 和身份/Auth/迁移/权限领域门槛。
- 核对生产部署是否由 main push 自动触发；未知时不得合并触发部署。
- 生产部署、真实管理员恢复、真实会话撤销、强制 CSP 和真实安全操作需要单独授权。
- 发布后 G6 记录登录/MFA 错误率、403 分类、审计写入和支持请求；仅在确有报告接收端时记录 CSP 报告。

### 回退

- 明确每个阶段最后一个已验证提交。
- API/数据库使用兼容扩展与 forward-fix。
- UI、BFF、API、迁移按依赖顺序回退，不留下版本不兼容组合。
- Auth 因子和历史审计不得通过代码回退自动删除。

## 10. 每个任务的完成报告模板

每个 Agent 完成任务时必须使用以下结构：

```text
任务：
起始 HEAD / 最终 HEAD：
分支：
风险分级及理由：
授权范围：

完成内容：
变更文件：
合同/迁移/消费者同步：

静态检查：PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED
Local：PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED
本地 Supabase：PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED
CI：PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED
Provider：PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED
生产门槛：PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED

回退方式：
未完成/阻塞：
commit / push / merge 状态：
下一项满足依赖的任务：
```

## 11. 推荐派发顺序

严格顺序：

1. `SEC-PROBE-00`（可与不依赖 Auth 行为的代码准备独立进行）
2. `SEC-ADMIN-01`
3. `SEC-ADMIN-02`
4. `SEC-TRACE-03`（独立于 status，也可提前）
5. `SEC-ACTION-04`
6. `SEC-STEPUP-05`
7. `SEC-MFA-06`
8. `SEC-AUDIT-07`
9. `SEC-WEB-08`（独立于 MFA，也可提前）
10. `SEC-VERIFY-09`

如果目标是先最快改善操作员体验，可在完成 `SEC-ADMIN-01` 后暂停并单独验收。但不要跳过 `SEC-ADMIN-02` 直接给各业务页面增加更多本地状态判断，也不要在 `SEC-STEPUP-05` 之前实现依赖不可信 Factor ID 的新审计展示。
