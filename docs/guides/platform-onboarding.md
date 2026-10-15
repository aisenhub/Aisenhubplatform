# 新平台接入手册（兼容入口）

当前新平台接入资料已经从单一 docs 手册迁移到仓库根 [`platform-integration`](../../platform-integration/README.md)。本文件只保留历史链接兼容，不再维护第二套接入事实。

## 当前入口

- 开发者：[`platform-integration/README.md`](../../platform-integration/README.md)
- AI Agent：[`platform-integration/AGENTS.md`](../../platform-integration/AGENTS.md)
- 机器可读 manifest：[`platform-integration/manifest.json`](../../platform-integration/manifest.json)
- Capability 索引：[`platform-integration/ai/capabilities.json`](../../platform-integration/ai/capabilities.json)
- Canonical Account OpenAPI：[`contracts/account/v1/openapi.json`](../../contracts/account/v1/openapi.json)
- Conformance：[`platform-integration/conformance/README.md`](../../platform-integration/conformance/README.md)

新平台仍采用 **Contract-First HTTP + 平台自有 Auth/BFF**。Consumer 不安装 AisenHub runtime SDK；Platform Key 只在可信服务端；浏览器只调用同源 BFF；中央不可用或授权不确定时 fail closed。

历史文档或 Proposal 可以继续链接本路径；新代码、新 Agent 指令和新的接入文档应直接引用 `platform-integration/`。
