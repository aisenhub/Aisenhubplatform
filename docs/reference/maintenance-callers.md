# Maintenance 调用方与环境差异矩阵

本文件是维护入口的静态调用方清单。源码和迁移证明入口、请求校验和批量预算；`schedule.json` 只证明计划元数据，不证明外部调度器已经安装或实际触发。Hosted Vault、网关、executor 角色和真实响应必须按环境单独验收。

## 调度与批处理入口

| 入口 | 源码预算 | 计划调用方/频率 | 当前可证明的实际调用方 | 鉴权与执行角色 | Local证据 | Hosted/Staging证据 |
| --- | --- | --- | --- | --- | --- | --- |
| `/maintenance/v1/billing/jobs/run` | 每批最多 5 个 Billing job；Cron HTTP timeout 5000ms | `private.billing_maintenance_cron()` 每分钟 | BILL-16 + TASK-0702 数据库 Cron；Vault 基址规范化后由 pg_net 投递 | Bearer `billing_maintenance_job_token`；函数内 `job_executor`；lease/fence | `pnpm test:db`、TASK-0702 SQL、`pnpm test:maintenance` PASS | pg_cron/pg_net 真实 HTTP、网关路径、Vault 和恢复 NOT_RUN |
| `/maintenance/v1/files/run` | 每批最多 20 个候选文件；单文件 Storage timeout 5000ms | `schedule.json` 每分钟 | 只有计划元数据；未在当前仓库发现独立安装的 Cron/外部 scheduler | Bearer maintenance token；文件领域过程经 `job_executor` | handler 与原有 SQL/Worker 测试 PASS | 实际调度、Storage 交错失败和恢复 NOT_RUN |
| `/maintenance/v1/files/reconcile` | 每批最多 20 个文件 | `schedule.json` 每小时 | 只有计划元数据；实际调度器未知 | Bearer maintenance token；`job_executor` | handler 可静态核对 | Hosted 调度、告警和积压恢复 NOT_RUN |
| `/maintenance/v1/accounts/retention` | 每批最多 20 个账户 | `schedule.json` 每日 | 只有计划元数据；实际调度器未知 | Bearer maintenance token；`job_executor` + Auth/Storage 服务端凭据 | handler 可静态核对 | Hosted 调度、删除保留和恢复 NOT_RUN |
| `/maintenance/v1/idempotency/cleanup` | 每批最多 100 个过期幂等缓存 | `schedule.json` 每日 | 只有计划元数据；实际调度器未知 | Bearer maintenance token；`job_executor` | handler 与 SQL 权限测试 PASS | Hosted 调度和清理告警 NOT_RUN |

Billing 的 `/discover`、`/process`、`/finish`、`/requeue`、`/claim` 不是独立 scheduler；它们由 `/billing/jobs/run` 在固定 Worker 身份下内部 dispatch，不能在调度矩阵中重复计为独立 Cron。`files/cleanup` 是单文件受控步骤，由文件删除流程调用；不是 `schedule.json` 的批量入口。

## 受控删除步骤

| 入口 | 调用方 | 预算/租约 | 证据状态 |
| --- | --- | --- | --- |
| `/maintenance/v1/deletion-jobs/claim` | Admin deletion job 流程或受控运维 runner | 单 Job；lease 60 秒 | Local handler/SQL 测试 PASS；Hosted executor、Auth、Storage 交错恢复 NOT_RUN |
| `/maintenance/v1/deletion-jobs/step` | 删除流程推进器 | 必须提交 job fence 与 lease fence；Backup barrier 可阻塞 | Local handler/SQL 测试 PASS；Hosted 恢复屏障 NOT_RUN |
| `/maintenance/v1/deletion-jobs/files` | 删除流程文件步骤 | 当前 Job 文件列表；逐文件 Storage 结果 | Local handler/SQL 测试 PASS；对象备份/恢复 NOT_RUN |
| `/maintenance/v1/deletion-jobs/auth` | 删除流程 Auth 步骤 | 只有已确认外部文件结果才推进 | Local handler/SQL 测试 PASS；真实 Auth 删除和恢复 NOT_RUN |

这些入口都要求 maintenance Bearer token，不能由浏览器直接调用；Admin 页面只能通过 Account API 的受控 deletion-jobs 合同发起操作。

## 环境与发布结论

- Local 使用固定 localhost Supabase 和虚构 fixture；本地超级用户能够应用迁移，不等于 Hosted `postgres` 已加入所有 executor 角色。
- Staging/Production 的函数 URL、Vault Secret、网关前缀、JWT/verify_jwt、Worker token、调度频率、告警接收人和恢复窗口均需要逐环境证据。
- 当前不存在仓库内可证明“所有 `schedule.json` 条目已安装”的单一外部调度器配置；因此这些条目统一记为 `NOT_RUN`，不由静态文档升级为 PASS。
- TASK-0702 已增加 `private.billing_cron_invocations`，Billing Cron 能区分 scheduler skip、请求受理、HTTP 完成和 Worker 业务结果；其他入口仍需后续 TASK-0703/0705 的观测和告警闭环。
