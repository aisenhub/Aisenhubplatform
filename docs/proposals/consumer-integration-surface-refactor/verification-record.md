# Consumer Integration Surface 重构验证记录

本文件只记录本次实施实际发生的修改与命令结果，不把未运行或被环境阻塞的检查记为 PASS。

## 基线与范围

- 日期：2026-10-15
- 起始分支：`main`
- 起始 HEAD：`58b4ef5a444b6c46015c712a4190076b7efbd36d`
- 起始工作区：clean
- 风险：R3
- 范围：删除 Admin Consumer Lab；建立根 `platform-integration/`；迁移 Developer/AI 接入入口；更新 Registry、Harness/Conformance 周边工具、测试与 active 文档。
- 明确未修改：共享 Supabase Identity、Platform Account、Principal、Account v1 业务合同、private SQL、Config/Feedback/Commerce 领域语义。
- Production：独立发布步骤；本文件记录实现与 Local/R3 验收，实际 Production 发布结果以发布交接为准。

## 实施结果

1. 建立 `platform-integration/` 双入口：Developer `README.md` + AI `AGENTS.md`，并增加 machine-readable `manifest.json` / `ai/capabilities.json`、安全规则、workflow、分主题 guides、env example 和 Conformance 入口。
2. 增加 `platform-integration/validate.mjs`，校验入口文件、canonical Account contract 指针、guide 路径、core capability 和 capability `operationId` 是否真实存在。
3. 删除 `/admin/consumer-lab`、`apps/admin/features/consumer-lab`、Global Navigation 项及其专用 generated contract snapshot/checker。
4. `contracts:check` 改为继续执行 canonical OpenAPI 检查，同时执行 Integration Package 校验；没有修改 Account/Admin OpenAPI 内容。
5. Registry schema 升至 `4.0.0`，以 `consumer_integration` 替代 Admin Consumer Lab 元数据；Harness 仍保持 test-only implementation。
6. `docs/guides/platform-onboarding.md` 缩减为历史链接兼容入口，新的当前事实集中到 `platform-integration/`。

## 验证记录

| 命令 / 检查 | 结果 | 证据 / 说明 |
| --- | --- | --- |
| `pnpm platform-integration:check` | PASS | 11 capabilities；canonical Account OpenAPI 40 operations；所有引用 operationId/guide/entrypoint 有效。 |
| `pnpm test:registry` | PASS | manifest/canonicalContracts/consumerIntegration/consumerHarness/templateInventoryRetired/browserSecretBoundary 全部 PASS。 |
| `pnpm contracts:check` | PASS | Account 40 operations、Admin 76 operations；Integration Package 校验与 Consumer compatibility check 同时 PASS。 |
| `pnpm docs:check`（首次） | FAIL | 新 Proposal 尚未挂入 `docs/proposals/README.md`，2 个文档不可达。 |
| `pnpm docs:check`（修复索引后） | PASS | 218 documents；required entries/local links/navigation 一致。 |
| `pnpm --filter admin test:unit` | PASS | 14 test files / 69 tests PASS。 |
| `pnpm --filter admin typecheck` | PASS | `tsc --noEmit` PASS。 |
| `pnpm test:consumer-harness` | PASS | test-only boundary、forbidden imports、browser secret markers、canonical operations、dynamic route、workspace isolation、process/static UI/CSRF/contract metadata 等 PASS。 |
| `pnpm format:check`（首次） | FAIL | 新增 `capabilities.json`、`manifest.json`、`validate.mjs` 需要格式化。 |
| 定向 `oxfmt` + `pnpm format:check` | PASS | 413 files 格式一致。 |
| `pnpm lint` | PASS | 347 files，0 warnings / 0 errors。 |
| `pnpm --filter admin build` | PASS | Next 16 production build PASS；生成的 Route 列表中不存在 `/admin/consumer-lab`。 |
| Active source/current docs Consumer Lab grep | PASS | apps source（排除生成缓存）、Registry、tooling、tests、architecture/reference/guides 无当前态 Consumer Lab/旧 registry key/旧 snapshot script 引用；历史 Proposal/Archive 保留。 |
| `git diff --check` | PASS | 修正兼容 guide EOF 空行后无 whitespace error。 |
| `pnpm test:e2e:consumer-harness`（默认端口首次） | BLOCKED | Local Supabase 未启动；进一步确认 Windows 排除端口覆盖默认 `54321–54329` 本地服务端口。 |
| 临时 Local Supabase 端口映射 | PASS | 仅本次验证把 `supabase/config.toml` 的 `54321–54329` 临时映射为 `55321–55329`，启动完成后所有 Supabase 容器均 healthy；原配置已备份，验证结束后恢复，不纳入提交。 |
| `pnpm test:e2e:consumer-harness`（临时本地端口） | PASS | Harness process、Auth Cookie/CSRF、platform isolation、activation、redeem、Profile/Preferences ETag、binary、Config/Gallery、Feedback、suspend fail-closed、logout/invalid refresh 全部 PASS。 |
| `pnpm verify:task:0801 --reuse-local` | PASS | 22 executable gates PASS；包含 114 个 Deno/API 测试、63 个 SQL 文件 / 1381 个数据库断言、并发探针、Contract breaking、Registry、Harness static/Local E2E、Admin browser E2E、219 docs 与最终 contracts check。 |

## 当前结论

实现、静态合同、Registry、文档、Admin unit/typecheck/build、Harness static/process/Local E2E、format/lint 与最终 R3 汇总 gate 均已验证通过。

宿主 Windows 仍排除仓库默认 Supabase 本地端口，因此此次 R3 验收使用临时 `55321–55329` 映射；该变更只用于本机验证，不改变仓库标准配置、Harness 安全断言或发布门槛。Proposal 可以标记 `Completed`。
