# Account API v1 Contract Changelog

## 2026-10-14 预上线 rebaseline

- 删除未发布的旧商品/Checkout/config-files 合同，冻结 canonical Offer/Config Version 模型。
- Admin 增加 query-bound UTF-8 平台游标；所有消费者同批更新。
- 后续 v1 变更继续执行严格 wire compatibility。

## 1.0.1

- 补齐服务端已存在的 `SubscriptionProduct.reason = purchases_paused`，修正 canonical OpenAPI 与领域输出的历史漂移；不改变运行时 wire 行为。
- `contracts:check` 同步校验中央 Domain 的商品 reason 集合，避免同类 enum 漂移再次静默通过。

## 1.0.0

- 建立当前 `/v1` Account API 的 canonical OpenAPI baseline。
- 合同内容从 `docs/reference/contracts/account.openapi.json` 原样迁入根 `contracts/account/v1/openapi.json`；本次路径迁移不改变 wire 行为。
- 冻结 backward-compatible、expand-first 治理规则。
