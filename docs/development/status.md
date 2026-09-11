# 实际进度与阶段同步

更新日期：2026-09-10。规划交付与应用实现严格分开；Frontend Experience & State 已完成 Local 代码交付，但总体发布门槛仍未关闭。

## DP2当前基线（优先于下方历史交接摘要）

2026-09-10 FE-R1/DP2 本地核对：当前产品实现基线为 `c9c19f4`，最新 FE-V Local 浏览器回归测试提交同为 `c9c19f4`；FE-D02 批次边界的产品基线仍为 `54ff79727dd0b7ea734822d23db2c9b58d6fe4ea`。Frontend Phase 01–08 代码、FE-D02 Local 修复与验证已完成，本轮补齐资源 loader generation/epoch 防护、目录 400/403/404/409/412/428/429/500/503 文案矩阵、Plans/Accounts/Operations/Subscriptions 的 412/429/503/202、Files/Policy/Settings 的 412/503/202、Origins 迟到响应竞态，以及 Admin MFA 二维码 Next Image 优化，均已推送。不能再按空 main/尚未合并判断。DP2 原规划时实现基线 `31b5142421847c26e61fe733b0df67f2fecd115a`、ASU-R1 旧 main `0d42b4cd44a2c17777c33f616bd393c22ee78f16` 与更早 main `f981ca533db67e543bbe3f6d88c337b78c0199d4` 仅保留为历史快照。下方原任务 PASS 仍只代表各自报告范围；本次前端审查的剩余项见 [FE-R1 verification record](../plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/verification-record.md)。

2026-09-11 产品范围修正：按用户决定，`apps/template-preview` 已从“完整 Consumer 登录/用户状态集成模板”改为“公开页面参考模板与 API 接入示例”。旧M5-04/M5-05中关于Auth、刷新、Profile、兑换、文件和停用的验证仍是历史证据，不代表当前preview行为；新的参考模板范围需要重新执行对应Local安装验收。

## FE-R1 前端当前审查（2026-09-10）

| 范围 | 当前状态 | 尚未关闭的任务/门槛 |
|---|---|---|
| Phase 01–08 代码交付 | Local 已交付 | 代码批次均已 push；当前产品实现基线为 `c9c19f4`，FE-D02 修复代码为 `54ff797`；不等于 Hosted、Staging、生产或正式发布通过。 |
| FE-D02 批次重复创建 | PASS（Local） | SQL/API 探针已证明同 operation 返回 `replayed_existing` 元数据、无 codes/receipt；异参数返回 409 `IDEMPOTENCY_CONFLICT`。Hosted 未运行。 |
| FE-V 状态/故障矩阵 | PARTIAL | 本轮已补 loader generation/epoch 竞态防护、目录 400/403/404/409/412/428/429/500/503 矩阵、Plans/Accounts/Operations/Subscriptions 及 Files/Policy/Settings 的 412/429/503/202 代表性页面证据、Origins 迟到响应收敛、关闭/重开/刷新失败保留已知状态和 MFA `<img>` lint 修复；仍需 FE-V01～16 全量正向高风险流程、所有资源页面的逐状态恢复闭环、390px/完整键盘焦点矩阵与 Hosted/Staging/生产证据。已有 T16 Local PASS 不替代完整发布门槛。 |
| Hosted / Staging | BLOCKED / NOT_RUN | 依赖 X02/X03/X05 与受控权限，承接 T17-R1～R3、T18-S、G4-S、M5-05 hosted；覆盖 OAuth/SMTP/SSR、独立 executor/TLS/pooler/CA、Storage 迟到写入和双平台。 |
| M4–M6 运维/发布 | PARTIAL / WAITING | M4-11、M6-02 外部备份、M6-03/04 恢复/轮换/告警、M5-06 正式 Registry 发布仍需 X04/X06、隔离目标和明确授权。 |
| Future diagnostics | NOT_STARTED（计划内） | 需真实 Observability、搜索、告警生命周期和权限/脱敏合同；本期不实现假指标、假搜索、假通知。 |

## FE-R1 暂缓交接（2026-09-10）

