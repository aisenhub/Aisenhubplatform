# 认证、安全与生命周期 v1.2

本文件从属于 [架构基线](architecture.md)。身份是全局共享的，业务状态是平台本地的，两者不能互相替代。

**ASU-R1 实现登记（2026-09-09）：** [Auth 优化计划 §2.10](plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/00-master-plan.md) 已落实 scoped CSRF/proof、CSRF 刷新窗口、local revoke 结果分类、退出 fence/ack、迟到响应隔离、显式刷新所有权与 MFA 部分成功协议。实现代码与阶段验证记录见 [verification-record.md](plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/verification-record.md)；真实 Supabase/Auth、浏览器双 Tab、响应式回归和生产观察仍需在对应环境执行。现有中央 JWT/session/AAL2/proof 和领域授权要求不变。

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

Next.js adapter 统一处理 Secure/SameSite Cookie、session refresh、PKCE、OAuth callback、email confirmation 和 password reset。当前 ASU 实现另外使用 Consumer/Admin scoped access、refresh、CSRF、recent-proof、login-ack、auth-flow 与 logout-fence cookies；登录及刷新响应禁止共享缓存/ISR，每请求独立用户 client，禁止全局 singleton 混入不同用户 token。浏览器端只持有会话状态，不暴露 access/refresh/proof token。

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

## 5. 单一管理员和近期 MFA

system_admin singleton 保证最多一名管理员；每个 Admin Route/Server Action 验证 token、会话、user状态、实时 membership、AAL2。AAL2本身不证明近期完成MFA，也不使用JWT iat作为MFA时间。

生成/轮换/撤销Key、生成及确认兑换码交付、Manual Grant/revoke/pause/resume、管理员下载/删除配置文件、Global Delete、替换管理员等高风险动作，要求最近5分钟完成一次服务端验证的MFA challenge。

Admin Auth adapter在官方MFA验证成功后写入 private.admin_step_up：user_id、session_id、verified_at、expires_at、factor_id；证明绑定当前会话，服务端存储，用户不可自行写。普通token refresh不延长窗口，撤销会话或替换管理员立即使证明不可用。收到挑战完成的客户端布尔值不构成证明。

Admin数据库入口的授权包装函数重新检查成员、会话、AAL2已验证上下文及step-up证明，再调用共用领域函数；Account executor无权调用Admin包装或记录step-up。数据库不自行验证HTTP JWT签名，由服务器Auth adapter验证后传入受控上下文。

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

函数固定空search_path、全限定表名、参数化SQL；撤销PUBLIC/anon/authenticated的EXECUTE并设置默认权限。domain_owner不能拥有不相关Auth或Storage表。会话查询使用独立只读helper，仅授予所需Auth列SELECT，不能通过业务函数修改auth.users/auth.sessions。

public核心表全部RLS，显式撤销浏览器CRUD；View用security_invoker或不暴露。普通runtime不获Ledger/Event/Audit UPDATE/DELETE；匿名化例外仅通过recovery入口。数据库函数的测试必须使用真正executor角色，不能只以postgres测试。

Supabase Secret Key用于服务器Storage/Auth API；独立于SQL凭据和SSR用户client。它具有广泛能力，runtime泄露影响面不能靠自定义SQL角色消除；用独立环境、Secret存取控制和日志脱敏降低风险。

## 7. 生命周期和受控清除

Platform Suspend保留数据，拒绝业务及账户修改；恢复需Admin审计。Close默认不可自助重开，保留身份关联；普通平台注销不能调用Supabase删除用户API。

V1 Close后30天清理Profile/Preferences/文件内容，保留墓碑账户与最小业务历史。暂停不触发清理。若需其他保留期限，由运营在上线前明确配置并记录，不将这里的默认值当作法律合规结论。

Global Delete由用户近期重新认证后提交请求，Admin近期MFA确认执行；流程可中断续跑：

1. 锁定identity_lifecycle设deleting并提交job；阻止新增激活、Grant、上传及业务授权。
2. 撤销该用户全部Auth会话，枚举所有账户；任务保存checkpoint，不把整个跨服务流程包在DB事务。
3. 关闭各账户，处理上传中的未结算写入，删除对象并确认，或因明确保留要求置job blocked并说明原因。
4. 删除Profile/Preferences、个人文件名和metadata、幂等响应中的个人信息；匿名化历史actor、IP/user-agent与可识别自由文本，保留Grant业务效果和不可变关系。
5. platform_accounts.user_id=NULL、anonymized_at=now，保留closed墓碑；created_by等Auth引用SET NULL。若有保留阻塞不得伪报删除完成。
6. 清除step-up/receipt会话绑定、identity_lifecycle门闩及其他restrict依赖；只有处于受控deleting任务时允许该步。整个间隙仍由deletion job阻止新Principal或门闩重建。
7. 调用Auth Admin删除用户；失败维持deleting job并重试。成功后清空job.user_id，保留非个人任务ID/完成记录与审计。

当前管理员Global Delete必须先经离线恢复流程原子替换singleton；不得为了通过FK先临时移除管理员约束。删除任务涉及备份保留与恢复后重应用清除，见运维文档。

## 8. 限流和审计

V1使用数据库原子时间窗口计数器，不新增缓存服务；只存hash后的键与计数，1天后清理。兑换：每账户每分钟5次、每可信客户端IP每分钟30次、每平台每分钟300次；创建上传意图：每账户每分钟10次，最多2个pending/receiving/storing。公开套餐：每平台每分钟600次。返回429与Retry-After。固定窗口允许边界两侧瞬间两倍额度，这是明确的V1限流语义，不作为存储硬配额或严格滑动窗口承诺。

IP只能来自已配置可信代理链或BFF签发的内部字段，删除客户端原始转发头；平台级限额防止共享Auth资源被单平台耗尽。计数器不可用时敏感操作503，不放行。Auth登录/注册/重置使用Provider限流与边缘防护，不用可绕过的自建按钮限流替代。

审计至少覆盖平台/账户状态、Origin、Key生命周期、批次生成/确认/禁用、Grant/reversal/pause/resume、文件上传/下载授权与完成/删除、Admin查看、恢复与清除。日志禁止password、token、MFA secret、Code、完整签名、文件内容及任何Secret。

## 9. 必测情景

错误issuer/audience/过期JWT、同项目跨平台正常身份复用、A Key越权B、任意body归属、普通账户假Admin、AAL1、过期step-up、刷新不能续期MFA、退出后旧JWT、被替换Admin旧会话、CSRF、恶意returnTo、allow_activation关闭、suspended/closed激活、deleting期间并发新账户、匿名化后所有FK仍完整、普通角色调用私有函数、role下RLS与View绕过、限流失败默认拒绝。
