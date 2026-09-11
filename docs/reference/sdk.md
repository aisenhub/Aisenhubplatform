# SDK 与 Registry

| 包 | 当前职责 |
| --- | --- |
| @kit/account-auth | Auth 合同、认证意图与校验 |
| @kit/account-auth-nextjs | 服务端 SSR/Cookie/PKCE 与浏览器会话协调 |
| @kit/account-server | 服务端 HTTP 客户端、认证辅助与 Key 材料 |
| @kit/domain | DTO、校验、错误与兑换码材料 |

包的 exports、依赖和版本以各 package.json 为准。account-server 使用 node:crypto，不能放入浏览器 bundle；领域包使用可供 Node/Edge 引入的 TypeScript 边界。

[createAccountApiClient](../../packages/account-server/src/index.ts)提供账户、资料、偏好、订阅、兑换、Checkout、近期认证和文件方法，包括意图、上传、列表、详情、下载、删除。`authorizeProtectedFeature` 是服务端授权边界：它只接受中央 `getSubscription` 结果，暂停/无权益拒绝，中央错误返回可重试的 `AUTHORIZATION_UNAVAILABLE`，不在 Consumer 本地重算到期时间或信任浏览器 plan flag。构造参数包含 baseUrl、platformKey、可选 fetcher、timeoutMs 和 retry。

默认调用预算 5 秒，最多重试 2 次；GET 或带幂等键的可重试操作针对网络错误与 502/503/504 重试，二进制上传不自动重试。API 错误保留 status、code 和 requestId。

## 本地打包

根目录执行 pnpm sdk:pack，调用[打包脚本](../../tooling/scripts/src/sdk-pack.mjs)编译上述四个包并生成 tarball。默认产物目录 artifacts/sdk，manifest.json 按本次产物写入版本、文件路径及 SHA-256。生成的 hash 只对应同目录的具体 tarball，不在文档固定旧构建校验和。

M5_SDK_PACK_DESTINATION 可覆盖目标；打包会清空目标目录并重建各包 dist。包仍为 private，本地 tarball 不表示已发布到 npm。

## Registry

[manifest.json](../../registry/manifest.json)记录本地元数据及兼容范围；[templates.json](../../registry/templates.json)是安装器读取的模板清单。当前清单只包含参考应用真实存在的页面和 Auth callback，不应据此生成未提供的 Signup、Forgot Password 或 Reset Password 路由。

实际页面与适配边界见[前端模块](../architecture/modules/frontends.md)。安装脚本位于 tests/spikes/registry 和 tests/spikes/consumer；执行前应核对其路由假设。

`apps/template-preview` 的 `/api/v1/[...path]` 是同源 Consumer BFF：公开读取 plans/products，认证后代理 account principal/activate、profile/preferences、subscription、config-files 以及 close/delete-request 等当前白名单路径；服务端读取 Auth cookie 并注入 Platform Key，写请求校验 Origin/CSRF，近期认证证明只通过 HttpOnly cookie 转发。`/api/auth/reauth/start` 与 `/api/auth/reauth/verify` 是同源的近期认证辅助路由。Platform Key 不进入浏览器 bundle、URL、日志或客户端持久存储。

Consumer Auth 路由位于 `/api/auth/login`、`/api/auth/callback`、`/api/auth/refresh` 和 `/api/auth/logout`；`/login` 页面只提交邮箱/密码，浏览器不接触 access/refresh token。`/api/protected/advanced-config` 是最小服务端授权示例：先通过 scoped session gate，再用 `authorizeProtectedFeature` 调用中央 `getSubscription`，中央不可用、暂停或无权益不会降级为 Free 放行。
