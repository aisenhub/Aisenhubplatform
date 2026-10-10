# OPT-003 统一用户与身份删除生命周期治理

状态：In Progress

关联：[总计划](plan.md) · [优化事项总清单](../optimization-intake/README.md)

## 背景与当前问题

当前 Admin 的全局身份治理被拆成两个一级入口：

1. `/admin/accounts` 已经以 Supabase Auth Identity 为主对象，展示邮箱、Auth UID、全局身份状态、跨平台账户关系、创建时间与最近登录。
2. `/admin/operations` 名义上叫“运维中心”，但当前实际业务能力几乎全部属于同一个 Identity 的 Global Delete 生命周期：批准删除请求、查看 deletion job、checkpoint、阻塞/重试、失败原因与任务详情。

这种拆分把同一身份生命周期切成了“身份列表”和“删除任务”两套工作区。管理员从用户列表无法直接回答“这个身份是否已申请删除、删除进行到哪一步、是否需要我批准或重试”，而在运维中心启动任务时还需要手工粘贴 deletion request UUID。

与此同时，Overview、Audit 和平台文件页仍把 deletion job 深链到 `/admin/operations`。因此本项不是简单搬页面，而是统一 Identity 信息架构、补齐只读生命周期聚合边界，并迁移所有入口，同时保留旧 URL 与既有 deletion-job API 的兼容性。

本次重新核对最新 `main@425173ea70efc19e5410a0a4f0e25e7e30204591` 后确认：Global Delete 的数据库状态机、recent-MFA、幂等、lease/fence、worker checkpoint 与失败恢复已经存在且属于权威实现。本项**不重写删除算法**。

该事项新增 security-definer 查询函数、Admin API/OpenAPI，并改动身份/高风险操作 UI，按开发发布流程属于 **R3**。

## 目标与范围

### 目标

1. `/admin/accounts` 成为全局 Identity 生命周期的唯一一级业务入口。
2. 新增 `/admin/accounts/{userId}` 身份详情，将身份摘要、平台账户关系与当前/最近删除生命周期放在同一工作区。
3. pending deletion request 可以从对应 Identity 详情直接批准并启动任务，不再要求管理员复制 request UUID。
4. blocked/retry deletion job 可以从 Identity 详情直接重试，继续复用 existing recent-MFA、确认、幂等和 unknown-outcome 恢复语义。
5. 新增 `/admin/accounts/deletion-jobs` 作为跨用户删除任务/异常任务子视图，用于集中处理 blocked/retry 和查看历史任务；它属于“统一用户”，不是独立“运维中心”。
6. `/admin/operations` 保留兼容入口，服务端重定向到 `/admin/accounts/deletion-jobs`，尽可能保留 `job_id` / `q` 查询参数。
7. Overview、Audit、平台文件页等 deletion-job 深链统一迁移到新子视图。
8. Global Delete 的权威状态机、worker、权限和不可伪造完成语义保持不变。

### 明确排除

- 不改变用户提交 Global Delete 请求的普通 Account API 协议。
- 不改变 `deletion_requests` / `deletion_jobs` 的状态集合、checkpoint 顺序、lease/fence 或 worker provider side effects。
- 不把文件清理、Billing、平台账户治理合并成通用“运维中心”。
- 不实现身份合并、管理员替换、impersonation、密码/MFA 管理等新的高风险身份能力。
- 不在 Identity 列表中把最近几十条任务前端聚合成伪全量统计。
- 不提前实施 OPT-009 的 Platform Account 360。

## 当前事实基线

### 1. `/admin/accounts` 已是 Global Identity 列表

当前 Account API `GET /admin/api/v1/accounts` 由服务端 Supabase Auth Admin API 枚举/精确读取 Auth user，再通过 `private.admin_identity_accounts(...)` 补充：

```text
identity_state
account_count
accounts[]
```

浏览器不直接读取 Auth schema；`admin_executor` 也不获得任意 Auth 用户读取能力。

