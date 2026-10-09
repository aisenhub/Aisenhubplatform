# Phase 06：当前文档同步与 R3 总体验收

状态：R3 验收通过；待 commit/push 与远端 SHA 核对

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

## 当前验证状态（2026-10-09）

静态、构建、单元、API、数据库、并发、Contract/Registry/Reference Consumer、Runtime、Consumer/Admin 浏览器流与文档检查均已通过。此前 T16 的不一致失败点已完成诊断并收敛：

- `/v1/auth/recent-proof` 的 canonical OpenAPI 要求 `platformKey + bearerAuth`，Reference Consumer reauth BFF 却显式关闭了 Platform Key 注入，同时 `docs/reference/api.md` 仍写“不需要 Platform Key”；现已以 canonical contract 为准修正 BFF 与文档，Platform Key 仍只存在于服务端。
- Consumer/Admin 登录 E2E 原先可能在 React hydration 前点击 SSR 按钮；登录页现显式暴露 hydrated 状态，T16 等待该状态后再提交。
- Account Profile/Preferences 的 T16 原先只等待 HTTP response，没有等待前一个 React handler 完成；现等待用户可见成功状态后再执行下一操作。
- T16 fixture 现在不会把上一次中断留下的 `t16-r2-admin-*` 合成 `system_admin` 当成真实 previous admin 再恢复，避免污染后续 pgTAP。
- T16 原先把任意 HTTP status 都视为本地服务 ready，并把所有 Playwright locator/action 的全局等待压到 15 秒；现要求 Consumer/Admin 关键页面返回 200 且包含预期 HTML marker，并恢复 Playwright 标准 UI/action timeout。API/browser fetch 仍保留各自显式 deadline，因此未放宽产品授权、HTTP 状态或网络 SLA 断言。

在重新 production build 后，`pnpm test:e2e:t16-r2` 已完整 PASS，包含 `ordinaryProof`、文件上传/下载/删除、Profile/Preferences、Admin MFA、账户 suspend/restore、多 Tab terminal logout 与敏感 mutation unknown-outcome 等 20 项矩阵；`test:api:t12-ordinary-proof` 也通过真实 Local Auth/DB/Account API 的独立 email event session、中央 proof、原 session 绑定与临时 session 撤销。

中间一次复用本地库的完整验收曾因中断 T16 遗留的 `private.system_admin(singleton_id=1)` 阻塞 pgTAP；该行已确认属于 `t16-r2-admin-* @example.test` 合成 fixture。恢复 Docker Desktop 后没有执行 `db:reset`：条件删除返回 `NO_MATCH_NO_CHANGE`，随后只读查询确认 `private.system_admin` 为空，`pnpm test:db` 重新得到 58 files / 1082 tests PASS。

最终同一候选运行 `pnpm verify:task:0801 --reuse-local` 退出码 0，输出 `TASK-0801 PASS: 21 executable gates passed.`：Edge/API 97/97、DB 58 files / 1082 tests、结算并发、Contract breaking、Registry、Reference Consumer、Node/Deno runtime、T16 20 项 Consumer/Admin 浏览器矩阵、T12 Admin MFA/step-up/responsive-a11y、docs 101 documents、OpenAPI Account 22/Admin 45 operations 与 4 contracts / 39 fields ownership 全部 PASS。R3 验收退出条件已满足；当前只剩 commit/push 与远端 SHA 核对，完成前不标“已交付”。
