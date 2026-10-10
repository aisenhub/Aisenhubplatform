# OPT-002 全局审计中心与概览去审计化

状态：In Progress

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md)

## 背景与当前问题

OPT-002 同时解决两个相互关联的问题：

1. Global Overview 当前把审计流水作为首页内容和隐式数据依赖：页面请求最近 8 条审计，既展示“最近活动”，又据此推导“最近变更的平台”，并把审计源状态纳入“系统状态”。这让概览同时承担异常/待办入口与事件流水浏览器两种职责。
2. `/admin/audit` 虽然已有稳定分页、错误恢复和只读 Inspector，但一级表格仍以 `platform.updated / billing.order.resolved / platform / UUID` 等工程字段为主，服务端只有一个通用 `q`，无法可靠回答“谁、在哪个平台、对什么对象、做了什么、结果怎样”。

本次重新核对最新 `main` 后确认一个重要事实：`public.audit_logs` **已经持久化权威的 `platform_id` 与 `platform_account_id`**；当前缺失平台维度，是因为 `private.admin_audit_list` 的只读投影没有返回它们，而不是底表没有平台归属。因此正式方案不新增或猜测平台归属列，而是在兼容的新投影中安全暴露现有事实。

远端 `workendstaging` 的实际审计事件也证明当前 `metadata.outcome` 大量为空。缺失 outcome 不能被 UI 猜成“成功”；正式设计把它明确展示为“未记录”，并允许结构化筛选。

该事项同时修改数据库函数、Admin API/OpenAPI Contract、Edge Function 和 Admin UI，按发布流程属于 **R3**。

## 目标与范围

### 目标

1. Global Overview 不再读取或展示审计流水，也不再用审计事件推导“最近变更的平台”或系统健康。
2. `/admin/audit` 成为全局只读审计中心，一级信息按照：

```text
操作者 → 平台 / 范围 → 对象 → 操作 → 结果 → 时间
```

组织，原始事件代码、UUID、request_id 留在 Inspector 的技术详情。
3. 审计查询由服务端在分页前完成可组合结构化过滤，至少支持：关键词、操作者、平台、动作、对象类型、结果。
4. 使用底表已有 `platform_id` 作为平台归属事实；不从 target UUID、文案或前端当前页猜测。
5. 操作者名称只从可信身份关系推导，不把受影响账户误当操作者。
6. 保持审计只读、AAL2、稳定 cursor、Global Delete 匿名化和最小信息披露边界。

### 明确排除

- 不修改各业务过程产生审计事件的写入算法和事件命名；本项只改读取/展示中心。
- 不把任意 `metadata` 原样返回浏览器；仍只暴露经过允许的字段。
- 不实现审计删除、编辑或重放。
- 不把 OPT-003 的 Operations → Unified Users 路由迁移提前做进本项；`deletion_job` 详情链接先保持现有兼容路由，后续 OPT-003 再迁移。
- 不为缺失 outcome 生成虚假的 success。

## 当前事实基线

### 1. Audit 底表已有权威 scope

`public.audit_logs` 已有：

```text
id
request_id
actor_type
actor_user_id
platform_id
platform_account_id
event_type
target_type
target_id
ip
user_agent
metadata
created_at
```

并有 `(platform_id, created_at desc)` 索引。`private.audit_append(...)` 把业务过程提供的平台与账户事实直接写入该表。

### 2. 当前 Admin 投影主动丢弃了 scope

`private.admin_audit_list(ctx, cursor, limit, q)` 当前只返回 actor/action/target/outcome/time 等字段，没有 `platform_id / platform_account_id`，也没有平台名称、操作者 email/display name。结构化筛选不存在。

### 3. `platform_account_id` 不是通用 actor profile 指针

写入语义随事件而不同。例如用户激活自己账户时，`actor_user_id` 与 `platform_account_id` 属于同一用户；但管理员暂停账户时，`actor_user_id` 是管理员，而 `platform_account_id` 是**被操作的目标账户**。因此不能简单 `join platform_profiles on audit.platform_account_id` 并把得到的名字当作操作者。

### 4. 当前远端 outcome 不能支持“默认成功”

在当前远端样本中，`account.activated`、`plan.created/updated`、`platform.created`、`billing.checkout_created`、`redemption.batch_created/confirmed`、`subscription.config_updated` 等现有事件的 `metadata.outcome` 均为空。正式 UI 必须保留“未记录”这一真实状态。

## 目标数据与查询架构

### 1. 保留 v1，新增兼容的 `private.admin_audit_list_v2`

不原地改变已存在的 v1 签名。新增 v2，便于 API 切换同时保留旧消费者与回滚能力。

