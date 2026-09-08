# DP2：首批收尾与阶段验收

日期：2026-09-08。依据[校准基线](../evidence/DP2-baseline.md)、[M2规格](../modules/M2-identity-platform.md)、[公共合同](../contracts.md)、[认证安全](../../auth-security.md)及[验证计划](../verification-plan.md)。本文件细化既有任务的剩余范围，不撤销历史 Local 验收，也不把计划当作已实现。

父任务 T12/T16 保持 PARTIAL；T17 保持 PARTIAL；T18 保持 WAITING。下列 READY 仅表示可派发，当前授权仅为规划。依赖任务字段列本次收尾任务间的依赖；已交付基础及外部条件另列，不能用历史 SQL PASS 代替浏览器验收。

| ID | 交付 | 依赖任务 | 初始状态 |
|---|---|---|---|
| T12-R1 | 真实 Auth/SSR adapter 与会话范围 | 无 | READY |
| T12-R2 | 近期认证、MFA 与敏感操作合同闭环 | T12-R1 | WAITING |
| T16-R1 | M2 HTTP/SDK/BFF与最小账户管理补齐 | T12-R2 | WAITING |
| T16-R2 | 双入口浏览器链路与可复现CI | T16-R1 | WAITING |
| T18-L | G1/G2-L 本地阶段收口 | T16-R2 | WAITING |
| M3-R1 | G3证据矩阵与缺失回归收口 | 无 | READY |
| T17-R1 | 托管独立executor、TLS与网关合同 | 无 | READY |
| T17-R2 | 托管浏览器、Origin、真实Provider | T16-R2,T17-R1 | WAITING |
| T17-R3 | 实际BFF/Edge上传与Storage探针 | T17-R1 | WAITING |
| T18-S | G0-S/G2-S及首批最终交接 | T18-L,T17-R2,T17-R3 | WAITING |

## T12-R1 — 真实Auth/SSR adapter与会话范围

- 依赖任务：无。
- 已有基础：T04 Local密码/refresh/TOTP/logout探针、T11合同、T12每请求client与安全工具；不是重写这些能力。
- 改动目录：`packages/account-auth`、`packages/account-auth-nextjs`、两个应用的Auth路由、相关测试；必要时同步锁文件、API专题和合同。
- 步骤：核对锁定的 Supabase SDK/SSR 版本与当时官方文档；补实际Browser/Server client、Cookie更新、刷新与并发隔离、PKCE交换、确认/重置回调、signup/reset/link意图适配；两个应用统一使用适配器。明确信任代理、Cookie模型、no-store和相对returnTo。
- 会话范围：现有logout HTTP调用未显式传scope；按架构的默认local语义补双会话测试，证明退出当前会话不撤销另一个独立会话，全局退出是独立明确操作。401/403等Provider异常必须区分，不只因Cookie被删就判定撤销成功。
- 验收：V-AUTH-01/02、V-AUTH-04 Local子集、V-SDK-01；真实Local密码登录/刷新/退出、两用户并发不串Cookie、错误回调和CSRF拒绝、旧JWT后续请求拒绝。真实Google/外部SMTP留T17-R2；Local可用邮件捕获器测试确认/重置，mock只能覆盖负向分支。
- 交接：更新T12证据，列实际版本、命令和Local/Provider边界；T12整体需T12-R2完成后按原验收判定。

## T12-R2 — 普通近期认证与管理员MFA闭环

- 依赖任务：T12-R1。
- 改动目录：Auth包、Admin/Consumer认证页及BFF、`supabase/functions/account-api`、必要新增迁移、`docs/contracts`、`packages/domain/src/contracts`及测试。
- 步骤：复用已在中央和Admin OpenAPI登记的`/admin/api/v1/auth/recent-proof`，逐字段核对其语义和消费者；明确普通用户proof签发、同user/session绑定、认证事件来源、过期/替换/退出失效，必要变更先同步API专题、OpenAPI、DTO及消费者。不以JWT iat、AAL2或前端布尔值替代近期认证事件。
- 补齐Admin真实MFA挑战、proof获取和敏感动作恢复流程，实时查singleton/session；验证普通Close/Global Delete request与Link敏感步骤。普通用户可验证协议若不可用，记录具体阻塞并保持拒绝，不能将T12/G2-L标PASS。
- 验收：V-AUTH-01/03及V-DELETE-01请求子集；跨session/过期/撤销/管理员替换后proof拒绝，refresh不续期，重复请求无重复副作用；真实Local认证成功→敏感动作成功→退出后拒绝。Global Delete仅`pending_admin`，不开始purge。
- 交接：合同变更记录、失败用例、实际API覆盖表，T12 Local完成结论单独报告。

