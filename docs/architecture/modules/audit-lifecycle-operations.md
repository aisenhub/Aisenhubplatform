# 审计、身份删除与维护任务架构

本模块汇总跨业务领域的操作证据、Global Delete、账户保留策略、Durable Job、lease/fencing、幂等缓存、备份删除屏障和恢复墓碑。它是系统“异步操作不能靠一次 HTTP 请求假装完成”的基础。

## Requirements

本模块主要承担 [审计、删除与维护任务需求](../../spec/audit-lifecycle-operations.md) `REQ-OPS-001` ～ `REQ-OPS-009`，并直接支撑 `REQ-SYS-004` ～ `REQ-SYS-006`、`REQ-SYS-008`。

## 1. Audit Ledger

`public.audit_logs` 是通用审计事实表，关键字段：

- `request_id`；
- `actor_type: user | admin | job | recovery | system`；
- optional actor user；
- optional `platform_id/platform_account_id`；
- `event_type`；
- `target_type/target_id`；
- optional IP/UA；
- 有界 metadata；
- created time。

`platform_id` 是审计底表的权威 scope。不能从 target ID 或当前页面反推平台归属。

审计 metadata 只存允许的调查事实，不复制 Token、Cookie、MFA secret、Platform Key、兑换明文、文件内容或大段自由输入。

## 2. Admin Audit Center

Global `/admin/audit` 是只读调查中心，一级信息结构：

```text
操作者 -> 平台/范围 -> 对象 -> 操作 -> 结果 -> 时间
```

服务端在 cursor pagination **之前**组合 keyword、actor、platform、action、target type、outcome。当前 `admin_audit_list_v2` 的 limit 为 1–100；`q/actor/action/target_type` 最长 128，outcome 最长 64。`outcome=unrecorded` 专门匹配 `metadata.outcome` 为空的历史事件。

操作者身份只能从可信 actor relation 推导；`platform_account_id` 在某些事件中是被操作目标，不能自动当 actor profile。当前 SQL 只有在 `actor_type='user'` 且该 Platform Account 的 `user_id == actor_user_id` 时才读取 Profile display name；actor email 由受控 helper 按 `actor_user_id` 读取。

历史事件可能没有 outcome。UI 必须显示“未记录”，不能因为事件存在就猜测 success。

request ID 用于关联一次 HTTP 请求；异步流程最终结果还需 operation/job ID。两者职责不同。

## 3. 普通用户幂等

`private.idempotency_keys` 按 platform/account/operation/actor scope/key 保存 request hash、pending/completed、response status/body 和最多 7 天有效期。

同 key + 同 hash replay 返回既有结果；同 key + 不同 hash -> conflict。认证失败和限流通常在 claim 之前处理；SQL/基础设施 5xx 不缓存成永久业务结果。

## 4. Admin 幂等

`private.admin_idempotency` 支持 global 或 `platform:*` scope，保存 admin user、operation、key、request hash 和已完成响应，同样最长 7 天。

此外部分高风险领域使用长期 `operation_id` 唯一约束，避免普通 idempotency cache 过期后重复产生永久作用。例如 Billing order、Grant、Redemption Batch、System Admin membership operation。

UI 一次操作开始后应持有同一 operation ID 直到确认结果，不因网络失败生成新 ID。

## 5. Identity Lifecycle Gate

`private.identity_lifecycle` 只有 `active | deleting`。

Global Delete 一开始先切 `deleting`，作为跨模块总门闩。之后不再激活新 Platform Account、不创建新 Grant、不开始新 Config/Feedback 上传，普通 Principal 构造拒绝。删除任务中途失败仍保持门闩，避免业务在清理间隙复活。

## 6. Deletion Request

`private.deletion_requests` 状态：`pending_admin | approved | cancelled`。

普通用户在 recent authentication 后发起 Global Delete request。request 绑定当前 Auth session；Admin 批准属于 recent-MFA 高风险动作。

## 7. Deletion Job

`private.deletion_jobs`：

- scope 当前固定 `global`；
- state：`pending | running | blocked | retry | completed`；
- checkpoint；
- fence；
- retry count / next attempt；
- last error；
- completed time。

