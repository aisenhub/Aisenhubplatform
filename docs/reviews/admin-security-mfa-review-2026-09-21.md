# Admin 安全管理与 MFA 专项审查报告

审查日期：2026-09-21  
审查基线：`bf142bb51f2e62ad3ba964e2199d01955dd7bd10`（`codex/fix-admin-session-delete-jobs`）  
审查类型：只读安全与操作体验审查  
风险分级：本次审查为 R0；后续单纯 UI 文案和状态展示修正可按 R1 执行，涉及身份认证、公共 API、数据库过程、审计合同或迁移的整改应按 R3 执行。  
主要消费者：Admin 操作员、Admin BFF、Account API、Supabase Auth、数据库审计与运维排障人员。

## 1. 执行摘要

本次审查重点检查了 Admin 客户端中的安全管理、管理员身份、MFA（多因素验证）、近期 MFA 验证、会话、确认操作和审计展示。

项目现有后端安全边界总体合理：浏览器通过同源 BFF 访问中央 API；Admin BFF 有方法和路径限制；变更请求检查 Origin 和 CSRF；访问令牌、刷新令牌及近期 MFA 凭证使用 HttpOnly Cookie；中央 API 校验 JWT 签名、签发者、受众、有效期、主体和会话，并检查管理员身份与 AAL2；高风险操作可要求近期 MFA；数据库通过独立 executor role 和私有 `SECURITY DEFINER` 过程收口写入。

本轮静态审查未发现可以直接判定为严重认证绕过或普通用户直接提权为管理员的明显漏洞。主要问题集中在以下方面：

1. 前端没有统一区分登录失效、MFA 不足、近期验证过期、非管理员、真实权限拒绝和服务故障，导致同类错误在不同页面显示成不同含义。
2. 当前系统采用单管理员模型，却在界面中使用了容易让操作员误以为存在细粒度权限管理的文案。
3. MFA 页面只完成了首次绑定和验证，没有形成完整的因子生命周期管理，单管理员存在设备丢失后的锁死风险。
4. 部分确认框显示的“异步”“保留历史”等信息与真实操作不一致；部分要求填写的操作原因没有进入后端和审计记录。
5. 浏览器请求 ID、中央 API 请求 ID和数据库审计 ID没有形成同一个关联标识，影响事故排查。
6. 审计页面展示的信息不足以回答“谁、何时、为什么、改了什么、最终结果如何”。

因此，当前最需要的不是增加更多安全页面或引入新的权限框架，而是建立一套简单、服务端权威、前端统一使用的安全状态模型，并删除或修正所有无法被真实后端数据支持的展示。

## 2. 审查范围与方法

### 2.1 已审查范围

- Admin 登录、MFA 和安全页面。
- Admin Shell 与浏览器会话状态管理。
- Admin BFF 的 Cookie、CSRF、Origin、路径代理和错误透传。
- Account API 的 Admin 身份、AAL2、近期 MFA 和会话校验。
- MFA 因子注册、挑战、验证和近期验证凭证签发。
- 平台、账户、文件、Billing 等高风险操作的确认界面。
- 数据库 Admin 领域过程和审计投影。
- Admin 2.0 导航与信息架构 proposal 及其验证记录。
- 运维文档中的管理员恢复流程。

### 2.2 本次未覆盖

- 未对生产环境执行渗透测试。
- 未操作真实 Supabase 项目或真实管理员账号。
- 本地 Admin、Account API 和 Supabase 服务未运行，因此没有完成真实浏览器交互验收。
- 未检查部署平台上实际生效的 CDN、反向代理和响应安全头配置。
- 未执行管理员恢复、因子丢失、数据库故障等破坏性演练。

## 3. 当前安全模型梳理

### 3.1 认证与授权边界

当前 Admin 请求大致经过以下链路：