## T16-R1 — M2端到端资源补齐

- 依赖任务：T12-R2。
- 已有基础：T13～T15 SQL/SDK和M3中央Account API；逐方法复用，不另写账户或权益算法。
- 改动目录：中央HTTP adapter、`packages/account-server`、`apps/admin`、`apps/template-preview`、必要领域包装/迁移及合同测试。
- 步骤：逐条对照当前17个Account及32个Admin OpenAPI操作（已含Admin recent-proof），若T12-R2新增操作则同步数量，标记SQL/HTTP/SDK/BFF/UI/测试层实际覆盖。补M2的close、delete-request、Profile/Preferences及最小业务保护页；补平台创建/更新/读取、Origin配置、Key创建/轮换/撤销、账户suspend/restore/close的必要管理入口。缺SQL包装时补受控领域函数，不让UI直写表。
- 平台Key操作响应丢失按operation元数据追踪、撤未知交付Key再新建；Origin管理给出synced/drift/error，托管同步实测留T17-R2。M3资源由M3-R1追踪，M4资源仍contract-only；M5负责完整列表体验，不承接本任务必须的授权能力。
- 提交边界：按覆盖表与合同、平台/Origin入口、Key交付轮换、账户敏感路径、最小表单集成分小提交逐项验证；若一个子项涉及多个公共合同或难回退迁移，再拆实施子任务，不把本收尾范围做成一次大迁移。
- 验收：V-ACCOUNT-01～05、V-SDK-01/02及V-UI-01最小账户子集；真实HTTP→SQL的428/412、64KiB边界、跨目标404、停用/撤Key后拒绝、中央故障503；敏感写入与Audit同事务。创建平台不得要求手工SQL成为正常产品流程。
- 交接：逐操作覆盖表写入T16证据；未实现项各有承接任务，不笼统宣称全部CRUD完成。

## T16-R2 — 双入口浏览器验收与测试入口

- 依赖任务：T16-R1。
- 改动目录：两个应用的集成页面、`tests`、`tooling/scripts`、根测试脚本、CI及证据。
- 步骤：两个不同Origin/Platform、独立浏览器上下文，真实登录→回调/刷新→principal→activate→Profile/Preferences→业务保护→Admin停用→再次访问拒绝；共享Global Identity经合法B入口正常使用，A Key不能构造B Principal。
- 将现有API/SQL/Auth探针接入明确的可复现命令，用真实Local fixture启用`test:api`和`test:e2e`；CI补Local空库/升级、真实角色pgTAP、API负向和浏览器流程。缓存按工具存`E:\AppData\<tool>`，系统工具遵循安装约定；不使用生产凭据。依赖未启动返回明确NOT_RUN/失败，不能跳过后退出0。
- 验收：V-AUTH-01/02/03、V-ACCOUNT-01～05、V-SDK-01/02；两用户Cookie隔离、CSRF/returnTo、AAL1拒绝、proof过期、停用/中央不可用拒绝、Browser bundle无后端凭据。保留失败fixture和回归用例，脱敏报告绑定commit。
- 交接：测试入口、环境准备和清理步骤、CI实际运行链接；仅工作流定义不算CI PASS。

## T18-L — 本地阶段收口

- 依赖任务：T16-R2。
- 改动目录：阶段证据、status、批次清单；发现代码缺陷另列修复任务。
- 步骤：以候选commit重跑G1/G2-L所需检查，核对空库与从前一迁移集升级、真实角色、SQL/HTTP/SDK/浏览器对应矩阵。核对远端commit及PR集成状态，不把推送视为main合并。
- 验收：G1、G2-L的必要用例没有未归属的NOT_RUN；T12/T16按范围关闭。生成M4实现的Local依赖证明；G2-S仍按T18-S判定，父T18仍不能整体DONE。

## M3-R1 — G3完整证据收口

