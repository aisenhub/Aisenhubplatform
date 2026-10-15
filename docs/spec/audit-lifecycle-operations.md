# 审计、删除与维护任务需求

## REQ-OPS-001 — Audit 必须保存可调查作用域与主体

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/audit-lifecycle-operations.md`

**Statement**

跨域审计必须保留 request/actor/platform/account/event/target/time 等可调查事实；平台作用域必须来自权威字段，不能从当前页面或 target ID 猜测。

## REQ-OPS-002 — Audit outcome 未记录时不得猜测

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Reliability

**Statement**

历史事件缺少 outcome 时必须明确显示未记录；accepted、completed、failed 和 unknown 不能仅凭“有一条事件”推断。

## REQ-OPS-003 — 普通与 Admin mutation 必须具有幂等 identity

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

可重放 mutation 必须用 Idempotency-Key/request hash 或长期 operation identity 区分同一操作与不同请求；同 key 不同请求必须 conflict。

## REQ-OPS-004 — Global Delete 必须是可恢复工作流

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

Global Delete 必须先设置 identity deleting 门闩，再通过 durable job/checkpoint/retry/fence 完成 session revoke、跨平台清理、隐私最小化与 Auth user 删除；中途失败不能恢复普通业务授权。

## REQ-OPS-005 — Retention 缺少明确政策时 fail closed

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Privacy

**Statement**

个人数据 retention/anonymization 必须来自显式 policy；没有 policy row 时任务不得猜测法律期限或自动清除。

## REQ-OPS-006 — Maintenance 能力凭据必须分离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

files、identity、billing 等 Maintenance 能力必须使用独立 server-only credential/权限边界，一个任务 token 不得天然拥有其他任务域能力。

## REQ-OPS-007 — 外部副作用必须使用 lease/fence/reconciliation

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

Storage/Provider/Auth 等外部副作用必须在短事务 claim、事务外执行、带 fence finish；过期 worker 和未知外部结果必须通过持久 reconciliation 收敛。

## REQ-OPS-008 — Backup Barrier 与 Tombstone 必须保护恢复一致性

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

物理对象删除必须尊重 active recovery-set barrier；删除墓碑只保存最小脱敏恢复事实，并可在恢复旧数据库后重新应用，防止已删除对象复活。

## REQ-OPS-009 — 代码存在不等于调度已运行

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P1
- **Type**: Constraint

**Statement**

schedule metadata、migration 或 job handler 存在只能证明实现能力；是否有真实 scheduler/cron、告警接收和恢复介质必须由环境证据单独确认。

**Acceptance**

- `schedule.json` 的 cadence 不得单独计为 Hosted/Production scheduler PASS。
- 若 canonical migration 安装了数据库 Cron（当前 Billing processing），可以记录“安装逻辑存在”，但 Vault/pg_net/HTTP/Worker 健康仍需目标环境证据。
- RPO/RTO、外部对象备份与恢复演练只有实际运行记录才能标记通过。

## Domain Verification

当前 Implemented 基线来自 canonical Audit/Idempotency/Deletion/Retention/Lease/Barrier/Tombstone SQL、Maintenance runtime、`repair_task_d3_lifecycle.sql`、Account lifecycle/workbench 与 file/feedback lifecycle tests。`docs/architecture/reference/maintenance-callers.md` 保存 Local 与 Hosted/NOT_RUN 的精确调用证据；不得把“静态实现存在”升级成“生产已运行”。