1. 操作员在 Admin 客户端登录 Supabase Auth。
2. Admin BFF 使用同源 Cookie 保存访问令牌、刷新令牌、CSRF 信息和近期 MFA 凭证。
3. 浏览器只访问 Admin BFF，不直接持有数据库写权限。
4. BFF 将允许的方法和路径转发至中央 Account API。
5. Account API 验证 JWT、Auth 用户、Auth Session、管理员身份和 AAL。
6. 领域变更通过数据库私有函数执行，并写入审计日志。

这条链路的安全方向是正确的。OWASP 也建议授权默认拒绝、在每次请求中执行，并在服务端而不是前端实施。前端隐藏菜单只能改善体验，不能构成安全边界。

### 3.2 当前不是 RBAC 系统

迁移 `supabase/migrations/20260907103848_security_helpers.sql` 中的 `system_admin` 是单例管理员。这意味着当前系统只有两种身份：

- 配置的系统管理员；
- 非系统管理员。

当前没有真正实现角色、权限组、资源级权限或管理员委派。因此，Admin UI 中不应向操作员暗示“你的管理员账号缺少某个后台权限”，除非后端将来真的返回一个经过服务端授权计算的能力结果。

现阶段更准确的产品定位是“管理员身份与登录安全管理”，而不是“管理员权限管理”。

## 4. 主要问题与整改建议

## 4.1 P0：所有 403 被错误归类，导致界面状态混乱

### 现状

`apps/admin/features/resources/admin-resource-utils.ts` 约第 85 行优先根据 HTTP 403 显示“当前管理员账号没有权限”，没有先区分服务端错误码。

另一方面，`apps/admin/features/billing/central-billing-page.tsx` 约第 352、399 行又把 403 直接解释为“需要 MFA”。

因此以下完全不同的状态可能被混在一起：

- 当前会话已经失效；
- 当前账号没有完成 AAL2；
- AAL2 已完成，但近期 MFA 已过期；
- 当前 Supabase 用户不是系统配置的管理员；
- 请求确实被某项授权策略拒绝；
- 上游服务发生错误但错误被错误映射。

### 影响

- 操作员不知道应该重新登录、完成 MFA、执行近期验证还是联系运维。
- 不同页面可能针对同一个服务端响应给出相反的操作指引。
- 页面可能进入重复 MFA 或重复请求循环。
- 排障人员无法根据用户截图判断真实失败原因。

### 建议

复用并收敛现有 `admin-resource-utils.ts`，建立唯一的 Admin 错误分类入口，不为每个页面创建新的错误框架。

建议映射：

| 服务端状态 | UI 含义 | UI 行为 |
| --- | --- | --- |
| `401` | 登录失效、会话被撤销或令牌不可恢复 | 清除敏感页面状态，跳转登录页，保留安全的返回地址 |
| `MFA_REQUIRED` | 管理员身份已登录，但需要达到 AAL2 | 跳转 `/admin/mfa` |
| `RECENT_MFA_REQUIRED` | 当前操作需要重新验证 MFA | 原地打开 Step-up 面板，保留操作意图但不自动重放 |
| `ADMIN_REQUIRED` | 当前账号不是配置的系统管理员 | 停止后台数据加载，提示退出或切换账号 |
| 其他 `403` | 服务端明确拒绝当前操作 | 显示真实拒绝原因，不暗示 MFA |
| `404` | 资源不存在或已被删除 | 刷新列表并显示资源状态 |
| `409` | 状态冲突或并发修改 | 显示冲突对象和恢复动作 |
| `429` | 频率限制 | 显示可重试时间，不重复自动请求 |
| `5xx`/网络错误 | 服务不可用 | 保留页面，显示规范请求 ID和重试入口 |

近期 MFA 完成后不得自动重新执行删除、付款、密钥轮换等副作用操作。只应恢复原页面和表单状态，由操作员再次明确确认。

## 4.2 P0：Admin Shell 缺少服务端权威的认证状态门

### 现状

`apps/admin/components/shell/admin-shell.tsx` 主要针对登录页和 MFA 页面隐藏外壳，但没有在其他 Admin 页面加载前统一确认当前用户是否：

