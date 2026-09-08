# 首批可执行任务：T01～T18

版本DP1，基于[总计划](../master-plan.md)、[公共合同](../contracts.md)与[验证目录](../verification-plan.md)。本批目标是完成开发基座、公共数据库设施和账户纵向链路，**不包含正式开发权益、文件业务或生产部署**；文件/事务探针只验证技术可行性。

当前应用实现已推进至首批后段：T01～T11、T13～T15及T04 Local JWT/logout/proof 子项已完成；T12与T16仍为PARTIAL，T17与T18按托管依赖等待。M3-01～M3-03的Local交付另见[第二批M3任务](batch-02.md)。任务执行者必须读取根AGENTS和对应模块规格，先检查依赖证据，不把已有规划文字当作依赖已完成。

## 任务导航

| 任务 | 内容 | 依赖 | 当前状态 |
|---|---|---|---|
| T01 | 环境、上游与导入清单核验 | 无 | DONE |
| T02 | 固定版本导入与Admin-only骨架 | T01 | DONE |
| T03 | 双运行时公共边界、脚本与CI | T02 | DONE |
| T04 | Auth/SSR/MFA与近期认证探针 | T03 | DONE（Local；托管/浏览器留T17） |
| T05 | 私有SQL/pooler/角色探针 | T03 | DONE |
| T06 | 受控上传与真实字节边界探针 | T03 | DONE |
| T07 | 双连接事务、幂等与回滚探针 | T05 | DONE |
| T08 | 核心平台与账户迁移 | T05,T07 | DONE |
| T09 | 安全辅助表、角色和内部helper | T08,T04 | DONE |
| T10 | 数据库负向与事务设施验收 | T09,T07 | DONE |
| T11 | OpenAPI、SQL context和错误合同冻结 | T10,T04 | DONE |
| T12 | Auth SDK、SSR adapter和Admin鉴权 | T11 | PARTIAL/BLOCKED |
| T13 | Platform Key、Principal与Admin平台基础 | T12,T10 | DONE |
| T14 | 激活、状态控制、关闭与删除请求 | T13 | DONE |
| T15 | Profile、Preferences与公开Plan | T14,T11 | DONE |
| T16 | 最小Consumer/BFF纵向集成 | T15,T12 | PARTIAL/BLOCKED |
| T17 | 托管环境探针与真实Auth验收 | T16,T06 | BLOCKED（Staging连接变量/CLI凭据未进入当前工作进程） |
| T18 | G1/G2验收、首批交接与下一批细化 | T16,T17 | WAITING |

T04/T05/T06依赖相同，可按资源独立安排，但不自动授权多agent。T17还需要X01/X02/X03及当前工作进程可用的 Staging 连接配置；缺失时T16仍可本地完成。T18可提前整理G2-L材料，但T17未过不能宣称整批托管验收完成。

## 通用执行合同

开始时输出任务ID、已读取规格、依赖状态与计划改动。默认分支task/tXX-简短名称，从已合入依赖的最新基线开始；同一任务分支继续已有工作时不重复创建。

只改本任务文件范围，必要公共合同变化先记录并同步文档/测试；不执行未分配下一任务。完成后运行对应检查、生成脱敏报告docs/development/evidence/TXX.md、更新status、commit并push任务分支，核对远端SHA。没有合并授权时不自动merge。

报告包含：环境/固定版本、改动、用例ID与命令、PASS/FAIL/NOT_RUN、可重复步骤、限制、commit/push状态、下一项满足依赖的任务。额外安装必须遵循根AGENTS路径，不上传Secret。

## T01 — 环境、上游与导入清单核验

- 模块：[M0](../modules/M0-foundation.md)。
- 依赖：无。
- 改动范围：docs/upstream-sources.md、docs/development/evidence/T01.md、工具版本/导入清单文档；不导入应用源码。
- 输入：已确认Makerkit候选commit、本机只读工具信息和AGENTS。

执行步骤：

