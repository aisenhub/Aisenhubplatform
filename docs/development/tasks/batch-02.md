# 第二批任务：M3 权益与兑换

依据[M3实施规格](../modules/M3-entitlements-redemption.md)、[公共合同](../contracts.md)和[订阅兑换合同](../../subscription-redemption.md)。本批只推进 M3；不把 M4 文件、支付、生产发布或未交付的中央 HTTP/Auth 设施混入实现。

## M3-01 — Plan、Ledger、Projection 与领域写入口

- 依赖：T10、T14；T16 的中央 HTTP 不是 SQL 本地实现前置条件。
- 交付：Plan 生命周期与默认 Free；不可变 Grant；有序 Subscription Event；Projection；统一 entitlement_apply；Admin grant/revoke/pause/resume；权限、RLS、复合 FK 和审计。
- 验收：V-ENT-01/02/03 的 Local SQL 子集、V-DB-03 M3 表、真实账户锁串行写入；不直接开放 Projection/Grant 表更新。
- 状态：DONE（本地数据库与真实事务探针已通过）。

## M3-02 — 兑换批次、码生成、原子兑换与 SDK/BFF 边界

- 依赖：M3-01、T15/T16 已交付的 server-only SDK 边界。
- 交付：pending_delivery→confirm→active 批次状态；只存 HMAC/mask；用户兑换；幂等；过期/禁用/已兑换拒绝；同码并发；服务端安全随机码生成；Account server SDK 和 Consumer BFF 转发边界。
- 验收：V-REDEEM-01～04 的 Local SQL 子集、双连接同码竞争、代码扫描和 SDK/BFF 单测。
- 状态：DONE（中央 HTTP 上游尚未交付，因此 BFF 的真实浏览器链路不宣称完成）。

## M3-03 — 中央 Account API、Admin 页面与 Consumer 兑换页面

- 依赖：T04 的近期证明失效协议、T16 中央 HTTP/Auth adapter 和真实登录链路。
- 交付：Admin plans/batches/subscriptions 动作路由与最小页面；Consumer subscription/redeem 页面；真实 Auth、CSRF、step-up、no-store 与审计全链路。
- 状态：DONE（Local）。中央 `account-api`、Admin/Consumer BFF 与页面、Password Auth 会话 Cookie、CSRF、AAL2/近期证明门槛和真实本地 API 探针已交付；托管环境部署、生产 Auth provider、logout 后已签发 JWT 的即时失效仍为 NOT_RUN/BLOCKED，不以 Local 结果冒充生产完成。
