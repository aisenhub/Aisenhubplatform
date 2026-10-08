# Phase 06：当前文档同步与 R3 总体验收

状态：未开始

## 目标

把已实施的无 SDK 架构同步到 architecture/reference/guides，并执行最终静态、构建、单元、合同和适用 Local Supabase/E2E 验收。

## 前置条件

- Phase 01–05 代码完成且定向检查通过。

## 文档同步范围

至少检查 `AGENTS.md`、`docs/README.md`、`docs/agents.md`、architecture overview/frontends、reference API/contracts/consumer matrix、platform onboarding、testing、development-release-workflow、Registry README。删除 `docs/reference/sdk.md`。历史 archive/review/旧 verification 的真实历史 SDK 事实不改写。

## 接入手册目标

新平台流程：读 canonical contract/changelog → 记录验收 revision → 配置 Auth/API/Platform Key/Origin → 从 Reference Consumer 复制并自行拥有 Auth/BFF/integration 代码 → login/principal/activate/protected route → 按需接 profile/subscription/files → 本项目及中央 Local 验收。不得再要求安装 AisenHub runtime SDK。

## 最终验证

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
pnpm test:reference-consumer
pnpm runtime:probe
pnpm docs:check
git diff --check
```

随后按 R3 核对 Local Supabase，运行适用 API/Auth/BFF/E2E。任何可能重置未知本地数据的命令先检查参数/fixture。`verify:task:0801` 仅在确认安全且环境可用时运行；否则记录具体 BLOCKED/NOT_RUN。

## 最终静态断言

- active runtime code 不含 `@kit/account-auth*`、`@kit/account-server`。
- `apps/template-preview` 不含 `@kit/domain`。
- root scripts/CI/vercel 不含 `sdk:pack`。
- active 指南不要求 SDK tarball/vendor override/SDK compatibility。
- canonical OpenAPI 没有第二份人工维护副本。

## 退出条件

- 所有适用 R3 必需验证对最终候选 PASS。
- 当前 architecture/reference/guides 与实现一致。
- Proposal 状态/verification record 更新。
- commit push 且远端 SHA 核对后才标已交付。
- main 合并按长期授权及生产自动部署绑定判断；绑定未知时只推任务分支。