### 2. 删除请求和任务已经有权威状态

`private.deletion_requests`：

```text
pending_admin → approved
             ↘ cancelled
```

每个仍存在的用户最多一个 active request（pending_admin / approved）。

`private.deletion_jobs`：

```text
pending → running → completed
          ↘ blocked
          ↘ retry → running
```

任务保存 checkpoint、fence、retry_count、next_attempt_at 与 last_error_code；worker 通过 lease/fencing 执行跨服务步骤。

### 3. Admin 删除动作已经受 recent-MFA 保护

`private.admin_deletion_job_start(...)` 会：

- 验证 system_admin、活动 session 与 recent step-up proof；
- 通过 `private.admin_idempotency` 保证重复提交安全；
- 锁定 deletion request；
- 将 request 从 pending_admin 转 approved；
- 设置 `identity_lifecycle = deleting`；
- 创建/返回 deletion job；
- 同事务写 `identity.delete_approved` 审计。

`private.admin_deletion_job_retry(...)` 同样要求 recent proof 和幂等键，只允许 blocked/retry 状态。

这些函数继续作为唯一写入边界。

### 4. Auth 删除完成后不能永久依赖 live user_id

Global Delete 最终调用 Auth Admin 删除用户后，`deletion_requests.user_id` 与 `deletion_jobs.user_id` 可因 `ON DELETE SET NULL` 脱离已删除身份。平台账户也会保留匿名墓碑。

因此：

- Identity 详情只代表**当前仍存在的 Auth Identity**。
- 已删除身份不能靠旧 UID 伪造一个“仍存在的用户详情”。
- 已完成且已脱离 user_id 的历史 deletion job 仍应通过 `/admin/accounts/deletion-jobs` 按 job/request ID 查看。

## 目标信息架构

### 1. 一级导航

Global Scope 一级导航保留“统一用户”，移除独立“运维中心”。

统一用户工作区内部提供：

```text
用户与身份        /admin/accounts
删除任务          /admin/accounts/deletion-jobs
```

“删除任务”是 Identity 生命周期的运维子视图，不重新作为全局一级业务模块。

### 2. Identity 详情

新增：

```text
/admin/accounts/{userId}
```

页面分层：

1. 身份摘要：email、Auth UID、identity state、created_at、last_sign_in_at。
2. 平台账户：当前跨平台关联、状态与平台深链。
3. 身份删除：当前/最近 deletion request + 对应 job。
4. 技术信息：request/job ID、checkpoint、error code 等按需展示，不占一级身份摘要。

删除区根据权威状态提供动作：

- `pending_admin` 且无 job：显示“批准并开始删除”。
- job `blocked` / `retry`：显示“重试删除任务”。
- `pending/running`：只显示进度，不提供重复开始按钮。
- `completed`：显示完成事实；如果 Auth 用户随后已物理删除，则该 Identity 详情自然变为 404，历史任务仍留在 deletion-jobs 子视图。

### 3. 删除任务子视图

`/admin/accounts/deletion-jobs` 复用现有 Operations UI 的成熟交互，但重新定位与整理：

- 一级优先展示 state/checkpoint、Identity（仍存在时）、request/job ID、错误/重试信息。
- 支持 `job_id` 精确打开 Inspector。
- blocked/retry 是明确的异常治理入口。
- 不再保留“手工输入 request UUID 启动删除”作为默认主路径；启动动作放到 Identity 详情。
- 对 Auth 已删除的 completed job，Identity 显示“身份已删除/已脱离”，保留 job/request 技术追踪能力。

## 数据与查询架构

### 1. 新增只读 `private.admin_identity_lifecycle_read`

新增 forward migration，不修改旧迁移。

目标签名：

```text
private.admin_identity_lifecycle_read(
  p_ctx private.admin_context,
  p_user_id uuid
)
```

返回一个安全聚合行：

