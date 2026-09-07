# M0 工程基座与技术验证实施规格

状态：待实施。依据[总计划](../master-plan.md)、[决策](../decision-register.md)、[公共合同](../contracts.md)。目标是可重现工程与可验证基础路径，不开发完整业务。

## 1. 输入、范围与输出

输入为当前文档仓库、现有Node/pnpm/Docker、固定Makerkit候选commit。输出为清理后的Turborepo、apps/admin空壳、template-preview最小消费者、根supabase目录、公共TS包骨架、CI和探针报告。

不导入Starter业务账户/组织/Billing schema；不复制营销页面、示例业务或不需要的Auth授权逻辑。保留必要UI、i18n、form/query工具和许可证。现有README/AGENTS/docs/.git历史不能被上游覆盖。

## 2. 导入与工具方案

1. T01只读盘点全部实际工具路径，确认Docker服务；固定上游commit、manifest、lock、license、安装脚本白名单。
2. 在独立临时目录读取上游，制作保留/删除/改造清单。先审查preinstall/postinstall、git clean、deploy、自动fix，再运行任何上游脚本。
3. T02按清单导入：apps/web→apps/admin并同步workspace包名、filter脚本、路径别名、E2E和环境加载；数据库目录移根supabase。
4. 复用Node24.19.0，pnpm锁11.18.0；Supabase/Deno精确版本由T01核验后登记，不临时跟随latest。新增软件只能按AGENTS路径安装，项目与系统工具区别记录。
5. packageManager、engines、pnpm-lock、deno.lock/deno.json和CI运行版本一致。首次安装若发现上游catalog不可解析，报告具体包与版本，不偷偷大范围升级。

初始保留Oxlint/Oxfmt工具链，不引入第二套格式工具。Deno/Edge源码采用其检查能力与项目统一格式配置，例外显式记录。

## 3. 脚本与仓库合同

M0提供以下真实根脚本，并在README说明实际工作目录和环境要求：

| 脚本 | 必须做的事 |
|---|---|
| format:check / lint / typecheck | 只读检查，不能在CI自动fix |
| build | Admin、Consumer与已存在包可构建 |
| test:unit | Vitest实际用例，不能allow-empty掩盖应有测试 |
| db:start / db:stop / db:reset | 仅Local根supabase，guard禁止生产URL |
| test:db | 使用固定CLI实际支持的命令跑pgTAP |
| test:api / test:e2e | 分别启动测试栈和浏览器用例，清楚区分尚未建立阶段 |
| docs:check | 相对链接、任务依赖、ID与文档结构 |

不能创建永远返回0的占位测试脚本。尚无对应测试的阶段在CI任务表标未启用及预计启用任务；从该领域任务交付后必须启用且禁止空测试成功。

## 4. 最小UI与环境

Admin只保留/admin/login和受保护/admin空壳；普通用户登录不进入该部署。Consumer使用独立端口/Origin，仅提供探针所需登录/回调与受保护页面，不做品牌设计。

.env.example只含虚构值；Local使用生成的测试凭据且不提交。建立配置验证，对Prod/Staging/Local项目混用直接启动失败；Supabase状态输出可能含密钥，只保存脱敏环境别名。

## 5. 技术验证

SP-SOURCE确认导入可构建；SP-SQL用测试schema验证Edge/Node/pooler/真实角色；SP-AUTH验证SSR、MFA/会话及普通用户近期认证证据；SP-UPLOAD在后端探针验证1MiB边界、并发内存和中断；SP-TXN验证双连接串行及回滚。

探针报告放docs/development/evidence/，测试代码放tests/spikes或隔离supabase test schema，不能进入生产迁移目录。Staging资源仅在真实项目和权限已提供后使用；本地不安装生产Secret。

## 6. CI、失败处理与验收

GitHub Actions只进行检查，不自动部署、发码或执行生产migration。版本固定，公开仓库workflow不向来自不可信PR的代码提供Secret；依赖缓存按lock和平台区分。

通过V-BASE-01/02与G0-L后可开始M1；G0-S只在真实host探针完成后关闭。失败报告精确区分工具未安装、Docker不可用、上游构建问题、凭据缺失和平台能力不符。

交付清单：可构建骨架、锁文件、上游移植记录/THIRD_PARTY_NOTICES、Local配置、非修改型CI、固定运行命令、五项探针状态与报告。没有前述证据不能将M0标DONE。