1. 复用决策登记中的已核实来源，核对本地/远端Git状态及工具真实路径；报告Node/pnpm/Docker、Supabase/Deno是否可执行，不用PATH缺失推断未安装，不重新选择Starter或重复泛搜。
2. 以固定commit读取LICENSE、manifest、lock、安装脚本、supabase配置及workspace依赖图。确认候选版本确实可取得，记录上游SHA。
3. 制作逐目录保留/删除/改造表，列出需要拆除的Starter业务schema/权限、web路径脚本、营销UI、自动fix/clean/deploy快捷命令。
4. 固定Node/pnpm及Supabase/Deno可用版本方案；新软件未安装则给出D盘目标和最小安装步骤，不能自行回落C盘。
5. 记录当前实际工具与目标版本差异，确认Windows和CI可使用同一项目脚本。

验收：SP-SOURCE的“来源/脚本审查”部分完成，commit/license/依赖清单可复核；不将clean install/build标PASS，它们由T02完成。交付清单足以让T02按固定版本导入，不需要重新选Starter。

## T02 — 固定版本导入与Admin-only骨架

- 模块：[M0](../modules/M0-foundation.md)。
- 依赖：T01。
- 改动范围：apps/admin、apps/template-preview、必要packages/tooling、根manifest/lock、根supabase配置、THIRD_PARTY_NOTICES。
- 输入：T01导入白名单和版本记录。

按固定commit在隔离目录取得上游，保留本仓库Git/docs/AGENTS。只导入清单内文件；重命名web包和所有引用；把Supabase移到根；先禁用危险脚本再安装依赖。保留MIT要求的版权声明，不以清品牌删许可证。

建立Admin登录空壳与独立Consumer空壳，删除Starter业务表依赖；不能把Starter accounts表误当本项目platform_accounts。Local配置只含测试环境，生产deploy入口不接入。

验收：V-BASE-01/02；按固定lock clean install，两应用build/typecheck，根supabase工作目录正确。部署、OAuth、业务权限尚未实现要明确NOT_RUN。出现上游版本不可安装时报告具体差异，不批量升级依赖。

## T03 — 双运行时公共边界、脚本与CI

- 模块：[M0](../modules/M0-foundation.md)。
- 依赖：T02。
- 改动范围：packages/domain骨架、supabase/functions/_shared、根测试脚本、.github/workflows、文档检查器。

建立纯TS DTO/error模块并在Node与Edge探针同时import；不复制实现到两个目录。创建M0规定的真实检查脚本，尚无领域测试时明确何时启用，不用空测试成功掩盖缺失。

CI固定版本，运行format/lint/typecheck/build、已有测试和docs检查；去掉自动fix及任何部署权限。文档检查至少校验相对链接、任务ID/依赖存在性和无环、用例ID及模块文件。

验收：V-BASE-01/02；本地与CI命令一致、PR不获得部署Secret、双运行时共享包检查通过，新增命令在README可复现。

## T04 — Auth/SSR/MFA与近期认证探针

- 模块：[M0](../modules/M0-foundation.md)，结论供[M2](../modules/M2-identity-platform.md)。
- 依赖：T03。
- 改动范围：隔离Auth探针/Consumer、evidence/T04、必要ADR及API专题增补。

用Local Auth真实登录/刷新/退出，不伪造Auth表；验证Cookie no-store、session_id及Admin MFA challenge。证明绑定当前session，refresh不能延长5分钟，退出和更换session使旧证明失效。

另行验证普通用户Close/Link/Delete-request的近期认证证据：核实Provider支持的密码/OAuth/OTP重新认证方式、返回claims和服务器绑定方式；选择唯一可执行协议并记录完整请求/结果/失效模型。不能仅比较JWT iat或客户端布尔值。如果需新增reauth公共endpoint，同步API专题和公共合同后再交给T11冻结。

验收：SP-AUTH本地部分、V-AUTH-02/03；给出可实现的Admin与普通用户证明协议。Google/SMTP未配置时仅标真实Provider部分BLOCKED，不宣称G2-S通过。若普通近期认证无法可靠实现，明确阻塞T09相关证明字段和T14敏感动作，不交付弱校验替代。

## T05 — 私有SQL/pooler/角色探针

- 模块：[M0](../modules/M0-foundation.md)，结论供[M1](../modules/M1-database-security.md)。
- 依赖：T03。
- 改动范围：隔离测试schema/role、Node/Edge连接adapter探针、evidence/T05。

