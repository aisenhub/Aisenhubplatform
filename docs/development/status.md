# 实际进度与阶段同步

更新日期：2026-09-07。规划交付与应用实现严格分开。

## 已完成事实

- 架构v1.2及专题已写入，历史v1.1已归档；文档链接/SQL关系/示例熵经过静态核对。
- Git仓库已初始化，远端aisenhub/Aisenhubplatform为空仓库起步，公开可见，main已建立。
- C1架构基线commit：4d9b7edcf243b925a850ac2022596f5b1a9444b0，已push并通过ls-remote核对。
- C2规划基线commit：08646a4b0baf6ca8c33208cb47651aa46cb570cc，已push并核对远端main。
- C3规格与任务commit：175ec1435ccc84b1b58efec1dba2921277c68d21，已push并核对远端main；本进度记录随后作收尾同步，最新提交以Git历史为准。
- 已只读核对本地Node/pnpm/Docker与Makerkit固定commit；Deno按T03安装到`D:\APP\Codex\Deno`，没有使用C盘默认路径。

## 本轮规划交付

| 阶段 | 内容 | 状态 |
|---|---|---|
| C1 | 架构基线、README、AGENTS、Git基础 | 已提交并同步 |
| C2 | 开发总计划、决策、验证门槛 | 已提交并同步 |
| C3 | M0～M6规格、公共合同、首批任务、复核修正 | 已提交并同步 |

## 本轮检查

28份Markdown文件、103个相对文件链接、7份模块规格、18项任务、40个具体验收ID、17个Account方法/路径组合已核对。任务导航与正文依赖一致且无环；围栏与引用检查无错误；常见凭据格式扫描无匹配；git diff --check通过。这里的检查不证明SQL或应用运行正确。

## 应用实现

M0为IN_PROGRESS：T01、T02、T03已完成，T04为BLOCKED，T05/T06可继续，T07等待T05；M1～M6仍为NOT_STARTED。`SP-SOURCE`的来源/脚本审查部分、本地`V-BASE-01/02`、双运行时import、质量检查和文档检查已通过；`SP-AUTH`基础登录/TOTP子项已通过但近期证明被阻塞，`SP-SQL`、`SP-UPLOAD`、`SP-TXN`、托管探针和G0-L/G0-S仍按证据记录为`NOT_RUN`，不会因骨架可构建而宣称M0完成。

当前任务状态：T01环境与固定上游导入清单核验、T02固定版本导入与Admin-only骨架、T03双运行时公共边界/脚本/CI均已完成；T04证据见[evidence/T04.md](evidence/T04.md)，当前阻塞在已签发JWT的logout失效边界。T05/T06仍可执行，Local、Staging和正式产物发布的验收分别记录。

## T01 任务交接

- 分支：`task/T01-source-inventory`
- 范围：工具实际路径/版本、Docker、固定上游 commit、许可证、lock/workspace、安装脚本、Starter 数据库与权限边界、目录导入清单。
- 结论：T01 验收通过；未执行 `pnpm install`、build、Supabase 迁移、业务测试或应用导入，这些保持 `NOT_RUN` 并交由后续任务。
- 已知工具缺口：Supabase CLI、Deno 未在 PATH 或已检查目录发现；已记录 D 盘安装方案，不因缺失伪造版本或通过结果。

## T02 任务交接

- 分支：`task/T02-admin-foundation`
- 结果：固定上游基础文件已导入；Admin 与 template-preview 为独立最小 Next 应用；旧 Starter migration、seed、业务账户界面和生产 deploy 入口未导入。
- 验收：固定 pnpm 11.18.0 frozen install、项目级 Supabase CLI 2.111.0、两应用 typecheck、根 typecheck、两应用及根 build 均通过。
- 限制：Next 16.3.0 在当前 Windows/Turbopack 布局下的默认构建存在内部模块解析错误，两个应用固定使用 `next build --webpack`；这不是依赖升级，后续升级前需重新验证。

## T03 任务交接

- 分支：`task/T03-runtime-ci`
- 结果：公共纯 TS domain 边界、Node/Deno 双运行时探针、真实只读脚本、文档一致性检查和固定版本 CI 已交付。
- 验收：冻结安装、format、lint、typecheck、build、37 个单元测试、双运行时 import、docs check 均通过。
- 未完成：Local Supabase、SQL/Auth/上传/事务探针和 G0-L/G0-S；这些不是 T03 的通过条件，分别交给 T04～T07/T17。

## T04 任务交接

- 分支：`task/T04-auth-probe`
- 结果：Local password session、refresh、`session_id`、TOTP enrollment/challenge/verify 和 refresh 撤销已实测；SSR Cookie、真实 Provider 和 proof 设施未完成。
- 状态：BLOCKED。logout 后已签发 access JWT 仍可用至过期，不能满足近期证明失效合同；未使用弱校验替代。
- 下一步：T05/T06 可独立继续；T09/T12/T14 必须先采用服务端 session-bound proof 协议。
