# 阶段 02：API / Contract / Checkout Compatibility

状态：Not Started

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

在 legacy Consumer 不破坏的前提下开放 Offer-aware catalog/checkout，并为 Admin 商业目录、摘要、权益用户与 Campaign 提供稳定 API/OpenAPI。

## 任务

- [ ] API-001：Account `GET /v1/commerce/offers`，Additive DTO 与 fail-closed purchase readiness。
- [ ] API-002：Checkout 支持 `offer_id XOR product_code`，服务端价格/Plan/term/Mapping snapshot，不允许客户端金额。
- [ ] API-003：legacy `/v1/subscription/products` 与 `{product_code}` Checkout 解析到 bootstrap Offer，保持旧样例/消费者通过。
- [ ] API-004：Admin Offer/Price CRUD/publish/archive + Provider Mapping 读写安全边界。
- [ ] API-005：Admin commerce summary / entitlement list / Campaign v2/detail。
- [ ] API-006：权益治理复用现有 command，必要时补 read DTO attribution；不创建第二套 mutation。
- [ ] CONTRACT-001：Account/Admin OpenAPI additive 更新、旧描述漂移修复、Consumer Lab/compatibility/breaking PASS。
- [ ] TEST-001：API unit 覆盖 idempotency、recent-MFA、unknown outcome、legacy/new checkout、IDOR、金额/隐私 fail-closed。

## 退出条件

DB + API + OpenAPI/contracts/breaking 全绿，legacy Consumer contract 无破坏；若 Edge Function 改动，同步 staging 并验证后进入 Phase 03。