用真实account/admin/job executor与NOLOGIN owner做最小可读/可写函数，禁止schema暴露。分别验证允许函数成功、表DML/越权函数/浏览器Data API拒绝；检查连接释放、事务参数及prepared statement设置。

核实需要读取的Auth user/session列和最小GRANT，记录准确列与版本，不把SELECT auth.*作为方案。只验证Local时记录与托管pooler的差异，托管部分由T17补。

验收：SP-SQL Local、V-DB-02原型；有可复现SQL/连接步骤和实际角色权限结果。失败不得改为postgres或service-role全表访问。

## T06 — 受控上传与真实字节边界探针

- 模块：[M0](../modules/M0-foundation.md)，结论供[M4](../modules/M4-files-jobs.md)。
- 依赖：T03。
- 改动范围：仅测试BFF/Edge受控接收器及fake/隔离Storage adapter、evidence/T06。

测试1MiB、1MiB+1、0字节、声明小/真实大、chunked、Content-Encoding、半途断流。读body前取得并发名额，有界缓冲收齐后才允许Storage adapter调用；记录最大内存与实际调用次数。

模拟PUT超时而供应商稍后完成，返回unknown而非“失败可释放”。报告fence只保护DB、不取消外部写入的证据边界；不创建生产文件表或通用浏览器直传接口。

验收：SP-UPLOAD本地、V-FILE-01原型；超限Storage调用=0。真实host限制留T17，不因本地Node成功而默认Edge可承载。

## T07 — 双连接事务、幂等与回滚探针

- 模块：[M0](../modules/M0-foundation.md)，结论供[M1](../modules/M1-database-security.md)。
- 依赖：T05。
- 改动范围：隔离测试表、并发测试、evidence/T07。

构建最小account锁/idem/ledger/audit过程，两连接barrier同时操作；验证同账户串行、不同账户独立、同key同/异参数、业务拒绝提交与SQL异常回滚。

故障注入在每个写步骤后执行，模拟提交后响应丢失；不能用多个独立HTTP CRUD请求拼事务。不要为探针实现完整兑换领域。

验收：SP-TXN、V-TXN-01/02原型；重复执行稳定，不能依赖睡眠碰撞。记录选择的隔离级别、lock/statement timeout及结果。

## T08 — 核心平台与账户迁移

- 模块：[M1](../modules/M1-database-security.md)。
- 依赖：T05,T07。
- 改动范围：supabase/migrations、生成数据库类型、核心pgTAP fixture、evidence/T08。

按数据模型建立schema/context、platforms/accounts/profile/preferences/origins/plans/default FK；加入Profile/Preferences row_version。所有归属、nullable墓碑、默认Free复合关系和updated_at规则落实。

迁移使用固定CLI命名，不复制原设计片段即忽略RLS/REVOKE；在业务函数尚未交付前核心表对runtime默认deny。只建立本模块表，不提前添加空壳Grant/Billing。

验收：V-DB-01/03/04核心子集；空库两次reset、同平台异Plan和跨平台非法关系、墓碑约束、row_version/trigger基本行为。记录升级基线，不编辑已应用migration掩盖问题。

## T09 — 安全辅助表、角色与内部helper

- 模块：[M1](../modules/M1-database-security.md)。
- 依赖：T08,T04。
- 改动范围：安全辅助迁移、private functions、roles/bootstrap、单测、evidence/T09。

补齐M1辅助表全DDL、proof字段、Key/HMAC元数据、Audit、用户/Admin幂等、限流、deletion request/job、门闩和job lease。Auth只读helper采用T05确认的列，近期证明采用T04协议。

内部Audit/claim/finalize不授予HTTP executor拆开调用；role密码由Local bootstrap注入，不进migration。定义域包装及权限矩阵，验证global deletion job阻止门闩重建。

验收：V-DB-02/04、V-TXN-01/02基础、V-AUTH-03证明存储权限；所有aux表无未决NULL/unique语义。缺可靠proof协议时相关子项BLOCKED，不用占位is_recent字段。

