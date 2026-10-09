# Aisenhubplatform

面向多个自营平台的统一身份、平台账户、订阅权益、兑换码和配置文件后端。

仓库包含 Next.js 管理控制台、Supabase Account/Admin API、PostgreSQL 领域过程、文件维护任务、canonical OpenAPI contracts，以及 test-only Consumer Conformance Harness。

- [文档导航](docs/README.md)
- [系统架构](docs/architecture/overview.md)
- [本地开发](docs/guides/development.md)
- [测试入口](docs/guides/testing.md)
- [配置参考](docs/reference/configuration.md)
- [Agent 工作规则](AGENTS.md)

在具备仓库要求的工具后，执行 `pnpm install --frozen-lockfile --store-dir E:\AppData\pnpm`。管理端可用 `pnpm --filter admin dev --port 3000` 启动；Consumer 接入协议可用 `pnpm test:consumer-harness` 与 `pnpm test:e2e:consumer-harness` 验证。中央 API、本地 Supabase 与配置见本地开发指南。

`tests/consumer-harness` 只用于本地协议/安全 conformance，不是 starter、产品 UI 或生产部署单元。维护者可在 Admin `/admin/consumer-lab` 查看 canonical contract 摘要；生产部署与外部调度不由本地构建自动完成。
