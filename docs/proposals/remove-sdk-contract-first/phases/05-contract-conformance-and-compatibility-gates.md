# Phase 05：Contract、Registry 与 Reference Consumer 门槛

状态：已交付

## 目标

用可执行 Contract/Reference Consumer 门槛替代 SDK package/install tests，并纳入 TASK-0801。

## 前置条件

- Phase 04 已删除旧 SDK tests/scripts。

## 实施步骤

1. 把 `tests/spikes/registry/m5-04-template.mjs` 从 SDK 版本/包假设改为 contract compatibility + 实际模板路径/Secret 边界检查；新增 root `test:registry`。
2. 新建 Reference Consumer 架构 probe，检查 package/source 不依赖 `@kit/account-*`/`@kit/domain`，必需 Auth/BFF/protected 文件存在，Registry 指向当前 contract。
3. 新增 `test:reference-consumer`；删除旧 tarball consumer install test。
4. 更新 `task-0801.mjs`：移除 SDK package/install gates，加入 `contracts:breaking`、`test:registry`、`test:reference-consumer`；保留 format/lint/typecheck/build/unit/API/DB/concurrency/runtime/browser/docs/contracts 等领域门槛。
5. 本 Proposal 不强制新增 oasdiff/Spectral/Schemathesis 依赖；后续需求另行评估。

## 验证

```text
pnpm contracts:check
pnpm contracts:breaking
pnpm test:registry
pnpm test:reference-consumer
pnpm test:tooling
pnpm runtime:probe
node --check tooling/scripts/src/task-0801.mjs
git diff --check
```

## 退出条件

- TASK-0801 不引用 SDK/tarball/install test。
- 新 gate 能阻止 forbidden package 重新进入 Reference Consumer。
- Registry 与 canonical contract 对齐。
- 原领域/API/DB/E2E 门槛未删除或放宽。
