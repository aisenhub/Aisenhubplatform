# Afdian Provider 受控联调

适用：首次声明真实 Afdian 渠道已联调、Provider adapter/签名/Mapping 合同变化，或准备正式开启新购买。正常代码合并仍以 Local Mock/合同测试为门槛；本 Runbook 不把远程 Provider 变成日常开发必测项。

权威协议见 [`billing-settlement`](../../architecture/modules/billing-settlement.md)；Consumer 只接触 Checkout，不接触 Provider Secret。

## 前置授权

必须明确：使用沙箱/测试账号还是正式渠道受控测试、测试商品/Price/Mapping、回调环境、订单数量和金额上限、是否允许产生真实扣款、失败后的人工处置。未明确这些范围时停止在只读配置核对。

## 配置预检

- 目标 `Provider Account -> Commercial Price -> verified current Mapping` 与金额/币种/期限一致。
- `AFDIAN_USER_ID`、API token、Webhook public key 只核对目标环境已配置，不读取/记录值。
- Webhook URL 属于目标环境，非 loopback 必须 HTTPS；本地环境不得接收生产客户订单。
- Checkout / Webhook ingress / Background Processing / Auto Settlement 四个开关独立记录。

## 最小正向链

1. 从 Consumer/Account API 选择真实 Offer 创建 Checkout，保存 checkout id、custom order id、mapping version、price snapshot。
2. 打开 Provider payment link；只有授权允许时才完成受控付款。
3. 记录 Webhook event key/payload hash/signature status；ACK 仅表示进入可恢复边界。
4. Maintenance `query-order` 得到权威观察，Order 分别记录 provider / verification / linkage / entitlement / resolution。
5. Settlement 形成最终 decision；只有合法 linked/verified facts 才创建唯一 Billing-source Grant。
6. Consumer Checkout progress、Subscription 与 Admin Billing evidence 必须指向同一订单/Grant 事实。

## 必测反例

- duplicate Webhook 不重复 Grant；同 event key 不同 payload hash 进入 conflict 证据。
- 无效签名/必填字段、错误金额/币种/Plan/SKU/Mapping version 不授予。
- API 429/Retry-After、timeout、非 2xx、格式异常统一为 temporarily unavailable/retryable，不猜业务事实。
- Webhook 丢失时 reconciliation/query-order 能发现；迟到 paid 不因原 Checkout expiry 被降级。
- `unlinked paid` 稳定进入 manual review，保留资金事实但不自动 Grant。
- 响应丢失/未知 create 使用原 Idempotency-Key 恢复原 Checkout，不创建第二购买意图。
- refund/chargeback observation 与 Entitlement revoke 分离；当前产品不声称网站自动退款。

## PASS 与停止条件

PASS 要求 Provider facts、DB Order/Observation/Settlement/Job/Audit、Grant 和 Consumer/Admin 读模型可以按 ID 串联，且至少一个故障恢复用例成立。任何错误授予、重复 Grant、错误金额、跨环境回调或未知真实资金结果立即停止新购买/自动结算，先查询原订单，不盲目再付款/退款/Grant。
