# Admin Consumer Lab 与 Consumer Conformance Harness 总计划

状态：In Progress

关联：[优化设计](design.md) · [执行交接](agent-handoff.md) · [验证记录](verification-record.md)

风险级别：R3

起始基线：`54acd1bba16500849bb0dabe14727315460ec22f`，分支 `codex/admin-consumer-lab-harness` 从已交付但尚未合入 `main` 的 `codex/remove-sdk-contract-first` 创建，因此本 Proposal 是 stacked follow-up；前序分支未进 main 时不得声称可单独应用到旧 main。

## 总体范围

本计划删除完整 `apps/template-preview` Reference Consumer，以 Admin Consumer Lab 承担维护者 UI，以 test-only Consumer Conformance Harness 承担外部 Consumer 独立边界证明。同时修复 Contract-First 复审中已经发现的 canonical OpenAPI 漂移和 breaking gate 盲区。

受影响消费者/入口：Account `/v1` canonical OpenAPI 与 breaking/consumer contract checks、`apps/admin` Global 导航、`tests/consumer-harness`、T16/Browser E2E、TASK-0801、Registry、root package/lockfile 及 active architecture/reference/guides。

不修改数据库 schema/迁移、Account API 业务路由、Admin API wire contract、Billing/Provider、Production 配置或真实数据。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | 修复 canonical contract 漂移并强化 breaking gate；收尾前序 Proposal 状态 | 无 | 验收通过待推送 | [01 Contract foundation](phases/01-contract-foundation.md) |
| 02 | 建立非 workspace、极薄 Consumer Conformance Harness | 01 | 验收通过待推送 | [02 Harness](phases/02-consumer-conformance-harness.md) |
| 03 | 在 Admin 增加 Consumer Lab | 01，可与 02 部分并行 | 验收通过待推送 | [03 Admin Lab](phases/03-admin-consumer-lab.md) |
| 04 | 迁移 E2E/Registry/TASK-0801 并删除 `apps/template-preview` | 02、03 | 验收通过待推送 | [04 Remove preview](phases/04-remove-template-preview.md) |
| 05 | 同步 active 文档并执行最终 R3 Local 验收 | 04 | 验收通过待推送 | [05 Final verification](phases/05-docs-and-r3-verification.md) |

Phase 02 与 Phase 03 可在 Phase 01 后并行设计，但本次单 Agent 串行实施。Phase 04 是 destructive code removal gate，只有新 Harness 已通过真实 Local 行为且 Admin Lab build/unit 可用时才能进入。

## 跨阶段冻结规则

1. Harness 永远位于 `tests/`，不得加入 workspace、生产构建或部署入口。
2. Harness 不允许导入 `@kit/*`、`apps/admin/**`、`packages/domain/**` 或 Supabase secret/service-role helper。
3. Harness 不维护公共 DTO 手写 enum；需要 contract metadata 时直接读取 `contracts/account/v1/openapi.json`。
4. Admin Lab 只是维护 UI，不能替代 Harness compatibility evidence。
5. `ACCOUNT_PLATFORM_KEY` 只存在 Harness server/test process 环境，不进入 HTML、JS、日志、错误 body 或浏览器 bundle。
6. `/v1` wire behavior 不因删除 Reference Consumer 改变；发现合同与服务端冲突先修 canonical contract/checker，不在 Harness 私下兼容。
7. 历史 archive/review/旧 proposal 中真实过去状态不机械改写；当前 active 文档和当前 Proposal 状态必须同步。

## 验证总线

阶段定向验证外，最终候选至少运行：

```text
pnpm toolchain:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:tooling
pnpm contracts:check
pnpm contracts:breaking
pnpm test:registry
pnpm test:consumer-harness
pnpm runtime:probe
pnpm docs:check
git diff --check
pnpm verify:task:0801 --reuse-local
```

不存在的 proposed command 只有在对应阶段真正加入 `package.json` 后才可执行并记录 PASS。

## 回退

- Phase 01 只改 contract/checker，可独立 revert；不改数据库/API runtime。
- Phase 02/03 只增加替代路径，可在旧 Reference Consumer 存在时回退。
- Phase 04 才删除 `apps/template-preview`；若 Harness/E2E 发现无法覆盖必要 Consumer 行为，停止删除或 revert Phase 04，不修改数据库数据。
- Phase 05 主要是文档/gate 收尾，可独立修正，不需要数据回滚。

## 总体验收

- [x] canonical OpenAPI 与真实 `purchases_paused` 行为一致，breaking checker 负向测试通过。
- [x] `tests/consumer-harness` 独立且 test-only，无 `@kit/*`/Next/React/Domain/Admin runtime dependency。
- [x] `/admin/consumer-lab` 可导航、可读、不会暴露 Secret 或伪造 Harness PASS。
- [x] `apps/template-preview` 已删除，root workspace/build/typecheck 不再包含它。
- [x] Registry/TASK-0801/E2E 已切到 Harness + Admin Lab 模型。
- [x] Consumer platform/session/CSRF/BFF/file/subscription 等适用 Local 行为仍有真实测试证据。
- [x] active architecture/reference/guides 不再指导复制 `apps/template-preview`。
- [x] 最终 R3 Local Supabase gate 对最终候选 PASS；失败记录保留。

## 风险与阻塞

- Harness 若逐渐长成业务 UI，立即收缩：只保留协议/安全诊断，不复刻产品页面。
- 删除 template-preview 前若 T16 仍依赖页面专属交互，先把断言改为协议/领域行为再删除，不能仅删测试获得通过。
- Admin Lab 若需要 Consumer Platform Key 才能提供某功能，第一版保持只读而不是临时把 key 放入 Admin/browser。
- 本地 Supabase/Docker 不可用时可完成静态/构建阶段，但 Phase 04 destructive removal 和 Phase 05 R3 不能标已交付。

## 交付

实际命令、失败、复测、commit 与 push 只记录在 [verification-record.md](verification-record.md)。每阶段通过后形成小提交并 push 当前任务分支；不合并 main、不部署生产。