## T10 — 数据库负向与事务设施验收

- 模块：[M1](../modules/M1-database-security.md)。
- 依赖：T09,T07。
- 改动范围：supabase/tests、并发测试、权限快照、evidence/T10；必要修复对应迁移/函数。

建立三平台三用户专用Admin fixture；真实角色尝试表DML/私有函数越权、Audit修改、归属变更。双连接复测幂等，故障注入确保成功业务与Audit共提交，基础设施失败无部分写入。

测试过期lease旧fence、admin scope NULL规避、Profile版本竞争的SQL基础；确保CI不是postgres-only。修复错误后保留用例，不放宽策略。

验收：G1；报告明确尚未覆盖M3/M4表和真实OAuth，不用G1代表全系统安全验收。完成后提供给T11的schema/函数/错误事实。

## T11 — OpenAPI、Context与错误合同冻结

- 模块：[M2](../modules/M2-identity-platform.md)。
- 依赖：T10,T04。
- 改动范围：docs/contracts、packages/domain/src/contracts、SQL context映射、生成/校验脚本、evidence/T11。

把API专题方法/路径、鉴权、headers、DTO、错误、ETag、分页和no-store写入OpenAPI3.1；M2实现范围与后续M3/M4路径明确标注，不能创建假成功handler。

冻结Admin具体资源动作、普通用户近期认证协议及DTO；API变更同步架构专题和contracts表。约定schema版本/生成类型，不让每个SDK再定义数据结构。

验收：所有API表条目有对应operation，schema验证和样例往返通过；NULL Free/perpetual/none区分、上传二进制与生成码no-store不会被通用JSON缓存吞掉。V-SDK-01合同子集通过。

## T12 — Auth SDK、SSR adapter与Admin鉴权

- 模块：[M2](../modules/M2-identity-platform.md)。
- 依赖：T11。
- 改动范围：account-auth、account-auth-nextjs、Admin auth、Consumer auth、Auth验证测试。

依T04/T11协议实现密码/Provider意图、Cookie/PKCE/Callback、session验证、近期证明及退出；Admin每入口实时membership/session/AAL2，敏感入口查proof。

每请求独立client，禁止共享缓存和把getSession.user作为授权依据；BFF防CSRF/恶意returnTo。Admin专用身份不能进入普通消费授权；Secret client独立于SSR用户client。

验收：V-AUTH-01/02/03，本地真实Auth流程；真实Google/SMTP部分仍由T17。登录成功不自动创建Platform Account。

## T13 — Key、Principal与Admin平台基础

- 模块：[M2](../modules/M2-identity-platform.md)。
- 依赖：T12,T10。
- 改动范围：Account HTTP adapter、平台SQL函数、Server SDK初版、Admin platform/key/origin页面及测试。

实现Key生成/HMAC/轮换/撤销、平台注册与Origin校验、principal；ctx只来自verified user+mapped Key。公开plans例外仍需有效Key，未知路由默认拒绝。

Principal实时查session、删除门闩、平台/账户状态，缺账户not_activated；平台disabled可诊断但不能通过业务授权。Admin平台动作使用同一DB授权包装与审计。

验收：V-ACCOUNT-02/03、V-SDK-01/02已有方法；A Key跨B拒绝、Global JWT经B合法入口符合共享身份、Key撤销后新请求拒绝、503默认拒绝。Origin实际同步状态如缺X01则不能标托管完成。

## T14 — 激活、状态、关闭与删除请求

- 模块：[M2](../modules/M2-identity-platform.md)。
- 依赖：T13。
- 改动范围：账户生命周期SQL/HTTP、最小Admin动作/Consumer提示、Server SDK方法、并发测试。

实现幂等activate、suspend/restore/close、allow_activation；激活创建唯一账户与Profile/Preferences，Free回退不生成Grant。Admin状态动作与用户授权锁顺序一致。

Close和Global Delete request按T04/T11近期认证协议，删除请求只是pending_admin；不调用Auth实际delete，不开放半成品purge。closed不可self-reactivate，suspended恢复只允许Admin。

验收：V-ACCOUNT-01/03、V-DELETE-01门闩前置子集；并发激活一账户；敏感证明失效拒绝；关闭A不改B/Global身份；无完整清除能力不能返回deleted成功。

