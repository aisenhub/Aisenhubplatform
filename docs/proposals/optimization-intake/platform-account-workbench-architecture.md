# 平台账户工作台预研架构

状态：Preliminary Architecture / OPT-009 预研输入，尚未提升为正式 Proposal，也不代表当前系统已经实现。

关联事项：[OPT-009：单平台账户工作台与账户治理](README.md#优化事项总清单)

当前实现参考：[身份、安全与生命周期](../../architecture/modules/identity-security.md)、[订阅、权益与兑换](../../architecture/modules/entitlements.md)、[核心数据模型](../../reference/data-model.md)、`apps/admin/features/accounts/platform-accounts-page.tsx`。

## 1. 目标与定位

当前单平台账户页更接近“平台账户状态表”：管理员可以按 Account ID / User ID / 状态查找账户，查看激活、暂停、关闭等时间，并执行暂停、恢复、关闭。它能完成最低限度的账户生命周期治理，但不能让管理员快速理解“这个用户在当前平台里是谁、买了什么、能用什么、最近发生了什么、提交过什么内容、为什么被限制、接下来需要处理什么”。

OPT-009 的目标不是继续增加几个账户动作按钮，而是把 `/admin/platforms/:platformId/accounts` 升级为当前平台的 **Platform Account 360 / 用户账户工作台**：以 Platform Account 为中心聚合已经存在或后续新增的 Profile、Entitlement、Subscription、Billing、配置资源、用户反馈、支持标签/备注和治理时间线，同时严格保持 Global Identity 与 Platform Account 的领域边界。

目标体验应满足两个基本问题：

1. 管理员从账户列表中能快速找到并识别某个用户，而不是先理解 UUID。
2. 管理员点开账户后，在一个上下文里完成“理解用户 → 查看商业/内容关系 → 处理问题 → 执行受控治理”，而不是复制 UUID 在多个页面之间人工串联。

## 2. 不可突破的身份边界

### 2.1 Global Identity 与 Platform Account 是两层对象

当前架构已经明确“身份全局共享，业务状态平台本地”。这条原则必须继续保持。

| 领域 | Global Identity / 统一用户 | Platform Account / 当前平台账户 |
| --- | --- | --- |
| 主体 | Supabase Auth 用户 / 全局 `user_id` | `platform_accounts.id` |
| Email / 登录标识 | 权威归属 | 只读摘要，不复制第二套 |
| 密码 / OAuth / MFA | 权威归属 | 不管理 |
| 全局 Session / 退出所有设备 | 权威归属 | 不管理 |
| Global Delete | 权威归属 | 作为关联账户参与清理，不独立重做 |
| 平台访问状态 | 不承担 | `active / suspended / closed` |
| 平台 Profile / Preferences | 不承担 | 权威归属 |
| Plan / Entitlement / Subscription | 不承担 | 权威归属 |
| 平台订单/支付关系 | 不承担 | 权威归属 |
| 配置资源 / 用户反馈 | 不承担 | 权威归属 |
| 平台管理员标签/备注 | 不承担 | 权威归属 |

因此单平台账户工作台可以显示必要的全局身份摘要，例如当前邮箱、Identity 状态或到“统一用户”的链接，但这些信息是只读引用，不应在 Platform Account 页面增加“修改邮箱、改密码、重置 MFA、删除全局身份”等第二套身份操作。

### 2.2 跨平台信息不能无意泄漏

平台账户工作台默认只展示当前平台的业务关系。即使管理员是全局 system admin，也不应该在单平台工作台中把其他平台的账户、订阅、配置或反馈自动展开出来，否则会重新破坏 OPT-005 已确定的 Global / Platform 作用域分离。

如果需要查看该 Identity 的跨平台关联，应提供显式“查看统一用户”深链，由 Global 作用域承担。

## 3. 当前实现与已存在的数据基础

### 3.1 当前账户页

`apps/admin/features/accounts/platform-accounts-page.tsx` 当前：

- 请求当前平台 `/accounts?q=...&limit=100`。
- 搜索提示为“账户 ID、用户 ID 或状态”。
- 一级表格展示账户、状态、创建时间、更新时间。
- 用户主标识仍是 `platform_account_id`，`user_id` 作为第二行技术信息。
- 详情只展示 Platform Account ID、User ID、状态、激活/暂停/关闭/创建/更新时间。
- 可执行操作只有 `suspend / restore / close`。
- 详情仅额外提供“查看订阅投影”深链。

因此当前页面主要是生命周期状态管理，而不是完整的用户管理工作台。

### 3.2 当前数据库已经有可复用信息

`public.platform_accounts` 当前已经保存：

```text
id
platform_id
user_id
status
activated_at
suspended_at
closed_at
anonymized_at
last_login_at
created_at
updated_at
```

其中 `last_login_at` 虽然是一个潜在的平台级登录字段，但预研阶段不能因为字段存在就认定它已经被所有 Consumer 链路可靠更新。正式设计前必须重新核实其写入来源、语义和覆盖率，再决定能否显示为“最近登录”；更不能把 Global Auth 的 `last_sign_in_at` 直接称为“当前平台最近活跃”。

`public.platform_profiles` 已经保存：

```text
display_name
avatar_url
bio
locale
timezone
metadata
```

`public.platform_preferences` 保存平台偏好；订阅域已经可以按 `platform_account_id` 返回有效 Plan、features、订阅状态、开始时间、当前周期结束时间和下一次转换时间；Billing 也已经能够按 Platform Account 关联订单。OPT-007 和 OPT-008 落地后，还会分别提供配置资源和反馈关系。

因此 Account 360 不应重新复制这些数据，而应建立受控的账户聚合读模型。

## 4. 目标信息架构

### 4.1 账户目录

账户目录的目标不是展示所有技术字段，而是让管理员快速识别、筛选和进入正确的账户。

一级信息建议优先为：

```text
用户                 状态     Plan / 订阅      加入平台       最近平台活动      操作
头像 + 显示名         正常     Pro · 有效       2026-05-12     2 小时前          查看
email 摘要
```

具体规则：

- 主标题优先使用 `platform_profiles.display_name`；没有显示名时使用受控 fallback，例如邮箱脱敏摘要或“未设置名称”，而不是直接把 UUID 当用户名。
- 头像来自 Platform Profile；无头像使用统一 fallback。
- Email 来自 Global Identity 权威源，只做只读摘要；若取不到就显示“不可用/未知”，不能从其他 metadata 猜测。
- Account ID / User ID 仍保留，但降级到详情、复制菜单或技术信息。
- Plan / Subscription 显示有效业务语义，而不是只展示 plan UUID。
- “最近活跃”只有在平台级事实语义冻结后才展示；未实现时不放假时间。

### 4.2 结构化筛选与分页

列表应从当前 `q + limit=100` 升级为服务端 cursor pagination 与稳定排序。第一阶段建议支持：

- 关键词：显示名、受控 email、Platform Account ID、User ID。
- 账户状态：active / suspended / closed。
- 有效 Plan。
- 订阅状态 / 是否付费。
- 加入时间范围。
- 最近平台活动时间范围（仅在权威来源建立后）。
- Admin 标签。

OPT-007 / OPT-008 落地后可以扩展：

- 有待审核配置。
- 有未处理反馈。
- 有配置广场资源。
- 有支付/订单异常。

这些条件必须在服务端分页之前执行，不能读取前 100 条后在浏览器二次筛选。

## 5. Platform Account 360 详情页

详情不建议继续只用一列技术字段 Inspector。随着聚合信息增多，应升级成可承载多个业务分区的详情工作台；具体是全页详情、宽 Inspector 还是 Tab Layout 留到正式 UI 设计冻结。

建议逻辑分区如下。

### 5.1 概览

第一屏回答“这个用户当前是什么情况”：

- 头像、显示名。
- Email 只读摘要。
- Platform Account 状态。
- 当前有效 Plan。
- Subscription 状态 / 到期时间。
- 加入平台时间。
- 最近平台登录 / 活动（有权威来源时）。
- 关键待处理标记，例如 suspended、支付异常、待处理反馈等。

### 5.2 平台资料

展示当前 `platform_profiles`：

- display_name。
- avatar_url。
- bio。
- locale。
- timezone。
- 经审核允许展示的业务 metadata。

Admin 是否允许直接修改用户 Profile 不能默认照搬 Consumer 的 PATCH 能力。若正式需求没有明确提出，第一版应以查看为主；需要管理员修正资料时应单独设计权限、reason 和审计，而不是复用用户自助写接口。

### 5.3 订阅与权益

至少展示：

- 当前有效 Plan 名称/代码。
- entitlement / subscription 状态。
- features 摘要。
- started_at。
- current_period_end。
- next_transition_at。
- 是否处于 entitlement paused 状态。

已有 Admin Grant、撤销和 correction 等能力不应在 Account 360 中重新实现第二套领域逻辑。账户页可以提供摘要和上下文深链，真正写入仍调用现有 Subscription / Entitlement 权威入口。

### 5.4 商业与订单摘要

目标展示管理员最常用的商业事实，例如：

- 历史订单数。
- 最近订单状态。
- 最近成功付款时间。
- 当前存在的异常/人工处理订单。
- 在口径明确后才展示累计付费等金额指标。

“累计消费”“LTV”等指标只有在 Billing/Settlement 的权威口径冻结后才能出现，不能把 checkout 金额、订单请求金额或未结算金额直接加总后标成收入。

账户页只负责摘要；“查看全部订单”应跳到 Billing Workspace 并自动带上 `platform_account_id` 服务端筛选。

### 5.5 配置资源

OPT-007 落地后，账户详情可以展示：

- 当前拥有 Config 数量 / entitlement 槽位。
- 已进入配置广场数量。
- 待审核共享申请数量。
- 被管理员移出/阻止的广场条目数量（如需要）。

点击后进入当前平台配置资源管理，并自动按 owner account 过滤；Account 360 不复制配置审核状态机。

### 5.6 用户反馈与支持上下文

OPT-008 落地后，可展示：

- 历史反馈总数。
- new / reviewing 等未结反馈数量。
- 最近反馈时间和摘要。
- 是否允许邮件联系。

Email 仍由 Feedback 自己保存提交时快照；账户页显示的是当前 Identity email 摘要，两者不能在数据库层被误认为同一个永远同步的字段。

### 5.7 管理员标签与内部备注

建议新增 **Admin-only** 支持上下文，不能复用 `platform_profiles.metadata`。

标签示例：

```text
VIP
Beta Tester
高频反馈用户
配置作者
风险账户
```

内部备注示例：

```text
2026-10-10 已邮件联系，等待用户补充复现步骤。
```

原则：

- 用户 Consumer API 不得读取或修改 Admin-only tags/notes。
- Note 至少记录 author admin、created_at；是否允许编辑/删除在正式设计冻结。
- 标签变更和备注写入属于管理数据，应具备审计，但 Audit metadata 不应复制整段敏感备注正文。

## 6. 建议的账户聚合读模型

### 6.1 不让浏览器自己 Join 多个领域

不能让浏览器为了打开一个用户详情连续请求：

```text
account
profile
identity
subscription
billing orders
configs
feedback
tags
notes
```

然后在前端猜测哪个结果才是权威值。这会带来：

- 多个接口部分失败时难以表达状态。
- 列表页产生 N+1 请求。
- 各页面重复业务映射。
- 很难保证同一时间点的状态语义。
- 未来分页/权限边界容易被浏览器绕乱。

预研建议新增一个 Admin Account Read Model / Aggregation Boundary，由服务端按明确成本生成账户摘要和详情。

逻辑上可以有：

```text
GET /admin/api/v1/platforms/{platformId}/accounts
GET /admin/api/v1/platforms/{platformId}/accounts/{accountId}
```

路径是否沿用当前合同由正式 Proposal 决定，但返回 DTO 应从“纯 platform_accounts 行”升级为业务可读摘要。

### 6.2 列表 DTO 与详情 DTO 分离

列表 DTO 只返回高频列，避免每行聚合全部历史数据。

概念列表摘要：

```text
platform_account_id
identity_summary
profile_summary
account_status
effective_plan_summary
subscription_summary
joined_at
platform_activity_summary
support_flags
```

详情 DTO 再返回更丰富的各域摘要和计数。

配置/反馈/订单的详细历史仍通过各自领域接口读取，不把所有数据塞进一个超大 Account JSON。

### 6.3 部分数据不可用时显式降级

例如 Identity email 读取失败但 Platform Account / Profile 正常时，可以显示：

```text
账户信息：正常
身份邮箱：暂不可用
```

不能把上游 Auth Admin 失败解释成 `email = null`，也不能为了页面能画出来把 Subscription、Billing、Feedback 的未知状态当成 0。

## 7. 平台活跃与登录语义

“最近活跃”是成熟账户后台很有价值的字段，但也是最容易伪造的字段之一。

需要区分：

```text
Global Auth last_sign_in_at   = 用户最后一次在共享 Auth 身份系统完成登录
Platform last_login_at        = 当前平台账户的登录事实（前提是写入链路已验证）
Platform last_active_at       = 当前平台真实产品活动事实
```

三者不能互换。

正式设计前应先审计 `platform_accounts.last_login_at` 的写入来源。如果它能够由当前平台 BFF/Account API 在可信边界稳定写入，可展示为“最近登录”；如果没有可靠写入，就应修复事实来源或暂不展示。

若未来需要“最近活跃”，推荐维护一个低频、可限流更新的 platform activity projection，而不是对每个普通 API 请求都同步写一行造成热点更新。具体采样窗口和事件来源需在正式架构阶段定义。

## 8. 账户治理模型

### 8.1 保留现有三个核心动作

当前平台账户状态机的权威状态仍是：

```text
active -> suspended -> active
active/suspended -> closed
```

`closed` 保持终态语义，不应因为 UI 方便增加“重新开启已关闭账户”而破坏当前生命周期合同。

### 8.2 reason 必须真正进入权威领域记录

当前 UI 的 `ConfirmActionDialog` 要求填写 reason，但服务端账户动作路由没有读取请求 body，`private.admin_account_transition` 也没有 reason 参数，最终 Audit metadata 为空。

正式重构必须使治理原因真实落库，而不是只在浏览器收集后丢弃。

预研推荐至少记录：

```text
action
platform_account_id
actor_admin_user_id
reason
occurred_at
previous_status
resulting_status
```

实现可以复用/扩展不可变审计事件，也可以增加账户治理事件 ledger；正式方案需要决定哪个是业务事实、哪个是 Audit 投影。无论采用哪种方式，Account 详情应能形成可读时间线。

### 8.3 可选的定时暂停

成熟治理常见“暂停 24 小时 / 7 天 / 至某日期”。AisenHub 当前只有永久 suspended，预研建议把 `suspended_until` 作为可评估能力，而不是立即确定必须实现。

如果正式引入定时暂停，需要同时定义：

- 到期由读时判断还是任务恢复。
- Entitlement pause 与 Account suspend 的区别。
- 到期恢复事件和 Audit。
- 时钟失败/任务失败时的 fail-closed 语义。

在这些语义冻结前，宁可保持手动恢复，也不要只在 UI 加一个日期输入框。

### 8.4 关闭仍是高风险生命周期动作

关闭 Platform Account 影响平台访问和后续个人数据清理链路，应继续：

- recent MFA / step-up。
- 明确影响提示。
- reason。
- 不自动重放未知结果。
- 权威状态 requery。
- 审计与生命周期时间线。

Global Identity 删除仍走 OPT-003 的统一用户删除流程，不能把“关闭当前平台账户”和“删除全局身份”合成一个危险按钮。

## 9. 不建议首版直接加入的能力

### 9.1 直接修改密码 / MFA / Email

这些属于 Global Identity，不属于单平台账户治理。账户工作台只提供只读身份摘要和进入统一用户的深链。

### 9.2 无痕 Impersonation

“管理员一键登录成用户”虽然对客服排障有价值，但安全成本很高，不应作为 OPT-009 首版默认功能。

未来若确实需要，应单独评审 **Support Session**：

- recent MFA。
- 强制填写原因。
- 极短有效期，例如 10～30 分钟。
- 页面持续显示“管理员支持会话”明显标识。
- actor admin 与 subject user 分离记录。
- 全量受控审计。
- 随时撤销。
- 明确禁止访问哪些高敏资源。

### 9.3 高风险批量治理

批量暂停、批量关闭不能因为列表支持多选就自然出现。若未来需要，应另外设计最大批量、预览、reason、step-up、幂等、部分失败和恢复语义。

## 10. Admin-only 支持数据的逻辑模型

以下只是预研逻辑模型，表名和字段名不在本阶段冻结。

### 10.1 Account Tag

```text
tag_id
platform_id
name
created_at
```

### 10.2 Account Tag Assignment

```text
platform_account_id
tag_id
assigned_by
assigned_at
```

应有同账户同标签唯一约束。

### 10.3 Account Note

```text
note_id
platform_id
platform_account_id
author_admin_user_id
body
created_at
updated_at / deleted_at   # 是否允许编辑/删除待正式设计
```

Note 正文可能含用户支持上下文，应纳入数据保留、Global Delete 影响分析和导出/访问控制评审，不能因为它是“管理员备注”就默认永久保存。

### 10.4 Account Governance Event

如果正式决定建立独立业务 ledger，可逻辑记录：

```text
event_id
platform_id
platform_account_id
actor_admin_user_id
action
reason
previous_status
resulting_status
occurred_at
request_id
```

它与通用 Audit Log 的关系必须明确：业务 ledger 用于重建/解释账户治理事实，Audit 用于跨域审计查询；不能形成两份互相矛盾的“真相”。

## 11. 时间线模型

Account 360 的“时间线”应是跨域摘要，不是把所有数据库事件复制到新表。

可聚合的事件类型包括：

- 账户激活。
- 暂停 / 恢复 / 关闭。
- Plan / Grant 变化。
- 订阅状态变化。
- 关键订单结算或异常。
- 配置广场批准/移出等重要治理事件。
- 用户提交反馈、反馈解决等重要事件。
- Admin 标签/备注（是否进入主时间线可配置）。

时间线 DTO 应保留 source domain、source object id 和 occurred_at，点击后下钻到真正领域详情。Account 页不是新的 Event Store。

## 12. 隐私、权限与审计

账户工作台会比当前页面集中更多个人与商业信息，因此权限边界必须比“能打开页面就全返回”更明确。

预研原则：

- Identity email 只通过已有 server-only Auth Admin 边界获取，不给数据库普通角色新增 Auth schema 直读权限。
- Profile、订单、反馈、配置等都按当前 platform_id + platform_account_id 做服务端归属校验。
- Account tags/notes 只对 Admin 可见。
- 通用审计不要复制完整 Profile、Note、Feedback 正文、Email 等高敏字段。
- 页面只拿完成当前任务所需的摘要；技术 UUID、raw event、request_id 放详情/技术信息。
- 所有高风险治理继续执行当前 AAL2 + recent step-up 约束。

## 13. 与其他优化项的关系

### OPT-003：统一用户与身份删除

OPT-003 管 Global Identity；OPT-009 管单平台 Platform Account。账户详情应能跳到统一用户，但不重复 Global Delete、MFA 或 Session 管理。

### OPT-004：平台概览

OPT-004 的用户总量、新增、注销、暂停账户等指标应从权威平台账户聚合获得；不能用 OPT-009 当前分页列表长度计算。

### OPT-007：配置资源

配置系统落地后，Account 360 消费 owner 维度摘要和深链，不重新实现配置审核/版本/Storage 逻辑。

### OPT-008：用户反馈

反馈系统落地后，Account 360 消费 reporter 维度摘要和深链，不复制 Feedback 状态机；Feedback 提交时保存的 email snapshot 与当前 Identity email 继续保持不同语义。

### Billing / Subscription

账户页聚合摘要，具体 Grant、Correction、Billing Order 操作仍走现有权威领域入口。

## 14. 推荐的实施分层（非正式计划）

后续正式 Proposal 可以考虑按以下依赖拆阶段，但本文不授权实施：

1. 冻结 Identity / Platform Account 展示边界与 Account Summary DTO。
2. 重构账户列表的服务端查询、cursor、结构化筛选和 Profile / Plan 摘要。
3. 建立 Account 360 详情聚合读模型。
4. 修复 suspend / restore / close reason 持久化与治理时间线。
5. 增加 Admin-only tags / notes。
6. 接入 Billing / Subscription 摘要与自动带筛选的深链。
7. OPT-007 / OPT-008 落地后再接配置/反馈摘要。
8. 在真实平台行为事实准备后接入 last login / last active。
9. 最后评估 Support Session、定时暂停、批量治理等第二阶段能力。

## 15. 正式架构阶段必须重新冻结的问题

在把本文提升为正式 `design.md / plan.md` 前，至少重新核实并冻结：

1. `platform_accounts.last_login_at` 当前是否存在真实、完整、平台隔离的写入链路；若没有，是否保留字段还是改建 Activity Projection。
2. 单平台账户列表读取 Identity email 的成本、批量 Auth Admin 读取方式和失败降级语义。
3. Account Summary / Detail 是数据库聚合函数、Account API orchestration 还是混合 Projection，如何避免 N+1。
4. Admin tags / notes 的生命周期、Global Delete、保留期和导出策略。
5. Governance reason 作为业务 ledger 还是 Audit metadata 的权威归属。
6. 是否需要 `suspended_until`，以及自动恢复的故障语义。
7. closed 账户在 Account 360 中保留哪些历史摘要，哪些个人数据必须按 retention 清理/匿名化。
8. Billing 金额摘要可以展示哪些真正已经 settlement-authoritative 的指标。
9. 配置/反馈摘要的聚合接口与 OPT-007/008 正式模型对齐方式。
10. 是否需要 Support Session；如果需要，必须作为独立高风险能力另做安全设计。

## 16. 预研结论

OPT-009 的核心不是“给账户页补几个操作”，而是把 Platform Account 建成单平台管理员理解和治理用户的统一上下文。现有 `platform_accounts / platform_profiles / subscriptions / billing` 已经提供了相当一部分事实基础，OPT-007/008 又会补充内容与反馈关系；真正缺少的是清晰的 Global Identity / Platform Account 分层、业务可读的账户目录、稳定的服务端聚合读模型、管理员支持上下文，以及可解释、可审计的账户治理时间线。

正式设计应优先把这些基础能力做对，再考虑 impersonation、批量封禁等高风险扩展。
