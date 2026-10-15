# 本地 Registry

`manifest.json` 保存工具链、HTTP contract、`platform-integration` 与本地 conformance surface 元数据。Registry 不维护页面模板清单，也不是已发布的 npm、starter 分发或生产 Registry。

Account/Admin 的公共集成边界以根目录 `contracts/*/v1/openapi.json` 为准；Registry 记录 Platform Integration Package 与 Consumer Harness 当前验收的 contract major，不分发 Account runtime package。

开发者和 AI Agent 从 [`platform-integration`](../platform-integration/README.md) 获取接入步骤、capability 映射和 Conformance 入口；协议兼容证据来自 `tests/consumer-harness` 及其 Local E2E。Harness 是 test-only conformance fixture，不是可复制的一键产品模板。