- 已登录；
- 是系统管理员；
- 已达到 AAL2；
- 需要近期 MFA；
- 会话已被服务端撤销。

现有浏览器会话管理器在初始阶段没有完整的服务端状态，通常要等待子页面请求失败后才能推断状态。

### 建议

增加一个轻量、只读、服务端权威的认证状态端点。响应只包含 UI 所需的非敏感状态：

- `authenticated`
- `is_system_admin`
- `current_aal`
- `next_aal`
- `verified_factor_count`
- `recent_mfa_valid`
- `recent_mfa_expires_at`
- `next_action`

Admin Shell 在普通业务页面发起数据请求前先解析该状态。不要在客户端自行解析 JWT 后推断管理员身份或近期验证有效性。

## 4.3 P0：确认框显示无法保证为真的操作信息

### 现状

共享组件 `packages/ui/src/makerkit/confirm-action-dialog.tsx` 约第 59、60 行默认设置：

- `asyncOperation = true`
- `historyRetained = true`

多个调用方未显式覆盖这些属性，因此同步请求也可能显示“异步操作：是”，没有可查询历史的操作也可能显示“保留历史记录：是”。

### 建议

- 删除这两个默认展示。
- 只有调用方能够提供真实、可验证的信息时才显示。
- 对异步操作显示“请求已接受”，并给出任务 ID、跟踪位置和最终状态。
- 对同步操作只显示实际影响、不可逆性和成功条件。
- 不新增复杂的确认框配置层；优先减少通用字段，使用每个动作已有的真实信息。

## 4.4 P0：操作原因被收集但没有进入审计链路

### 文件删除

`apps/admin/features/files/platform-files-page.tsx` 约第 1029 行要求填写原因，但确认回调约第 1044 行只执行 `submitDelete()`，没有传递该原因。

### 账户生命周期

`apps/admin/features/accounts/platform-accounts-page.tsx` 会发送原因，但 `supabase/functions/account-api/admin.ts` 约第 588 至 604 行没有将原因传入数据库过程；`supabase/migrations/20260907124124_t14_account_lifecycle.sql` 约第 150 行写入的审计 metadata 仍为空对象。

### 影响

操作员以为自己已经留下审计说明，但事后无法从审计记录中获得该信息。这比完全不显示原因输入框更危险，因为它制造了错误的合规预期。

### 建议

对于确实需要原因的操作，原因必须完整通过：

`Admin UI -> OpenAPI -> BFF -> Account API -> 数据库领域过程 -> 脱敏审计投影`

并在服务端校验：

- 必填；
- 去除首尾空白；
- 合理的最大长度；
- 不允许写入凭据、Token 或其他秘密；
- 审计读取端只返回脱敏后的允许字段。

如果某个原因不会被用于审批、审计或排障，应直接删除输入框，不收集无用数据。

## 4.5 P0：请求 ID 与数据库审计无法可靠关联

### 现状

- `apps/admin/app/api/v1/[...path]/route.ts` 自己生成请求 ID，并优先返回该 ID。
- Account API 入口另行生成响应请求 ID。
- `supabase/functions/account-api/admin.ts` 中的 `adminContextValues()` 再生成一个数据库审计 ID。

一次浏览器操作因此可能出现三个不同标识。

### 影响

- 页面提示的“联系支持时提供此 ID”无法准确找到数据库审计记录。
- 操作员、API 日志和数据库日志之间无法快速关联。
- 安全事件调查需要依赖时间、账号和动作进行模糊匹配。

### 建议

- 由中央 Account API 生成唯一的规范 request ID。
- 将该 ID显式传入 Admin dispatch、数据库领域过程和审计上下文。
- Account API 响应返回同一个 `X-Request-Id`。
- Admin BFF 原样透传上游 ID。
- 如果代理自身需要 ID，使用不同名称，例如 `X-Proxy-Request-Id`。
- 增加测试：一次变更响应的 `X-Request-Id` 必须等于相应审计记录的 `request_id`。

## 4.6 P1：MFA 因子管理只有首次绑定，没有完整生命周期

