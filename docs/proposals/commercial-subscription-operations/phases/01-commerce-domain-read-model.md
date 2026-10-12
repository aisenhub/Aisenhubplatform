# 阶段 01：Commerce Domain / Read Model

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

建立 additive Offer/immutable Price 商业目录与 legacy bootstrap，并提供后续 API/UI 所需的权威经营、权益用户、Redemption Campaign 读模型。

## 任务

- [x] DOM-001：新增 `platform_commercial_offers` / `platform_commercial_prices`、RLS、约束、索引与不可变 guard。
- [x] DOM-002：bootstrap 当前 platform paid_plan + monthly/yearly/lifetime 为 legacy Offers/Price v1，保证 non-empty 数据可升级。
- [x] DOM-003：Provider Mapping / Checkout additive Offer/Price attribution 与历史 snapshot 兼容字段。
- [x] READ-001：Commerce summary 有界时间范围、可核实成交/退款/净额、有效 paid entitlement、来源/即将到期统计。
- [x] READ-002：平台权益账户 stable cursor/filter，并按 winning grant 返回 source/attribution。
- [x] READ-003：Redemption Campaign v2 stable cursor/filter/stats + masked code detail。
- [x] SEC-001：security-definer 固定 search_path、最小 grant、cross-platform IDOR、direct table denial。
- [x] TEST-001：pgTAP 覆盖 legacy bootstrap、多 Paid Plan、Price immutability、金额口径、source、Campaign 统计/隐私。
- [x] TEST-002：fresh + non-empty upgrade，旧 fixed-product/provider/checkout/order/grant/redemption 事实保持。

## 完成证据

- fresh：`pnpm db:reset --yes` PASS；完整 DB `72 files / 1515 tests` PASS。
- non-empty：从 `20261012094715` 建立 legacy paid plan/provider/checkout/order/grant/redemption fixture 后前向应用三条 OPT-010 migration；bootstrap 得到 3 个 legacy Offer + 3 个 Price，旧订单金额、Grant source 与 Redemption Batch 状态保持不变，历史 Checkout/Batch 不伪造 Offer/Price attribution。
- canonical：`pnpm verify:task:0801 --reuse-local` 最终 `20/20 gates` PASS；API `107/107`、DB `72/1515`、contracts/browser/docs 全绿。
- staging：已授权 `workendstaging / egsokuicabbxspkdccqe` 已对齐 `20261012114256`、`20261012123209`、`20261012131422`；只读核验 Offer/Price、Commerce Summary、Entitlement list、Campaign v2 与 Checkout Price FK index 均存在。
- Production：NOT_RUN。

## 退出条件

数据库 fresh/non-empty 全绿，读模型与权限边界稳定，且 legacy purchase facts 无漂移后进入 Phase 02。需要远端 migration 时，Phase 01 结束前同步 staging 并核对。
