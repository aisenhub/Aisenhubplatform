# 测试

命令以[根 package.json](../../package.json)为准；下表说明入口做什么，不记录历史运行结果。

## 环境约定

Staging默认保留数据，不随部署重置；测试按独立批次隔离并受控清理，旧数据升级和空库安装分别验证。全库重建必须单独明确授权，数据分类及清理检查见[开发流程第5.2节](development-release-workflow.md#52-staging数据保留批次清理与重建)。

项目采用Local本机Supabase Docker、独立Hosted Staging、独立Hosted Production。按[Agent 开发与发布流程](development-release-workflow.md)分级：R0无需应用部署，R1可记录理由后跳过Staging，R2/R3必须Hosted验收；所有实际生产部署均有对应生产前门槛。生产数据不得作为Local或日常Staging fixture，环境是否已配置以实际证据为准。

| 命令 | 范围与条件 |
| --- | --- |
| pnpm docs:check | 文档必需入口、相对链接与导航可达性 |
| pnpm contracts:check | OpenAPI 引用、操作、样例与二进制合同 |
| pnpm format:check / pnpm lint | 格式和静态 lint |
| pnpm typecheck / pnpm build | 类型与构建；前置 SDK 打包 |
| pnpm test:unit | Turbo 调用 workspace 单元测试 |
| pnpm test:upload | 本地有界上传读取器探针 |
| pnpm runtime:probe | Node 与 Deno 共享导入边界 |
| pnpm test:db | 本地 Supabase pgTAP，需要数据库服务 |
| pnpm test:maintenance | Deno worker 测试；命令含 Windows 固定 Deno 路径 |
| pnpm test:api | 聚合运行 Account API、Maintenance、Billing Webhook 与 Provider 适配层的隔离 Deno 测试 |
| pnpm test:e2e | 调用 tests/spikes/e2e/t16-r2-account.mjs，需要本地服务和浏览器条件 |
| pnpm test:ops:m6-02-local | 本地备份模拟，操作本地夹具与临时产物 |

## 定向验证

数据库用例位于 [supabase/tests](../../supabase/tests)，涵盖角色负向授权、平台账户、权益、文件预算、租约、删除和备份协议。API 与浏览器脚本位于 [tests/spikes](../../tests/spikes)。根命令中的任务编号是现有脚本名称，不能用其名称推断覆盖已成立。

中央 API 的隔离 Deno 测试为 [index.test.ts](../../supabase/functions/account-api/index.test.ts)，Storage 与上传读取器测试位于 [共享目录](../../supabase/functions/_shared)。

参考应用页面与 registry/templates.json 的路由定义存在差异；Consumer/Registry/E2E 脚本是否适用于当前页面必须由执行结果判定，不能复用其他页面版本的成功结论。

## 结果解释

CI 运行全仓格式、lint、typecheck、build、单元测试、中央 Edge/API 隔离测试、运行时导入和文档合同检查，不运行整个 SQL/API/浏览器/Hosted 验证矩阵。Local完成逻辑、SQL和定向验证；R2/R3还须在Hosted Staging验证实际部署链路，不能将本地reset/清理脚本直接改URL指向远程。Production在获授权后做受控部署与观察，不承担破坏性回归。

测试结果在任务回复或测试平台报告中说明环境、版本、命令、断言与限制，仅使用PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED；不适用另写范围和理由。Local、CI、Hosted Staging、Provider与生产观察分别记录。隔离mock不代表真实Auth、Storage或生产恢复成功，历史PASS不能代替当前版本验收。