## T15 — Profile、Preferences与公开Plan

- 模块：[M2](../modules/M2-identity-platform.md)。
- 依赖：T14,T11。
- 改动范围：资料/偏好/公开Plan SQL及HTTP、SDK、最小表单和查询测试。

实现白名单PATCH、MergePatch、GET ETag、If-Match原子版本；缺条件428、过期412，成功递增。JSON请求与合并结果有界，禁止ownership字段。

公开plans无需userToken，仅active platform/key，输出白名单且不创建账户；套餐管理仍属于M3，用fixture验证读取。Profile跨用户/平台404，no-store一致。

验收：V-ACCOUNT-04/05、V-SDK-01；并发相同ETag只一成功，冲突UI保留未保存数据供用户处理，不自动覆盖新版本。

## T16 — 最小Consumer/BFF纵向集成

- 模块：[M2](../modules/M2-identity-platform.md)。
- 依赖：T15,T12。
- 改动范围：apps/template-preview、消费BFF模板、Playwright、集成fixture、evidence/T16。

以两个Origin/两个Platform配置同一最小消费应用，不加后端platform分支。跑公开Pricing→登录/回调→principal→activate→Profile/Preferences→业务保护页→Admin停用→再次请求拒绝。

扫描Browser bundle确认无Platform/Supabase Secret/SQL凭据，测试Token刷新不串用户、CSRF/returnTo/缓存、authorization unavailable不放行。BFF真正调用打包前SDK，不在测试中绕过中央API直连表。

验收：G2-L与V-AUTH-01/02/03/04、V-ACCOUNT-01/02/03/04/05已交付矩阵，M0/M1/M2本地命令可复现。不要声称完整Registry安装或权益/文件已完成。

## T17 — 托管环境探针与真实Auth验收

- 模块：[M0](../modules/M0-foundation.md)及[M2](../modules/M2-identity-platform.md)。
- 依赖：T16,T06。
- 外部前提：X01独立Staging、X02实际host/域名、X03Google/SMTP测试配置。
- 改动范围：受控Staging配置模板/部署验证、evidence/T17和探针报告；不部署生产。

按真实pooler与executor重跑SP-SQL；在拟用BFF/Edge运行SP-UPLOAD并记录内存/超时/取消差异；真实Google/邮件确认/重置/Link、SSR刷新、Admin近期MFA与退出旧JWT验证。

配置Secret不进入公开仓库或日志；必要外部资源/费用未经授权不创建。若缺输入，清楚列出被阻塞用例和已通过Local证据，不借用生产项目。

验收：G0-S、G2-S及V-AUTH-04。发现与Local不符时修adapter/ADR和相关测试，不能跳过失败后继续宣布托管完成。

## T18 — 首批验收与下一批交接

- 模块：集成收口。
- 依赖：T16,T17。
- 改动范围：报告、status、任务状态和M3/M4下一批拆分；必要集成修复另建小任务。

核对T01～T17真实commit/证据、G1/G2-L/G2-S状态、Schema/OpenAPI/SDK兼容、无未关闭安全问题。使用干净依赖与Local库复现关键链路，核对远端已推送。

把M3权益/兑换和M4文件规格细化为下一批任务：依赖已实现函数和fixture，不重新复制公共设施；为每项关联V-ENT-01/02/03、V-REDEEM-01/02/03/04、V-FILE-01/02/03/04/05/06/07、V-JOB-01用例与代码范围。

验收：首批应用完成报告、真实未解决项、下一批任务清单。T17缺输入时只能交付本地阶段总结，T18保持部分完成/WAITING，不将整个首批标DONE。

## 可直接派发的首项指令

> 执行docs/development/tasks/batch-01.md中的T01。先读取AGENTS.md、架构主文档、M0规格与决策登记；完成环境和固定上游核验、导入清单及版本差异报告。不要导入或开发应用代码，不安装到C盘默认目录，不执行T02。将脱敏证据与来源记录提交到任务分支，推送到指定GitHub仓库并核对远端commit，最后报告T02是否具备启动条件。