### 现状

`apps/admin/app/admin/security/page.tsx` 提供“管理 MFA 因子”入口，但 `apps/admin/app/admin/mfa/page.tsx` 在已经存在因子后不再显示新增因子的完整流程。

当前缺少：

- 第二个备用 TOTP 因子；
- 因子名称或设备说明；
- 已验证因子的安全删除；
- 最后一个因子的删除保护；
- 设备丢失时的恢复说明；
- 因子删除后的会话 AAL 刷新；
- MFA 提交过程的重复点击和并发保护。

### 风险

系统是单管理员模型。如果唯一的 TOTP 设备丢失、损坏或时间严重偏移，在线管理能力可能完全锁死，只能依赖离线恢复。运维文档虽然存在恢复流程，但 Admin UI 没有向操作员明确说明这一约束。

### 建议的最小实现

1. 允许管理员在已有因子时新增第二个已验证因子。
2. 新增或删除因子前，要求使用已有因子进行近期验证。
3. 因子列表显示名称、类型、创建时间和可确认的最近验证信息。
4. 默认隐藏 Factor UUID，只在“技术信息”折叠区显示。
5. 禁止普通 UI 删除最后一个已验证因子。
6. 最后因子丢失只能走明确的离线恢复流程。
7. 删除因子后刷新 Auth Session，并使现有近期验证凭证失效。
8. MFA 登录、注册和验证按钮在请求期间禁用，防止双击并发 challenge/verify。
9. 清理未验证因子时只处理当前注册流程创建的因子，不要无差别删除其他并发流程的未验证因子。

Supabase 官方文档区分 `currentLevel` 与 `nextLevel`，并说明因子变化后需要正确处理会话 AAL。MFA 因子重置和恢复也应遵循重新认证、可审计和防账户接管原则。

## 4.7 P1：近期 MFA 凭证中的 Factor ID 缺少归属校验

### 现状

`supabase/functions/account-api/admin.ts` 约第 102 至 110 行会接受 `X-Mfa-Factor-Id`，并在 Bearer 已为 AAL2 时签发近期 MFA 凭证。当前迁移没有证明该 Factor ID：

- 属于当前 Auth 用户；
- 是已验证因子；
- 是本次挑战实际使用的因子。

### 风险判断

该问题不会直接绕过 AAL2，因此不应夸大为认证绕过。但持有合法 AAL2 的调用者可以提交任意 UUID，使审计中的“使用了哪个因子”不可信。

### 建议

二选一：

1. 中央 API 使用 Auth 管理能力查询当前用户已验证因子，并校验 Factor ID 后再写入凭证和审计；
2. 如果无法可靠证明因子归属，则从审计中移除具体 Factor ID，只记录“已完成 AAL2/近期 MFA”。

不要把来自浏览器请求头的值直接当成安全证据。

## 4.8 P1：安全页面展示技术状态，但没有回答操作员的问题

### 现状

`apps/admin/app/admin/security/page.tsx` 展示了原始 Factor UUID、Session 状态和 Step-up 状态。页面状态主要来自浏览器内存中的会话管理器，不是一次服务端权威读取，也没有显示近期验证的准确过期时间。

### 操作员真正需要的信息

- 当前登录的管理员账号；
- 当前会话是否仍被服务端接受；
- 当前 AAL 和是否还需要 MFA；
- 已验证因子数量；
- 是否已经配置备用因子；
- 近期 MFA 是否有效；
- 近期 MFA 的服务端过期时间；
- 当前是否可以执行敏感操作；
- 下一步应该登录、完成 MFA、重新验证还是联系离线运维。

### 建议页面结构

#### 概览

- 管理员身份：已确认/不是管理员；
- 登录会话：有效/已撤销；
- MFA：已完成/需要验证；
- 备用因子：已配置/未配置；
- 敏感操作授权：有效至具体时间/需要重新验证。

#### 可执行动作

- 重新验证 MFA；
- 添加备用因子；
- 管理已验证因子；
- 注销当前会话；
- 注销所有设备（如果后端真实支持）；
- 查看离线恢复说明。