- 当前策略：Frontend Experience & State 优化已完成本轮代码、Local 回归与文档收口，现按产品优先级暂缓继续开发，先承接其他明确派发的功能；“暂缓”不等于 FE-R1 总体完成、Hosted 通过或正式发布。
- 已完成：`c9c19f4` 已推送 `main`，包含 loader generation/epoch 竞态防护、目录错误文案矩阵、资源页 412/429/503/202 代表性测试、迟到响应与状态收敛验证、Admin MFA Next Image 优化；T16-R2 Local 汇总 20 项 PASS。
- 暂缓项：FE-V01～16 全量正向高风险流程、逐资源完整恢复闭环、390px/键盘焦点全矩阵、Hosted/Staging/生产、真实 Storage 迟到写入及 M4–M6 发布运维门槛，继续保持 PARTIAL、NOT_RUN 或 BLOCKED。
- 恢复条件：恢复 FE-R1 时从 `main@c9c19f4` 复核实际代码和 VR-0018/VR-0019，先补 Local 未关闭矩阵，再按 X02/X03/X05、X04/X06 和受控发布授权推进托管与生产门槛。
- 下一开发入口：其他功能必须使用独立任务编号、变更目录、合同和验收记录，不自动把新功能混入本计划；FE-R1 恢复时再更新本计划和对应 evidence。
- 用户输入：继续 Local 开发无需额外输入；要推进 Hosted/Staging/生产，需提供或授权 X02/X03/X05 环境与权限，以及 X04/X06 备份、恢复、轮换和发布条件。

`pnpm format:check` 的 61 个未触及历史文件问题记录为基线债务，不作为本次前端代码回归；本轮目标文件检查通过。上述状态不得从文档审核自动升级为生产验收。

| 范围/Gate | 当前判定 | 剩余承接 |
|---|---|---|
| M0 / G0-L | Local已有PASS证据，模块仍IN_PROGRESS | G0-S托管补齐 |
| M1 / G1 | 候选 commit 已完成 Local 空库升级、真实角色与 pgTAP 复验 | 托管/生产门槛不由 G1 推定 |
| M2 / G2-L | T12-R2、T16-R1、T16-R2 与候选 commit Local 复验已通过 | 托管 G2-S、Provider/SMTP 与生产门槛 |
| G0-S / G2-S | T17 PARTIAL，基础Auth/API有历史PASS；T17-R1已补网关配置与独立URL适配，但托管角色/TLS未运行 | T17-R1 hosted核验、T17-R2/R3、T18-S |
| M3 / G3 | M3-01～03 Local交付；M3-R1为PASS（Local证据） | 托管、浏览器与生产验收仍不属于本项，不推定整体阶段完成 |
| M4～M6 | M4-02～M4-08 PASS（Local）；M4-09为PARTIAL（Local）；M4-10 G4-L PASS（Local） | M4-11补齐实际host G4-S；M5/M6按路线 |
| T18 | PARTIAL；T18-L Local已完成 | T18-S仍依赖托管输入，全部条件满足才关闭父任务 |

T12-R1已在`task/T12-R1-auth-ssr`完成代码实现并推送（`aa5089d`），但证据判定为PARTIAL：本地Auth探针、包单测、类型检查和两个应用构建通过；真实浏览器SSR、OAuth/邮件及应用路由端到端Local回归留给T16-R2/T17-R2。T12-R2已在`task/T12-R2-browser-regression`补齐Admin真实MFA挑战、中央recent-proof消费者、普通用户独立 email `token_hash` 事件、双session中央proof issuer、HttpOnly proof cookie及真实Local Chrome敏感生命周期回归；T12-R2判定为PASS（Local），完整Close/Delete HTTP消费者由T16-R1承接，详见`evidence/T12-R2.md`。T16-R1已补齐M2平台/Origin/Key/账户管理的受控HTTP→SQL链路、普通Account敏感消费者、SDK/BFF与最小页面，并通过Local数据库/API/单测/构建回归，详见`evidence/T16-R1.md`；T16-R2已接入可复现 `pnpm run test:e2e`，真实 Chrome 双 Origin/Platform、独立上下文、Admin停用恢复、普通敏感操作和 bundle 凭据扫描通过，详见`evidence/T16-R2.md`。托管CI、SMTP、Storage和生产证据仍未宣称。M4-01已完成合同/恢复矩阵冻结（当前分支 `task/M4-01-file-contract`，运行证据见 `evidence/M4-01.md`），不改变M4实现仍等待T18-L的门槛。T12父任务仍保持PARTIAL。

