# 身份、安全与生命周期

本文件描述当前身份、安全与生命周期实现，属于 [系统架构](../overview.md) 的身份模块。身份是全局共享的，业务状态是平台本地的，两者不能互相替代。

## Requirements

本模块主要承担 [身份与安全需求](../../spec/identity-security.md) `REQ-IAM-001` ～ `REQ-IAM-011`，并共同满足 `REQ-SYS-001` ～ `REQ-SYS-006`、`REQ-SYS-008`。未完成目标以 Spec 的 `Partial/Planned` 状态和 [`docs/plans/TODO.md`](../../plans/TODO.md) 跟踪，不提前写成当前能力。

## 1. 平台信任边界

V1 全部为同一运营主体控制的自营平台。Platform API Key 只证明调用服务所属平台；Global JWT 证明用户身份，**不证明用户是在目标平台完成登录，也不是平台绑定的授权令牌**。

持有有效 Global JWT 的用户，经 B 平台正常 BFF 身份接口可访问其 B 账户（或按激活策略加入 B）；这是共享身份合同。A Key 直接调用中央 API 只能构造 A Principal，不能传 B platform_id 越权。这两个测试必须区分，不能把共享身份行为宣称为跨平台令牌隔离。

平台凭据不得跨 BFF 分发，中央 API 不提供浏览器任意选择 Key 的代理。第三方应用接入前必须重新评审平台 audience、同意、令牌交换或独立身份域；不得只发一个 Platform Key 沿用当前信任模型。

管理员专用身份不在普通平台使用；激活、BFF 业务授权、普通账户 API 拒绝 system_admin 身份。该措施保护业务入口，不宣称共享 Supabase Auth 本身能够按页面 origin 禁止管理员登录；运维规范同样要求管理员只使用控制台、独立浏览器配置和凭据。

## 2. JWT、会话及 SSR

Account API 验证签名、允许算法、精确项目 issuer、受众 authenticated、exp/nbf、sub UUID 和 session_id；拒绝来自其他环境或项目的令牌。JWKS 可按官方缓存策略缓存；缓存公钥不等于缓存业务授权。不接受 user_metadata 的身份/权限声明。

服务端 getClaims/已验证 token 路径用于身份校验；需要最新用户信息调用 getUser。getSession 只用于取得待转发 token，不能信任其中未验证的 user 对象。实现时固定 Supabase SDK/SSR 版本并通过真实 PKCE/刷新测试。

V1 用户 access token 默认15分钟；每次构造 Principal 还通过只读私有 helper 检查 user 存在、未封禁、identity_lifecycle 非 deleting、session_id 属于该 user 且会话存在并在配置有效期内。查询失败拒绝授权，不把 JWT 尚未过期视为可绕过条件。

退出默认撤销当前平台所用当前会话（local scope）；“退出所有设备”是单独明确的全局操作。已删除会话的旧 JWT 在后续 Principal 检查时拒绝。仍在执行中的跨服务请求不承诺即时中断。

Next.js adapter 统一处理 Secure/SameSite Cookie、session refresh、PKCE、OAuth callback、email confirmation 和 password reset。当前实现另外使用 Consumer/Admin scoped access、refresh、CSRF、recent-proof、login-ack、auth-flow 与 logout-fence cookies；登录及刷新响应禁止共享缓存/ISR，每请求独立用户 client，禁止全局 singleton 混入不同用户 token。浏览器端只持有会话状态，不暴露 access/refresh/proof token。

Cookie 模型遵循所固定 SSR SDK 实际需要，不虚假承诺所有富客户端 Cookie 均可 HttpOnly。业务 BFF 的写入口严格检查同源 Origin、CSRF token 和 HTTP method；CORS 不是授权。回调 returnTo 仅允许同源相对路径，不接受任意 URL。

## 3. Origin、注册与 Linking

平台 Origin 在注册前规范化，生产 HTTPS、精确 callback 路径；Supabase Auth allowlist 按环境配置同步，生产不接受 preview 通配符。检测未同步或漂移时阻止该平台启用新 Auth 流程，并向管理员展示配置错误。