```text
user_id
identity_state
request_id
request_state
requested_at
approved_at
approved_by
cancelled_at
job_id
job_state
checkpoint
retry_count
next_attempt_at
last_error_code
job_created_at
completed_at
```

不返回：

```text
request_session_id
job fence
lease owner / fencing token
Auth session identifiers
```

这些内部执行字段不是 Identity 详情做正确业务决策所需信息。

### 2. 选择 request/job 的确定性规则

对 live `p_user_id`：

1. 优先选择 active request：`pending_admin` 或 `approved`。
2. 若没有 active request，选择 `requested_at desc, id desc` 的最近 request。
3. job 只通过所选 `request_id` 关联；不独立猜“最近 job”。
4. 如果没有 request，仍返回 identity lifecycle state，request/job 字段为 null。

唯一 active request 索引与 job 的 `request_id unique` 已覆盖该读取模式；没有实际查询计划证据时不额外增加索引。

### 3. 权限

函数：

- `security definer`
- `search_path = pg_catalog, private, public`
- 内部重新检查 system_admin + active session
- owner 为 `domain_owner`
- 显式撤销 `public / anon / authenticated / account_executor / job_executor / recovery_executor`
- 仅 grant `admin_executor`

SQL 测试必须以真正 `admin_executor` 执行读取；pgTAP 断言本身在恢复测试角色后执行，避免重复 OPT-002 暴露过的扩展可见性问题。

## Admin API Contract

### 1. 新增 Identity detail endpoint

新增：

```http
GET /admin/api/v1/accounts/{userId}
```

读取流程：

1. 校验 `userId` UUID。
2. 使用现有 `getAdminAuthUserById()` 通过 Supabase Auth Admin API 精确读取 live Auth Identity。
3. Auth user 不存在 → `404 RESOURCE_NOT_FOUND`。
4. Auth Admin 服务失败 → fail closed `503 AUTHORIZATION_UNAVAILABLE`。
5. 用现有 `admin_identity_accounts(...)` 补平台账户关系。
6. 调用新 `admin_identity_lifecycle_read(...)` 补删除生命周期。
7. 组合成一个安全 DTO。

读取只要求普通 Admin AAL2；不要求 recent-MFA。

### 2. DTO

目标：

```json
{
  "user_id": "uuid",
  "email": "...",
  "created_at": "...",
  "last_sign_in_at": "...",
  "identity_state": "active|deleting",
  "account_count": 2,
  "accounts": [],
  "deletion": {
    "request": null,
    "job": null
  }
}
```

`deletion.request` 与 `deletion.job` 只包含 UI 所需的上述安全字段。

### 3. 写入 API 保持兼容

以下现有端点不改路径、不改高风险语义：

```text
POST /admin/api/v1/deletion-jobs
GET  /admin/api/v1/deletion-jobs
GET  /admin/api/v1/deletion-jobs/{jobId}
POST /admin/api/v1/deletion-jobs/{jobId}/retry
```

Identity UI 只是把已知 `request_id` 传给现有 start API；绝不复制 approval/start SQL 逻辑。

OpenAPI 新增 `GET /accounts/{userId}`，现有 deletion-job 操作保持兼容并继续声明 step-up。

## URL 兼容与深链迁移

### 1. 旧 Operations 路由

`/admin/operations` 不直接删除。改成服务端兼容重定向：

```text
/admin/operations
  → /admin/accounts/deletion-jobs

/admin/operations?job_id=...
  → /admin/accounts/deletion-jobs?job_id=...
```

对于现有 `q` 也保留同名参数。未知参数不需要承诺永久转发。

### 2. 当前消费者

以下深链迁移到新子视图：

- Overview blocked/retry deletion job attention。
- Audit `target_type=deletion_job`。
- 平台文件页中 deletion job 链接。
- 现有 Admin Browser E2E / responsive route inventory。

旧外部书签仍通过 `/admin/operations` 兼容重定向工作。

## 高风险交互不变量

Identity 详情的 approve/start 与 retry 必须复用现有 Operations 的：

