# Aisenhubplatform

面向多个自营平台的统一身份、平台账户、订阅权益、兑换码和配置文件后端。

仓库包含 Next.js 管理控制台、Supabase Account/Admin API、PostgreSQL 领域过程、文件维护任务、Auth/Server SDK，以及平台端本地参考页面。

- [文档导航](docs/README.md)
- [系统架构](docs/architecture/overview.md)
- [本地开发](docs/guides/development.md)
- [测试入口](docs/guides/testing.md)
- [配置参考](docs/reference/configuration.md)
- [Agent 工作规则](AGENTS.md)

在具备仓库要求的工具后，执行 `pnpm install --frozen-lockfile --store-dir E:\AppData\pnpm`，再执行 `pnpm --filter template-preview dev --port 3001` 查看参考页面。Admin 和中央 API 的配置与启动方式见本地开发指南。

平台端参考页使用演示状态与可选 Auth 操作；它不是完整普通用户业务应用。生产部署与外部调度不由本地构建自动完成。
