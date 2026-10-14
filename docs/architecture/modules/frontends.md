# 管理端与 Consumer 接入面

## Admin

Admin 使用深色导航与浅色数据工作区，平台目录提供紧凑的名称/标识搜索，概览提供常用管理入口。全局统一用户、计费与审计导航使用中文任务名称。Shell 提供键盘跳到内容入口；窄屏导航在路由切换后收起。账户列表显示当前详情选择，强调查看入口；关闭动作仍需原有确认、理由及服务端近期 MFA。

平台与账户表的横向滚动由有名称、可聚焦的单一容器承担，窄屏显示滚动提示；Admin 样式让该容器内的上游 Table 包装层不再独立滚动。详情字段按内容高度从顶部排列。设计与产品约束见 [Admin 设计规则](../../../apps/admin/DESIGN.md) 和 [产品背景](../../../apps/admin/PRODUCT.md)。

[apps/admin](../../../apps/admin)使用 Next.js App Router。Admin Shell 按 URL 区分 Global 与 Platform 两种 Sidebar 上下文：Global 工作区组织概览、平台、统一身份、Billing、Audit、安全与账户，以及只读 Consumer Lab；进入 `/admin/platforms/:platformId/**` 后，Sidebar 只展示当前平台的概览、账户、商业化、配置资源、用户反馈与平台设置，不再常驻注入平台目录或任何 Global 治理入口。平台设置把 Origin 与 Platform Key 收敛到 `/admin/platforms/:platformId/settings/integration` 接入配置主入口；接入进度只投影现有中央权威事实，目标平台 Auth/BFF 与 E2E 仍明确要求目标仓库独立验证。PlatformSwitcher 是 Global / Platform scope 的常驻主入口：使用同等资源映射在 Global/Platform Accounts 与 Billing 之间切换，其他无法对等映射的平台资源切回 Global 时回到平台目录；其下拉浮层只承载“所有平台（全局透镜）”、平台搜索和具体平台选择。对象详情仍可按业务需要显式深链到全局页面，但不重新形成 Platform Sidebar 的全局导航组。平台工作区不再维护第二套横向一级导航，Topbar 显示当前平台与资源上下文；单平台配置入口以配置资源中心承载 Config、Gallery、审核与 usage，generic legacy file 产品面已退出，Storage policy 只作为 Config Version 的物理边界。`/admin/platforms/:platformId/feedback` 是平台 Feedback 处理中心，服务端筛选、详情附件、时间线、治理、CSV 与删除都经 Admin API 权威边界完成。Ctrl/Cmd+K 继续提供真实路由跳转。

资源页由 apps/admin/features 实现，通过同源 /api/v1/... 代理访问中央 /admin/api/v1/...。AdminShell 先经 BFF 读取服务端权威 `security/status`，状态确认前不渲染普通管理页面；未登录转登录、AAL1 管理员只进入 `/admin/mfa`、AAL2 管理员继续，非管理员和状态服务故障均 fail closed。BFF 只做同源会话转发，不自行判断 membership/AAL。`/admin/accounts` 以 Supabase Auth Identity 为主对象：中央 Account API 使用 server-only Auth Admin 能力读取身份，再由 `private.admin_identity_accounts` 聚合 AisenHub 平台账户关联；浏览器只发一个 Global Identity 请求，平台目录仅用于筛选选项。Billing 的 Global `/admin/billing/orders` 与 Platform `/admin/platforms/:platformId/billing` 复用同一 `BillingOrderWorkspace`，列表、详情、Evidence Timeline、If-Match、operation_id、Unknown Outcome 与 requery/resolve 只有一套实现；筛选与 selected order 写入 URL。敏感操作仍由服务端认证和近期 MFA 检查决定，页面按钮不构成权限边界；`/admin/mfa` 保持为独立认证流程，不作为普通 Sidebar 页面。

## Admin Consumer Lab

平台切换器使用服务端搜索和游标分页，每页 20 个平台；游标保存 UTF-8 搜索条件并绑定查询。切换平台时实体详情回到目标平台对应集合，不携带原实体 ID。平台工作区按 platformId 隔离子树，异步读取同时校验会话与请求范围，迟到响应不能覆盖新平台。

`/admin/consumer-lab` 是维护者只读页面。页面 build-time 直接读取根目录 Account/Admin canonical OpenAPI，展示 contract major、spec version、operationId、method/path 和 security，并明确列出 Harness 命令与 server-only Platform Key 边界。它不接受 Consumer Secret，不代理任意 Account 请求，也不把页面展示当作 conformance PASS。

## Consumer Conformance Harness

[tests/consumer-harness](../../../tests/consumer-harness) 是 test-only 原生 Node HTTP Consumer，不在 pnpm workspace 中，也不作为生产进程部署。它提供极薄 HTML/JS 登录与诊断入口、HttpOnly access/refresh Cookie、可读 CSRF Cookie、精确 Origin 校验、canonical operation allowlist、server-only Platform Key BFF、超时/no-store/request_id、Config/Feedback 二进制代理和 fail-closed feature 授权。

Harness 的 Local E2E 使用两个独立 Harness origin/platform key 和真实本地 Supabase Auth/Account API/DB/Storage fixture，验证平台隔离、激活、Offer/entitlement/redeem、Profile/Preferences ETag、Config/Version/Gallery/Like/Usage、Feedback draft/图片/submit/跨平台拒绝、Suspend 拒绝、Logout 与 invalid-refresh terminal clear。它证明公共协议/安全边界可由独立 Consumer 实现，不提供可复制的产品页面、品牌、支付 UI 或完整 OAuth/找回密码流程。

## 共享 UI 与安装元数据

packages/ui 提供 shadcn、经审查的上游适配组件和业务展示组件，仅供仓库内产品界面使用；Harness 不依赖它。`src/makerkit/` 仅保留为上游来源追踪目录名，不代表当前产品品牌或业务模型。

Registry manifest 记录 Account/Admin contract major、Harness 与 Admin Consumer Lab 路径及本地验证命令，不分发 Account SDK 或页面模板。相关接入方式见[新平台接入手册](../../guides/platform-onboarding.md)。
