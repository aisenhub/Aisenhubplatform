# 配置参考

只列当前源码读取的应用配置；值由环境注入。公开配置与 Secret 分离，真实凭据不得进入文档。

## Admin

来源：[认证配置](../../apps/admin/app/api/auth/_lib.ts)和[资源代理](../../apps/admin/app/api/v1/%5B...path%5D/route.ts)。

| 变量 | 用途与优先级 |
| --- | --- |
| SUPABASE_URL | Auth URL；回退 NEXT_PUBLIC_SUPABASE_URL |
| SUPABASE_PUBLISHABLE_KEY | 优先，其次 SUPABASE_ANON_KEY、NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY、NEXT_PUBLIC_SUPABASE_ANON_KEY |
| ADMIN_ORIGIN | 同源校验的精确 origin |
| ACCOUNT_API_URL | 中央 API base URL；代理在其后追加资源路径 |
| NODE_ENV | production 时写 Secure Cookie |

## 平台参考页

账户页读取 NEXT_PUBLIC_SUPABASE_URL，以及 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（回退 NEXT_PUBLIC_SUPABASE_ANON_KEY）。这些参数允许公开；SUPABASE_SECRET_KEY、SQL URL、平台 Key 和 HMAC 不得使用 NEXT_PUBLIC 前缀。

## 中央 API

来源：[account-api](../../supabase/functions/account-api/index.ts)。

| 变量 | 行为 |
| --- | --- |
| SUPABASE_URL | Auth 与 Storage 地址 |
| SUPABASE_ANON_KEY、SUPABASE_PUBLISHABLE_KEY | Auth 验证优先使用前者，后者为回退 |
| ACCOUNT_API_JWT_SECRET | 可选 HS256 JWT 验证 Secret；ES256 access token 使用 `SUPABASE_URL` 的 Auth JWKS。两者均保留数据库 session/revocation 检查；公钥不可用时回退 Auth `/user` |
| ACCOUNT_DB_URL | Account 独立数据库连接 |
| ADMIN_DB_URL | Admin 独立数据库连接 |
| ACCOUNT_API_DB_URL、SUPABASE_DB_URL | 独立连接缺失时依次回退 |
| ACCOUNT_API_DB_POOL_MAX | Account API 数据库连接池上限，允许 4–64，默认 8；按实际数据库连接预算调整 |
| ACCOUNT_API_DB_ROLE_MODE | 默认 `transaction`，每个事务设置 executor 角色；设为 `startup` 时在 Account/Admin 独立连接池建立时固定对应 executor 角色，需确认连接用户允许 `SET ROLE` |
| PLATFORM_KEY_HMAC_SECRET | 当前平台 Key HMAC Secret |
| PLATFORM_KEY_HMAC_SECRET_PREVIOUS | 可选上一平台 Secret |
| REDEMPTION_HMAC_SECRET | 当前兑换 Secret |
| REDEMPTION_HMAC_KEY_VERSION | 当前版本，默认 1 |
| REDEMPTION_HMAC_SECRET_PREVIOUS | 可选上一兑换 Secret |
| REDEMPTION_HMAC_PREVIOUS_KEY_VERSION | 上一兑换 Secret 的版本 |
| SUPABASE_SECRET_KEY | Storage 服务端凭据 |
| ACCOUNT_API_PORT | 直接 Deno 运行端口，默认 8000 |
| BILLING_CHECKOUT_ENABLED | `false` 时仅停止新 Checkout 签发；已有订单和 webhook 不受此开关影响，默认关闭，须在 G-PROVIDER/G-OPS 通过后显式开启 |
| AFDIAN_CHECKOUT_BASE_URL | 可选；服务端生成 Afdian Checkout URL 的 base，默认 `https://afdian.com/order/create`；不能由浏览器传入 |

## Maintenance

来源：[maintenance](../../supabase/functions/maintenance/index.ts)。

| 变量 | 行为 |
| --- | --- |
| MAINTENANCE_JOB_TOKEN | 必需，匹配请求 Bearer token |
| MAINTENANCE_DB_URL | 优先连接；回退 SUPABASE_DB_URL，再 ACCOUNT_API_DB_URL |
| MAINTENANCE_WORKER_ID | 可选；默认生成 maintenance-UUID |
| MAINTENANCE_PORT | 直接运行默认 8001 |
| SUPABASE_URL、SUPABASE_SECRET_KEY | Storage 和 Auth Admin API |
| BILLING_WEBHOOK_DB_URL | Webhook Inbox 数据库连接；缺失时回退 `SUPABASE_DB_URL`、`ACCOUNT_API_DB_URL` |
| BILLING_WEBHOOK_INGRESS_ENABLED | `false` 时拒绝新的 Provider webhook 且不写入 Inbox；独立于 Checkout，默认开启 |
| BILLING_PROVIDER_ACCOUNT_ID | Webhook 使用的 `billing_provider_accounts.id`；必须与 active Afdian provider account 一致，禁止写入前端 |
| AFDIAN_WEBHOOK_PATH_SECRET | 可选；为爱发电回调 URL 增加不可猜路径段。配置后 URL 必须使用 `/webhooks/afdian/<secret>` |
| BILLING_BACKGROUND_PROCESSING_ENABLED | `false` 时停止领取新的 Billing job，既有 lease 等待超时后可恢复，默认开启 |
| BILLING_AUTO_SETTLEMENT_ENABLED | `false` 时停止 Provider 查询与自动结算，已入队任务保留并可恢复，默认开启 |
| AFDIAN_USER_ID | 爱发电开发者账号 `user_id`；仅供 maintenance 服务端 API 调用，禁止进入浏览器 |
| AFDIAN_API_TOKEN | 爱发电开发者 API Token；仅供 maintenance 服务端签名 API 请求，必须通过 Secret 注入 |
| AFDIAN_API_BASE_URL | 可选；默认 `https://afdian.com/api/open`，staging 可指向测试代理 |
| AFDIAN_API_TIMEOUT_MS | 可选；Provider API 超时毫秒数，默认 5000 |

调度清单每天调用 `/maintenance/v1/idempotency/cleanup`，通过 `job_executor` 受限 wrapper 批量删除已过期的普通用户/Admin 幂等缓存。该任务不删除 `billing_checkout_intents` 或 `billing_orders` 等长期交易绑定；无需新增环境变量。

数据库回退是代码行为，不保证连接凭据权限最小化。各服务仍在事务内切换 executor 角色。Hosted Supabase 需要将 `postgres` 加入这些 executor 角色，见 `20260912143000_hosted_runtime_role_membership.sql`；否则 `SET LOCAL ROLE` 会在本地超级用户测试之外失败。

## 开发与共享设施

- M5_SDK_PACK_DESTINATION：SDK 打包输出，默认 artifacts/sdk；脚本会清空该目标，必须使用专属产物目录。
- LOGGER：共享日志实现，默认 pino。
- NEXT_PUBLIC_DEFAULT_LOCALE：共享 i18n 默认 en。
- NEXT_PUBLIC_VERSION_UPDATER_REFETCH_INTERVAL_SECONDS：共享版本检查组件间隔。

本地端口、Auth 和函数配置以 [supabase/config.toml](../../supabase/config.toml)为准。示例 env 文件不是完整的服务配置清单。