T17-R1本轮已完成可独立的网关合同配置与 Account/Admin 独立数据库 URL 选择；根据当前 Supabase 官方连接、SSL 与 Edge Functions 指南补充了 hosted 配置及验收矩阵。实际独立 executor、TLS、CA、pooler 和重新部署请求矩阵因受控 Staging 输入未提供而保持 BLOCKED/NOT_RUN，详见`evidence/T17-R1.md`；不改变远端部署，不把历史默认 `SUPABASE_DB_URL` 证据升级为通过。

M5-01已完成当前资源、包exports、OpenAPI/UI事实与承接矩阵盘点（见 `m5-compatibility-matrix.md`）；M5-02已完成四个本地tarball的可重复构建、边界扫描、独立消费者类型检查及Node/Edge导入回归（见 `evidence/M5-02.md`）。这些产物尚未发布到npm/Registry；M5-03 Local Admin页面、受控资源搜索、审计查询、状态动作和失败原因展示已完成（见 `evidence/M5-03.md`）；M5-04/M5-05的旧Auth Consumer验证已完成历史范围，但不再代表当前`template-preview`；公开参考模板改造已完成代码，新的独立安装与页面回归尚未单独记为PASS。Hosted双Origin/Platform E2E仍未运行（见 `evidence/M5-05.md`）。

M6-01已完成环境、Secret、联合备份屏障、manifest、墓碑和告警运维协议设计（见 `m6-operations-protocol.md`）；M6-02已补齐Local job lease/fence屏障收口、对象manifest/hash和隔离墓碑模拟（见 `evidence/M6-02.md`），但X04独立备份目标未确认，真实外部备份仍未验收；M6-03～04的真实恢复/轮换/容量告警验证仍未开始。X02/X05/X06也未确认。

T13～T15的DONE指历史报告已交付SQL/部分SDK范围，不代表原任务列出的全部HTTP/Admin/Consumer体验均完成；缺失链路由T16-R1承接，完整体验由M5完善。T04的普通用户reauth、SSR与真实Provider仍有未完成项，不能从Admin proof通过推断普通用户proof通过。

## DP2本轮规划交付

- [首批收尾](tasks/closeout-01.md)：10项任务，细化T12/T16、M3证据收口和托管门槛。
- [M4第三批](tasks/batch-03.md)：11项任务；M4-01为可先做的合同规格，M4-02实现依赖T18-L。
- [后续路线](roadmap-dp2.md)：M5六项、M6六项，明确早期准备、细节冻结、外部输入与发布授权。
- 当前下一项：按用户安排先承接其他明确派发功能；FE-R1 本轮代表性错误/竞态矩阵已完成并推送，未关闭的 FE-V01～16、全资源正向/恢复、390px/完整键盘焦点和 Hosted/Staging/生产门槛暂缓，恢复时从 `main@c9c19f4` 继续。FE-D02 已完成 Local 修复与 API/SQL 复验，Local G5-L、M5-03/M5-04 的 Local 开发和验证已完成。M4-11 的实际 host G4-S 仍依赖 T18-S 与受控托管输入；M5-06 正式发布仍依赖 X05 和明确发布授权。
- 本轮已在独立任务分支执行T12-R2普通proof合同/issuer、Admin MFA与真实Local浏览器子集、M4-01和M3-R1完整Local SQL/API范围内验证；未执行的托管、Storage及生产项仍保持BLOCKED/NOT_RUN。各任务证据和最终同步以对应分支报告为准。

## 已完成事实

