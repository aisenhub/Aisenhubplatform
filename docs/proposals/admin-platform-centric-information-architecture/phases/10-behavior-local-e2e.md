# Phase 10：行为 / Local E2E 与 R3 验收

状态：Completed

关联：[总计划](../plan.md) · [开发发布流程](../../../guides/development-release-workflow.md) · [验证记录](../verification-record.md)

## 阶段目标

把此前“静态检查全绿但关键行为未覆盖”的缺口转成可重复测试证据。所有必需测试针对最终候选版本，不引用旧 commit 的 PASS。

## 必测矩阵

### Unit / component

- [x] scope route mapper：Global↔Platform Accounts/Billing、平台间 suffix、fallback。
- [x] Identity filters/DTO：email/UID/platform filter、identity→accounts 聚合。
- [x] Accounts：typing 不请求、submit 单请求、refresh 复位、错误/stale 状态、URL 同步。
- [x] Billing Workspace：locked platform scope、global platform filter、cursor append、selected URL 状态。
- [x] Billing action：If-Match、operation_id reuse、Unknown Outcome、412/409 处理、RECENT_MFA_REQUIRED。

### Local Supabase / HTTP

- [x] `pnpm test:db`：migration、`admin_identity_accounts` 权限和数据隔离（59 files / 1092 assertions PASS）。
- [x] 定向 Admin HTTP：真实 Auth Admin identity search + account step-up PASS。
- [x] Billing Provider Mock/SQL：`bill_14_admin_operation_idempotency.sql` 与 settlement concurrency probe 保持 operation replay/version conflict/并发结算行为。
- [x] Admin BFF allowlist 与 canonical OpenAPI 全量一致（Admin 46 operations）。

### Browser/Admin E2E

- [x] Global accounts email/UID 检索→平台账户深链。
- [x] Global billing manual_review 深链→URL filter→浏览器刷新仍一致。
- [x] Global Billing→Platform Billing→Global Billing 同等 scope 切换。
- [x] Platform scope 一跳进入 Audit/Operations。
- [x] 缺 recent proof 的敏感 action 明确要求 MFA，不误报成功。

## 质量命令

最终候选至少执行：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm build`、`pnpm docs:check`、`pnpm contracts:check`、`pnpm test:db`、适用 API/Admin E2E/支付恢复脚本。环境缺失只能记 BLOCKED/NOT_RUN，不得改写为 PASS。

## 退出条件

最终 `pnpm verify:task:0801 --reuse-local` PASS：20 个可执行 gate 全部通过；R3 必需项没有 FAIL/NOT_RUN/PARTIAL/BLOCKED。提交、push、合并 main 与生产部署仍是独立交付动作，不由本阶段测试结果自动执行。
