# Errors and Observability

## request_id

保留中央响应中的 request_id / `X-Request-Id`，用于支持、审计和跨层定位。客户端自造 ID 不替代中央审计来源。

## Deadline

Account API 请求必须设置有界 deadline。推荐默认 `ACCOUNT_API_TIMEOUT_MS=5000`，目标平台可根据运行环境调整，但不能无限等待。

## Cache

账户、授权、Checkout 等敏感响应按中央 `no-store` 语义处理，不在 CDN/browser cache 中形成过期授权源。

## 错误分类

至少区分：

- 未认证 / session terminal invalid；
- Platform Account 未激活；
- 权限/feature 拒绝；
- 输入/并发条件错误；
- 上游中央不可用/timeout/invalid payload；
- unknown outcome，需要按合同恢复。

不要把中央 5xx/timeout 映射成允许，也不要通过吞掉 request_id 让故障无法追踪。
