# 阶段 02：API / Contract / Checkout Compatibility

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

在 legacy Consumer 不破坏的前提下开放 Offer-aware catalog/checkout，并为 Admin 商业目录、摘要、权益用户与 Campaign 提供稳定 API/OpenAPI。

## 任务

- [x] API-001：Account `GET /v1/commerce/offers`，Additive DTO 与 fail-closed purchase readiness。
- [x] API-002：Checkout 支持 `offer_id XOR product_code`，服务端价格/Plan/term/Mapping snapshot，不允许客户端金额。
- [x] API-003：legacy `/v1/subscription/products` 与 `{product_code}` Checkout 解析到 bootstrap Offer，保持旧样例/消费者通过。
- [x] API-004：Admin Offer/Price CRUD/publish/archive + Provider Mapping 读写安全边界。
- [x] API-005：Admin commerce summary / entitlement list / Campaign v2/detail。
- [x] API-006：权益治理复用现有 command，必要时补 read DTO attribution；不创建第二套 mutation。
- [x] CONTRACT-001：Account/Admin OpenAPI additive 更新、旧描述漂移修复、Consumer Lab/compatibility/breaking PASS。
- [x] TEST-001：API unit 覆盖 idempotency、recent-MFA、legacy/new checkout、server-side filters 与高风险写 fail-closed；DB 级 `t33` 直接证明非 legacy Offer Checkout snapshot/idempotency。

## 退出条件

DB + API + OpenAPI/contracts/breaking 全绿，legacy Consumer contract 无破坏；若 Edge Function 改动，同步 staging 并验证后进入 Phase 03。

## 完成证据（2026-10-12）

- Local fresh migration：`pnpm db:reset --yes` PASS；Phase 02 migration 与 staging history 对齐为 `20261012145252_commercial_operations_api_contract.sql`。
- DB：`pnpm test:db` = **73 files / 1536 tests PASS**；新增 `t33_commercial_operations_api.sql` 21 assertions 覆盖 7-day 非 legacy Offer、Price/Mapping readiness、服务端定价、Checkout immutable snapshot 与 Idempotency-Key replay。
- API：`pnpm test:api` = **111/111 PASS**；Offer catalog/checkout、Admin commerce filters、recent-MFA 边界均覆盖。
- Contract：Account/Admin OpenAPI = **47 / 77 operations**；`contracts:check`、Consumer Lab snapshot/compatibility、`contracts:breaking` 全 PASS。Checkout response 以 additive union 保留完整 legacy schema，而非把旧 `product_code` 直接改 nullable；breaking checker 增加“旧 response 分支必须完整保留”自动测试。
- Static：`test:tooling` 9/9、`typecheck`、`lint`（0 warning / 0 error）、`format:check`、`git diff --check` PASS。
- Staging：`workendstaging / egsokuicabbxspkdccqe` 已应用 `20261012145252 commercial_operations_api_contract`；SQL 核验 Offer catalog、Checkout v2、Admin Offer、Campaign v3、catalog constraint 与 Mapping current index 均存在；`account-api` 从 v61 部署到 **v62 ACTIVE**，保持 `verify_jwt=false`（路由内部继续执行 Platform Key/Auth/Admin 安全边界）。Production **NOT_RUN**。
- Supabase advisor：Security 仅报告既有 `pg_net` public schema 与 leaked-password protection 配置 WARN；未出现 OPT-010 新 SECURITY finding。Performance 的 unused-index/unindexed-FK 为全项目 INFO，其中新 commerce indexes 在刚部署 staging 尚无使用统计，留待真实流量与 Phase 04 复核。