allow_activation 只控制首次创建 Platform Account；共享 Auth 的全局 signup 由项目级配置统一决定。允许全局创建身份但拒绝某平台激活是合法结果；不能用隐藏 Signup 按钮代替激活检查。

V1 支持经官方验证的 email/password 与 Google OAuth；其他 Provider 需先通过同样的 Auth conformance suite。Provider Linking 通过 Supabase Auth；手动 Linking 要求有效会话和近期重新认证，验证 callback/PKCE，显示全局影响提示。

不按客户端提交邮箱自行合并用户，不自行维护 oauth_identities，也不假定同邮箱两个已有 user_id 会自动安全合并。已存在 identity 冲突返回明确错误，由恢复流程处理；管理员不能通过普通控制台强制把一个用户的 identity 转给另一用户。

## 4. Principal 与停用

Principal 从验证后的 user + Platform Key 得到 userId、platformId、platformAccountId、platformStatus、accountStatus。不存在账户时为 not_activated，不自动激活；只有 activate endpoint 创建账户。

所有 Account handler 接收 Principal，不重新信任 body 中的 user_id/platform_id/account_id。文件 ID 等目标资源仍须查询同平台同账户归属。事务内敏感写入重新检查平台、账户、Key和身份门闩；平台配置修改与业务通过共享/排他锁约定提交顺序。

中央服务不可用时，受保护业务默认503 AUTHORIZATION_UNAVAILABLE，不降级为只看JWT。BFF不跨请求缓存Principal/权益；调用超时与重试见接口文档。数据库会话检查、状态校验、代码重放是不同机制，不能互相省略。

## 5. System Admin membership 和近期 MFA

`private.system_admin` 是 System Admin membership 的权威来源，状态只有 `pending / active`；`private.active_system_admin` 是普通 Admin 授权的 active-only 投影。只有 active member 可以进入普通 Admin 业务，正常 readiness 要求至少 2 名 active System Admin，且每名 active 管理员至少有 2 个 Supabase Auth verified TOTP factor。System Admin 使用专用 Auth identity；pending/active 管理员身份都不能构造普通 Consumer Principal。

唯一允许在普通 Admin AAL2 gate 之前读取的入口是 `GET /admin/api/v1/security/status`。`private.admin_system_admin_self_status` 同时校验 membership、活动 session，并返回 `membership_state`、当前 AAL、当前 session recent-MFA 过期时间、verified TOTP 数量、active/member 数量和服务端 readiness。匿名为 401，非 membership 为 403 `ADMIN_REQUIRED`，无效 session 为 401。pending member 可以在 AAL1/AAL2 下读取 onboarding 所需状态，但不会因此获得普通 Admin 权限；AAL2 本身也不证明近期完成 MFA，不使用 JWT `iat` 作为 MFA 时间。

Admin Shell 在渲染普通管理页面前读取该状态：未登录转登录；active AAL1 管理员只进入 `/admin/mfa`；active AAL2 管理员进入普通管理页面；pending 管理员只允许 `/admin/mfa` 与 `/admin/security` 完成双 TOTP onboarding 和查看 readiness；非管理员和授权服务故障保持在无业务内容的阻断界面。`/admin/login` 是唯一不读取 status 的登录入口；BFF 只代理状态与 membership API，不复制 active-floor 或 factor 数量算法。

普通 Admin 操作以 active membership + 活动 session + AAL2 为统一授权基线。当前 recent-MFA 范围已经扩展到多个高风险 mutation，包括 System Admin `add / activate / remove`、Platform Key 创建/部署确认/撤销、Global Delete 启动/重试、Platform Account suspend/restore/close、Billing 人工 requery/resolve、Plan command、Offer/Price/Provider Mapping 商业配置变更、Redemption Campaign 创建、Subscription/Entitlement command、Config Gallery review/governance、Feedback batch delete，以及提高平台 Storage 总容量等条件式敏感变更。具体 operation 是否需要 step-up 以当前 Admin OpenAPI 的 `x-requires-step-up` / `x-requires-step-up-when` 和服务端实际 `adminStepUp` enforcement 共同为准，不能维护一份脱离合同/代码的静态白名单。近期 MFA proof 最长有效 30 分钟。System Admin mutation 在数据库中先取得统一 membership advisory lock，再重新校验 actor/recent-MFA：新增只创建 pending membership，激活前服务端确认目标至少 2 个 verified TOTP，移除 active member 时事务内保证结果仍有至少 2 名 active，并立即撤销目标 Auth session 与 recent-proof。

