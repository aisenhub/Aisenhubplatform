# 工程技术栈、Monorepo 与验证架构

本文件记录当前工程技术、共享 package ownership、构建测试和质量门槛。它描述“仓库实际怎么开发和验证”，不把 workspace 中仅安装但业务未使用的库误写为当前架构。

## Requirements

本基础设施为所有 Requirement 提供工程验证能力，重点支撑 `REQ-SYS-007`、`REQ-API-001`、`REQ-API-007` ～ `REQ-API-011`。技术栈本身不是业务需求；只有已接受的兼容、安全或工程约束才从 spec 进入本文件。

## 1. Monorepo

当前 tracked 主体：

```text
apps/admin
packages/domain
packages/ui
packages/shared
packages/i18n
tooling/scripts
tooling/typescript
supabase/functions
supabase/migrations
contracts
platform-integration
tests
registry
```

历史 `apps/template-preview`、`packages/account-auth*`、`packages/account-server` 已不在 Git tracked runtime 中；本地若仍有 node_modules/残留目录，不属于当前模块。

## 2. 固定 Toolchain

长期固定基线以 `tooling/toolchain.json` 为准，当前 Node 24.19.0、pnpm 11.18.0、Deno 2.9.6、Supabase CLI 2.111.0。

Root `packageManager/engines`、`.nvmrc`、CI 等重复声明由 `pnpm toolchain:check` 对齐。

Node lock：`pnpm-lock.yaml`；Deno：`deno.lock` frozen。

## 3. Web 技术

Workspace catalog 当前主要：Next.js 16.3.8、React 19.2.8、TypeScript 7.0.2、Tailwind CSS 4.3.3、Base UI 1.6.x、Supabase JS/SSR、Vitest 4.x、Lucide/cmdk/Sonner；TanStack Query/Table、RHF、Zod 等作为 workspace/shared UI 能力。

“catalog 有依赖”不等于“Admin 已采用”。Admin 实际依赖详见 `modules/admin-console.md`。

## 4. `@kit/domain`

中央内部 domain package，exports contracts、errors、validation、bounded upload helpers、redemption helpers、admin MFA attestation。

它没有 SQL client 或 server Secret，不把数据库直接带进 Browser；也不是 Consumer public SDK，公共 wire contract 是 OpenAPI。

## 5. `@kit/ui`

共享 UI package 两层来源：

- `src/shadcn`：尽量 upstream-replaceable primitive；
- `src/makerkit`：项目适配/语义组件和历史上游来源目录。

技术依赖：Base UI、CVA、clsx、tailwind-merge、cmdk、Lucide、Sonner 等。

package 同时包含 Table/Form/Chart/Theme 等能力，但 Admin 是否使用必须按 import 实际核对。

## 6. `@kit/shared`

主要 exports logger、utils、hooks、events。Logger 默认基于 pino。

## 7. `@kit/i18n`

基于 `next-intl` 的共享 i18n package。Admin 当前主要产品文案为中文，但“package 存在”不能解释为 Admin 已实现完整多语言切换。

## 8. Edge / Deno

Supabase Functions 使用 Deno runtime，并通过 root `deno.json/deno.lock` 锁定依赖。

Account/Admin API、Maintenance、Webhook 共享 `supabase/functions/_shared` 中的 HTTP/DB/Storage/Provider helper。

## 9. Build

Root 由 Turborepo 编排 build/typecheck/test。Admin 使用 `pnpm --filter admin build`，实际 Next build 使用 webpack。构建失败不能通过 `ignoreBuildErrors` 隐藏。

## 10. TypeScript

根配置强调 strict、noUncheckedIndexedAccess、isolatedModules、bundler module resolution、noEmit。Domain/UI/Admin 都从共享 tsconfig 体系继承。

## 11. Lint / Format

当前不是 ESLint/Prettier 主链，而是 Oxlint + Oxfmt。Oxfmt 主要规则：single quote、80 print width、semicolon、2-space tab。

`pnpm format` 是 check；`pnpm format:fix` 才修改文件。

## 12. Unit Test

Workspace `test:unit` 由 Turbo 分发。

Admin Vitest 重点测试 Auth API、BFF、Navigation、account/audit/billing/feedback/overview models、platform integration/overview、scoped load guard、security status。Domain/UI 也有各自 unit suite。

## 13. Database/API Tests

Root 验证包括 `pnpm test:db`、Account/Admin API Deno suite、executor/security SQL suites、Billing Webhook/Jobs/Workers、migration/prelaunch probes、system-admin concurrency、backup/runtime/performance probes。

测试层必须说明是否只是 static/unit、是否启动 Local Supabase、是否调用真实 Provider。

## 14. Browser E2E

主要有 Admin canonical browser E2E、Admin UX local、Consumer Harness E2E。它们连接 Local Supabase/API/Admin/Harness，验证真实 Cookie/CSRF/Auth/API/DB/Storage 路径，而不是只渲染组件 snapshot。

## 15. Contract Gates

- `pnpm contracts:check`；
- `pnpm contracts:breaking`；
- `pnpm platform-integration:check`；
- Consumer Harness static/package integration。

当前验证基线：Account 40 ops、Admin 78 ops、Integration 11 capabilities。

## 16. Documentation Gate

`pnpm docs:check` 验证 required entries、local links、navigation reachability 和目录一致性。架构新增文档必须从 `docs/README.md` 经 `architecture/README.md` 可达。

## 17. TASK-0801

`pnpm verify:task:0801` 是当前仓库综合验证入口之一，组合 toolchain、format、contracts、DB/API/security 等多个门槛。具体 gates 以脚本当前版本为准，不在文档复制固定数量防止漂移。

## 18. CI

GitHub Actions 对 main push/PR 运行 frozen install、format/toolchain/full verification 等。CI toolchain 使用 Ubuntu + pinned Node/pnpm/Deno。

CI PASS 证明仓库自动化门槛通过，不等于 Hosted Provider、Production Secret、真实调度或业务观察完成。

## 19. 上游与供应链

Makerkit Lite 等上游来源、commit/license 和实际复制范围记录在 `THIRD_PARTY_NOTICES`。候选 OSS/参考项目不等于已复制或已完成许可证审计。

新增依赖或上游代码前固定 Repository URL、commit、license、copied/adapted files、移除依赖和理由。安全核心优先官方 SDK/标准库和已审查实现。

## 20. 当前工程边界原则

- 不为了技术潮流替换已经稳定的 Next/React/Base UI/Tailwind 基础。
- 浏览器/Consumer 不依赖中央 private package 才能接入 HTTP API。
- Shared package 只提炼真正跨消费者复用的能力，不把业务状态机搬到 UI package。
- Test helper 不能拥有比 Production runtime 更宽的业务语义而使验证失真。
- 任何“已安装库”与“当前业务采用库”的描述必须分开。
