# 阶段 07：Schema Rebaseline、Reset 与完整验收

状态：本地及测试环境已完成；默认 Local fresh 验收 22 gates PASS、workendstaging reset/seed/三函数部署 PASS；Git/main 与 Admin 发布正在闭环。

前置：阶段 02～06 全部代码行为已经稳定。

覆盖：LC-13 与全部 R/LC 的最终关闭。

最终审查补充：fresh baseline 撤销浏览器对当前及未来 public 业务表的所有权限；移除无运行调用者的旧 Admin account/get/list/patch、platform/key/origin list、audit list、Billing metrics/detail 九个入口。对应测试改用当前 canonical 入口；Billing detail v2 仅保留为 v3 的内部实现，不授予 executor 直接调用权限。Auth 身份、MFA 与唯一管理员关联在 workendstaging 重置中保留，应用测试数据重新生成；发布期间 Checkout、Background Processing 与 Auto Settlement 关闭。

受控 seed 使用 `tests/fixtures/prelaunch-seed.sql`：只在已授权清空的测试环境运行，要求先恢复唯一管理员、注入临时 `prelaunch.platform_hmac_secret`。生成两个隔离平台、四个无登录凭据的合成用户及 canonical Commerce/Config/Feedback/Campaign fixture；订单通过领域结算入口生成 Grant。Config 先保留 pending intent，运维脚本实际上传 JSON 后调用 activate/approve，禁止仅伪造 active ledger。Secret、Platform Key 和 Storage 管理凭据不提交；fixture 没有真实 Provider 验证含义。

基线显式授予 `domain_owner` 对 public schema 的 USAGE，不依赖 Local 的 PUBLIC 默认权限；远端 reset/create schema 与托管角色边界下，平台 bootstrap trigger 也必须可正常创建 Commerce policy。首个远端 reset transaction 因该缺失失败并整体回滚，修复后重试；不得放宽业务表权限。

本阶段一并集成已提交的 UI 优化 `c1776f0`（17 个文件，UI-ISSUE-001～015），用户 2026-10-14 已确认；原工作区仍在编辑的 `AUDIT_REPORT.md` 不覆盖、不暂存。集成后重新执行全部 Local 与浏览器检查；删除安全加载页的重复技术说明，保留必要的加载反馈。

Seed Platform Key 材料必须由带独立用途前缀的 HMAC 按 Key ID 派生，不得把根 HMAC Secret 作为请求中的 Key 材料。受控测试项目的 seed 密钥已按此规则轮换；所有凭据仅在临时运维文件中使用并在交付后移除。

## 为什么最后做 schema rebaseline

先把目标行为实现并验证，再 squash/rebaseline，可以避免一边重写历史 migration 一边继续改模型导致 review 困难。由于没有正式数据，最终首发 schema 不需要包含“先创建 fixed products/legacy files，再逐步兼容，最后删除”的历史过程。

## Rebaseline 策略

优先方案（前提是阶段 00 destructive gate 仍成立）：

1. 记录旧 migration history 作为审计资料；
2. 生成/整理一个可从空库建立当前 canonical schema 的 prelaunch baseline；
3. 移除只为旧 schema forward upgrade 存在的 bootstrap/backfill/compat migration；
4. 保留真正体现领域演进且仍有运行价值的 SQL，或等价整合进 baseline；
5. Local fresh reset；
6. Test/Staging destructive reset + seed；
7. 不运行 legacy non-empty upgrade fixture。

如果环境门槛变化、Staging 出现必须保留的数据，则改为 forward destructive cleanup migration，不进行 history squash，但仍必须删除运行 compatibility surfaces。

2026-10-14 核对：远端只有测试数据；本轮明确授权覆盖 Local/workendstaging reset。先完成 Local canonical baseline 与 fresh 验收，再重置唯一远端测试项目并部署；不保留旧 Account/Key list wrapper，Billing detail 内部 helper 仅由 canonical detail 调用。

## Contract baseline

1. 保存本 Proposal expected breaking diff；
2. 更新 Account/Admin canonical OpenAPI baseline/snapshot；
3. 更新 Consumer Lab generated summary、Harness、Registry；
4. 从新 baseline 开始运行 `pnpm contracts:breaking`，必须重新 PASS；
5. `COMPATIBILITY.md` 继续保留并注明 prelaunch baseline 生效日期/commit。

## 必跑验证

- `pnpm db:reset --yes`
- `pnpm test:db`
- `pnpm test:api`
- `pnpm test:unit`
- Commerce/Mapping/Price 新并发测试
- Account transition illegal matrix tests
- Feedback same-operation replay tests
- Entitlement/Config mutation-between-pages tests
- `pnpm test:consumer-harness`
- `pnpm test:e2e:consumer-harness`
- `pnpm test:e2e:t12-r2`
- PlatformSwitcher >100 / stale platform response / cross-platform entity route tests
- `pnpm contracts:check`
- `pnpm contracts:breaking`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm docs:check`
- `git diff --check`

## 代码搜索型退出门槛

最终 repo 审查必须确认 runtime 中不再存在：

- `legacy_product_code`
- Account checkout `product_code` 输入
- `/v1/subscription/products`
- `resource_kind='legacy'`
- Consumer `/v1/config-files`
- Admin legacy config-file CRUD surface
- raw timestamp Billing cursor compatibility
-旧 `/admin/operations`、`/admin/deletion-jobs`、`/admin/billing` alias
- retired v1/v2/v3 functions（除非名称中的版本号是协议本身而非 compatibility generation，并有明确保留理由）

## Staging

若 staging 是唯一远端测试环境：

- destructive reset 必须有阶段 00 明确授权证据；
- redeploy Account API 后做 unauthenticated fail-closed、Platform Key、Admin auth/recent-MFA、Offer Checkout、Config Version、Global Delete 只读/可回滚 probe；
- 核对 RLS、function owner/search_path/grants、advisor；
- Production NOT_RUN。

## 完成

只有所有 R-01～R-15、LC-01～LC-13 均在 verification record 中有实际验证证据后，Proposal 才能标 Completed。
