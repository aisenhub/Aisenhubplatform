# 爱发电 Checkout 链接分析参考

> 分析日期：2026-09-11
>
> 记录性质：对用户提供的一条实际爱发电 Checkout 链接进行结构分析，作为 Provider 联调前的实现参考和备用灵感。本文不是 Echi 或其他平台的源码审计，也不证明该平台的 Webhook 已经成功绑定或自动授权。
>
> 安全边界：不重复保存完整可复用支付链接、真实 Token、Webhook URL、真实用户账号或订单详情。下面只保留参数结构和脱敏值。

## 1. 观察到的链接结构

用户提供的链接结构为：

```text
https://afdian.com/order/create
  ?product_type=1
  &plan_id=<afdian-plan-id>
  &sku=<URL-encoded JSON SKU list>
  &custom_order_id=O20260911<redacted>
```

观察结果：

| 参数 | 观察到的用途 | 当前判断 |
|---|---|---|
| `product_type=1` | 指示爱发电商品类型 | Provider 商品事实，需用真实账号核对含义 |
| `plan_id` | 指向爱发电档位/方案 | Provider 商品标识 |
| `sku` | URL 编码的 SKU JSON，包含 `sku_id` 和 `count` | Provider 商品明细 |
| `custom_order_id` | `O20260911...` 形式的外部关联值 | 很可能是发起方生成的本地订单号或不透明关联号 |
| `remark` | URL 中未出现 | 本链接不是通过 `remark` 传递本地订单号 |
| `return_url` / `callback_url` | URL 中未出现 | 不能从链接证明浏览器返回地址由该参数控制 |

该链接的 Host 和路径是爱发电官方 Checkout：`afdian.com/order/create`。因此实际支付界面由爱发电提供；外部平台可以在跳转前生成链接并预填商品、SKU 和关联参数。

## 2. 已确认与未确认的边界

### 2.1 已确认：关联参数被放入支付请求

`custom_order_id` 已经出现在爱发电的订单创建 URL 中。爱发电 Checkout 前端的订单创建请求包含该字段，官方开发者资料也将其定义为可由前端支付链接传入的自定义订单信息。

这至少证明了以下入站链路是可行的：

```text
外部平台生成 custom_order_id
    ↓
拼接到 afdian.com/order/create URL
    ↓
爱发电 Checkout 读取并提交 custom_order_id
```

这条观察不能证明已经完成真实下单，因为本次没有点击付款、没有创建真实订单，也没有使用任何真实 Token 调用 Provider API。

### 2.2 未确认：Webhook 和 query-order 是否原样回传

仅凭浏览器 URL 不能确认下面两条回程链路：

```text
爱发电订单
    ├─ Webhook.data.order.custom_order_id
    └─ query-order 返回的订单.custom_order_id
```

用户此前提供的 Webhook 调试样例没有 `custom_order_id`。因此当前仍必须把 Provider round-trip 能力标记为 `NOT_RUN`，不能把 URL 中出现参数解释为回调已经成功回传。

### 2.3 未确认：是否使用了 API 二次确认

页面和链接无法证明外部平台的服务端是否在 Webhook 后调用 `query-order`。实际实现可能是：

```text
Webhook → custom_order_id 找本地订单 → 直接授权
```

也可能是更稳妥的：

```text
Webhook → 持久化 Inbox
       → query-order(out_trade_no)
       → 校验状态、金额、商品和关联值
       → 原子结算本地订单
       → 授权权益
```

后一种才符合本项目的 Provider 双通道设计。

## 3. 对页面和账号登录文案的判断

该页面使用爱发电 Host、爱发电 Checkout 路径和爱发电支付字段。页面中的“登录账号（发电记录会绑定该账号）”属于爱发电 Checkout 的支付账号语义，不能据此认定登录的是外部业务平台账号。

外部平台账号如果要参与归属绑定，应在跳转前由外部平台自己的登录态创建 `checkout_intent`，并把本地订单与 `custom_order_id` 保存到服务端。爱发电账号的 `user_id` 只有在另行完成 OAuth 或身份绑定后，才能作为外部平台身份映射依据；不能直接当作外部平台账号。

## 4. 对本项目架构的映射

这条链接可以作为下面流程的参考样本：

```text
已认证平台账号
    ↓
billing_checkout_intent
    ├─ platform_account_id
    ├─ plan / product 快照
    ├─ expected_amount
    └─ custom_order_id digest
    ↓
生成爱发电 Checkout URL
    ├─ plan_id
    ├─ sku
    └─ 带版本的不可猜 HMAC custom_order_id
    ↓
爱发电标准 Checkout
    ↓
Webhook：实时发现信号
    ↓
Inbox + 可恢复处理任务
    ↓
query-order：Provider 权威确认
    ↓
billing_order：本地支付事实
    ↓
统一 entitlement_apply：授予权益
```

