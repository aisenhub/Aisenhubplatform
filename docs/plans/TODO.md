# 当前剩余工作 TODO

更新时间：2026-10-16  
当前整改分支基线：`codex/active-plan-reconcile`；本轮实施计划见 [`todo-remediation-2026-10-16/plan.md`](todo-remediation-2026-10-16/plan.md)。执行任何环境/发布事项前仍需重新核对当前 HEAD、Spec、Architecture、OpenAPI、源码和测试。

本文件只保留**当前还没有真实完成证据**的事项。已经实现并通过适用仓库级验证的任务不继续留在 TODO；Hosted / Provider / Production / 法务政策必须以目标环境或责任人的真实输入证明，不能用代码存在代替。

## P0 — 只差当前候选的 Local 验收

### TODO-ADM-001 — 完成 PlatformSwitcher 真实浏览器键盘验收

- **Requirement**：`REQ-ADM-008`（Partial）。
- **实现状态**：源码已实现稳定 option id、`aria-activedescendant`、ArrowUp/ArrowDown/Home/End、Enter/Space、搜索框进入 listbox、active option 保持与滚动；模型单测已 PASS，真实浏览器场景已加入 `tests/spikes/e2e/admin-ux-local.mjs`。
- **剩余证据**：运行当前候选的 Local Admin E2E，确认仅键盘可以搜索、遍历、选择平台，桌面/窄屏/鼠标行为无回退。
- **当前阻塞**：本次 Runner 无权启动 Windows `com.docker.service`；Docker Desktop Linux engine 因该服务 stopped 而不稳定退出，Local Supabase/Admin E2E 无法启动。服务恢复后执行 `pnpm verify:task:0801` 即自动覆盖该用例。
- **完成条件**：当前候选 Local browser PASS 后，把 `REQ-ADM-008` 升为 Implemented。

### TODO-IAM-001 — 完成 verified TOTP 删除的 Local Supabase/Auth 验收

- **Requirement**：`REQ-IAM-011`（Partial）。
- **实现状态**：verified factor 删除产品入口已经落地。中央数据库通过 `admin_mfa_factor_operations` + prepare/finalize 串行化同一管理员的 Provider `unenroll`，重新校验 membership/session/recent proof/factor ownership/factor floor，prepare 先失效当前 session 旧 proof；Provider 结果未知时保留租约事实阻止盲目重复。成功后刷新 session；受控入口 active admin 删除后至少保留 2 个 verified TOTP，pending 至少保留 1 个。
- **自动验证已准备**：`supabase/tests/sec_admin_04_mfa_factor_lifecycle.sql`、`tests/spikes/sql/admin-mfa-factor-concurrency.mjs`、Account API/Next Auth/Admin UI 单测与 Local browser flow；并发脚本已接入 `verify:task:0801`。
- **剩余证据**：Local Supabase reset 应用新 migration，运行 pgTAP、双 session 并发、真实 Supabase TOTP enroll/delete/session refresh/browser flow。
- **当前阻塞**：同上，当前 Runner 无权启动 `com.docker.service`，因此没有把 mock/unit 结果冒充 Local Supabase PASS。
- **已知边界**：Supabase 原生 endpoint 仍可绕过应用路径；即使本项 PASS，也只声明受控 Admin 入口保护，不声明 Provider 全局原子保证。
- **完成条件**：Local Supabase/Auth/browser 当前候选全部 PASS 后，把 `REQ-IAM-011` 升为 Implemented。

### TODO-ADM-003 — 从 CSP Report-Only 收敛到经验证的强制策略

- **Requirement**：`REQ-ADM-010`（Partial）。
- **已完成**：全局 `X-Frame-Options: DENY`、`nosniff`、Referrer-Policy、Permissions-Policy 和 CSP Report-Only 已进入 `next.config.mjs`，静态单测已覆盖；Feedback binary 继续使用更严格 sandbox CSP。
- **剩余工作**：在可运行的候选浏览器中覆盖登录、MFA、TOTP `data:` QR、Next 静态资源、same-origin BFF、核心工作区，记录并消除所有未解释 CSP violation；证据稳定后再将完整策略从 Report-Only 升为强制 CSP。
- **发布边界**：HSTS 仍必须在正式 HTTPS/域名策略确认后独立启用，不能在本地代码审查中提前声明生产完成。
- **完成条件**：候选浏览器无未解释 violation，强制 CSP 自动 header 断言 + browser PASS；再把 `REQ-ADM-010` 升为 Implemented。

## P1 — 当前 HEAD 完整本地 Release Gate

### TODO-VERIFY-001 — 恢复 Local Supabase 后运行当前候选完整门禁

- **入口**：`pnpm verify:task:0801`。
- **当前已通过的独立层**：Admin unit/typecheck、Account API Deno tests、canonical contracts；最终提交前还会运行所有不依赖 Docker 的 format/lint/typecheck/build/unit/tooling/maintenance/consumer/docs/contracts 检查。
- **完整门禁仍需**：Local Supabase reset + DB pgTAP、Billing/System Admin/MFA 双连接并发、实际 API、本地 Consumer Harness、Admin browser、备份恢复等现有 `task-0801` 流程。
- **阻塞恢复方法**：由有本机服务权限的操作者启动 `com.docker.service` / Docker Desktop Linux engine；不得改脚本连接 Hosted/Production 来绕过 Local gate。
- **完成条件**：当前候选 SHA 的 `verify:task:0801` 全部 PASS；不存在必需 FAIL/NOT_RUN/PARTIAL/BLOCKED。

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
- **依赖**：TODO-VERIFY-001；本次发布若启用/修改 Provider、Cron/Vault、Retention、恢复等，再依赖对应 P2 证据。
- **完成条件**：候选 SHA、migration/hash、配置差异、旧数据升级/forward-fix、停止开关、回退、观察阈值和本次授权范围全部可复查。

### TODO-RELEASE-002 — 正式生产发布与 G6 观察

- **需要明确授权**：目标环境及具体应用部署、migration、Secret/Key、Provider/价格、Cron/Vault、数据修正、强制 CSP/HSTS、真实付款中哪些动作被允许。
- **完成条件**：部署成功与 G6 观察分别留证；没有真实事件时对应业务观察保持 `NOT_RUN`，不以空日志/空队列冒充完成。

## 明确不列为 TODO 的旧目标

中央 Consumer runtime SDK、生产 starter/template、Admin Consumer Lab、Afdian OAuth 收款、多支付渠道、自动 Provider 退款、真实 recurring subscription/MRR/ARR/churn、Passkey/SMS OTP、完整 Dark Mode、无痕管理员 impersonation 均不属于当前 Active Requirement；未来若需要，必须先新增/修改 Spec。
