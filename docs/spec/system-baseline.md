# 跨模块系统基线需求

这些要求约束所有业务模块。它们来自当前系统已接受的安全、租户、可靠性和合同边界；具体实现方式由 Architecture 定义。

## REQ-SYS-001 — 服务端权威租户作用域

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/platform-tenancy.md`, `architecture/foundations/database-security.md`

**Statement**

系统必须由服务端可信凭据确定 Platform/Account 作用域，不得接受浏览器通过 body、query 或 path 覆盖已认证租户归属。

**Acceptance**

- 跨平台对象访问不会泄露对象是否存在。
- 数据库写路径再次验证 platform/account 归属。
- Platform Key、JWT、Admin membership 的作用域不能由客户端声明替代。

## REQ-SYS-002 — 浏览器不得持有中央特权 Secret

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/foundations/runtime-deployment.md`, `architecture/modules/consumer-api-integration.md`

**Statement**

浏览器不得获得 Platform Key、数据库特权凭据、Provider API Token、Maintenance Token 或私有 Storage 写凭据。

**Acceptance**

- Consumer/Admin 浏览器通过同源 BFF 或受控 API 调用中央能力。
- Secret 不进入 client bundle、URL、普通日志或公开响应。

## REQ-SYS-003 — 安全与权限失败必须 fail closed

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/identity-security.md`, `architecture/foundations/database-security.md`

**Statement**

认证、授权、MFA、Entitlement 或安全依赖不可用时，受保护操作必须拒绝或返回明确不可用，不得猜测成功、权限或默认放行。

**Acceptance**

- Auth/Admin security status 不可用不能渲染为已授权状态。
- Entitlement 上游失败不能当作 feature=true。
- Provider 查询失败不能被解释成 paid/not_found。

## REQ-SYS-004 — Mutation 必须处理幂等与结果未知

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability
- **Architecture**: `architecture/modules/audit-lifecycle-operations.md`, `architecture/modules/admin-console.md`

**Statement**

可能产生副作用的操作必须具备明确幂等/operation identity；网络中断或 session refresh 后若无法证明 mutation 未执行，系统必须表达 unknown outcome，并通过权威重读恢复，而不是静默重复提交。

**Acceptance**

- 同 operation/key 同请求可安全 replay 或返回既有结果。
- 同 key 不同逻辑请求产生 conflict。
- 不可安全 replay 的 mutation 不因 401/timeout 自动二次执行。

## REQ-SYS-005 — 跨服务长期任务必须可恢复

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability
- **Architecture**: `architecture/modules/audit-lifecycle-operations.md`

**Statement**

涉及 Provider、Storage、Auth 或其他外部网络的长期任务必须使用持久状态、retry/checkpoint/lease/fencing 或等价机制恢复，且网络等待不得持有数据库事务。

**Acceptance**

- stale worker 不能覆盖新 worker 的状态。
- 外部结果未知时保留证据并继续 reconciliation。
- 任务失败后可从持久 checkpoint/retry state 继续。

## REQ-SYS-006 — 高风险操作必须可审计

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/audit-lifecycle-operations.md`

**Statement**

账户治理、权益变更、商业发布、密钥/管理员安全操作和删除等高风险动作必须保留可关联的 actor、target、scope、operation/request identity、时间和必要 reason，不得依赖浏览器文案作为唯一证据。

**Acceptance**

- Audit/domain ledger 能关联操作对象和管理员/系统 actor。
- Audit metadata 不复制 Secret、Token、MFA secret 或不必要的敏感正文。

## REQ-SYS-007 — HTTP 合同 Contract-First

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Compatibility
- **Architecture**: `architecture/modules/consumer-api-integration.md`

**Statement**

Consumer 接入必须以 canonical OpenAPI 与 Platform Integration capability 为公共合同，不要求 Consumer 依赖中央私有 SDK/package 才能正确集成。

**Acceptance**

- Account/Admin OpenAPI 可自动验证。
- Consumer compatibility gate 能检测 producer/consumer/schema 漂移。
- 公共合同不依赖 `@kit/domain` 私有实现。

## REQ-SYS-008 — 数据删除与恢复必须保持证据完整性

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy
- **Architecture**: `architecture/modules/audit-lifecycle-operations.md`, `architecture/modules/config-storage.md`

**Statement**

个人数据删除必须最小化不再需要的数据，同时保持法律/财务/审计/交易引用所需的最小不可变事实；物理 Storage 删除必须与数据库状态、备份屏障和恢复墓碑一致。

**Acceptance**

- 删除 Auth Identity 不破坏必须保留的 Order/Grant/Audit 引用。
- 数据库 metadata 删除不能冒充 Storage object 已删除。
- 恢复旧备份后可重新应用 deletion tombstone/禁用旧凭据。

## REQ-SYS-009 — 未知与失败不得伪装为空或成功

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: UX
- **Architecture**: `architecture/modules/admin-console.md`

**Statement**

当权威数据源失败、超时或仅部分可用时，UI/API 必须把 unknown/error 与真实 zero/empty/success 区分。

**Acceptance**

- 读取失败不显示为“0 条”或空状态。
- 部分聚合失败可标记局部 unavailable，而不是伪造 null/0。
- 历史 Audit 没有 outcome 时显示未记录，而不是猜 success。

## Domain Verification

跨模块基线不由单一测试文件证明。当前证据入口包括 `pnpm contracts:check`、Platform Integration/Consumer Harness compatibility、executor/RLS/security SQL tests、Platform Key/Principal tests（如 `t09_security_helpers.sql`、`t13_platform_key_principal.sql`）、各领域 lifecycle/recovery suites、Admin unit/browser tests 与 Maintenance probes。任何一个领域的局部 PASS 都不能替代其他领域的安全/恢复要求。
