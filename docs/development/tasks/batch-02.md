# 第二批任务：M3 权益与兑换

依据[M3实施规格](../modules/M3-entitlements-redemption.md)、[公共合同](../contracts.md)和[订阅兑换合同](../../subscription-redemption.md)。本批只推进 M3；不把 M4 文件、支付、生产发布或未交付的中央 HTTP/Auth 设施混入实现。

DP2校准：以下保留各项Local交付范围；中央API、Staging基础部署和logout旧JWT拒绝已有后续证据。完整G3子情景由[收尾M3-R1](closeout-01.md)核对，真实浏览器/Provider与托管门槛按T12/T16/T17收尾，不把下文阶段依赖理解为当前能力全部缺失。

## M3-01 — Plan、Ledger、Projection 与领域写入口

- 依赖：T10、T14；T16 的中央 HTTP 不是 SQL 本地实现前置条件。
- 交付：Plan 生命周期与默认 Free；不可变 Grant；有序 Subscription Event；Projection；统一 entitlement_apply；Admin grant/revoke/pause/resume；权限、RLS、复合 FK 和审计。
- 验收：V-ENT-01/02/03 的 Local SQL 子集、V-DB-03 M3 表、真实账户锁串行写入；不直接开放 Projection/Grant 表更新。
- 状态：DONE（本地数据库与真实事务探针已通过）。

## M3-02 — 兑换批次、码生成、原子兑换与 SDK/BFF 边界

- 依赖：M3-01、T15/T16 已交付的 server-only SDK 边界。
- 交付：pending_delivery→confirm→active 批次状态；只存 HMAC/mask；用户兑换；幂等；过期/禁用/已兑换拒绝；同码并发；服务端安全随机码生成；Account server SDK 和 Consumer BFF 转发边界。
- 验收：V-REDEEM-01～04 的 Local SQL 子集、双连接同码竞争、代码扫描和 SDK/BFF 单测。
- 状态：DONE（Local SQL/SDK/BFF边界）；中央HTTP随后由M3-03交付，真实浏览器链路仍待T16-R2，不以单测代替。

## M3-03 — 中央 Account API、Admin 页面与 Consumer 兑换页面

- 依赖：T04 的近期证明失效协议、T16 中央 HTTP/Auth adapter 和真实登录链路。
- 交付：Admin plans/batches/subscriptions 动作路由与最小页面；Consumer subscription/redeem 页面；真实 Auth、CSRF、step-up、no-store 与审计全链路。
- 状态：DONE（Local交付）。中央 `account-api`、Admin/Consumer BFF与最小页面、Password Auth Cookie、CSRF、AAL2/proof门槛及本地API探针已交付；后续T04/T17补logout拒绝和Staging基础部署/账户路径。完整G3矩阵、普通reauth、真实浏览器/Provider仍待收尾，不以Local结果冒充生产完成。
