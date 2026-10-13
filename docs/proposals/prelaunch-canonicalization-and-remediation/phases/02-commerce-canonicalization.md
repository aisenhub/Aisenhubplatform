# 阶段 02：Commerce 单轨化与高风险写修复

状态：本地已完成 / 待 Git checkpoint

前置：阶段 01 contract 已冻结。

覆盖：LC-01、LC-02、LC-03、LC-04、LC-06、LC-07、LC-12；R-02、R-03、R-04、R-08、R-09、R-10。

## 目标数据模型

1. 删除 `public.subscription_products` 及其 guard/list/seed。
2. 删除 Offer `legacy_product_code` 与相关 unique index/bootstrap。
3. Provider Mapping 删除 `subscription_product_id` 业务 target；`commercial_price_id` 必须成为唯一 catalog target。
4. Checkout intent 删除 legacy `product_code/subscription_product_id` 依赖；新 Checkout 必须拥有 Offer/Price attribution。
5. `platform_subscription_config` 不再表达 fixed products：
   - 删除 single `paid_plan_id`；
   - 删除 monthly/yearly/lifetime enabled；
   - `purchases_paused` 若保留，迁移为清晰的 Commerce policy；
   - copy 若保留，放入明确 presentation config。
6. Redemption batch 删除 product_code/model-v2 专用字段和创建路径；保留 Offer 或 Admin-defined Plan+duration。
7. 删除无职责的 `billing_lifetime_purchase_guard`。

## R-02 Plan lifecycle

不要修补旧 `admin_plan_upsert` 旁路。实现一个 canonical Plan command 边界：

- create/update metadata 与 lifecycle action 分离；
- archive 前检查 active Offer；
- archive/改变会影响解释的字段前检查 current/future Grant；
- 已有 Offer/Grant 时禁止改变 Plan kind 等语义身份字段；
- Admin API/UI 只调用 canonical command；删除旧 write function/grant。

## R-03 Mapping atomic switch

提供单事务 command，例如语义 `switch_current_mapping(price_id, target_mapping_id, expected_current_id?, operation_id, reason)`：

1. 锁定 commercial Price 或统一 Provider+Price scope；
2. 校验 target mapping scope/verified 状态；
3. disable 原 current；
4. publish/enable target；
5. 同事务 Audit；
6. 失败整体 rollback，不产生 no-mapping 中间窗口。

## R-04 高风险 operation idempotency

Offer activate/archive、Price publish/retire、Mapping switch 必须复用真实 idempotency 模式：

- operation scope + operation_id + request_hash 唯一；
- first caller claim；
- same id/same hash completed → replay stored result；
- same id/different hash → idempotency_conflict；
- in-progress → operation_in_progress；
- transaction 内写业务事实 + audit + finalize。

UI unknown outcome 必须保留同一个 operation id 重查/安全 replay，不能自动生成新 ID。

## R-08/R-09 并发

- Price version：在 Offer scope 上 `FOR UPDATE` 锁 Offer 后分配 `max(version)+1`，或使用等价的 scope counter；不能裸读 max。
- Mapping version：锁 Provider+Price 的稳定 parent/scope 后分配版本。
- Price publish：锁 Offer 作为所有 draft Price 的共同互斥资源，再 retire old + activate target；并发 publish 结果必须是确定的序列化业务结果，而非 raw unique violation。
- 测试必须启动两个真实并发事务，不以串行 pgTAP 模拟替代。

## R-10 Price retire

实现独立 retire command：

- recent-MFA + reason + operation id；
- lock Offer/Price；
- draft/retired/active transition matrix 明确；
- retire 当前 active Price 后 Offer purchase readiness 明确变为 price_unavailable；
- 不删除历史 Price。

## 验收测试

至少覆盖：

- fixed-product 表/列/function 不存在；
- product_code Checkout 被拒绝/不在合同；
- Offer checkout 正常，价格完全服务端决定；
- Plan archive active Offer/Grant preflight；
- Mapping replacement 无窗口且 rollback 安全；
- same operation id replay；different hash conflict；
- Price/Mapping concurrent create；two-draft concurrent publish；
- independent Price retire；
- retired compatibility function 无 executor grant。
