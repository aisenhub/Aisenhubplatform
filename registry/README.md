# 本地 Registry

`manifest.json` 保存工具链、HTTP contract 与本地 conformance surface 元数据。Registry 不再维护页面模板清单，也不是已发布的 npm、starter 分发或生产 Registry。

Account/Admin 的公共集成边界以根目录 `contracts/*/v1/openapi.json` 为准；Registry 记录 Consumer Harness 与 Admin Consumer Lab 当前验收的 contract major，不分发 Account runtime package。

协议兼容证据来自 `tests/consumer-harness` 及其 Local E2E；维护者可在 Admin `/admin/consumer-lab` 查看 canonical contract 摘要。独立平台接入、环境配置、用户待办及验收见[新平台接入手册](../docs/guides/platform-onboarding.md)。Harness 是 test-only conformance fixture，不是可复制的一键产品模板。
