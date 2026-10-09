# Phase 05：Active 文档收敛与 R3 总体验收

状态：验收通过待推送

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把当前架构、接入手册、测试/配置/Registry 说明同步到 Admin Consumer Lab + Consumer Conformance Harness，并对最终候选执行完整 R3 Local 验收。

## 进入条件

- Phase 04 已删除 `apps/template-preview`，定向构建/E2E PASS。

## Active 文档同步

至少核对并按实际修改：`README.md`、`AGENTS.md`、`docs/README.md`、`docs/architecture/overview.md`、`docs/architecture/modules/frontends.md`、`docs/architecture/deployment.md`、`docs/reference/contracts.md`、`docs/reference/configuration.md`、`docs/reference/contract-consumer-matrix.md`、`docs/reference/contract-consumers.json`、`docs/guides/platform-onboarding.md`、`docs/guides/testing.md`、`docs/guides/development-release-workflow.md`、`registry/README.md` 及本 Proposal/前序 Proposal 的当前状态入口。

接入手册目标语义：

> 新平台直接按 canonical OpenAPI/HTTP 实现自己的 Auth/BFF；Admin Consumer Lab 用于维护者浏览合同；Consumer Conformance Harness 用于中央仓库验证独立 Consumer 边界。Harness 是测试实现，不是应复制到生产的 Starter App。

## 最终静态断言

- active product/build 文件没有 `apps/template-preview`。
- active 指南不再要求复制 Reference Consumer 源码。
- Harness 不属于 workspace/部署组件。
- Registry 不再有 `reference_consumer`/template route inventory。
- `@kit/domain` 仍为 central-internal，不出现在 Harness。

## R3 验证

优先复用现有 Local Supabase，不 reset 未确认数据。确认 fixture 范围后执行：

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

完整 gate 必须覆盖真实 Local Account API/DB/Storage/Auth、Harness Browser flow 和 Admin MFA flow；环境不可用时记录 BLOCKED，不能把先前 commit 的 PASS 当最终候选 PASS。

## 最终交付

- 全部阶段状态与 verification record 一致。
- Proposal 改为 Completed 只在最终 R3 PASS、commit push、远端 SHA 核对后。
- 推送任务分支；不合并 main，不部署 Production。
