# Authorization and Entitlement

Auth、Platform Account 与业务授权是三层不同事实。

目标平台 protected business route 应在服务端读取中央 entitlement/subscription，并至少要求：

```text
effective_status == active
required_feature == true
```

中央不可用、timeout、invalid payload、unknown status 一律 fail closed，例如映射为目标平台自己的 `AUTHORIZATION_UNAVAILABLE`。

不要：

- 仅靠前端隐藏按钮做授权；
- 把目录里的 Plan/Offer 当当前用户授权；
- 自行根据付款 query 参数授予功能；
- 在中央失败时默认 Free 或沿用过期 entitlement；
- 把 feature entitlement 当目标平台资源 ownership。

目标平台仍需对 project/job/document 等自身资源做独立 ownership/ACL 校验。
