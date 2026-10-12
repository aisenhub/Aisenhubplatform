# OPT-006 平台接入配置与首次接入向导

状态：Completed

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md) · [新平台接入手册](../../guides/platform-onboarding.md)

## 背景与最新事实基线

实施基线为 `main@018bcaf78797391b9b9080c5cb4be81150d86925`。

当前平台创建成功后只刷新平台目录并关闭对话框；管理员需要自行进入平台工作区，再分别寻找“接入地址”“接入密钥”“基本设置”“套餐”等页面。接入事实已经存在，但信息架构和首次体验把它们拆散了：

- `public.platforms` / Platform Admin API 已提供 `status` 与 `allow_activation`。
- `private.admin_origin_list_v2` 按平台返回完整 Origin/回调集合，不是浏览器有界窗口。
- `private.admin_platform_key_list_v3` 按平台返回完整 Key metadata，并包含 `deployment_confirmed_at`。
- `GET /admin/api/v1/platforms/:id/subscription-config` 提供当前商业配置；Plan 列表也已有现成 Admin 边界。
- Platform Key 创建、部署确认、撤销已经保留 recent-MFA、确认、一次性明文、replay-never 与 unknown-outcome 恢复语义。
- Origin 创建已经由服务端校验 environment、Origin 与三个回调 URL，并通过 Admin-only security-definer 边界写入。

中央 Admin **没有**可以证明“目标平台仓库已经实现 Auth session / principal / activate / protected route”或“目标平台独立 E2E 已通过”的权威事实。根据接入手册，这些能力由目标平台自己的 Auth/BFF/integration 与验收命令负责，因此本项不得用浏览器访问记录、手工勾选或本地 UI 状态伪造完成。

## 目标

1. Platform Sidebar 不再把“接入地址”“接入密钥”作为独立常驻项；在“平台设置”下新增唯一主入口“接入配置”。
2. 新建 `/admin/platforms/:platformId/settings/integration`，同时承担首次接入向导和后续接入维护中心。
3. 平台创建成功后直接进入新页面的首次接入态，而不是只关闭弹窗刷新目录。
4. 首屏显示基于现有权威事实计算的中央准备进度、当前阻塞项和下一步动作。
5. 同一页面长期保留“域名与回调”“服务端密钥”“接入状态/验证”等区域，并复用既有安全交互，不复制第二套 Key/Origin 写逻辑。
6. 目标平台代码联调和独立验收始终明确标为“需要目标平台完成/外部验证”，不计入中央自动完成百分比。
7. 旧 `/settings/origins`、`/settings/keys` URL 保留兼容并导向新接入配置页，不删除底层 API。

## 接入状态模型

### 中央可自动验证的必需步骤

中央准备进度只计算以下四项；任一数据源失败时该项显示“无法确认”，不得按未完成或成功猜测：

1. **平台策略**：`platform.status === 'active' && platform.allow_activation === true`。
2. **域名与回调**：至少存在一条 `status === 'active'` 的 Origin，且三个回调 URL 均有值。
3. **服务端密钥**：至少存在一条 `status === 'active'` 的 Platform Key。
4. **部署确认**：至少存在一条 active Key 且 `deployment_confirmed_at` 非空。

四项全部满足时只能表述为“中央准备就绪”，不能自动表述为“平台已接入/可运营”。

### 按需商业配置

商业配置作为非阻塞步骤展示：

- 若存在 active `paid_plan_id` 且至少一个 Monthly / Yearly / Lifetime 商品启用，可显示“付费商品已配置”。
- 否则显示“按需配置”；免费平台或尚未启用付费能力不能因此被判定接入失败。
- 本项不改变商品/Plan 领域模型，也不提前实施 OPT-010。

### 只能外部验证的步骤

以下步骤固定标记为“需要目标平台完成”，中央页面只给出接入手册和验收说明：

- Auth session / principal / activate / protected route 的目标仓库实现与真实调用。
- 目标平台自己的 build、Auth/BFF、Local Supabase、可选能力和最终 E2E 验收。

在未来存在真实 Consumer integration verification contract 之前，不为这两项提供“手工完成”按钮。

## 页面结构

```text
接入配置
├─ 首次接入提示（仅 ?welcome=1）
├─ 中央准备状态
│  ├─ 4 项权威步骤进度
│  ├─ 下一步动作
│  ├─ 商业配置（按需）
│  └─ 外部验证 2 项（明确不自动判定）
├─ 域名与回调
│  └─ 复用 Origin 列表 / 创建交互
├─ 服务端密钥
│  └─ 复用 Key 列表 / 一次性明文 / 部署确认 / 撤销 / recent-MFA
└─ 接入验收说明
   └─ 链接当前 canonical onboarding guide / Consumer Harness 边界
```

## 组件与复用边界

- `PlatformOriginsPage` 拆为可复用 `PlatformOriginsSection` + 页面 wrapper；embedded 模式读取完整列表，不使用共享 `q` 参数，并通过回调把最新 facts 提供给接入页。
- `PlatformKeysPage` 同样拆为 `PlatformKeysSection` + 页面 wrapper；所有高风险 mutation 逻辑保留在同一个组件实现中。
- 新增纯模型 `platform-integration-model.ts`，只负责把 Platform / Origin / Key / subscription config facts 投影为可展示步骤，便于 unit test 固定“无假进度”规则。
- 新页面可以单独读取 subscription config；不新增 migration、Edge route、OpenAPI 或 BFF allowlist。
- 旧 Origin/Key 路由只做兼容跳转，不保留第二套独立主入口。

## 平台创建后的连续流程

创建接口成功时必须从响应中取得真实 `platform_id`。只有服务端返回有效 Platform DTO 后才导航到：

`/admin/platforms/:platformId/settings/integration?welcome=1`

若响应缺少有效 DTO，不根据表单中的 code/name 猜测平台 ID；显示可恢复错误并留在当前对话框。

## 风险分级

**R3**。

本项不新增数据库或公共合同，但会重组 Origin / Platform Key 的管理入口，并把高风险 Key 创建、部署确认和撤销嵌入新的共享页面。按当前 release workflow，Origin / Platform Key / Auth integration 属于 R3，必须完成 Local Supabase、真实 Admin browser、权限/step-up/unknown-outcome 回归与 canonical gate。

受影响消费者：Admin Sidebar/navigation、平台创建流程、Origin/Key Admin UI、PlatformSwitcher/Platform Workspace、Admin browser harness、当前 onboarding guide。

## 明确排除

- 不新增“目标平台已完成”的数据库布尔值或手工 checklist。
- 不替目标平台生成 Auth/BFF 代码，不修改 Consumer canonical `/v1` contract。
- 不提前实现 OPT-007 配置资源、OPT-008 Feedback、OPT-009 Account 360、OPT-010 商业目录重构。
- 不改变 Platform Key 明文规则、recent-MFA、审计、replay/unknown-outcome 边界。
- 不部署 Production。

## 验收

- 创建平台后能够连续进入首次接入页，且使用服务端返回的真实平台 ID。
- Platform Sidebar 只显示一个“接入配置”入口，不再显示“接入地址/接入密钥”。
- 中央四项进度只由权威事实计算，数据读取失败不伪造完成。
- 外部联调/验收不可手工标 PASS，页面明确说明由目标平台验证。
- 新接入页可以完成现有 Origin 创建、Key 创建/一次性明文/部署确认/撤销流程。
- 旧 Origin/Key URL 有确定兼容行为。
- unit/typecheck/build/browser/lint/format/docs 与 canonical R3 Local 验证全部通过。
