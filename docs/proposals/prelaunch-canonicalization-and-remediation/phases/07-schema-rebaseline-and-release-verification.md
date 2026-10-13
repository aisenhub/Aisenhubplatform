# 阶段 07：Schema Rebaseline、Reset 与完整验收

状态：未开始

前置：阶段 02～06 全部代码行为已经稳定。

覆盖：LC-13 与全部 R/LC 的最终关闭。

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