- 架构v1.2及专题已写入，历史v1.1已归档；文档链接/SQL关系/示例熵经过静态核对。
- Git仓库已初始化，远端aisenhub/Aisenhubplatform为空仓库起步，公开可见，main已建立。
- C1架构基线commit：4d9b7edcf243b925a850ac2022596f5b1a9444b0，已push并通过ls-remote核对。
- C2规划基线commit：08646a4b0baf6ca8c33208cb47651aa46cb570cc，已push并核对远端main。
- C3规格与任务commit：175ec1435ccc84b1b58efec1dba2921277c68d21，已push并核对远端main；本进度记录随后作收尾同步，最新提交以Git历史为准。
- 已只读核对本地Node/pnpm/Docker与Makerkit固定commit；Deno按T03安装到`D:\APP\Codex\Deno`，没有使用C盘默认路径。

## DP1历史规划交付

| 阶段 | 内容 | 状态 |
|---|---|---|
| C1 | 架构基线、README、AGENTS、Git基础 | 已提交并同步 |
| C2 | 开发总计划、决策、验证门槛 | 已提交并同步 |
| C3 | M0～M6规格、公共合同、首批任务、复核修正 | 已提交并同步 |

## DP1历史检查

28份Markdown文件、103个相对文件链接、7份模块规格、18项任务、40个具体验收ID、18个Account方法/路径组合已核对。任务导航与正文依赖一致且无环；围栏与引用检查无错误；常见凭据格式扫描无匹配；git diff --check通过。这里的检查不证明SQL或应用运行正确。

## DP2校准前的应用进度快照

以下保留此前阶段摘要；其中“proof通过”须按本页DP2表区分Admin与普通用户，“已完成”须按原报告区分SQL/API/浏览器，不作为新的Gate结论。

M0为IN_PROGRESS：T01～T07 Local 已完成，T04 的 JWT/logout/proof 子项已闭环；M1为IN_PROGRESS（T08、T09、T10、T11已完成）；M2为IN_PROGRESS（T12已交付可独立部分，T13、T14、T15 Local已完成，T16仍为 PARTIAL）；M3为IN_PROGRESS（M3-01、M3-02、M3-03及M3-R1 Local已完成，托管/生产全链路未验收）；M4～M6仍为NOT_STARTED。`SP-AUTH`的密码、refresh、TOTP、中央近期 proof 与 logout 后旧 JWT 拒绝均已通过 Local 和 Staging 基础链路验收；G0-L 为 PASS。Staging 已清理旧项目基线并应用仓库 13 个迁移，公共 Auth 健康探针返回 200，`account-api` v13 已部署；G0-S 当前为 PARTIAL，X02/X03、托管 pooler/TLS、浏览器 SSR 和 Storage 真实语义仍未完成。

当前任务状态：T01～T11、T13～T15已完成；T04 Local JWT/logout/proof 子项已完成，Staging 基础 Auth/API 与 logout 旧 JWT 拒绝已完成，真实 Provider 与浏览器 SSR 留给 T17；T12与T16为PARTIAL；T17为PARTIAL，T18仍为WAITING。M3-01/M3-02/M3-03及M3-R1已完成 Local 交付，M3-R1为PASS（Local证据），证据见[evidence/M3.md](evidence/M3.md)和[evidence/M3-R1.md](evidence/M3-R1.md)；G0-L 证据见[evidence/G0-L.md](evidence/G0-L.md)，G0-S 已完成 Staging 清理、迁移、Edge 部署和基础 Auth/API 探针，但完整托管门槛仍待完成，证据见[evidence/G0-S.md](evidence/G0-S.md)。

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

- 分支：`task/T04-session-revocation`
- 结果：Local password session、refresh、`session_id`、TOTP、中央近期 proof、logout 与旧 JWT 拒绝均已实测；logout 路由和 Account API 已采用 Auth 验证及 session-bound 授权。
- 状态：DONE（Local；Staging 基础 Auth/API 通过）。真实 OAuth/SMTP、浏览器 SSR 和完整托管环境由 T17/G0-S 验收，不再标记为 T04 阻塞；Staging logout 后旧 JWT 已实测返回 401。
- 下一步：继续 T17 的托管 pooler/TLS、浏览器 SSR、OAuth/SMTP 和 Storage 语义验收。

