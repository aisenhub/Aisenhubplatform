# 数据库到 Registry 的消费者兼容清单

本清单是 TASK-0103 的可执行合同索引，覆盖数据库领域入口、Account API、OpenAPI、Account SDK、Consumer BFF/UI、Admin BFF/UI、Registry 及测试责任。机器可读源文件为 [contract-consumers.json](contract-consumers.json)，不要只修改表格而不更新源文件。

## 维护规则

- 数据库返回字段先由 Edge DTO 归一化，再由 OpenAPI 和 Domain DTO 定义公共形状；Consumer 不复制金额、期限、权益或授权算法。
- 新增、删除或改名字段必须同时更新 JSON 清单中的 producer、edge、OpenAPI、每个 consumer 和 test owner。
- 兼容发布采用 expand-first：旧字段继续存在，新增字段先可选或以同一 `/v1` 合同安全读取；未验证旧 Consumer 前不得删除字段或改变 `/v1/plans`、`/v1/subscription/products` 语义。
- `pnpm contracts:check` 同时执行 OpenAPI 检查和清单检查；清单检查只证明静态映射完整，不代替本地 API、浏览器或 Provider 验证。

## 当前映射

| 合同 | 唯一生产者/Edge | 主要 Consumer | 失败与恢复责任 |
| --- | --- | --- | --- |
| 商品目录 `SubscriptionProduct` | `subscription_products_list` → `subscriptionProductDto` | Account SDK、Consumer BFF、订阅页、Registry | Domain DTO 拒绝金额/期限/原因不合法的响应；Account API 无 Bearer 仍需 Platform Key；SDK 保持 no-store |
| 结账快照 `SubscriptionCheckoutData` | `subscription_checkout_create` → `subscriptionCheckoutDto` | Account SDK、Consumer BFF、订阅页 | 服务端定价和 Idempotency-Key；页面只保存 checkout_id 并轮询服务端状态，不根据本地状态授予权益 |
| 权益投影 `Entitlement` | `entitlement_read` → `entitlementDto` | Account SDK、Consumer BFF、订阅页 | `none` 保留 NULL/空 features 语义；页面只展示服务端状态，暂停不得被前端判断为可用 |
| Admin 账单证据 | `admin_billing_order_read_v2/v3` → Account API | Admin BFF、中央 Billing 页面 | Webhook 签名、Job 租约、重试预算和审计时间线分开呈现；hash/owner 只返回脱敏摘要 |

字段级消费者、测试负责人和 OpenAPI schema 指针以 JSON 清单为准。当前清单已覆盖公共商品目录、结账快照、权益投影及 Admin Billing 诊断新增字段；Provider 真实联调、Staging、Production、浏览器 E2E 仍需各自环境授权。
