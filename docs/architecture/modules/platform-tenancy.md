# 平台与租户架构

本模块定义 Aisenhubplatform 的平台租户边界、平台接入元数据、Origin、Platform Key 与平台作用域。平台是绝大多数业务数据的第一归属维度，但用户 Auth Identity 是全局共享的，两者不能混为同一个租户概念。

## Requirements

本模块主要承担 [平台与租户需求](../../spec/platform-tenancy.md) `REQ-PLT-001` ～ `REQ-PLT-008`，并共同满足 `REQ-SYS-001` ～ `REQ-SYS-003`、`REQ-SYS-006`、`REQ-SYS-007`。

## 1. 职责边界

本模块负责：

- Platform 的创建、状态和基础策略；
- `platform_id` 的权威归属；
- Platform Auth Origin 与回调地址注册；
- server-only Platform API Key 的创建、部署确认、撤销和轮换；
- Global / Platform scope 的服务端与 Admin URL 语义；
- 新平台“中央准备就绪”的可验证事实。

本模块不负责：

- 用户身份认证本身：见 [身份与安全](identity-security.md)；
- Platform Account 生命周期：见 [账户与资料](accounts-profile.md)；
- Plan/Offer/Price：见 [商业目录](commerce-catalog.md)；
- 目标 Consumer 仓库是否真的完成 BFF/Auth/E2E：见 [Consumer 接入](consumer-api-integration.md)。

## 2. 权威数据

### `public.platforms`

关键字段：

- `id`: UUID，所有平台资源 FK 的作用域键；
- `code`: 稳定业务代码；
- `name`: 人类可读名称；
- `status`: `active | disabled`；
- `allow_activation`: 是否允许首次创建 Platform Account；
- `default_locale`；
- `default_plan_id`；
- `default_plan_kind='free'`；
- `config`: 有界 JSON object；
- `created_at / updated_at`。

平台 disabled 是服务端授权事实，不是 UI 展示状态。普通平台业务不得仅因为 JWT 有效而绕过 disabled。

### `public.platform_auth_origins`

每条记录绑定 `platform_id`，环境固定为：

`local | preview | staging | production`

保存精确：

- `origin`；
- `oauth_callback_url`；
- `password_reset_url`；
- `email_confirmation_url`；
- `status: active | disabled`。

应用 Registry 不能替代 Supabase Auth redirect allowlist；两者必须一致。生产环境不使用宽泛 preview wildcard 作为正式安全边界。

### `private.platform_api_keys`

Platform Key 不在 `public` 业务表内。数据库只保存：

- `key_hmac`；
- HMAC key version；
- prefix/suffix 掩码；
- `status: active | revoked`；
- expires/revoked 时间；
- creation operation；
- deployment confirmation 时间和管理员。

**数据库不保存可恢复的完整明文 Platform Key。** 明文只在创建时一次性返回。创建、部署确认和撤销属于高风险 Admin 动作并要求 recent MFA。

## 3. Platform Key 与 Principal

Consumer 服务端调用 Account API 时使用：

```text
X-Platform-Key: <server-only secret>
Authorization: Bearer <user access token>
```

Platform Key 证明“调用服务属于哪个平台”，Global JWT 证明“用户是谁”。二者组合后中央服务构造 Principal。

禁止：

- 浏览器持有 Platform Key；
- body/query 提交一个 `platform_id` 覆盖 Key 映射结果；
- 把 Global JWT 解释成“用户已经在某个平台登录并获授权”；
- Consumer 本地缓存一个长期 Principal 后跳过中央状态检查。

同一个 Global Identity 可以合法拥有多个 Platform Account。这是共享身份模型，不是跨平台凭据越权。

## 4. 平台状态与激活策略

`allow_activation` 只决定“没有账户的已认证用户能否首次创建该平台账户”。它不等同：