全局 Identity 的 Admin 读取继续把 Auth PII 与业务生命周期分层：`GET /admin/api/v1/accounts` 用服务端 Auth Admin API 枚举/精确解析允许的 Auth identity，再由 `private.admin_identity_accounts` 补平台账户关系；`GET /admin/api/v1/accounts/{userId}` 对一个仍存在的 Auth identity 复用同一 Auth 读取，并通过只授予 `admin_executor` 的 `private.admin_identity_lifecycle_read` 补当前/最近删除 request 与关联 job。该只读投影固定 security-definer search_path，只返回 Admin UI 做状态判断所需的 request/job 字段，不返回 request session、job fence 或 lease 等执行内部信息。读取仍只要求普通 Admin AAL2；Global Delete 启动/重试继续走既有 recent-MFA mutation 边界。

Admin Auth adapter 先在当前 Supabase Auth session 内对指定 TOTP factor 执行真实 challenge/verify；成功获得 elevated session 后还必须确认 session ID 与原登录 acknowledgement 相同。随后 Admin BFF 用共享服务端 HMAC Secret 签发最多 60 秒的 attestation，绑定 user_id、session_id、factor_id、verified_at 和随机 nonce；中央 Account API 验证签名、当前 AAL2 bearer 的 user/session 绑定与时效后，才调用 `private.admin_step_up_issue` 写入 `private.admin_step_up`。中央 API 不重新向 Auth Provider 查询 factor，而是信任“当前 session 已完成 Provider challenge + server-signed attestation”这条链。数据库只接受 verified_at 在当前时间前 90 秒以内且不能超过未来 5 秒的证明输入；最终 step-up proof 最长有效 30 分钟。证明记录保存 user_id、session_id、verified_at、expires_at、factor_id 和 attestation_nonce；nonce 按当前管理员会话唯一消费，重放拒绝。同一 user/session 只有按 `verified_at,id` 排序最新的一张 proof 可通过 `admin_step_up_valid`，因此再次验证/新增因子形成新 proof 后旧 proof 不再可用于高风险 mutation，同时旧记录仍保留以维持 nonce 防重放。普通 token refresh 不延长窗口；撤销会话或移除管理员 membership 会立即使证明不可用。浏览器单独提交的 factor id、挑战完成布尔值或已有 AAL2 本身都不构成近期 MFA 证明。

### 当前 TOTP 因子生命周期边界

Admin 当前支持列出 verified TOTP、首因子注册、在已有因子时添加备用 TOTP，以及 verified factor 的受控删除。开始新的 enrollment 前只会清理由失败渲染等原因遗留的 **unverified** TOTP，不会自动触碰 verified factor。

verified factor 删除不由浏览器直接调用 Provider：same-origin Auth route 先要求 Origin/CSRF、当前 Admin session 与 recent-proof cookie，再由中央 API 调用 `private.admin_mfa_factor_delete_prepare`。数据库在 System Admin membership 行上串行化 prepare，重新校验活动 session、recent proof、factor 归属和最低剩余数量（active 删除后至少 2 个 verified TOTP，pending 至少保留 1 个），并在 `private.admin_mfa_factor_operations` 创建短租约 operation；同一管理员已有 authorized operation 时第二会话返回 `OPERATION_IN_PROGRESS`。prepare 成功会先撤销当前 session 的旧 recent proof，随后 BFF 才调用 Supabase `mfa.unenroll`；已知 Provider 失败且 factor 仍存在时 finalize 为 failed，factor 已不存在时 finalize 为 completed 并写 `system_admin.mfa_factor_removed` 审计，未知结果则保留 operation/lease 阻止立即重复删除。成功后刷新 Auth session，无法刷新则要求重新登录。

