# 移除 Consumer SDK 与 Contract-First 接入总计划

状态：In Progress

关联：[优化设计](design.md)

执行入口：[Agent 交接](agent-handoff.md)；实施事实：[验证记录](verification-record.md)

风险级别：R3

## 总体范围

本计划把 AisenHubPlatform 从“HTTP + Consumer SDK + SDK 发行”迁移到“HTTP/OpenAPI Contract + Reference Consumer + Consumer-owned integration”。迁移不改变数据库 schema 或既有 `/v1` 业务语义，按先建立替代稳定性、再迁消费者、最后删除旧路径的顺序执行。

起始实现事实：

- `packages/account-auth`、`packages/account-auth-nextjs`、`packages/account-server` 均存在且被应用消费。
- `apps/template-preview` 依赖上述 SDK/适配包及 `@kit/domain`。
- `apps/admin` 依赖 `@kit/account-auth-nextjs`，并使用 `@kit/domain` 作为中央内部能力。
- `prebuild`/`pretypecheck` 会先 `sdk:pack`；SDK tarball、独立安装 probe 和 Registry SDK compatibility 仍在主路径。
- OpenAPI/consumer matrix 已能作为新架构基础，但 canonical 文件仍在 `docs/reference/contracts`，静态检查包含固定 Account operation 数量。

跨阶段冻结规则：

1. `/v1` wire schema 和安全语义本任务不做破坏性改变。
2. `packages/domain` 保留为中央内部模块；Reference Consumer 必须退出其依赖。
3. Reference Consumer 可保留 `@kit/ui` 展示依赖，但不能保留任何集成 SDK 依赖。
4. Auth 行为先等价迁移，不借本任务改协议。
5. Phase 04 删除 package 前，所有 runtime consumer 必须已完成切换并通过定向测试。
6. 所有失败测试保留；不得通过扩大 allowlist、关闭 CSRF/MFA 或降低断言完成迁移。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | 提升 OpenAPI 为 canonical contract 并建立治理/兼容检查 | 无 | 已交付 | [01 Contract baseline](phases/01-contract-baseline-and-governance.md) |
| 02 | Reference Consumer 退出 Account SDK 与 Domain consumer 依赖 | 01 | 已交付 | [02 Reference Consumer](phases/02-reference-consumer-without-sdk.md) |
| 03 | Reference Consumer 与 Admin 退出 Auth SDK | 02 | 验收通过待推送 | [03 Auth/BFF decoupling](phases/03-auth-and-bff-decoupling.md) |
| 04 | 删除 SDK packages、tarball、安装链和构建前置 | 03 | 未开始 | [04 Remove distribution](phases/04-remove-sdk-packages-and-distribution.md) |
| 05 | 用 contract/reference probes 与现有 HTTP/E2E 门槛替代 SDK tests | 04 | 未开始 | [05 Contract gates](phases/05-contract-conformance-and-compatibility-gates.md) |
| 06 | 同步 architecture/reference/guides，执行 R3 总体验收 | 05 | 未开始 | [06 Final verification](phases/06-documentation-cleanup-and-final-verification.md) |

Phase 05 的部分脚本可在 01 后提前准备，但最终启用必须在 04 删除旧 SDK tests 后统一完成。涉及同一 `package.json`、OpenAPI、Reference Consumer 或 Auth 文件的阶段按表中顺序串行，不并行修改。

## 文件所有权

- Phase 01：`contracts/**`、合同检查器、contract consumer 索引及引用。
- Phase 02：`apps/template-preview` 的 Account integration、bounded input、public contract types 与业务授权。
- Phase 03：`apps/template-preview/app/_lib/auth/**`、`apps/admin/app/_lib/auth/**` 及所有 Auth import consumers。
- Phase 04：三个 SDK package、SDK tooling/tests、root/app package metadata、lockfile、Registry SDK metadata。
- Phase 05：`tooling/scripts`、`tests/spikes/registry|consumer`、TASK-0801 gate。
- Phase 06：`docs/architecture`、`docs/reference`、`docs/guides`、`AGENTS.md`、Proposal 状态/验证记录。

历史 archive/review/verification 中的过去 SDK PASS 和历史实施事实不改写；仍面向未来的 active 指南/计划引用按实际需要同步。

## 关键验证

每阶段执行定向测试；最终至少要求：

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

R3 还要求适用 Local Supabase/API/Auth/BFF/E2E。优先使用现有隔离入口；运行 `verify:task:0801` 前必须核对其重置行为，默认不删除未知本地数据。Provider 业务规则、SQL schema、并发状态机未改变，因此无需为本重构制造新的真实支付/数据库迁移测试，但现有本地领域测试不能因移除 SDK 而从总 gate 中被静默删除。

## 回滚

Phase 01–03 只增加替代路径/迁移消费者，旧 SDK package 仍存在，可按阶段 commit 回退。Phase 04 才删除 SDK；发生回归时 revert Phase 04 可恢复 package/发行链，无数据库或交易数据回滚。Phase 05/06 为检查和文档，可独立 revert，不影响领域数据。

## 总体验收

- [ ] canonical OpenAPI 只维护在根 `contracts/`，active 引用正确。
- [ ] `/v1` compatibility policy 与自动 breaking check 存在且通过。
- [ ] Reference Consumer 不依赖/导入 `@kit/account-*` 或 `@kit/domain`。
- [ ] Admin 不依赖/导入 `@kit/account-auth-nextjs`。
- [ ] 三个 SDK/适配 package 和其打包/安装体系删除。
- [ ] `prebuild`/`pretypecheck` 不产生 SDK tarball。
- [ ] Registry 使用 contract compatibility，不使用 SDK compatibility。
- [ ] Auth Cookie/CSRF/session/replay/recent-auth/MFA 安全测试保持。
- [ ] Account BFF/protected feature/file upload 负例保持。
- [ ] R3 适用 Local 验证实际运行并写入 `verification-record.md`。
- [ ] 当前架构、API、合同、接入手册、测试流程与实际代码一致。

## 风险与阻塞

- 本地 Supabase 或浏览器工具不可用时先完成静态/单元/构建；R3 最终合并门槛保持 BLOCKED，不把 NOT_RUN 写成 PASS。
- Auth 等价迁移出现行为差异时停止 Phase 04，先修复 Phase 03 并保留失败用例。
- 若中央内部模块仍真实依赖 account-* package，先确认职责归属并迁入中央内部代码，不保留“临时公共 SDK”。
- 不新增生产部署、Secret、真实支付或收费动作。

## 验证与交付

实际命令、失败、复测、阶段 commit 和远端状态统一记录在 [verification-record.md](verification-record.md)。只有必要验证通过、commit 已 push 并核对远端后，阶段才能标“已交付”；全部阶段验收后 Proposal 才改为 Completed。
