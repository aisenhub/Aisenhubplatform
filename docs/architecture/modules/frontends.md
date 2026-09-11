# 管理端与平台参考页面

## Admin

[apps/admin](../../../apps/admin)使用 Next.js App Router。平台目录与平台上下文组织账户、套餐、兑换批次、订阅、文件、Origin、Key 和设置；operations 集中审计与删除任务；中央 Billing 页面提供 Provider 订单、结算、积压指标和受控重查入口。登录、MFA、安全页面管理管理员会话。

资源页由 apps/admin/features 实现，通过同源 /api/v1/... 代理访问中央 /admin/api/v1/...。平台文件列表的 platform_id 在 SQL 分页前过滤，游标带平台范围。敏感操作由服务端认证和近期 MFA 检查决定，页面按钮不构成权限边界。

## 平台参考页面

[apps/template-preview](../../../apps/template-preview)提供：

| 路径 | 行为 |
| --- | --- |
| / | 重定向到 /files |
| /files | 本地文件列表、上传和删除参考交互 |
| /account | 本地账户资料与可选 Supabase 验证操作 |
| /login | Consumer 邮箱/密码登录，建立同源 scoped session cookies |
| /subscription | 从中央 API 读取商品/权益，使用同源 BFF 创建 Checkout、轮询真实状态和兑换激活码 |
| /pricing | 重定向到 /subscription |

ReferenceApiCard 展示接口调用示例，不执行示例代码。账户页可在配置公开 Auth 参数后执行部分验证；文件及资料仍是参考页面。订阅页不伪造支付成功，`granted` 之前不会显示为已开通；BFF 仅代理白名单路径，Provider 回调和真实会话生命周期仍需对应环境配置。Consumer 登录、刷新、退出和 OAuth callback 位于 `/api/auth/*`，受保护服务端示例位于 `/api/protected/advanced-config`，由 `@kit/account-server` 的 `authorizeProtectedFeature` 读取中央权益，不信任浏览器 plan 字段。

## 共享 UI 与安装元数据

packages/ui 提供 shadcn、Makerkit 和业务展示组件；Admin 与参考页面分别维护样式和页面结构。

registry/templates.json 只登记当前参考应用真实存在的页面和同源 Auth callback；注册表不虚构 Signup、Forgot Password 等尚未提供的页面。安装校验脚本会对这些路径和 Secret 边界做一致性检查。相关源码与使用限制见[SDK 与 Registry](../../reference/sdk.md)。
