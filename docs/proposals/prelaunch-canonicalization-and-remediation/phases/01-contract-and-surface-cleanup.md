# 阶段 01：Contract / Harness / URL Surface 清理

状态：未开始

前置：阶段 00。

## 目标

先让公共合同只描述最终目标，后续数据库和实现按该 contract 收敛，不再以旧 OpenAPI/Consumer Harness 阻止删除。

## Account Contract

1. 删除 `GET /v1/subscription/products`。
2. `POST /v1/subscription/checkout` request 只允许 `offer_id`，删除 `product_code` variant。
3. Checkout response 删除 legacy response branch；`offer_id/offer_code/price_version/plan` 成为唯一商业 attribution。
4. `CommerceOffer` 删除 `legacy_product_code`。
5. 删除 Consumer `/v1/config-files...` 六个 operation；保留 `/v1/configs...`、Version content 与 Gallery。
6. Redemption code contract 与 canonical 31 字符策略对齐。
7. 更新 Domain DTO 与 runtime validation 类型，删除 `SubscriptionCheckoutStatus` 等只为旧 API 名称存在的 alias（若无其他语义用途）。

## Admin Contract

1. Subscription Config 删除 `paid_plan_id + monthly/yearly/lifetime_enabled` fixed-product 语义；若保留 `purchases_paused/copy`，改为 Commerce policy/presentation contract。
2. Redemption batch create 删除 `product_code` branch，只保留 Offer 或 Admin-defined Plan+duration。
3. legacy config-file CRUD/list/content 不再作为 Admin 公共产品 contract；替换为 Config Version scoped diagnostic contract（如果 UI 仍需要）。
4. 去除 retired URL/endpoint 描述。

## Harness / Registry / UI route

1. 更新 Consumer Harness canonical operation set。
2. 更新 Consumer Lab generated contract summaries。
3. 更新 Registry local manifest 对应 contract snapshot。
4. 删除 `/admin/operations`、`/admin/deletion-jobs` compatibility redirect 页面/helper/test。
5. 删除 `/admin/billing` duplicate page/alias，只保留 `/admin/billing/orders`。
6. 同步架构文档，删除“旧路由保持兼容”等表述。

## Breaking baseline

当前 `contracts:breaking` 预期会因主动删除旧 contract 而失败。实施 Agent必须：

1. 先记录 expected breaking diff；
2. 确认差异全部属于本 Proposal 删除清单；
3. 在阶段 07 建立新的正式 baseline；
4. 从新 baseline 起再次要求 `contracts:breaking` PASS。

## 验收

- OpenAPI 不再描述 fixed-product checkout、legacy config-files、旧 redemption product_code。
- Harness 不再要求已删除 operation。
- 没有 compatibility redirect/alias 页面。
- runtime 尚未完成收敛的部分允许暂时编译失败，只能在同一任务分支继续进入阶段 02/03，不能把阶段 01 独立发布到共享 staging。
