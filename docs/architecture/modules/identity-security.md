# 身份与安全

## 身份、平台与账户

Supabase Auth 用户是共享身份，platform_accounts 是平台内业务状态。Account API 从 X-Platform-Key 解析 Key ID 和版本，以 HMAC 查验平台凭据；目标平台来自验证结果，不由业务 body 指定。

[Account API](../../../supabase/functions/account-api/index.ts)调用 Supabase /auth/v1/user 验证 Bearer token，并核对 token 中的 sub 与返回用户一致，解析 session_id 和 AAL。这里没有本地 JWKS 验签实现。数据库 helper 继续校验会话、用户、平台、账户和删除门闩。

principal 可返回未激活、暂停、关闭或平台禁用状态；这类诊断结果不代表业务放行。activate 显式创建平台账户，唯一约束保证同平台同用户只有一个账户；已有暂停或关闭账户不能通过激活恢复。

## 管理端

Next.js 提供登录、刷新、退出、回调、MFA 注册和验证路由。资源写请求校验 ADMIN_ORIGIN 与 scoped CSRF Cookie/header；[代理](../../../apps/admin/app/api/v1/%5B...path%5D/route.ts)转发 access token 和近期认证 proof。

中央 Admin 分派校验管理员身份和 AAL2。敏感动作调用 admin_step_up_valid，并由相应数据库包装函数检查权限。system_admin 是 singleton，普通用户 metadata 不能授予管理员权限。

近期 MFA proof 绑定用户、会话和 factor，窗口为 5 分钟。普通近期认证入口接收当前 token 与 X-Reauth-Access-Token，验证独立认证会话并调用 user_recent_auth_proof_issue。刷新 token 本身不会延长近期认证证明。

## Cookie 与浏览器协调

[Next.js Auth 适配器](../../../packages/account-auth-nextjs/src/index.ts)维护请求级客户端、Cookie、PKCE、回调、刷新和近期认证；[Cookie 策略](../../../packages/account-auth-nextjs/src/cookie-policy.ts)区分 consumer/admin 的 access、refresh、CSRF、proof、logout fence、login ack 和 auth flow。

[浏览器会话协调](../../../packages/account-auth-nextjs/src/browser-session.ts)处理刷新所有权、退出信号和迟到响应隔离。SDK 提供这些能力，不表示平台参考页面已经接入完整业务会话链路。

## 数据库权限

迁移定义 account_executor、admin_executor、job_executor、recovery_executor 与领域 owner/helper 角色。HTTP 事务使用 SET LOCAL ROLE 调用 private 过程，核心 public 表启用 RLS；private 不在 exposed schemas 中。

函数定义包含固定 search_path；不同函数具体取值以迁移为准，不能概括为全部为空。运行角色不能任意更新 Ledger 或通过浏览器 Data API 调用 private 入口。

## 生命周期

平台账户关闭与全局身份删除分别处理。关闭保留身份关系，保留清理任务处理关闭超过 30 天的账户。全局删除由请求、管理员启动和持久任务步骤组成，包含文件清理、匿名化、Auth 解绑及外部删除；失败由租约和 checkpoint 恢复。完整入口见[文件与任务](files-jobs.md)。