本链接中的 `O20260911...` 看起来是外部生成的订单关联值，但不能证明它使用了本项目规定的 `AC_<key_version>_<HMAC>` 形式。项目实现仍应遵守架构决策：平台和账号信息不得明文或 Base64 放入外部参数；数据库保存 Token digest，不把完整 Token 写入日志、审计或普通缓存。

`out_trade_no` 只用于 Provider 订单唯一性、幂等和精确查询；Provider `user_id` 只代表 Provider 身份；`plan_id`、SKU、购买月数和金额只用于订单合同验证。

## 5. “返回原平台后确认支付”的参考含义

浏览器回到外部平台、用户点击“确认支付”与 Webhook 不是同一个可信来源：

```text
浏览器返回
    ↓
外部平台读取本地 Checkout 状态
    ↓
必要时触发受限的 query-order 对账
```

“确认支付”可以作为 Webhook 延迟时的主动检查入口，也可以只读取已经被 Webhook 更新的本地状态。它不能由前端直接把订单改成已支付，更不能仅凭返回页面或用户点击授权权益。

如果 Webhook 已到达，按钮应返回本地 `paid`、`verified` 或 `granted` 状态；如果 Webhook 尚未到达，服务端可以创建或唤醒一次对账任务；如果 Provider 仍未确认，应继续显示 `pending`，等待 Webhook 或后台对账。

## 6. 可借鉴的最小实现

```text
POST /webhooks/afdian
  1. 校验 method、content-type 和 body 大小
  2. 提取 out_trade_no 与 custom_order_id 等最小线索
  3. 持久化 webhook inbox 和处理任务
  4. 持久化成功后返回 {"ec":200}

Worker
  1. 按 out_trade_no 去重并获取 lease
  2. 使用 Provider API query-order 查询权威订单
  3. 校验 Provider Account、status=2、金额、商品、SKU、月数和 Token 关联
  4. billing_order 使用唯一约束/CAS 从 pending 结算一次
  5. 通过统一权益过程写 Grant/Event/Projection
  6. 失败分类、退避重试或转人工处理
```

不得采用下面的弱化流程：

```text
收到 Webhook
  → 信任未经验证的 user_id 或 custom_order_id
  → 直接增加订阅/积分
```

如果 Webhook 或 `query-order` 没有返回可关联的 `custom_order_id`，订单必须保存为 `unlinked` 或 `review_required`，不应猜测平台用户，也不应自动授予权益。

## 7. Provider 联调验收清单

真实 Provider 测试完成前，以下状态保持 `NOT_RUN`：

| 验证项 | 证据要求 | 状态 |
|---|---|---|
| URL 参数被 Checkout 接受 | 记录脱敏 URL、页面可打开；不等同于已付款 | 观察到，未完成真实下单 |
| Webhook 回传 `custom_order_id` | 原始 body 脱敏后与生成值逐字比较 | `NOT_RUN` |
| `query-order` 回传 `custom_order_id` | 使用 `out_trade_no` 精确查询并比较 | `NOT_RUN` |
| Webhook 与 query-order 字段一致性 | 比较订单号、商品、金额、状态和关联值 | `NOT_RUN` |
| 重复 Webhook 幂等 | 同一通知重复投递，不产生第二次权益效果 | `NOT_RUN` |
| 返回页面/确认按钮竞态 | 确认按钮早于、晚于 Webhook 都得到正确状态 | `NOT_RUN` |
| 关联失败保护 | 缺少关联值时进入 `unlinked/review_required`，无 Grant | `NOT_RUN` |

通过条件：真实测试记录 Webhook 和 `query-order` 均能回传可关联值，并且订单合同验证、幂等结算和失败恢复测试全部通过。真实测试证据应写入 [`verification-record.md`](verification-record.md) 的 G-PROVIDER 表。

## 8. 参考来源

- [爱发电官方开发者 API 与 Webhook 文档](https://guide.afdian.com/creator/developer)
- [爱发电开发者功能汇总：Webhook、API、OAuth2](https://afdian.com/p/010ff078177211eca44f52540025c377)
- [AfdianPay：通过 URL Builder 设置 custom_order_id 的公开示例](https://github.com/suzhelan/AfdianPay)
- [Cloudreve-V4-AfdianPay：本地订单、Webhook、query-order 和重试的公开示例](https://github.com/yukaidi1220/Cloudreve-V4-AfdianPay)

这些公开资料仅用于理解实现思路，不能替代当前开发者账户的 Provider 联调证据。
