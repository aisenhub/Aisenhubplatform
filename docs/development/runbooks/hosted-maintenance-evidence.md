# Hosted Maintenance / Billing Cron / Vault 验收

适用：需要声明目标 Hosted 环境的 Maintenance、Billing Cron、Vault、pg_net、告警链已经真实运行，或准备开启 Billing background processing 时。架构事实见 [`audit-lifecycle-operations`](../../architecture/modules/audit-lifecycle-operations.md)、[`billing-settlement`](../../architecture/modules/billing-settlement.md) 和 [`maintenance-callers`](../../architecture/reference/maintenance-callers.md)。

## 前置条件

1. 已确认目标 Supabase project ref、函数域名、当前部署 commit/迁移 hash；只读核对，不从本地 `.env` 复制生产 Secret。
2. 明确 `MAINTENANCE_FILES_TOKEN / MAINTENANCE_IDENTITY_TOKEN / MAINTENANCE_BILLING_TOKEN` 的环境归属；Billing Vault 中只核对 Secret **存在/版本**，不把值写入证据。
3. Billing 四个开关的目标值和操作授权明确。首次验收默认保持 Checkout / Auto Settlement 关闭，除非批准清单明确允许开启。
4. 已指定告警接收器与值班责任人；没有接收器时只能验证数据库告警事实，不宣称 delivery PASS。

## 只读预检

- 核对 canonical migration 已包含 `cron.schedule('billing-worker-every-minute', '* * * * *', 'select private.billing_maintenance_cron();')`。
- 核对目标环境 `pg_cron`、`pg_net`、Vault 可用，`billing_maintenance_cron()` / `billing_cron_observability()` 存在且权限符合 migration。
- 核对 Maintenance Function URL 的完整网关路径；`schedule.json` 仅用于对照 cadence，不作为 scheduler 安装证据。
- 读取最近 `private.billing_cron_invocations`、Billing job backlog / oldest age / lease / retry / manual review / alert delivery，先保存基线。

## 执行与故障矩阵

1. **正常批次**：准备一个合成或已批准的非真实资金 job，观察 scheduler request → pg_net HTTP completion → Worker business result 三层事实。空队列 200 不计正常批次 PASS。
2. **鉴权负例**：错误/缺失 Billing token 必须 401/403，不得被 files/identity token 替代。
3. **路径与网关**：错误 base URL / prefix 必须形成可调查失败，修正后下一轮恢复。
4. **重叠调用**：并发触发应由 advisory lock / invocation 状态识别，不产生重复结算。
5. **超时/5xx**：HTTP/Worker 失败保留 retry/alert/invocation 证据；不能只看 cron 已触发。
6. **lease/fence**：过期 worker 不得 finish 新 fence；恢复批次只处理仍合法的 job。
7. **告警 delivery**：制造一个可控告警条件，验证 receiver 成功后才 `delivered`；再验证恢复事件。
8. **Secret 轮换**：仅在单独授权下执行新 token/Vault 版本 → Worker 接受 → cron 切换 → 旧 token 拒绝；轮换前后不打印值。

## PASS 证据

至少保存：目标 project/deployment、cron 名称和 cadence、一次非空正常 invocation、一次故障及恢复、HTTP status、Worker processed/failed/retry 业务计数、job/fence、alert key/fingerprint/delivery、四个 Billing 开关实际值，以及其他 `schedule.json` 条目是否有真实 scheduler。未逐项证明的入口继续 `NOT_RUN`。

## 停止与回退

发现错误 Grant、重复结算、跨环境 URL/token、未知真实资金副作用或告警失联时立即停止新 Checkout/Auto Settlement；保留 Webhook ingress 和既有 job 事实，按权威订单查询恢复，不删除 backlog 或重建 operation ID。配置回退只恢复上一个已验证 URL/token/开关组合，不修改历史 migration。