目标参数：

```text
p_ctx
p_cursor_id
p_limit
p_query
p_platform_id
p_actor_query
p_action
p_target_type
p_outcome
```

其中：

- `p_query`：通用关键词，最长 128。
- `p_platform_id`：权威平台 UUID 精确过滤。
- `p_actor_query`：操作者类型、UUID、Auth email、可信 Profile display name 模糊匹配，最长 128。
- `p_action`：event_type 精确过滤，最长 128。
- `p_target_type`：target_type 精确过滤，最长 128。
- `p_outcome`：结果精确过滤；特殊值 `unrecorded` 表示 `metadata.outcome` 为空，最长 64。

所有过滤必须在 SQL 中、cursor 分页之前组合执行。UI 不允许先取 50 条再做本地结构化筛选。

### 2. v2 返回安全、可读的投影字段

```text
audit_id
request_id
platform_id
platform_name
platform_code
platform_account_id
actor_type
actor_id
actor_display_name
actor_email
event_type
target_type
target_id
outcome
created_at
```

不返回 `ip`、`user_agent` 或整个 `metadata`。

### 3. 操作者身份规则

权威 actor 始终是 `actor_type + actor_user_id`。

- `admin`：可通过 `actor_user_id → auth.users.email` 给 Admin 只读展示当前 email。
- `user`：只有当 `audit.platform_account_id` 指向的账户 `user_id == actor_user_id` 时，才允许从该账户的 `platform_profiles.display_name` 补显示名；否则只依赖 Auth email/UUID。
- `system`：显示“系统”。
- `job`：显示“后台任务”。
- `recovery`：显示“恢复流程”。
- Global Delete 已把 `actor_user_id` 匿名化的历史记录：显示“已匿名主体”，不能尝试从已删除身份恢复 PII。

这一规则防止把管理员操作中的**目标账户 Profile**误显示成管理员本人。

### 4. 平台 / 范围规则

- `platform_id != null`：通过 `public.platforms` 读取当前 `name + code`，一级展示平台名，code 作为次级信息。
- `platform_id == null`：显示“全局”。
- 平台被停用不影响历史事件归属。
- 当前 FK 使用 `on delete restrict`，因此历史平台归属不会因普通平台删除静默丢失。

### 5. 对象与动作可读性

建立 Admin Audit 专用展示模型，不继续把映射放在 Overview model。

动作映射至少覆盖当前源码/远端已观察到的：

```text
account.activated                      激活账户
account.suspended                      暂停账户
account.restored                       恢复账户
account.closed                         关闭账户
platform.created                       创建平台
platform.updated                       更新平台设置
platform.origin_created                新增平台 Origin
platform.key_created                   创建 Platform Key
platform.key_revoked                   撤销 Platform Key
platform.key_deployment_confirmed      确认 Platform Key 部署
plan.created                           创建套餐
plan.updated                           更新套餐
billing.checkout_created               创建支付结账
billing.order.resolved                 结案计费订单
entitlement.granted                    授予权益
entitlement.resume                     恢复权益
redemption.batch_created               创建兑换批次
redemption.batch_confirmed             确认兑换批次交付
subscription.config_updated            更新订阅商品配置
```

未知动作必须回退显示原始 event code，不能因为映射表未更新而丢事件。

对象类型建立对应中文映射，例如平台、平台账户、套餐、计费订单、结账、权益 Grant、兑换批次等。一级列表不突出 UUID；目标 UUID 留在详情技术区。对于平台对象，平台 scope 已提供可读平台名。

## Admin API Contract

`GET /admin/api/v1/audit` 保持同一路径，新增 query parameters：

```text
q
platform_id
actor
action
target_type
outcome
limit
cursor
```

Account API 负责：

1. UUID 和长度校验。
2. 调用 `admin_audit_list_v2`。
3. 将 SQL row 转换成安全 DTO。
4. 保持 `next_cursor` 的稳定 `(created_at, id)` 顺序语义。

读取仍只要求管理员有效 AAL2 session，不增加 recent-MFA；审计中心没有写操作。

OpenAPI 必须同步结构化参数和 400 响应，避免 Admin UI 使用未声明的隐式合同。

## Admin Audit UI

### 1. 页面结构

页头统一使用中文：

```text
全局审计
查看管理员、用户、后台任务和恢复流程在各平台或全局范围内发生的受审计事件。
```

筛选区：

```text
关键词 | 操作者 | 平台 | 操作 | 对象类型 | 结果 | 查询 | 清除
```

筛选值写入 URL；任何过滤条件变化都清除旧 cursor。

### 2. 主列表

业务顺序：

