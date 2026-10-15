# Account, Profile and Lifecycle

## Principal 与 Activation

推荐顺序：

1. Auth session 成功。
2. `GET /v1/account/principal`。
3. 若 reason 为 `not_activated` 且产品允许，调用 `POST /v1/account/activate`。
4. 只有得到允许的 Platform Principal 后再访问账户能力。

不要从请求 body 接受 platform/account ownership 字段替代中央 Principal。

## Profile / Preferences

Profile 与 Preferences 是可选能力。PATCH 按 canonical contract 使用 `If-Match`；冲突时重新 GET 并让上层决定如何合并，不做 last-write-wins 猜测。

## Lifecycle

平台账户 close 与 Global Identity delete 是不同操作。需要 recent-auth 的操作先按合同取得证明；敏感 mutation 不自动 replay。

Global Identity 生命周期是中央共享身份治理能力，不代表各个平台的业务数据合并。
