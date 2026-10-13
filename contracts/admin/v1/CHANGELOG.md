# Admin API v1 Contract Changelog

## 2026-10-14 预上线 rebaseline

- 删除未发布的旧商品/Checkout/config-files 合同，冻结 canonical Offer/Config Version 模型。
- Admin 增加 query-bound UTF-8 平台游标；所有消费者同批更新。
- 后续 v1 变更继续执行严格 wire compatibility。

## 1.0.0

- 建立当前 Admin API 的 canonical OpenAPI baseline。
- 合同内容从 `docs/reference/contracts/admin.openapi.json` 原样迁入根 `contracts/admin/v1/openapi.json`；本次路径迁移不改变 wire 行为。
- 冻结 backward-compatible、expand-first 治理规则。
