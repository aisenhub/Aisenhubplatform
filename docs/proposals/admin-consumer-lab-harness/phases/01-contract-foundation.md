# Phase 01：Contract Foundation Hardening

状态：验收通过待推送

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

在替换 Reference Consumer 前，修复已知 canonical contract 漂移，并让 breaking checker 能通过自动负向测试证明其核心兼容规则。

## 进入条件

- 工作区除本 Proposal 文档外无其他任务修改。
- 已确认服务端/Domain/DB 测试会返回 `SubscriptionProduct.reason = purchases_paused`。
- 不修改 Account API runtime 或数据库迁移。

## 已核实文件

- `contracts/account/v1/openapi.json`
- `packages/domain/src/contracts/api.ts`
- `supabase/migrations/20260914223608_repair_task_d3_lifecycle.sql`
- `supabase/tests/bill_08_purchase_readiness.sql`
- `tooling/scripts/src/contract-breaking-check.mjs`
- `tooling/scripts/src/contract-consumer-check.mjs`
- `docs/proposals/remove-sdk-contract-first/**`

## 实施步骤

1. 在 Account OpenAPI `SubscriptionProduct.reason` enum 增加 `purchases_paused`；同步 changelog/spec revision，保持同一 `/v1` compatible correction。
2. 把 breaking comparison 提取为可 import 的纯函数模块或让现有脚本可安全 import；CLI 仍保持当前 `contracts:breaking` 行为。
3. 增加 checker 单元测试，至少覆盖：新增 required request body field、删除 parameter、删除 response property/enum、改变 security 都 FAIL；新增 endpoint/optional response field PASS。
4. 强化 `contracts:check` 的关键枚举一致性，让 `SubscriptionProduct.reason` 与 central Domain source 不再静默漂移；不能重新把 Domain 变成 Consumer runtime contract。
5. 把前序 `remove-sdk-contract-first` 的 design/plan/Phase 03–05/verification summary 状态与实际已 push/R3 PASS 记录对齐为 Completed/已交付；历史失败行保留。

## 禁止事项

- 不因为 checker 难写而删除 enum/required 约束。
- 不把 `packages/domain` 重新定义成 Consumer runtime contract。
- 不改写前序 verification 中真实发生过的 push FAIL、T16 FAIL 或 Docker BLOCKED。

## 验证

```text
node --test tooling/scripts/src/contract-breaking-check.test.mjs
pnpm contracts:check
pnpm contracts:breaking
pnpm docs:check
git diff --check
```

负向 fixture 由自动 test 构造，不通过手改真实 contract 后恢复来冒充单测。

## 退出条件

- canonical OpenAPI 与 `purchases_paused` 服务端行为一致。
- breaking checker 有自动负向测试且本阶段用例 PASS。
- 前序 Proposal 当前状态源一致。
- Phase 02/03 可以基于可信 contract 开始。