典型流程：request approved -> identity lifecycle deleting -> revoke Auth sessions -> 枚举/关闭平台账户 -> 各领域隐私最小化与对象删除 -> retention/blocker -> 清理 proofs/session binding -> 删除 Auth user -> 保留最小墓碑并 complete。

跨服务步骤不能包在一个数据库事务里，因此 checkpoint、retry、fence 是正确性的组成部分，而不是仅用于监控。

## 8. Retention Policy

`private.account_retention_policy` 是显式法务/财务政策，保存 personal data retention days、policy source/reference 和更新时间。

**没有 policy row 时个人数据匿名化任务 fail closed。** 代码不能自行猜“固定 30 天就是法律要求”。

Closed account retention 与数据库/Storage backup retention 是不同概念。

## 9. 通用 Job Lease

`private.job_leases` 保存 job kind + resource ID、lease owner/until、单调 fencing token、retry count / next attempt / error。

原则：claim 在短事务内完成；网络调用在事务外；finish 带 fence；过期 worker 不能覆盖新 worker 状态；fencing 只约束 DB finish，不能假装取消外部网络副作用。

Billing 自己的 processing job 也采用等价 lease/fence 模式。

## 10. Maintenance Capability 分离

Maintenance 不使用用户 JWT，按能力使用独立 server-only Bearer：files、identity、billing。一个 Billing token 不应复用于 identity/files。

当前 `schedule.json` metadata：

| Job | 路由 | Cadence |
| --- | --- | --- |
| file cleanup | `/maintenance/v1/files/run` | every minute |
| feedback attachment cleanup | `/maintenance/v1/feedback-attachments/run` | every minute |
| file reconcile | `/maintenance/v1/files/reconcile` | hourly |
| account retention | `/maintenance/v1/accounts/retention` | daily |
| billing processing | `/maintenance/v1/billing/jobs/run` | every minute, limit 5 |
| idempotency cleanup | `/maintenance/v1/idempotency/cleanup` | daily |

`schedule.json` 是调用元数据，不等于外部 scheduler 已安装或已运行。

### 10.1 调度证据分级

Billing processing 是当前唯一在 canonical migration 中同时安装数据库 Cron 的 Maintenance 批处理入口：

```text
cron.schedule('billing-worker-every-minute', '* * * * *',
              'select private.billing_maintenance_cron();')
```

`billing_maintenance_cron()` 使用 advisory lock 防重叠，从 Vault 读取函数基址与 Billing worker token，经 `pg_net` POST `/maintenance/v1/billing/jobs/run`，固定 `limit=5`、HTTP timeout 5000ms，并将 skipped/queued/queue_failed 等事实写入 `private.billing_cron_invocations`。

这只能证明**安装逻辑与观测模型存在**；具体 Hosted 环境是否配置了 Vault Secret、网关 URL、pg_cron/pg_net 是否成功投递、Worker 是否返回健康结果仍必须由环境证据确认。

相反，`files/run`、`feedback-attachments/run`、`files/reconcile`、`accounts/retention`、`idempotency/cleanup` 当前只在 `schedule.json` 中声明 cadence；仓库内没有同等级的已安装 scheduler 证据，不得写成 Production 已自动运行。

### 10.2 Maintenance capability 边界

Maintenance HTTP 入口按路径映射成三个互斥 capability：

- `files` -> `MAINTENANCE_FILES_TOKEN`；
- `identity` -> `MAINTENANCE_IDENTITY_TOKEN`；
- `billing` -> `MAINTENANCE_BILLING_TOKEN`。

所有入口只接受 POST 和对应 Bearer；JSON body 在入口层限制为 4096 bytes。数据库事务内使用 `set local role job_executor`，外部 Storage/Auth/Provider 网络调用放在事务外。

## 11. File Backup Barrier

`private.file_backup_barriers` 保护 DB snapshot 与 Storage object copy 之间的一致恢复集，记录 scope/recovery set、state、lease/fence、deadline、manifest version、error/finish time。

删除物理对象前检查 active barrier。Barrier 只有在 active object manifest 完整时才能 complete；创建时 deadline 必须晚于当前时间且不得超过 2 小时。超时先标记 failed 再解除阻塞。

数据库备份本身不包含 Storage bytes。

## 12. Deletion Tombstone