```text
操作者 | 平台 / 范围 | 对象 | 操作 | 结果 | 时间 | 详情
```

- 操作者：可读名称/email/type，不一级显示完整 actor UUID。
- 平台：平台名 + code；无 platform_id 时“全局”。
- 对象：中文 target type；技术 ID 在 Inspector。
- 操作：中文动作，未知 action 回退 raw code。
- 结果：成功/失败/处理中/结果未确认/未记录等；绝不从事件存在本身推断成功。
- 时间：保持 Asia/Shanghai 当前展示约定。

### 3. Inspector

上半部分先给业务摘要：操作者、平台/范围、对象、操作、结果、时间。

“技术详情”保留：

```text
audit id
request id
actor type / actor id
platform id / platform account id
raw event_type
raw target_type / target_id
raw outcome
```

现有对象深链继续保留；后续 OPT-003 再迁移 deletion job 的链接目标。

## Overview 去审计化

Overview 本次一次性移除：

1. `loadAudit()` 和 audit SourceState。
2. “最近活动”整段 UI。
3. 依赖 audit 的“最近变更的平台”。
4. `deriveSystemHealth` 中 audit source 依赖。
5. Overview model 中只为审计展示存在的 action/actor/target mappings 与 `recentChangedPlatforms`。

概览保留“系统状态 / 待处理 / 失败阻塞 / 计费告警 / 需要关注 / 平台概况”等真正的摘要和行动入口。导航和 Admin DESIGN 中“最近活动”文案同步删除。

这样 Overview 不再为了一个已移除的 UI 继续隐式请求 `/audit?limit=8`。

## 索引与性能

现有 `(created_at desc, id desc)` 与 `(platform_id, created_at desc)` 继续保留。新增 v2 需要为常用结构化过滤评估/添加有界索引：

- `(platform_id, created_at desc, id desc)`
- `(event_type, created_at desc, id desc)`
- `(target_type, created_at desc, id desc)`
- `(actor_user_id, created_at desc, id desc)`
- outcome expression + 时间/ID（如果 PostgreSQL 允许且本地 explain/用例证明有价值）

本项不为了通用 `%keyword%` 搜索提前引入 pg_trgm；数据规模未证明需要时不增加额外扩展和写放大。

## 兼容、迁移与回退

### Forward path

1. 新增 v2 SQL function/index；不删除 v1。
2. SQL/权限/合同测试通过后，部署到已授权 `workendstaging`。
3. 更新 Account API/OpenAPI 并部署兼容 Edge Function。
4. 验证旧 `/audit?q=...` 仍能使用，新结构化参数生效。
5. 再实施 Admin UI/Overview 改造。

### 回退

- Admin UI 可回退到上一版，因为 v1 SQL 保留。
- Edge Function 若需回退，上一版仍调用 v1，不受 v2 新函数影响。
- 新索引/函数默认保留作为兼容扩展；不在故障处理中做 destructive rollback。必要修复使用 forward-fix migration。

## 安全与隐私

- 审计中心继续只对 Admin AAL2 可读。
- 不向浏览器返回任意 metadata、IP 或 User-Agent。
- actor email 是管理员内部身份摘要，不进入搜索 URL 之外的日志或额外 audit metadata。
- Global Delete 后 `actor_user_id` 为空时不重新关联匿名身份。
- SQL function 继续 `security definer`、固定 `search_path`，只 grant `admin_executor`。
- 结构化 actor/platform/filter 参数由服务端校验，不拼动态 SQL。

## 验收条件

1. Overview 不再请求 Audit API，不再显示“最近活动/最近变更的平台”，系统健康也不依赖 audit source。
2. Audit API 返回权威平台 scope 与安全的可读 actor identity 摘要。
3. `q + actor + platform_id + action + target_type + outcome` 可组合、服务端分页前过滤。
4. UI 一级列表按“谁 / 范围 / 对象 / 操作 / 结果 / 时间”展示中文业务语义，UUID/raw code 不再占据一级信息主位。
5. 缺失 outcome 明确显示“未记录”，远端已有空 outcome 不被误判 success。
6. v1 SQL function 仍存在；v2 仅 Admin executor 可执行，固定 search_path。
7. API/Deno、SQL权限、OpenAPI/contracts、Admin unit/build、桌面/窄屏浏览器回归通过。
8. Phase 01 的 migration/Edge 变更同步到 `workendstaging` 并验证远端真实状态后，才进入 Phase 02。
9. 最终 GitHub/main/Supabase 状态一致，任务分支清理后才开始 OPT-003。

## 待确认项

无产品决策阻塞。当前底表、身份边界、远端事件分布和用户需求已足以进入实施。
