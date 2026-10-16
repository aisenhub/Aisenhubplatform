# 当前剩余工作 TODO

更新时间：2026-10-16  
当前整改候选已于 2026-10-16 通过 `pnpm verify:task:0801` 完整 Local release gate；本轮实施计划见 [`todo-remediation-2026-10-16/plan.md`](todo-remediation-2026-10-16/plan.md)。执行任何环境/发布事项前仍需重新核对当前 HEAD、Spec、Architecture、OpenAPI、源码和测试。

本文件只保留**当前还没有真实完成证据**的事项。已经实现并通过适用仓库级验证的任务不继续留在 TODO；Hosted / Provider / Production / 法务政策必须以目标环境或责任人的真实输入证明，不能用代码存在代替。

## P2 — 按需外部环境与政策证据

这些事项的仓库实现与执行清单已经准备完成；只有在要声明相应环境能力、开启真实业务或执行真实恢复时才运行。它们不新增为普通代码合并的 Hosted/Provider 测试门槛。

### TODO-OPS-001 — Hosted Maintenance / Billing Cron / Vault / 告警实证

- **Runbook**：[`docs/development/runbooks/hosted-maintenance-evidence.md`](../development/runbooks/hosted-maintenance-evidence.md)。
- **需要外部条件**：明确目标 Hosted 项目、只读/执行权限、Vault/Worker token 配置和告警接收器；Secret 值不得进入聊天/日志。
- **完成条件**：至少一条非空 job 正常链和一条故障→恢复链，scheduler request / HTTP completion / Worker business result / alert delivery 四层可串联；其他 `schedule.json` 入口逐项标实际 scheduler 状态。

### TODO-PROVIDER-001 — Afdian 受控真实渠道验收

- **Runbook**：[`docs/development/runbooks/afdian-provider-acceptance.md`](../development/runbooks/afdian-provider-acceptance.md)。
- **需要外部条件**：明确沙箱/测试账号或正式渠道受控测试、商品/金额/次数/回调范围，以及是否允许真实扣款。
- **完成条件**：Mapping → Checkout → Webhook/query-order → Observation → Settlement → Grant 与 Consumer/Admin 读模型可按 ID 串联，并覆盖 duplicate/conflict/429/timeout/迟到 paid/unlinked manual review/unknown outcome。

### TODO-OPS-002 — DB + Storage 真实备份恢复演练

- **Runbook**：[`docs/development/runbooks/backup-recovery-drill.md`](../development/runbooks/backup-recovery-drill.md)。
- **仓库入口**：`pnpm test:ops:m6-02-local` 只证明 Local 逻辑；真实 RPO/RTO 仍需要实际恢复介质和隔离恢复环境。
- **完成条件**：DB + Storage bytes + manifest + tombstone + session/key/code 恢复后处置均有真实结果，并测得 RPO/RTO。

### TODO-OPS-003 — 生产 personal-data Retention Policy 决策与落地

- **Runbook**：[`docs/development/runbooks/retention-policy-rollout.md`](../development/runbooks/retention-policy-rollout.md)。
- **需要业务输入**：`personal_data_retention_days`、`policy_source`、`policy_reference`、批准人/责任人/复审时间。仓库不会替业务/法务/财务猜天数。
- **当前安全状态**：缺 policy row 时匿名化继续 fail closed。
- **完成条件**：批准政策在目标环境有可审计 row，retention worker 读取该 row；备份保留期不被冒充个人信息保留期。

### TODO-CONSUMER-001 — 具体真实 Consumer 的接入/发布验收

- **触发条件**：有一个明确目标平台要接入或发布时才执行；中央仓库当前不缺 runtime SDK/starter。
- **权威入口**：`platform-integration/`、canonical Account OpenAPI 与 Consumer Harness。
- **完成条件**：该目标 Consumer 自己的 Auth/BFF/session/CSRF/server-only Platform Key、principal/activation、entitlement guard、所需 capability、build/test/E2E/conformance 和发布配置均有证据。

## P3 — Production 发布

### TODO-RELEASE-001 — G0–G5 生产前核对

- **Runbook**：[`docs/development/runbooks/production-release.md`](../development/runbooks/production-release.md)。
- **依赖**：当前候选 Local release gate 已 PASS；本次发布若启用/修改 Provider、Cron/Vault、Retention、恢复等，再依赖对应 P2 证据。
- **完成条件**：候选 SHA、migration/hash、配置差异、旧数据升级/forward-fix、停止开关、回退、观察阈值和本次授权范围全部可复查。

### TODO-RELEASE-002 — 正式生产发布与 G6 观察

- **需要明确授权**：目标环境及具体应用部署、migration、Secret/Key、Provider/价格、Cron/Vault、数据修正、强制 CSP/HSTS、真实付款中哪些动作被允许。
- **完成条件**：部署成功与 G6 观察分别留证；没有真实事件时对应业务观察保持 `NOT_RUN`，不以空日志/空队列冒充完成。

## 明确不列为 TODO 的旧目标

中央 Consumer runtime SDK、生产 starter/template、Admin Consumer Lab、Afdian OAuth 收款、多支付渠道、自动 Provider 退款、真实 recurring subscription/MRR/ARR/churn、Passkey/SMS OTP、完整 Dark Mode、无痕管理员 impersonation 均不属于当前 Active Requirement；未来若需要，必须先新增/修改 Spec。