## T05 任务交接

- 分支：`task/T05-sql-roles`
- 结果：Local Node/Deno transaction pooler、NOLOGIN owner、最小 executor、私有 schema 和负向权限路径均已实测。
- 验收：`SP-SQL Local` 与 `V-DB-02` 原型 PASS；托管 pooler/TLS 留 T17。
- 下一步：T06/T07 已完成；托管 pooler/TLS 留 T17。

## T06 任务交接

- 分支：`task/T06-upload-probe`
- 结果：1MiB 边界、声明/真实大小、chunked、Content-Encoding、断流、并发名额和 provider timeout/unknown 均已实测。
- 验收：`SP-UPLOAD Local`、`V-FILE-01` 原型 PASS；真实 host 的 Storage 取消/迟到写入留后续环境。
- 下一步：Local 依赖已满足；真实 host 的 Storage 取消/迟到写入留 T17。

## T07 任务交接

- 分支：`task/T07-transaction-probe`
- 结果：双连接账户锁、同/异 hash 幂等、业务拒绝、异常回滚和响应丢失重放均已实测。
- 验收：`SP-TXN`、`V-TXN-01/02` 原型 PASS；不宣称完整权益事务。
- 下一步：T08 的 T05/T07 依赖已满足；T04 的 Local 近期证明协议已闭环。

## T08 任务交接

- 分支：`task/T08-core-migrations`
- 结果：按数据模型交付固定时间戳核心迁移，包含平台、平台账户、资料、偏好、Origin、Plan、默认 Free 同平台复合外键、墓碑约束、row_version、updated_at 触发器，以及核心表 RLS/运行时默认拒绝。
- 验收：Local 空库 reset 两次、迁移历史升级基线、pgTAP 24/24、核心关系/墓碑/版本/触发器/anon 默认拒绝探针均通过；生成数据库类型写入 `packages/shared/src/database.types.ts`。
- 限制：只覆盖 T08 核心表，未提前创建 Grant/Billing 或 M1 辅助表；Staging 已重建为仓库迁移基线并应用 13 个迁移，真实 Provider/托管验证仍留 T17。

## T09 任务交接

- 分支：`task/T09-security-helpers`
- 结果：交付 M1 辅助表、非登录运行角色、受控 session/identity helper、幂等 claim/finalize、审计 append-only、固定窗口限流和 job lease fencing；未向 HTTP executor 授予基础表 DML 或拆分 helper 权限。
- 验收：T08 回归与 T09 pgTAP 共 54/54；幂等、审计、lease、限流和 Local Auth identity deletion gate 行为探针通过；public schema 类型已重新生成，包含 `audit_logs`。
- 限制：T04 的 Local 近期 proof 协议已通过；`admin_step_up` 交付 session/factor/5分钟边界和权限存储，真实 Provider/托管验证不由 T09 宣称。下一项满足依赖的任务是 T10。

## T10 任务交接

- 分支：`task/T10-db-acceptance`
- 结果：交付三平台三用户 Local Auth fixture、真实角色负向/权限快照、跨租户复合 FK、Admin global/platform scope、Profile 乐观版本竞争、事务故障回滚和过期 lease fencing 验收。
- 验收：T08/T09/T10 三份 pgTAP 共 59/59；T10 行为探针报告 fixture、跨租户拒绝、版本竞争、回滚、过期 fence 和 account/admin/job 角色负向均 PASS。
- 限制：T10 不覆盖托管环境、真实 OAuth/SMTP、完整 Admin proof 生命周期或 M3 事件表；T11 可继续冻结 API/错误合同。

## ASU-R1 Auth 计划修订

文档修订已纳入 [Auth 执行计划](../plans/aisenhub-auth-session-upgrade-plan-complete/auth-session-upgrade/00-master-plan.md)，包含 ASU-01～05 与 ASU-V01～16。产品实施未开始，运行验收 NOT_RUN；本轮文档提交不升级任何应用 Gate。下一项是用户派发后的 ASU-01 基线与安全基础，完整 Frontend 独立计划在 Auth 交付后承接。