`private.file_deletion_tombstones` 只保存恢复需要的脱敏最小事实：operation、platform、account/file/path hashes、original status、request/confirm time、reason code、data/source/manifest version。

禁止保存原始文件名、内容、Secret、Token、Key、兑换码、IP/UA 或自由文本。

恢复旧数据库后要重新应用墓碑，避免已经删除的对象/身份重新出现。

## 13. 备份与恢复边界

恢复集至少协同处理 database + Auth metadata、private Storage objects、config/runtime version、deletion tombstones、Secret/Key re-issuance。

恢复后必须撤销旧 Auth sessions、禁用恢复出的旧 Platform Key、禁用仍未兑换的旧 Code/Batch，并对 unknown write、deleting object、job lease/idempotency 做重新对账。

没有真实外部对象备份介质和恢复演练时，只能声称“代码支持 barrier/模拟”，不能声称已满足 RPO/RTO。

## 14. 后台错误与重试

网络/Provider/Storage 错误必须区分 retryable、blocked/permanent configuration error、unknown external outcome、manual review。

重试不得通过释放容量、重建 operation ID、覆盖 payload 或跳过 fence 来“修好”状态。

Config file 与 Feedback attachment 物理清理的当前 SQL 使用指数退避：首次约 60 秒，按 2 的幂增长并封顶 3600 秒；每次失败/unknown 增加 retry count。Config cleanup 在 retry count >= 10 时写 `file.cleanup_manual_required` 审计事件，而不是假装删除成功。Reconcile 将超过 5 分钟的 in-flight/unknown write、超过 15 分钟的 deleting backlog 以及容量不变量异常作为调查信号。

Global Delete 的 Auth 删除对 HTTP 404 按幂等成功处理；网络 timeout、408、429、5xx 进入 retry，其余 Auth 删除错误进入 blocked。任何一步失败都通过持久 deletion job 状态继续，不在 HTTP handler 中伪造跨服务原子性。

## 15. Retention 与 Global Delete 的最小化边界

普通 Account Close 不是隐私删除信号：业务历史、Admin support context 与跨域摘要仍可保留。只有显式 retention 或 Global Delete privacy path 才执行个人信息最小化。

当前测试确认：

- Retention cutoff 完全由 `account_retention_policy.personal_data_retention_days` 决定；测试可配置 90 天等任意合法策略值，证明代码没有固定 30 天语义；
- Retention 不删除 durable Billing facts；
- Platform Account 保留 closed/anonymized tombstone，同时 `user_id` 解除；
- Profile/Preferences 个人字段被最小化；
- 历史 Audit 的 actor identity 可匿名化，但 `event_type` 等业务事实保留；
- Global Delete 在 `files_blocked` 阶段已经清理 Account tags、内部 note/reason 等支持数据，在 Auth user 真正删除前先收缩普通读取面；
- Account 360 在 deleting/匿名化后不恢复 Config/Feedback 内容，只保留经过裁剪的 Billing 状态摘要。

## 16. 可观察性

长期调查至少关联 HTTP request ID、operation ID、resource/job ID、lease owner/fence、audit event、domain event/observation、稳定 error code。浏览器 UI 的错误文字不是调查事实源。

## 17. 实现与验证

- Audit/Idempotency/Delete schema：canonical migration；
- Identity worker：`supabase/functions/maintenance/identity.ts`；
- Retention：`maintenance/retention.ts`；
- Files/jobs：`maintenance/files.ts`；
- Billing jobs：`maintenance/billing.ts`；
- Admin UI：audit、accounts/deletion-jobs、billing metrics。
- Maintenance 调用证据矩阵：`docs/reference/maintenance-callers.md`（迁移完成前的精确环境证据来源）。

重点验证：job duplicate/timeout、stale fence、checkpoint recovery、Global Delete 并发激活、Auth delete failure、retention missing fail-closed、backup barrier、tombstone recovery、idempotency same/different body、Audit platform/actor/outcome 语义。代表性 SQL 包括 `repair_task_d3_lifecycle.sql`、Account workbench lifecycle tests 与 file/feedback lifecycle suites。

RPO<=24h、RTO<=4h、每日对象备份、季度恢复演练等当前属于运维目标/Runbook，不是仅凭代码可证明的 Hosted 已达成事实。Architecture 必须保持这一区分。