这套串行化只保护本项目受控入口，不改变 Supabase 原生 API。历史固定版本探针证明原生 unenroll 和绕过本应用的并发会话仍可能删到 0，因此绝不描述为 Provider 全局原子保证。当前 `REQ-IAM-011` 仍为 Partial 仅因为本次候选的真实 Local Supabase/Auth pgTAP/并发/browser 验证被本机 Docker 服务权限阻塞；相关自动用例已经加入 release gate。离线恢复继续属于受控运维路径，不在网页提供 MFA bypass。

中央 Account API 对普通 Admin Route 统一要求 active System Admin、活动管理员会话与 AAL2；私有数据库包装函数继续重新检查 active membership 和 session。System Admin membership mutation、Global Delete、关键密钥生命周期、平台账户状态变更与 Billing requery/resolve 使用同一 recent-MFA 边界；membership 的 active-floor、目标 MFA readiness 和并发串行化只在 private domain function 内决定。Account executor无权调用 Admin 包装或记录 step-up。数据库不自行验证 HTTP JWT 签名，由服务器 Auth adapter 验证后传入受控上下文。

普通用户的近期认证使用独立的 Supabase email sign-in 事件：当前业务会话先由 BFF 恢复并确认用户，邮件中的 `token_hash` 在不持久化的临时 Auth client 中验证，随后 BFF 只把临时 access token 通过 `X-Reauth-Access-Token` 传给中央 Account API。中央 API 分别验证当前 bearer 与事件 token 的 Auth 用户、解析出的 `session_id`，并由窄范围的 security-definer helper 检查事件 session 属于同一用户、创建时间在 5 分钟内且仍有效；proof 只写入原业务 session，临时 session 在 BFF 中撤销且不会返回浏览器。邮件 token 不放入中央 API body、proof cookie 仍为 HttpOnly，缺少任一事件/绑定/撤销证据即拒绝。该实现不把 `iat`、AAL2 或客户端布尔值当作近期认证证明；Supabase 的 `reauthenticate()`/nonce 流程仍仅保留为资料或密码变更语义，不作为本 proof 协议。

## 6. 私有数据库调用和 RLS

固定路径：Account/Admin SQL repository → TLS事务连接池 → private领域函数；不通过supabase.rpc调用未暴露schema，不将private加入Data API exposed schemas。连接只在短事务内占用，禁止依赖跨请求session变量、会话级锁或命名prepared statement；项目连接串使用真实部署返回的pooler地址，不手工推测主机名。

Account Edge函数同时承载平台凭据认证的公开套餐接口和用户接口，因此入口配置关闭旧式网关JWT预验证，由统一HTTP adapter按路由强制执行本文的JWT及Platform Key验证。关闭网关预验证不表示开放匿名业务访问；所有方法/path必须命中显式权限矩阵，未知路由拒绝。Admin部署与任务入口各用独立授权，不继承公开套餐例外。

角色分离：

| 角色 | 权限 |
|---|---|
| account_executor | LOGIN、CONNECT、private USAGE、普通Account函数EXECUTE；无基础表DML |
| admin_executor | 独立LOGIN，只可执行Admin授权包装及必要查询 |
| job_executor | 只可执行任务领取、对账与补偿函数；无普通Admin入口 |
| domain_owner | NOLOGIN、最小表权限及命名RLS policy；拥有指定领域函数，非全局BYPASSRLS |
| recovery_executor | 离线、限时启用的恢复/匿名化入口，生产运行时不持有 |

函数固定受控search_path、全限定表名、参数化SQL；显式撤销PUBLIC/anon/authenticated的EXECUTE，保留对应executor入口。每个新函数必须显式撤权；仅按schema设置默认权限不能撤销PostgreSQL全局PUBLIC EXECUTE默认值。全函数权限回归检查防止后续迁移重新暴露。domain_owner不能拥有不相关Auth或Storage表。会话查询使用独立只读helper，仅授予所需Auth列SELECT，不能通过业务函数修改auth.users/auth.sessions。

public核心表全部RLS，显式撤销浏览器CRUD；View用security_invoker或不暴露。普通runtime不获Ledger/Event/Audit UPDATE/DELETE；匿名化例外仅通过recovery入口。数据库函数的测试必须使用真正executor角色，不能只以postgres测试。

