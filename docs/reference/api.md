# API 参考

机器可读定义：[Account OpenAPI](contracts/account.openapi.json)与[Admin OpenAPI](contracts/admin.openapi.json)。DTO、错误码和校验位于 [domain/contracts](../../packages/domain/src/contracts)；路由行为以 [Account API](../../supabase/functions/account-api/index.ts)为准。

## 入口与认证

Account 业务前缀为 /v1；Admin 为 /admin/api/v1。Supabase 外层 /functions/v1/account-api 不属于业务路径。管理端浏览器经 Next.js /api/v1/... 转发中央路径。

Account 除近期认证 proof 外使用 X-Platform-Key；公开套餐 GET /v1/plans 不要求用户会话，其余用户操作要求 Bearer token。POST /v1/auth/recent-proof 使用当前 Bearer 和 X-Reauth-Access-Token，不要求平台 Key。Admin 使用管理员 Bearer，高风险操作还要求近期 proof。

## 请求和返回

- JSON 成功外壳为 data、request_id；部分列表另有 next_cursor。不要假设所有列表拥有同一分页结构。
- 错误外壳为 error.code、error.message、request_id；机器分支使用 code。
- Profile/Preferences 更新用 If-Match；缺失返回 428，版本不匹配返回 412。
- 兑换、文件意图及文件删除等按对应接口要求携带 Idempotency-Key；request_id 不是幂等键。
- 文件 content 使用 application/octet-stream。上传成功响应为 202；下载成功为字节流。
- 私有响应使用 no-store；获取 token 或明确错误不能作为默认业务授权成功。

## 资源边界

Account 的 18 个操作覆盖套餐、Principal、激活、近期认证、关闭、资料、偏好、订阅、兑换、文件和身份删除请求。Admin 的 36 个操作覆盖平台、Origin、账户状态、Key、Plan upsert、批次、订阅命令、文件策略、审计及删除任务。

Plan 创建与更新共用 POST 平台 plans 集合，通过 plan_id 区分；没有独立通用 Plan PATCH 路由。Origin 提供列表和创建，没有任意 CRUD。批次创建重试返回既有结果且不重复交付明文。

OpenAPI 中的 schema 定义可用于静态合同检查；检查通过不证明所有运行时响应与 schema 完全一致，也不证明托管可达。该仓库的 contracts:check 验证引用、操作标识、认证声明、错误样例、二进制和 no-store。

Maintenance 是独立 token 保护的任务接口，见[运维](../guides/operations.md)。
