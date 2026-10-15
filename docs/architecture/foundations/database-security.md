# 数据库、权限与事务基础架构

PostgreSQL private domain functions 是 Aisenhubplatform 最终业务不变量的执行边界。HTTP 层负责认证、解析和协议适配，但不能复制一套绕过数据库领域函数的授权、权益、配额或状态机。

## Requirements

本基础设施主要支撑 [系统基线需求](../../spec/system-baseline.md) `REQ-SYS-001`、`REQ-SYS-003` ～ `REQ-SYS-006`、`REQ-SYS-008`，以及各业务 spec 中要求服务端/数据库权威执行的租户、状态机和并发不变量。

## 1. 当前 Schema 基线

当前 schema 来源：

1. `20261013210107_prelaunch_canonical_baseline.sql`；
2. `20261014054854_system_admin_resilience.sql` forward migration。

当前规模：42 个 `public` 业务表；canonical baseline 19 个 `private` 控制/恢复表；forward migration 新增 `private.system_admin_operations`，因此当前合计 20 个 private 控制/恢复表。

`public` 仅表示业务 schema，不意味着浏览器可以直接读写。

## 2. Runtime Roles

### `domain_owner`

NOLOGIN，拥有领域 security-definer function，只访问必要底表，不作为全局 BYPASSRLS runtime。

### `account_executor`

Account API SQL login/executor；private schema USAGE + 普通 Account function EXECUTE；无基础业务表任意 DML。

### `admin_executor`

独立 Admin SQL login，只执行 Admin wrapper/read model，不继承 Account 任意能力。

### `job_executor`

Maintenance job claim/reconcile/compensation；不具有普通 Admin 页面能力。

### `recovery_executor`

离线/限时 break-glass；Production 常态 runtime 不持有。

### `billing_ingress`

Provider webhook 的窄 ingress 能力，不等价 account/admin/job executor。

## 3. Request Context Types

数据库使用明确 context value：

- `private.account_context(user_id, session_id, platform_id, platform_key_id, request_id)`；
- `private.admin_context(admin_user_id, session_id, request_id)`；
- `private.job_context(job_id, lease_owner, fencing_token, request_id)`。

数据库不解析 HTTP JWT 签名；HTTP adapter 完成 Auth 验证后构造受控 context，private function 再检查数据库可验证的 session/membership/platform/account 状态。Context 不是浏览器 DTO。

## 4. RLS 与 Data API

- public 核心表启用并 FORCE RLS；
- anon/authenticated 不获得浏览器任意 CRUD；
- private schema 不加入 Supabase Data API exposed schemas；
- view 使用 security_invoker 或保持不暴露；
- 函数显式 revoke PUBLIC/anon/authenticated EXECUTE；
- 每个新增 function 都要显式收窄授权。

仅设置 schema default privilege 不能自动撤销 PostgreSQL function 默认 PUBLIC EXECUTE，因此测试要做全函数 privilege 回归。

## 5. Security-definer 规则

private domain function 固定 `search_path`、全限定关键表/类型、参数化动态值，并在函数内部重新检查 context/scope。mutation 与 audit/idempotency 在需要原子性时同事务。

HTTP handler 不直接 `UPDATE subscriptions`、`UPDATE file status`、`INSERT grant` 等绕过领域入口。

## 6. 租户完整性

跨平台隔离不仅靠 WHERE：关键表保存 `platform_id`；使用 `(platform_id,id)` 或 `(platform_id,account_id,id)` composite unique/FK；child relation 强制同平台/同账户；跨租户对象通常统一 404，避免存在性泄露。

例如 Grant/Redemption success 使用复合 FK 确保 code、account、grant 属于同一平台账户链。

## 7. 身份完整性

Global Identity 属于 Supabase Auth；数据库业务表引用 Auth UUID，但普通 executor 不能任意修改 `auth.users/auth.sessions`。

会话存在性通过窄只读 helper 验证；Admin Auth 管理操作通过服务端 Supabase Admin API，而不是给 `admin_executor` Auth schema DML。

## 8. 并发和锁原则

- 锁定对象有稳定顺序；
- platform lifecycle 与子资源 mutation 避免逆序锁；
- entitlement 以 platform account 为核心串行点；
- Offer/Price/Mapping 发布在业务 scope 上串行化；
- job claim/finish 用 fence；
- row_version/If-Match 用于 Admin/用户可编辑 read-modify-write 资源。

数据库临界事务保持短小，禁止在锁内等待 Provider、Storage、Auth 或其他外部 HTTP。

## 9. Operation Time

需要一致时间语义的领域操作在获得关键锁后取一次 `clock_timestamp()` 作为 operation time，并在该操作所有事件/状态写入中复用，避免事务开始时间解释长时间等锁后的 entitlement 边界。所有业务时间语义统一 UTC 存储。

## 10. Idempotency

普通用户和 Admin 有独立 idempotency store，核心模式：claim(scope,key,request_hash) -> new/replay/conflict/in-progress -> business mutation -> finalize(response)。

request hash 只包含规范化业务输入，不包含 JWT、Secret、随机服务器时间。

确定性业务拒绝是否缓存由领域合同决定；5xx/未知基础设施故障不得永久写成“业务失败”。

## 11. Ledger 与 Projection

多个核心模块采用 immutable/append-only source facts + derived current projection。例如 Entitlement：Grant/Event 是事实，`subscriptions` 是 projection。

Projection 可以重建，但不能通过删除 Ledger 来“重建”。测试重放应在隔离副本/shadow projection 完成。

## 12. External Outcome

数据库无法通过一次网络 timeout 证明外部服务没有执行，因此 Storage/Billing 等模块显式支持 unknown/observation/job 状态。

正确模式：DB prepare/claim -> commit -> external call -> DB finalize/unknown -> durable reconcile。

## 13. Audit 原子性

对于必须审计的成功 mutation，业务状态、domain event、audit、idempotency finalize 应尽可能同事务提交。不能捕获 SQL 异常后继续 commit 一半业务再写“失败日志”。

## 14. Schema 变更策略

项目已经完成一次 prelaunch canonical squash。此后正常变更重新遵循 forward migration：不修改已应用 migration 伪造历史；expand -> compatible code -> verify -> contract；正式数据存在后优先 forward-fix；破坏合同走 major/明确迁移。

## 15. 测试要求

数据库安全测试不能只以 postgres/superuser 跑正向逻辑。必须实际切换 account_executor、admin_executor、job_executor、anon/authenticated negative access，必要时 recovery/billing ingress。

重点验证：PUBLIC EXECUTE 泄露、RLS bypass、复合 FK、cross-platform ownership、锁并发、idempotency race、fencing、read model stable pagination。