#### 技术信息

折叠展示 session ID、factor ID、AAL 原始值和规范 request ID。不要让这些内部字段占据主页面。

过期时间应由服务端返回绝对时间。客户端倒计时只能用于显示，所有授权决定仍由服务端执行。

## 4.9 P1：近期 MFA 的适用范围需要形成明确合同

当前所有 Admin 路由统一要求 AAL2，这是一个良好基础。部分高风险操作另有近期 MFA 校验，但平台状态和 Origin 信任边界修改等操作是否需要近期验证，没有形成清晰统一的政策。

建议至少将以下操作列为近期 MFA：

- 平台密钥创建、查看、轮换和撤销；
- Origin 信任边界增删；
- 平台禁用和激活策略修改；
- 账户停用、关闭和管理员恢复；
- 文件下载和删除；
- 权益、额度和兑换操作；
- Billing 人工处理和计划配置；
- MFA 因子新增、删除和重置；
- 系统管理员身份更换。

OpenAPI 中的 `x-requires-step-up` 应作为可检查的合同来源。增加自动测试，确保：

- OpenAPI 标记；
- Account API 实际校验；
- Admin UI 提示；

三者不会漂移。不要只在前端维护一份高风险动作名单。

## 4.10 P1：审计页面不能支持真实调查

### 现状

`supabase/migrations/20260908232054_admin_audit_list.sql` 主要从 `metadata ->> 'outcome'` 读取结果，但很多 `audit_append` 调用写入空 metadata。因此页面经常显示“未知”或“未提供”。现有投影也没有稳定提供操作原因和变更摘要。

### 建议

- 没有真实 outcome 时显示“已记录”，不要显示容易被理解为错误的“未知”。
- 将“请求已接受”“执行完成”“执行失败”分开建模。
- 异步操作不能把进入队列视为最终成功。
- 暴露经过允许列表和脱敏处理的操作原因、目标和变更摘要。
- 支持按规范 request ID、操作员、动作、目标、结果和时间查询。
- 记录 MFA 因子新增/删除、近期验证、会话撤销、管理员替换和离线恢复等安全事件。
- 失败登录、速率限制和异常 Auth 事件可以保留在独立安全日志中，避免与事务审计混用而导致噪声和保留策略冲突。

## 4.11 P2：Admin 响应安全头需要在部署环境确认并固化

`apps/admin/next.config.mjs` 中没有看到完整的 Admin 响应安全头。它们可能在部署平台或反向代理中设置，但仓库当前无法证明。

建议核对生产响应并逐步增加：

- Content-Security-Policy，先 Report-Only 再强制；
- `frame-ancestors 'none'`；
- `object-src 'none'`；
- `base-uri 'self'`；
- `form-action 'self'`；
- `X-Content-Type-Options: nosniff`；
- 严格的 Referrer-Policy；
- 合理的 Permissions-Policy；
- HTTPS 环境中的 HSTS。

CSP 需要兼容 Next.js 的脚本策略和 TOTP 二维码使用的 `data:` 图片。不要未经浏览器验证直接部署过严策略，避免再次出现“安全页面无法显示”的问题。

## 4.12 P2：近期 MFA 数据缺少生命周期清理

当前近期 MFA 验证会新增数据库记录，未发现明确的过期记录清理或按会话复用策略。单管理员低流量下不会立即形成容量问题，但会积累失效的 session、factor 和验证元数据。

最小整改方案：

- 每个管理员会话复用一条近期验证记录并更新过期时间；或
- 将过期记录纳入现有维护清理任务。

不需要为此新增独立服务。

## 5. 推荐的前端安全状态模型

Admin 页面统一围绕以下六种状态工作：