- Supabase 项目是否允许 signup；
- 平台是否 active；
- 已存在账户是否 active；
- 用户是否有付费权益。

典型状态判断：

```text
verified global identity
  + valid platform key
  + platform active
  + identity lifecycle active
  -> principal
     ├─ no account -> not_activated
     └─ account -> active / suspended / closed
```

只有 `/v1/account/activate` 创建账户；读取 Principal 不做隐式激活。

## 5. Admin 平台工作区

Admin 以 URL 中的 `platformId` 作为 Platform Workspace 权威上下文：

```text
/admin/platforms/:platformId/**
```

浏览器异步请求还必须绑定当前 scope/generation，避免从旧平台迟到的响应覆盖新平台页面。

Global 与 Platform 是两种“透镜”，不是父子权限系统：

- Global：跨平台平台目录、Identity、Billing、Audit、安全；
- Platform：当前平台账户、商业化、Config、Feedback、接入配置和设置。

平台切换时对象详情 ID 不跨平台携带；无法安全映射的详情路由回到目标平台集合页。

## 6. 接入配置与 readiness

中央 Admin 可以权威确认的“中央准备状态”只有：

1. Platform active 且 `allow_activation=true`；
2. 至少一个完整且 active 的 Origin；
3. 至少一个 active Platform Key；
4. 至少一个 active Key 已记录 `deployment_confirmed_at`。

这四项满足只能表述为“中央准备就绪”。以下事实仍必须由目标平台仓库验证：

- Auth session / callback；
- principal；
- activate；
- protected server route；
- 目标平台 build/E2E；
- 实际业务 capability 接入。

Admin 不提供手工勾选来伪造外部接入完成。

Plan/Offer/Provider Mapping 等商业配置是按需能力，不属于上述四项中央 readiness 的必需条件。免费平台或尚未启用 Commerce 的平台不能仅因为没有付费商品而被判定“接入失败”。

## 7. API 面

Admin 相关主要路由：

- `GET/POST /admin/api/v1/platforms`；
- `GET/PATCH /admin/api/v1/platforms/{platformId}`；
- `GET /admin/api/v1/platforms/{platformId}/overview`；
- Origin list/create；
- Platform Key list/create/confirm-deployment/revoke；
- 平台 commerce/file-policy 等子域接口。

Account 公共读取：

- `GET /v1/plans`；
- `GET /v1/commerce/offers`；
- `GET /v1/account/principal`；
- `POST /v1/account/activate`。

具体 wire schema 只以 canonical OpenAPI 为准。

## 8. 安全与事务不变量

- `platform_id` 必须出现在关键复合 FK 中，数据库而不是代码约定负责阻止跨平台拼接。
- 平台配置与依赖它的写操作遵循一致锁方向，避免禁用/撤销与业务写入发生 TOCTOU。
- Platform Key HMAC Secret 与 Redemption HMAC Secret 完全分开。
- HMAC 轮换采用 current + previous verify-only；无明文时不尝试“重新哈希迁移”。
- Key 撤销后后续授权实时拒绝，不能靠浏览器缓存继续放行。
- Origin、Key、平台状态的 Admin 操作必须审计。

## 9. 代码与验证入口

实现入口：

- canonical schema：`supabase/migrations/*prelaunch_canonical_baseline.sql`；
- Key/Principal：`supabase/functions/account-api/core.ts`；
- Account dispatch：`supabase/functions/account-api/account.ts`；
- Admin routes：`supabase/functions/account-api/admin.ts`；
- Admin platform UI：`apps/admin/features/platforms`、`platform-keys`、`origins`；
- scope/navigation：`apps/admin/components/navigation/admin-navigation.ts`；
- onboarding：`platform-integration/`。

重点测试应覆盖：错误 Key、revoked Key、disabled platform、A Key 访问 B 资源、激活开关、Key 一次性明文、recent-MFA、Origin 校验、平台切换 stale response 和跨平台详情 ID 清除。