- 依赖任务：无。
- 已有基础：M3-01～03 Local交付；独立核对可以现在派发，不依赖M4。
- 改动目录：M3测试/证据及必要缺陷修复；已应用迁移只追加修复。
- 步骤：将V-ENT-01/02/03、V-REDEEM-01～04、V-DB-03逐子情景映射到可执行断言。重点核查月末/闰年/UTC边界、影子重放、无订阅多码首次竞争、兑换与Admin Grant竞争、Batch禁用两种提交顺序、HMAC轮换与交付响应丢失。单次同码10路成功不覆盖这些情景。
- 验收：缺失用例补齐后真实双连接/barrier、回滚/幂等和权限测试PASS才关闭G3；补M3领域/API缺项时复用现有入口。浏览器体验不由本项宣称验收，T16-R2提供运行器，M5-03/05承接完整界面与安装链路；本项交付SQL/API领域证据。
- 交接：逐项PASS/FAIL/NOT_RUN及命令，不能由“M3 Local DONE”推定G3整体PASS。

## T17-R1 — 托管SQL角色、TLS和网关合同

- 依赖任务：无。
- 已有基础：X01及Staging基础Auth/API证据；启动时重新确认目标、权限和实际部署版本。
- 改动目录：受控Staging配置/部署脚本、适配层必要修复、ADR/合同及T17证据；不改生产。
- 步骤：核对部署真实SQL连接身份、Account/Admin独立最小executor、TLS事务pooler、prepared statement和连接回收。现证据使用默认`SUPABASE_DB_URL`，不能证明独立executor或TLS合同；不能直接推定它已使用高权限角色，也不能当作已通过。
- 核对`verify_jwt=true`部署记录与安全专题要求关闭旧网关预验证的差异：按当前官方文档、固定版本与真实请求矩阵修配置或先登记ADR修合同；公开plans无用户token但有平台Key、缺Key/坏JWT/未知路由均按合同。不给“部署成功”增加权限合格含义。
- 验收：SP-SQL托管、V-DB-02、V-AUTH-01、V-ACCOUNT-05；真实executor允许入口和越权拒绝、TLS/连接隔离证明、公开和受保护路由矩阵。凭据不可用时记录阻塞并交付可独立配置规格。

## T17-R2 — 托管SSR与真实Provider

- 依赖任务：T16-R2,T17-R1。
- 外部条件：X02实际Admin/BFF站点、域名及可信代理；X03 Google/SMTP。
- 改动目录：Auth/Origin适配必要修复、受控环境配置、托管浏览器测试及证据。
- 验收：SP-AUTH托管、V-AUTH-01～04；真实Google、确认/重置邮件、Link冲突/近期认证、Cookie刷新、双用户隔离、Admin MFA、local/global logout及旧JWT拒绝；Origin配置漂移阻止启用。临时fixture清理且报告脱敏。
- 交接：只补真实环境差异，不以Local成功代替Provider；缺X02/X03保持WAITING/BLOCKED。

## T17-R3 — 托管上传技术探针

- 依赖任务：T17-R1。
- 外部条件：X02实际BFF host与受控Staging Storage测试条件；复用T06探针，不等待完整M4状态机。
- 改动目录：上传探针、Storage adapter实验、T17/G0-S证据和必要ADR。
- 验收：SP-UPLOAD托管、V-FILE-01原型；双层1MiB/超限、chunked、断流、并发、内存、请求时限、取消/迟到结果。记录供应商能证明何种结算事实；无法证明取消时采用保留unknown及预算的合同，不宣称Storage有fencing。
- 交接：为M4-11提供真实host限制和证据边界；不以原型证明G4-S。

## T18-S — 托管门槛与首批最终交接

- 依赖任务：T18-L,T17-R2,T17-R3。
- 改动目录：G0-S/G2-S、T17/T18、status、版本及集成报告。
- 验收：G0-S/G2-S条件全部有真实环境证据，未解决安全/合同偏差明确关闭；首批任务按原范围逐项收口。T17完成不等于M3/G4或生产已验收。
- Git：核对候选commit、远端分支和CI/PR状态；只在明确合并授权下合并，生产发布仍独立。

## 下一项派发指令

> 执行本文件T12-R1。先读取架构、M2、公共合同、T04/T12证据及DP2校准记录；复用已交付认证边界，完成真实SSR和双会话logout范围验证。只执行本项及必要依赖检查，按工具安装/缓存规则操作，记录Local与真实Provider边界，提交并核对远端，不自动执行其余任务。