| 状态 | 页面表现 | 允许操作 |
| --- | --- | --- |
| 未登录或会话撤销 | 跳转登录页，不渲染敏感数据 | 登录 |
| 已登录但不是系统管理员 | 明确提示当前账号不是管理员 | 退出、切换账号 |
| 系统管理员、AAL1 | 进入 MFA 挑战或注册页 | 完成 MFA |
| 系统管理员、AAL2、近期验证过期 | 页面可读，敏感操作显示 Step-up | 查看、重新验证 |
| 系统管理员、AAL2、近期验证有效 | 正常使用；危险操作仍需明确确认 | 按服务端能力执行 |
| Auth/API/数据库不可用 | 显示服务不可用和规范 request ID | 重试、排障 |

禁止使用以下推断：

- 看到 403 就认为没权限；
- 看到 403 就认为需要 MFA；
- 菜单可见就认为服务端允许；
- JWT 中显示 AAL2 就认为数据库会话一定有效；
- 客户端倒计时未结束就认为近期验证一定有效；
- 操作请求返回 202 就认为后台任务已经成功。

## 6. 推荐的信息架构

### 6.1 “管理员安全”主页

只显示可行动信息：

- 当前管理员身份；
- 登录会话；
- MFA 状态；
- 备用因子状态；
- 近期验证有效期；
- 注销和恢复入口；
- 最近安全事件摘要。

### 6.2 “审计日志”页面

显示：

- 谁执行；
- 什么时间；
- 对哪个目标；
- 执行什么动作；
- 为什么执行；
- 请求是否接受；
- 最终是否成功；
- 对应 request ID。

### 6.3 普通业务页面

普通页面不再各自解释认证协议。所有页面复用统一错误分类器和统一 Step-up 面板，只提供与当前业务动作相关的确认信息。

## 7. 分阶段整改计划

### 阶段 A：统一前端语义（R1）

目标：先停止误导操作员，不改变认证协议。

- 收敛 401/403/错误码映射到共享工具。
- 移除各页面自行判断 `needsMfa` 的重复代码。
- 修正“权限不足”“异步执行”“保留历史”等不准确文案。
- 安全主页改为操作员状态摘要。
- Factor UUID 和原始状态移入技术信息折叠区。

验收：同一个后端错误在所有 Admin 页面产生相同提示和相同下一步动作。

### 阶段 B：服务端权威状态与关联 ID（R3）

目标：让 UI 和审计共享同一个事实来源。

- 增加只读认证状态端点。
- 统一中央 API、BFF 和数据库审计 request ID。
- 将需要保留的操作原因贯穿合同和数据库过程。
- 增加响应 ID 与审计 ID一致性测试。

验收：任意 Admin 变更可通过页面 request ID 唯一找到审计记录。

### 阶段 C：完整 MFA 生命周期（R3）

目标：解决单管理员因子丢失和因子管理不完整问题。

- 支持第二因子。
- 安全删除因子。
- 保护最后一个因子。
- 校验 Factor ID 归属。
- 因子变化后刷新会话并撤销近期验证。
- 完成离线恢复演练。

验收：新设备、备用设备、设备丢失、删除因子、会话降级和离线恢复都有可重复的测试证据。

### 阶段 D：审计与安全响应头（R2/R3）

目标：支持事故调查并完成浏览器侧加固。

- 审计结果、原因和变更摘要。
- MFA 和会话安全事件。
- CSP Report-Only 验证后强制。
- 验证 Clickjacking、Referrer 和 Permissions Policy。

验收：审计能重建一次管理员操作；生产响应头通过实际浏览器和部署环境检查。

## 8. 建议增加的验收矩阵

### 8.1 身份与页面路由

- 未登录直接访问 `/admin`。
- 普通 Supabase 用户登录后访问 `/admin`。
- 管理员 AAL1 访问普通页面。
- 管理员 AAL2 访问普通页面。
- 服务端撤销当前 session 后刷新页面。

### 8.2 MFA 生命周期

- 首次注册 TOTP。
- 已有因子时添加第二因子。
- 双击注册/验证按钮。
- 两个浏览器标签同时注册因子。
- 删除备用因子。
- 尝试删除最后一个因子。
- 因子删除后的 AAL 和近期验证状态。
- 丢失唯一设备后的离线恢复。

