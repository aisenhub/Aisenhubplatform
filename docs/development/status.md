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

M0为IN_PROGRESS：T01、T02、T03、T05、T06、T07已完成，T04为BLOCKED；M1为IN_PROGRESS（T08、T09、T10、T11已完成）；M2为IN_PROGRESS（T12已交付可独立部分，T13、T14、T15 Local已完成，T16已交付BFF安全边界但完整HTTP/Auth纵向仍阻塞），真实Auth/近期证明仍受T04约束；M3为IN_PROGRESS（M3-01、M3-02、M3-03 Local已完成，托管/生产全链路未验收）；M4～M6仍为NOT_STARTED。`SP-SOURCE`的来源/脚本审查部分、本地`V-BASE-01/02`、双运行时import、质量检查、文档检查、`SP-SQL Local`、`SP-UPLOAD Local`和`SP-TXN Local`已通过；`SP-AUTH`基础登录/TOTP子项已通过但近期证明被阻塞，托管探针和G0-L/G0-S仍按证据记录为`NOT_RUN`，不会因骨架可构建而宣称M0完成。

当前任务状态：T01环境与固定上游导入清单核验、T02固定版本导入与Admin-only骨架、T03双运行时公共边界/脚本/CI、T05 Local SQL/pooler/角色探针、T06 Local 上传边界探针、T07 Local 事务探针、T08核心平台与账户迁移、T09安全辅助表与内部helper、T10数据库负向与事务验收、T11 OpenAPI/Context/错误合同冻结、T13 Platform Key/Principal/Admin平台基础、T14账户生命周期、T15 Profile/Preferences/公开Plan均已完成；T12已交付可独立认证边界但整体受T04阻塞；T16已交付BFF安全边界但托管中央HTTP/Auth链路为PARTIAL。T04证据见[evidence/T04.md](evidence/T04.md)，当前阻塞在已签发JWT的logout失效边界；M3-01/M3-02/M3-03已完成 Local 交付，证据见[evidence/M3.md](evidence/M3.md)，任务拆分见[tasks/batch-02.md](tasks/batch-02.md)；托管/生产验证仍未完成。
当前任务状态：T01环境与固定上游导入清单核验、T02固定版本导入与Admin-only骨架、T03双运行时公共边界/脚本/CI、T05 Local SQL/pooler/角色探针、T06 Local 上传边界探针、T07 Local 事务探针、T08核心平台与账户迁移、T09安全辅助表与内部helper、T10数据库负向与事务验收、T11 OpenAPI/Context/错误合同冻结、T13 Platform Key/Principal/Admin平台基础、T14账户生命周期、T15 Profile/Preferences/公开Plan均已完成；T12已交付可独立认证边界但整体受T04阻塞；T16已交付BFF安全边界但托管中央HTTP/Auth链路为PARTIAL。M3-01/M3-02/M3-03已完成 Local 交付，证据见[evidence/M3.md](evidence/M3.md)，任务拆分见[tasks/batch-02.md](tasks/batch-02.md)；托管/生产验证和T04的logout即时失效仍未完成。T04证据见[evidence/T04.md](evidence/T04.md)，当前阻塞在已签发JWT的logout失效边界；T08～T16的验证分别见[evidence/T08.md](evidence/T08.md)、[evidence/T09.md](evidence/T09.md)、[evidence/T10.md](evidence/T10.md)、[evidence/T11.md](evidence/T11.md)、[evidence/T12.md](evidence/T12.md)、[evidence/T13.md](evidence/T13.md)、[evidence/T14.md](evidence/T14.md)、[evidence/T15.md](evidence/T15.md)和[evidence/T16.md](evidence/T16.md)。

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

## T05 任务交接

- 分支：`task/T05-sql-roles`
- 结果：Local Node/Deno transaction pooler、NOLOGIN owner、最小 executor、私有 schema 和负向权限路径均已实测。
- 验收：`SP-SQL Local` 与 `V-DB-02` 原型 PASS；托管 pooler/TLS 留 T17。
- 下一步：T06 可独立继续，T07 已满足 T05 依赖。

## T06 任务交接

- 分支：`task/T06-upload-probe`
- 结果：1MiB 边界、声明/真实大小、chunked、Content-Encoding、断流、并发名额和 provider timeout/unknown 均已实测。
- 验收：`SP-UPLOAD Local`、`V-FILE-01` 原型 PASS；真实 host 的 Storage 取消/迟到写入留后续环境。
- 下一步：T07 已具备依赖；T04 的 proof 阻塞保持不变。

## T07 任务交接

- 分支：`task/T07-transaction-probe`
- 结果：双连接账户锁、同/异 hash 幂等、业务拒绝、异常回滚和响应丢失重放均已实测。
- 验收：`SP-TXN`、`V-TXN-01/02` 原型 PASS；不宣称完整权益事务。
- 下一步：T08 的 T05/T07 依赖已满足；T04 proof 阻塞在 M1 辅助表冻结前保留。

## T08 任务交接

- 分支：`task/T08-core-migrations`
- 结果：按数据模型交付固定时间戳核心迁移，包含平台、平台账户、资料、偏好、Origin、Plan、默认 Free 同平台复合外键、墓碑约束、row_version、updated_at 触发器，以及核心表 RLS/运行时默认拒绝。
- 验收：Local 空库 reset 两次、迁移历史升级基线、pgTAP 24/24、核心关系/墓碑/版本/触发器/anon 默认拒绝探针均通过；生成数据库类型写入 `packages/shared/src/database.types.ts`。
- 限制：只覆盖 T08 核心表，未提前创建 Grant/Billing 或 M1 辅助表；Staging/Production 迁移未执行，T04 proof 阻塞仍交由 T09/T12/T14 处理。

## T09 任务交接

- 分支：`task/T09-security-helpers`
- 结果：交付 M1 辅助表、非登录运行角色、受控 session/identity helper、幂等 claim/finalize、审计 append-only、固定窗口限流和 job lease fencing；未向 HTTP executor 授予基础表 DML 或拆分 helper 权限。
- 验收：T08 回归与 T09 pgTAP 共 54/54；幂等、审计、lease、限流和 Local Auth identity deletion gate 行为探针通过；public schema 类型已重新生成，包含 `audit_logs`。
- 限制：T04 的真实近期 proof 协议仍 BLOCKED；`admin_step_up` 仅交付 session/factor/5分钟边界和权限存储，不能据此宣称 V-AUTH-03 全部通过。下一项满足依赖的任务是 T10。

## T10 任务交接

- 分支：`task/T10-db-acceptance`
- 结果：交付三平台三用户 Local Auth fixture、真实角色负向/权限快照、跨租户复合 FK、Admin global/platform scope、Profile 乐观版本竞争、事务故障回滚和过期 lease fencing 验收。
- 验收：T08/T09/T10 三份 pgTAP 共 59/59；T10 行为探针报告 fixture、跨租户拒绝、版本竞争、回滚、过期 fence 和 account/admin/job 角色负向均 PASS。
- 限制：T10 不覆盖托管环境、真实 OAuth/SMTP、完整 Admin proof 生命周期或 M3 事件表；T11 可继续冻结 API/错误合同。
