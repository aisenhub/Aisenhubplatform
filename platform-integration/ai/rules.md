# AI Integration Rules

这些规则是平台接入时不可弱化的边界。

## Contract

- `contracts/account/v1/openapi.json` 是 Account HTTP schema 唯一事实源。
- `ai/capabilities.json` 只做 capability → operationId 索引，不复制 DTO、枚举或状态码。
- 发现目标平台需要的 API 不在 canonical contract 中时，不绕过合同调用 private/Admin/SQL；应回到中央仓库单独设计公共合同变更。

## Secret 与会话

- Platform Key 仅 server-only。
- access/refresh token 仅进入受控 HttpOnly session storage。
- 不把真实 Secret 写进源码、README、日志、URL、错误消息或对话。
- `SUPABASE_PUBLISHABLE_KEY` 可以公开，但不能替换成 service role/secret key。

## BFF

- 浏览器只调用同源 BFF。
- Mutation 必须验证精确 Origin 与 CSRF。
- BFF 只能转发明确允许的 method/path。
- 不接受浏览器提供的上游 host、Platform Key、platform_id、platform_account_id 或任意 Admin path。
- 上游设置有界 timeout/deadline。
- 保留中央 `X-Request-Id` / response request_id。
- 敏感账户响应不缓存。

## Authorization

- Auth success != Platform Account activated != entitlement allowed。
- 业务 protected route 在服务端读取中央授权。
- 只有 `effective_status=active` 且目标 feature 严格为 `true` 时允许对应能力。
- 中央不可用、响应非法或状态未知时拒绝请求，不降级为 Free/allow，不用旧缓存猜测。
- Entitlement 只证明功能授权；目标平台自己的资源 ownership 仍要单独验证。

## Files / Binary

- 浏览器不直连 AisenHub private Storage。
- 二进制按原始 bytes 代理，不做 text/base64 无必要转换。
- 真实 content type/size、upload intent、quota 与状态机由中央合同决定。

## Retry / Concurrency

- 安全 GET 可按目标平台既定 session recovery 策略重试。
- Mutation 默认不自动重放。
- 只有合同明确声明 Idempotency-Key 的操作才保持同一 key 做受控恢复。
- ETag/If-Match 冲突重新读取，不自行覆盖中央版本。

## Scope

- 普通平台接入不修改共享 Identity / Platform Account / Principal 数据模型。
- 不重新引入中央 Consumer runtime SDK 或 starter app。
- `tests/consumer-harness` 是 fixture，不是产品代码模板。