### 8.3 错误分类

- `MFA_REQUIRED`。
- `RECENT_MFA_REQUIRED`。
- `ADMIN_REQUIRED`。
- 真实 `403`。
- Auth 不可用。
- Account API 不可用。
- 数据库超时。

### 8.4 审计一致性

- UI 输入原因后，审计投影能读取同一个脱敏原因。
- 响应 request ID 等于审计 `request_id`。
- 同步操作不显示异步。
- 202 操作显示待处理，而不是成功。
- 后台任务完成或失败后有最终结果事件。

### 8.5 可用性与无障碍

- 桌面和窄屏安全页面。
- 只使用键盘完成 MFA 和 Step-up。
- 错误后焦点移动到可操作提示。
- 二维码无法显示时可以复制 TOTP Secret。
- 屏幕阅读器不会朗读完整秘密或隐藏内容。
- 敏感值默认遮挡，复制有明确反馈。

## 9. 本次验证结果

### 静态检查

- `PASS`：完成 Admin 安全页面、MFA 页面、Admin Shell、BFF、Account API、数据库迁移、审计投影、运维文档和相关 proposal 的只读检查。

### Local

- `PASS`：`pnpm --filter admin test:unit`，2 个测试文件、9 项测试通过。
- `PASS`：`pnpm --filter @kit/account-auth-nextjs test:unit`，2 个测试文件、23 项测试通过。
- `PASS`：`pnpm exec deno test --allow-env supabase/functions/account-api/index.test.ts`，36 项测试通过。
- `NOT_RUN`：真实 Admin 浏览器流程，本地服务未运行。
- `NOT_RUN`：本地 Supabase MFA/会话/审计集成验证，本次为只读审查且未启动本地栈。

### CI / Provider / Production

- `NOT_RUN`：CI，本次未推送变更。
- `NOT_RUN`：Supabase Provider 验证，本次未连接真实项目。
- `NOT_RUN`：生产浏览器、响应安全头和恢复演练，本次未执行生产操作。

现有测试通过只能证明已覆盖路径当前可以运行，不能证明本文列出的状态分类、第二因子、原因落库、请求关联和操作员体验问题不存在。

## 10. 参考资料

项目内参考：

- `docs/architecture/modules/identity-security.md`
- `docs/architecture/modules/frontends.md`
- `docs/reference/api.md`
- `docs/reference/configuration.md`
- `docs/guides/operations.md`
- `docs/proposals/admin-2-navigation-ia/design.md`
- `docs/proposals/admin-2-navigation-ia/plan.md`
- `docs/proposals/admin-2-navigation-ia/verification-record.md`

官方参考：

- Supabase MFA：<https://supabase.com/docs/guides/auth/auth-mfa>
- Supabase TOTP：<https://supabase.com/docs/guides/auth/auth-mfa/totp>
- Supabase Sessions：<https://supabase.com/docs/guides/auth/sessions>
- Supabase Sign Out：<https://supabase.com/docs/guides/auth/signout>
- Supabase Row Level Security：<https://supabase.com/docs/guides/database/postgres/row-level-security>
- OWASP Authorization Cheat Sheet：<https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
- OWASP Multifactor Authentication Cheat Sheet：<https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html>
- OWASP HTTP Headers Cheat Sheet：<https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html>
- OWASP Content Security Policy Cheat Sheet：<https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html>

## 11. 最终建议

不要先增加更多安全菜单、角色开关或前端权限判断。最有效的第一步是：

1. 用一个共享分类器统一所有认证与授权错误。
2. 用一个服务端状态端点统一 Admin Shell 的当前安全状态。
3. 删除所有没有后端事实支撑的字段和承诺。
4. 修通操作原因、request ID 和审计记录。
5. 再补齐第二因子、因子删除和离线恢复。

这样可以用较少改动先解决操作员当前感受到的“这里不显示、那里报错、权限和 MFA 混在一起”的核心问题，同时避免引入一套项目目前并不需要的复杂 RBAC 框架。