- `ConfirmActionDialog`
- `AdminRecentMfaPanel`
- `Idempotency-Key`
- `replay: 'never'`
- `unknown_outcome` 后先重新读取权威 job 状态，再决定是否可重试

不得因为 UI 合并而把 recent-MFA 降级为普通 AAL2，也不得在网络不确定时自动重放 destructive mutation。

## 失败与恢复语义

- Auth Identity detail 读取失败：页面显示可恢复错误，不用 list cache 猜详情。
- lifecycle SQL 暂不可用：整个 Identity detail fail closed，不隐藏删除状态后继续展示危险动作。
- start mutation 202 后刷新 detail，权威 request/job 状态决定最终 UI。
- blocked/retry 仍由管理员显式重试，不由浏览器循环自动重放。
- completed job 不等于 UI 自己推断“Auth 已删除”；Auth identity 是否仍存在由 Auth Admin API 决定。
- 旧 `/admin/operations` 只做导航兼容，不承担第二套状态。

## 安全与隐私

- Auth email 继续只由服务端 Auth Admin API读取，数据库函数不扩大任意 Auth PII 权限。
- Identity lifecycle SQL 不返回 request session、lease、fence 等内部执行信息。
- Global Delete 完成并删除 Auth user 后，不尝试从 audit/profile/tombstone 反向恢复 email。
- deletion job 历史可以保留非个人 job/request ID 与执行状态，符合现有匿名化设计。
- 所有危险动作继续需要 Admin AAL2 + recent MFA；读取只需 AAL2。
- 审计写入仍由现有数据库 mutation function 完成，页面不自行拼审计事件。

## 迁移、兼容与回退

### Forward path

1. 新增 lifecycle read SQL + SQL 权限/行为测试。
2. 新增 Identity detail API/OpenAPI + API tests。
3. Local fresh/upgrade 与 R3 定向验证通过。
4. 实施 Identity detail / deletion-jobs 子视图 / route redirect / deep-link migration。
5. 完整 Browser/R3 回归后交付 Git。

### 回退

- 新 SQL 是只读兼容扩展，可保留并用 forward-fix 修正。
- 新 API 是新增 GET，不破坏旧 `/accounts` / deletion-job consumers。
- UI 如需回退，旧 deletion-job API 与 SQL mutation 均未删除。
- `/admin/operations` 兼容 redirect 可单独恢复为旧 UI，而无需回滚数据库。

## 验收条件

1. Global 一级导航不再出现“运维中心”；统一用户工作区能进入删除任务子视图。
2. Identity 列表可进入 `/admin/accounts/{userId}`，详情同时展示身份、平台账户与权威删除生命周期。
3. pending_admin request 可以从 Identity 详情批准启动，无需手输 request UUID；start 仍要求 recent MFA 和幂等。
4. blocked/retry job 可从 Identity 详情与任务子视图重试，仍要求 recent MFA；unknown outcome 不自动重放。
5. 已完成且 Auth user 已删除的历史 job 仍能在 deletion-jobs 子视图追踪，但不伪造 live Identity 详情。
6. `/admin/operations?job_id=...` 兼容重定向到新 URL，并能打开同一任务。
7. Overview、Audit、平台文件 deletion-job 深链均使用新 URL。
8. 新 lifecycle SQL 只允许 `admin_executor`，固定 search_path；非管理员/撤销 session/其他 executor 均拒绝。
9. API 对缺失 Auth user 404、Auth 服务故障 fail closed 503；DTO 不泄漏 request_session_id/lease/fence。
10. migration fresh/upgrade、DB/API/contracts、Admin unit/typecheck/build、browser、lint/format/docs 与 canonical R3 全部通过。
11. 最终 GitHub/main 与任何适用远端状态核对完成并清理任务分支后，才进入 OPT-004。

## 待确认项

无产品决策阻塞。现有数据模型、删除状态机与用户需求足以实施；具体 UI 布局在保持上述信息层级和安全不变量的前提下由实现选择。
