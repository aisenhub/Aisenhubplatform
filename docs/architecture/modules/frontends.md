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
| /subscription | 从中央 API 读取商品/权益，使用同源 BFF 创建 Checkout、轮询真实状态和兑换激活码 |
| /pricing | 重定向到 /subscription |

ReferenceApiCard 展示接口调用示例，不执行示例代码。账户页可在配置公开 Auth 参数后执行部分验证；文件及资料仍是参考页面。订阅页不伪造支付成功，`granted` 之前不会显示为已开通；BFF 仅代理白名单路径，Provider 回调和真实会话生命周期仍需对应环境配置。

## 共享 UI 与安装元数据

packages/ui 提供 shadcn、Makerkit 和业务展示组件；Admin 与参考页面分别维护样式和页面结构。

registry/templates.json 仍含 /login、/signup 等当前参考应用不存在的路由项。它是本地安装元数据，不能作为当前页面路由清单；安装校验脚本可能因此与参考应用不匹配。相关源码与使用限制见[SDK 与 Registry](../../reference/sdk.md)。
