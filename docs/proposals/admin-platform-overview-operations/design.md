# OPT-004 单平台运营概览

状态：Completed

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md)

## 背景与事实基线

当前 `/admin/platforms/:platformId` 只从 `PlatformContext` 展示运行状态、激活能力、Platform Code、Platform ID 与四个快捷入口。它没有读取平台账户、订阅或订单事实，因此不能回答“当前平台有多少用户、最近增长如何、商业侧有没有异常”。

现有 `/admin/platforms/:platformId/accounts?limit=100` 是有界资源列表，不能拿浏览器当前窗口长度冒充全量 KPI。全局 `billing/metrics` 则是系统运行健康指标，不是平台业务指标。

重新核对 `main@80a260bc43738b168d6521ccdbe51cb99eef929f` 后确认仓库已有以下权威事实：

- `public.platform_accounts`：平台账户状态、`created_at`、`closed_at`、`last_login_at`。
- `public.subscriptions` + `public.plans`：当前平台账户订阅投影与 Plan kind，可区分有效 paid Plan。
- `public.billing_orders`：平台归属、订单创建时间、Provider 支付时间、verification / entitlement / linkage / resolution 状态。
- Feedback 域尚未实现；Config Gallery / Pending Review 域也尚未实现，不能显示假 `0`。

本项因此属于 **R3**：需要新增 security-definer 聚合查询、Admin API/OpenAPI、BFF allowlist 与平台 Overview 数据消费者。

## 目标

1. 平台 Overview 的首屏主体改成业务摘要，而不是大面积技术标识卡。
2. KPI 全部来自服务端全量聚合，不使用有界列表长度推断。
3. 支持 7 / 30 / 90 天区间，并提供与紧邻上一周期的可比值。
4. 用户指标至少包含：总账户、活跃、暂停、本期新增、本期关闭、净变化。
5. 商业指标至少包含：当前有效付费账户、本期订单、本期已授予订单、本期需关注订单。
6. 平台状态 / Code / ID 降级为紧凑元数据区，保留复制和设置入口。
7. Feedback 与 Config Gallery 待办在对应领域未落地前明确显示“尚未接入”，不显示 `0`。
8. KPI / 待办卡可以下钻到已有的账户、订阅或全局订单视图，并带平台筛选。

## 指标口径

### 用户

`period_start = now() - days`，`previous_start = period_start - days`。

- `total_accounts`：该平台全部 `platform_accounts`，包含 closed 墓碑。
- `active_accounts`：`status = 'active'`。
- `suspended_accounts`：`status = 'suspended'`。
- `new_accounts`：`created_at ∈ [period_start, now)`。
- `closed_accounts`：`closed_at ∈ [period_start, now)`。
- `net_accounts`：`new_accounts - closed_accounts`。
- previous 同口径使用 `[previous_start, period_start)`。

### 商业

- `active_paid_accounts`：`subscriptions.status = 'active'`，关联 `plans.kind = 'paid'`，且 `started_at <= now()`，`current_period_end IS NULL OR current_period_end > now()`；按 `platform_account_id` 去重。
- `orders`：`billing_orders.created_at` 落在区间且 `platform_id` 匹配。
- `granted_orders`：上述订单中 `entitlement_status = 'granted'`。
- `attention_orders`：上述订单中存在需人工关注的权威状态：`linkage_status = 'ambiguous'`，或 `entitlement_status = 'blocked'`，或已支付但尚未 verified 且 `resolution_status = 'open'`。

本项**不展示收入/GMV**。当前退款/结算与最终经营收入口径尚未在 OPT-010 冻结；`show_amount`、Provider paid 与 settlement 不能直接等价为收入。

## API 与权限

新增只读函数：

```text
private.admin_platform_overview(
  private.admin_context,
  platform_id uuid,
  days integer
)
```

新增 Admin endpoint：

```text
GET /admin/api/v1/platforms/{platformId}/overview?days=30
```

- `days` 只允许 `7 | 30 | 90`。
- 只有活动 system admin session 的 `admin_executor` 可执行；其他 executor 无执行权限。
- 平台不存在返回 404；非法 days 返回 400。
- 函数固定 `search_path = pg_catalog, private, public`。
- 函数只返回聚合数字与区间边界，不返回用户 PII、订单 Provider 私密字段或任意 Auth 数据。

## UI

页面结构：

```text
页头：平台名 / 状态 / 7|30|90 天 / 刷新
KPI：总账户 | 活跃账户 | 当前有效付费账户 | 本期订单
增长：新增 | 关闭 | 净变化（均带上一周期比较）
待处理：暂停账户 | 商业异常订单 | 配置审核（未接入） | 用户反馈（未接入）
元数据：状态 / 激活策略 / Code / Platform ID
快捷入口：账户 / 套餐 / 订阅 / 设置
```

读取失败时 KPI 显示未知并提供重试；不得保留旧数字却无提示地冒充实时值。

## 明确排除

- 不实现 Feedback 数据域（OPT-008）。
- 不实现 Config Gallery / Pending Review 数据域（OPT-007）。
- 不重构 Platform Account 360（OPT-009）。
- 不改 Product/Plan/Offer/商业经营口径（OPT-010）。
- 不把 Supabase Auth `last_sign_in_at` 当单平台活跃指标。
- 不新增收入、MRR、ARR、churn 等当前无法证明的经营指标。

## 验收

1. 浏览器不再从账户资源列表计算任何 Overview 全量 KPI。
2. 7/30/90 天切换改变服务端聚合请求，并显示上一周期比较。
3. DB 真实 fixture 证明账户与订单的当前/上一周期边界正确。
4. `admin_executor` 可读，其他 executor 拒绝；invalid days / missing platform fail closed。
5. Overview 的反馈/配置审核卡明确标注尚未接入，不显示假数字。
6. Admin unit/typecheck/build/browser、fresh/upgrade DB、API/contracts、canonical R3 全 PASS。
