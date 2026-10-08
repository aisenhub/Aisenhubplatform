# 管理端与平台参考页面

## Admin

Admin 使用深色导航与浅色数据工作区，平台目录提供紧凑的名称/标识搜索，概览提供常用管理入口。全局计费、运维与审计导航使用中文任务名称。Shell 提供键盘跳到内容入口；窄屏导航在路由切换后收起。账户列表显示当前详情选择，强调查看入口；关闭动作仍需原有确认、理由及服务端近期 MFA。

平台与账户表的横向滚动由有名称、可聚焦的单一容器承担，窄屏显示滚动提示；Admin 样式让该容器内的上游 Table 包装层不再独立滚动。详情字段按内容高度从顶部排列。设计与产品约束见 [Admin 设计规则](../../../apps/admin/DESIGN.md) 和 [产品背景](../../../apps/admin/PRODUCT.md)。

[apps/admin](../../../apps/admin)使用 Next.js App Router。Admin Shell 按 URL 区分 Global 与 Platform 两种 Sidebar 上下文：Global 工作区组织概览、平台、Billing、Operations、Audit 和安全与账户；进入 `/admin/platforms/:platformId/**` 后，Sidebar 切换为当前平台的概览、账户、商业化、文件与配置导航，并保留返回平台目录和全局管理入口。平台工作区不再维护第二套横向一级导航，Topbar 显示当前平台与资源上下文；Ctrl/Cmd+K 同时提供全局和当前平台的真实路由跳转。

资源页由 apps/admin/features 实现，通过同源 /api/v1/... 代理访问中央 /admin/api/v1/...。AdminShell 先经 BFF 读取服务端权威 `security/status`，状态确认前不渲染普通管理页面；未登录转登录、AAL1 管理员只进入 `/admin/mfa`、AAL2 管理员继续，非管理员和状态服务故障均 fail closed。BFF 只做同源会话转发，不自行判断 membership/AAL。账户等资源使用紧凑工作区布局；共享 ResourceInspector 使用右侧 Sheet 展示详情，账户选择写入 URL 以保留刷新、返回和深链接语义。平台文件列表的 platform_id 在 SQL 分页前过滤，游标带平台范围。敏感操作仍由服务端认证和近期 MFA 检查决定，页面按钮不构成权限边界；`/admin/mfa` 保持为独立认证流程，不作为普通 Sidebar 页面。

## 平台参考页面

[apps/template-preview](../../../apps/template-preview)提供：

| 路径 | 行为 |
| --- | --- |
| / | 重定向到 /files |
| /files | 通过中央 Account API 读取、上传、下载和删除配置文件 |
| /account | 通过中央 Account API 管理资料、偏好和敏感账户动作；邮箱/手机/密码验证仍使用 Supabase Auth |
| /login | Consumer 邮箱/密码登录，建立同源 scoped session cookies |
| /subscription | 从中央 API 读取商品/权益，使用同源 BFF 创建服务端绑定 Checkout、轮询真实状态和兑换激活码；同时作为 staging 与后续 Consumer 模板的付款测试入口 |
| /pricing | 重定向到 /subscription |

ReferenceApiCard 展示接口调用示例，不执行示例代码。账户、文件和订阅页均通过同源 BFF 读取中央结果；账户页的邮箱/手机/密码验证仍依赖公开 Supabase Auth 配置。订阅页不伪造支付成功，`granted` 之前不会显示为已开通；购买必须从方案卡创建 Checkout，不能使用没有 `custom_order_id` 的裸 Provider 商品链接。价格、期限、Provider 计划和订单绑定由服务端快照决定，BFF 仅代理白名单路径，Provider 回调和真实会话生命周期仍需对应环境配置。Consumer 登录、刷新、退出、OAuth callback 和近期认证位于 `/api/auth/*`；Auth/session 实现位于 `app/_lib/auth`，HTTP DTO guard 与 fail-closed 授权位于 `app/_lib/integration`。受保护服务端示例 `/api/protected/advanced-config` 只信任中央权益结果，不信任浏览器 plan 字段。

## 共享 UI 与安装元数据

packages/ui 提供 shadcn、经审查的上游适配组件和业务展示组件；Admin 与参考页面分别维护样式和页面结构。`src/makerkit/` 仅保留为上游来源追踪目录名，不代表当前产品品牌或业务模型。

registry/templates.json 只登记当前参考应用真实存在的页面和同源 Auth callback；Registry manifest 记录当前 Account/Admin contract major 与 Reference Consumer 路径，不分发 Account SDK。校验脚本会检查这些路径、Secret 边界和 canonical contract。相关接入方式见[新平台接入手册](../../guides/platform-onboarding.md)。
