# OPT-003 统一用户与身份删除生命周期治理计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

将 Global Identity 与其删除请求/删除任务统一到 `/admin/accounts` 工作区：新增安全的 Identity lifecycle 只读聚合与详情 API，建立 Identity 详情页和删除任务子视图，移除独立“运维中心”导航，并用兼容重定向与既有 deletion-job API 保持旧深链和高风险操作语义。

起始基线：`main@425173ea70efc19e5410a0a4f0e25e7e30204591`。

风险分级：**R3**，因为涉及 security-definer SQL、Admin Auth/Identity API/OpenAPI、Global Delete recent-MFA 消费者与 Admin Browser 路由。

当前分支：`codex/opt-003-identity-lifecycle`。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | 建立 Identity lifecycle 权威只读投影、Identity detail Admin API/OpenAPI 与 R3 数据/API 证据 | 最新 main 事实基线、design 冻结 | 完成 | [阶段 01](phases/01-identity-lifecycle-contract.md) |
| 02 | 重构统一用户生命周期 UI、删除任务子视图、旧 Operations 兼容重定向与所有深链 | Phase 01 合同与本地 R3 通过 | 实施/验证/任务分支交付完成；main 待完成 | [阶段 02](phases/02-unified-identity-lifecycle-ui.md) |

## 总体验收

- [x] Identity detail API 将 Auth Identity、平台账户关系和删除生命周期按权威来源聚合。
- [x] lifecycle SQL 不泄漏 request session/lease/fence，且只授予 admin executor。
- [x] pending deletion request 可在 Identity 详情直接批准启动，仍复用 existing start API + recent MFA + idempotency。
- [x] blocked/retry job 可在 Identity/任务子视图重试，unknown outcome 不自动重放。
- [x] `/admin/accounts/deletion-jobs` 替代独立 Operations UI；`/admin/operations` 保留兼容重定向。
- [x] Overview/Audit/文件页 deletion-job 深链迁移完成。
- [x] Auth 已删除的身份不伪造详情，历史 detached jobs 仍可追踪。
- [x] migration fresh/upgrade、DB/API/contracts、Admin unit/typecheck/build/browser、lint/format/docs、canonical R3 通过。
- [ ] 最终 GitHub/main、适用远端状态与分支清理闭环完成。

## 风险与阻塞

- Global Delete 是高风险不可逆流程；UI 重构不得弱化 recent-MFA、确认、幂等或重放边界。
- Auth user 最终物理删除后 job.user_id 可置空；历史任务不能依赖 live Identity 才能读取。
- Identity detail 同时依赖 Auth Admin API 与数据库；任一来源不可用时 fail closed，不能用列表缓存伪造安全状态。
- 当前没有 Production 授权；本项不得触发 Production Supabase/Release 操作。

## 验证与交付

实际 migration、测试、失败/复测、commit/push/main 与分支状态统一记录在 [verification-record.md](verification-record.md)。Phase 01 未通过必需 Local R3 数据/API 门槛前，不进入 Phase 02。
