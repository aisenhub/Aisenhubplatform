# 测试

命令以[根 package.json](../../package.json)为准；下表说明入口做什么，不记录历史运行结果。

## 环境约定

测试使用本地合成 fixture，按独立批次隔离并受控清理；已有非本任务数据不得随意重置。数据库变更分别验证旧数据升级和空库安装。规则见[开发流程第5节](development-release-workflow.md#5-local-supabase-验证)。

项目采用 Local 本机 Supabase Docker → Production。最高测试环境为本地 Supabase；R0做适用静态检查，R1做适用本地检查，R2/R3增加本地 Supabase 和领域验证。适用本地测试通过即可进入上线流程，不要求 Hosted Staging、远程 Provider 或额外 CI 验收。生产目标、配置、迁移兼容和恢复方案仍须核对；生产数据不作为测试 fixture。

| 命令 | 范围与条件 |
| --- | --- |
| pnpm docs:check | 文档必需入口、相对链接与导航可达性 |
| pnpm contracts:check | OpenAPI 引用、操作、样例与二进制合同 |
| pnpm format:check / pnpm lint | 格式和静态 lint |
| pnpm typecheck / pnpm build | 类型与构建；不生成 Account SDK 发行物 |
| pnpm test:unit | Turbo 调用 workspace 单元测试 |
| pnpm test:tooling | 本地 Supabase 参数/环境守卫等工具安全负向测试 |
| pnpm contracts:breaking | 相对基线检查 `/v1` operation/schema/enum 破坏性变化 |
| pnpm test:registry / pnpm test:reference-consumer | Registry contract compatibility 与 Reference Consumer forbidden dependency/source boundary |
| pnpm test:upload | 本地有界上传读取器探针 |
| pnpm runtime:probe | Node 与 Deno 共享导入边界 |
| pnpm test:db | 本地 Supabase pgTAP，需要数据库服务 |
| pnpm test:maintenance | Deno worker 测试；使用固定工具链的 DENO_BIN 或 PATH |
| pnpm test:api | 聚合运行 Account API、Maintenance、Billing Webhook、Provider、Storage 和上传读取器的隔离 Deno 测试 |
| pnpm test:e2e | 调用 tests/spikes/e2e/t16-r2-account.mjs，需要本地服务和浏览器条件 |
| pnpm test:ops:m6-02-local | 本地备份模拟，操作本地夹具；Windows 临时产物位于 E:\AppData\m6-02-local-backup 独立目录 |
| pnpm test:perf:r15-local | 本地授权压力探针；默认100次/秒、15分钟，需本地 Account API；R15_START_API=1可由脚本启动 |

## 定向验证

数据库用例位于 [supabase/tests](../../supabase/tests)，涵盖角色负向授权、平台账户、权益、文件预算、租约、删除和备份协议。API 与浏览器脚本位于 [tests/spikes](../../tests/spikes)。根命令中的任务编号是现有脚本名称，不能用其名称推断覆盖已成立。

中央 API 的隔离 Deno 测试为 [index.test.ts](../../supabase/functions/account-api/index.test.ts)，Storage 与上传读取器测试位于 [共享目录](../../supabase/functions/_shared)。

参考应用页面、registry/templates.json和Consumer/Registry/E2E脚本必须针对当前版本核对与实际执行，不能复用其他页面版本的成功结论。

## 结果解释

`pnpm verify:task:0801` 在本地 Docker Supabase 运行静态、构建、全工作区单测、工具安全、Edge/API、SQL、结算并发、Contract breaking/Registry/Reference Consumer、运行时、浏览器及文档合同检查；默认重置当前本地数据库，执行前必须确认 fixture 范围。已确认本地迁移与fixture时可用 `pnpm verify:task:0801 --reuse-local` 保留数据库重跑，不能把它当全新迁移证据。CI调用同一入口，不增加远程验收。未覆盖领域仍需定向本地测试；Production不承担破坏性回归。

测试结果在任务回复或测试平台报告中说明环境、版本、命令、断言与限制，仅使用PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED；不适用另写理由。Local、可选CI/外部联调与生产观察分别记录。Mock不代表真实Auth、Storage或Provider已联调；历史PASS不能代替当前版本验收。未执行可选远程验证不增加本地已验收版本的上线测试门槛。
