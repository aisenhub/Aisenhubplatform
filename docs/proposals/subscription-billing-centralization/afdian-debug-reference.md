# Afdian 开发者调试参考（脱敏记录）

> 记录性质：用户在 Afdian 开发者控制台提供的调试信息，作为 BILL-01 Provider 合同核验输入。
>
> 安全边界：本文件不保存 API Token、完整 Secret、真实订单号、完整个人资料或可复用支付链接。用户消息中的 Token 不会写入仓库，也不会被本项目工具调用；由于该 Token 已出现在对话中，建议在 Afdian 控制台重新生成，并仅通过部署环境 Secret 配置。

## 1. 账户与文档

| 项目 | 记录 |
|---|---|
| Provider | Afdian / 爱发电 |
| Developer user_id | `4c111b10…1e7c00`（脱敏；完整值只在运行环境配置） |
| Dashboard | <https://ifdian.net/dashboard/dev> |
| Provider developer API/Webhook 文档 | <https://ifdian.net/p/9c65d9cc617011ed81c352540025c377> |
| Provider 功能汇总 | <https://ifdian.net/p/010ff078177211eca44f52540025c377> |
| 官方公开开发者文档 | <https://guide.afdian.com/creator/developer> |

运行环境变量建议使用 `AFDIAN_USER_ID` 和 `AFDIAN_API_TOKEN`。变量名可写入配置模板；真实值不得写入本目录、日志、测试 fixture、浏览器环境变量或提交历史。

## 2. 用户提供的控制台行为

- Afdian 提供 Webhook 被动通知和 API 主动查询两种方式。
- Dashboard 可以保存 Webhook URL，也可以点击“发送测试”立即发送测试数据。
- Webhook 接收端必须返回 JSON；至少需要 `{"ec":200}`，推荐 `{"ec":200,"em":""}`。非 JSON 或 `ec` 不为 200 会被视为失败。
- API 使用 Developer `user_id`、API Token、请求参数 JSON、秒级 `ts` 和 `sign`；Token 只参与签名，不应作为请求字段或日志内容发送。
- 本记录没有保存 Webhook URL，因为用户尚未提供项目的实际接收地址；也没有执行“保存”或“发送测试”。

## 3. 用户提供的 Webhook 调试样例（仅作字段 fixture）

以下值按用户消息中的公开调试样例记录为**合成测试数据**，不能当作真实生产订单：

```json
{
  "ec": 200,
  "em": "ok",
  "data": {
    "type": "order",
    "order": {
      "out_trade_no": "fixture-out-trade-no",
      "user_id": "fixture-afdian-user-id",
      "plan_id": "fixture-plan-id",
      "month": 1,
      "total_amount": "5.00",
      "show_amount": "5.00",
      "status": 2,
      "remark": "",
      "redeem_id": "",
      "product_type": 0,
      "discount": "0.00",
      "sku_detail": [],
      "address_person": "",
      "address_phone": "",
      "address_address": ""
    }
  }
}
```

样例中的订单字段包括 `out_trade_no`、Provider `user_id`、`plan_id`、`month`、`total_amount`、`show_amount`、`status`、`product_type`、折扣、SKU 和地址字段。

### 关键核验结论

用户提供的调试样例**没有 `custom_order_id`**。这意味着该样例本身不能把订单绑定到 Aisen 的 Supabase 用户或 `platform_account_id`。Provider 是否会在真实 Checkout 的 Webhook 或 `query-order(out_trade_no)` 结果中回传 `custom_order_id`，仍必须通过实际渠道测试确认。

在该能力未确认前：

1. Webhook 只能作为订单发现信号；
2. 必须调用 `query-order` 取得权威订单；
3. 无法关联 Checkout Intent 的成功订单只能保存为 `unlinked`；
4. `user_id`、`plan_id`、金额或备注不能被用来猜测 Aisen 用户；
5. 不得自动授予权益。

## 4. 对当前架构的直接影响

V1 自动到账的必要条件是：

```text
真实 Checkout
  → custom_order_id 写入支付请求
  → Webhook/query-order 原样回传
  → SHA-256(custom_order_id) 命中 checkout_intent
  → snapshot 验证通过
  → billing_order
  → entitlement_apply
```

`out_trade_no` 只用于 Provider 订单幂等和精确查询；Provider `user_id`/`user_private_id` 只代表 Provider 身份；`plan_id`/`month`/金额只用于订单合同验证。

如果真实 Provider 不回传 `custom_order_id`，必须在 V1 保持 `unlinked/no Grant`，或另行授权并设计外部身份绑定/订单认领。不能把本调试样例解释成已具备用户自动绑定能力。

## 5. BILL-01 必须完成的验证

使用明显虚构的本地 fixture 可以验证 JSON 解析、白名单字段、`status=2`、金额精度、PII 丢弃、幂等和 `{"ec":200}` 响应。

只有经过用户授权的真实 Provider 测试才能验证：

- Dashboard 保存 Webhook URL 后的实际投递；
- “发送测试”请求的真实 body 与重试行为；
- 真实 Checkout 的 `custom_order_id` 传递和回传；
- `query-order(out_trade_no)` 是否包含足够的关联字段；
- API 签名、时间窗口、分页、精确订单查询和限流；
- `plan_id/product_type/month/SKU` 与中央 Product mapping 的对应关系；
- 折扣、兑换码、零元订单和 `total_amount`/`show_amount` 规则。

真实测试结果必须写入 `verification-record.md` 的 G-PROVIDER 表，记录日期、脱敏结果、Provider 文档/控制台证据和是否允许启用自动授权。没有真实测试结果时状态保持 `NOT_RUN`。

## 6. 不得从本文件推断的内容

- 本文件不包含可用 Token、Webhook URL 或生产商品/订单配置；
- 本文件不证明 Provider 已支持 `custom_order_id` round-trip；
- 本文件不证明真实 Webhook 已发送成功；
- 本文件不证明 API 签名代码已在当前 Edge Runtime 通过；
- 本文件不授权修改 Afdian 商品、价格、Webhook 设置或发送真实支付测试。
