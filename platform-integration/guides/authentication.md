# Authentication and Session

当前自营平台共享 Supabase Auth Identity，但每个平台仍拥有自己的同源会话和 Platform Account 关系；共享 Identity 不等于跨域自动登录。

## 必须满足

- 浏览器只向目标平台同源 Auth/BFF 请求。
- access token / refresh token 使用 HttpOnly Cookie 或目标框架等价的服务端 session 方案。
- mutation 同时验证精确 Origin 和 CSRF Cookie + header。
- logout 后迟到 refresh/login 不能恢复旧 session。
- definitive invalid session 才进入 terminal expired/logout；临时中央故障不能当授权成功。
- callback 的 `returnTo` 只允许安全相对路径，不能携带 token/proof/password。

Platform Key 与 Supabase publishable key 是不同信任级别：前者 server-only；后者可按 Supabase 模型公开，但不能替换成 secret/service role。

参考行为实现位于 `tests/consumer-harness/server.mjs`，只参考协议/安全行为，不复制为生产 server。