Supabase Secret Key用于服务器Storage/Auth API；独立于SQL凭据和SSR用户client。它具有广泛能力，runtime泄露影响面不能靠自定义SQL角色消除；用独立环境、Secret存取控制和日志脱敏降低风险。

## 7. 生命周期和受控清除

Platform Suspend保留数据，拒绝业务及账户修改；恢复需Admin审计。Close默认不可自助重开，保留身份关联；普通平台注销不能调用Supabase删除用户API。

Close 后个人资料匿名化/清理期限**不在代码中硬编码为固定 30 天**。`private.account_retention_policy` 是显式法务/财务 policy source，记录 `personal_data_retention_days`、来源和依据；没有 policy row 时 retention cutoff 直接返回 `retention_policy_not_configured`，匿名化任务 fail closed。暂停不触发清理。数据库/Storage 备份最长保留窗口与个人信息 retention 是不同政策，不能互相替代。

Global Delete由用户近期重新认证后提交请求，Admin近期MFA确认执行；流程可中断续跑：

1. 锁定identity_lifecycle设deleting并提交job；阻止新增激活、Grant、上传及业务授权。
2. 撤销该用户全部Auth会话，枚举所有账户；任务保存checkpoint，不把整个跨服务流程包在DB事务。
3. 关闭各账户，处理上传中的未结算写入，删除对象并确认，或因明确保留要求置job blocked并说明原因。
4. 删除Profile/Preferences、个人文件名和metadata、幂等响应中的个人信息；匿名化历史actor、IP/user-agent与可识别自由文本，保留Grant业务效果和不可变关系。
5. platform_accounts.user_id=NULL、anonymized_at=now，保留closed墓碑；created_by等Auth引用SET NULL。若有保留阻塞不得伪报删除完成。
6. 清除step-up/receipt会话绑定、identity_lifecycle门闩及其他restrict依赖；只有处于受控deleting任务时允许该步。整个间隙仍由deletion job阻止新Principal或门闩重建。
7. 调用Auth Admin删除用户；失败维持deleting job并重试。成功后清空job.user_id，保留非个人任务ID/完成记录与审计。

当前 System Admin 若要进入 Global Delete，必须先通过正常 membership 流程移除其管理员资格，并保证仍有至少 2 名 active System Admin；只有正常管理路径整体不可用时才进入离线 recovery。不得为了通过 FK 临时删除 membership 约束或绕过 active-floor。删除任务涉及备份保留与恢复后重应用清除，见运维文档。

## 8. 限流和审计

V1 使用数据库原子时间窗口计数器，只存 hash 键与计数，不新增缓存服务。兑换每账户每分钟 5 个新意图、每平台每分钟 300 个；已完成同 key 重放不再计数。超限返回 429，拒绝记录提交后再形成 HTTP 错误。Config 各操作使用当前 SQL 的 action-specific 固定窗口限制，Storage 并发和容量另由领域锁约束。固定窗口允许边界两侧瞬间两倍额度，不承诺严格滑动窗口。

当前 BFF 没有可验证的可信客户端 IP 传播合同，因此不使用客户端原始转发头构造安全限流键，也不宣称已实现 IP 限流。计数器不可用时敏感操作 fail closed。Auth 登录/注册/重置沿用 Provider 限流。

审计至少覆盖平台/账户状态、Origin、Key生命周期、批次生成/确认/禁用、Grant/reversal/pause/resume、文件上传/下载授权与完成/删除、Admin查看、恢复与清除。日志禁止password、token、MFA secret、Code、完整签名、文件内容及任何Secret。

## 9. 必测情景

错误issuer/audience/过期JWT、同项目跨平台正常身份复用、A Key越权B、任意body归属、普通账户假Admin、AAL1、过期step-up、刷新不能续期MFA、退出后旧JWT、被替换Admin旧会话、CSRF、恶意returnTo、allow_activation关闭、suspended/closed激活、deleting期间并发新账户、匿名化后所有FK仍完整、普通角色调用私有函数、role下RLS与View绕过、限流失败默认拒绝。
