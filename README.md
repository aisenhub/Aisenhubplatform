# Aisenhubplatform

面向多个自营平台的统一身份、平台账户、订阅权益、兑换码与配置文件后端。

当前阶段：已有工程、数据库基础、部分账户链路及M3权益兑换的Local交付；T12/T16/T17仍部分完成，M4～M6尚未实施。DP2已校准进度并细化首批收尾、M4及后续路线，见[实际进度](docs/development/status.md)。历史本地测试通过不代表完整托管或生产验收。

## 阅读入口

- [架构基线](docs/architecture.md)：范围、边界和实现顺序。
- [开发规划](docs/development/README.md)：总计划、模块规格、首批任务与实际进度。
- [DP2后续路线](docs/development/roadmap-dp2.md)：首批收尾、M4文件与任务、M5成品及M6运行发布门槛。
- [审核问题闭环](docs/review-v1.2.md)：审核意见与设计修订对照。
- [上游来源](docs/upstream-sources.md)：官方依据及待核验依赖。
- [Agent工作规则](AGENTS.md)：任务边界、安装路径、验证及提交约定。

主基座：Makerkit Lite；后端：Supabase；Admin：Next.js；产品接入：Auth SDK、Next.js适配器、Server SDK与源码模板。

V1仅服务统一运营的自营平台，不包含支付、组织/团队、第三方平台接入或跨域SSO。

## 仓库与进度

远端：[aisenhub/Aisenhubplatform](https://github.com/aisenhub/Aisenhubplatform)。按可验证阶段提交和推送；生产发布是独立流程，推送文档不部署任何服务。

依赖版本、运行和测试命令由 M0 任务固定；在仓库根目录执行：

- `pnpm install --frozen-lockfile`：按锁文件安装依赖。
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`：执行质量检查和两个应用构建；不部署服务。
- `pnpm test:unit`：执行已有 Vitest 用例和领域合同用例。
- `pnpm test:upload`：执行本地受控上传边界探针；不会写入 Storage。
- `pnpm runtime:probe`：让 Node 与 Deno 导入同一份 Edge 共享边界。
- `pnpm docs:check`：检查文档相对链接、任务依赖无环和验证用例 ID。
- `pnpm db:start|db:stop|db:reset`：仅操作根 `supabase/` 的本地配置；发现远程 URL 或 project ref 会拒绝执行。
- `pnpm test:db`：调用固定 Supabase CLI 的本地 pgTAP 命令，运行 `supabase/tests` 下的数据库测试集。
- `pnpm test:api`、`pnpm test:e2e`：当前明确返回 `NOT_RUN`；T16-R2将已有探针与真实Local夹具接入，并补SQL/API/浏览器CI。

历史文档位于 `docs/archive`，只作追溯。
