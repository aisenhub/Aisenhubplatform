# 第三批任务：M4配置文件与持久任务

日期：2026-09-08；DP2。依据[M4规格](../modules/M4-files-jobs.md)、[文件合同](../../config-files.md)、[认证清除合同](../../auth-security.md)、[运维](../../operations.md)、[公共合同](../contracts.md)及[验证计划](../verification-plan.md)。M4-01规格与M4-02 Local持久模型已交付；后续文件/Storage/worker验收仍按各任务逐项运行。

## 依赖和执行规则

M4-01规格可现在派发；M4实现从M4-02开始，必须取得[收尾任务](closeout-01.md)T18-L的G1/G2-L证明。托管文件验收另需T18-S和T17-R3，不用X02/X03缺失阻塞所有本地规格。Global Purge涉及M3历史，M4-09额外依赖M3-R1。

复用现有`private.job_leases`、删除请求/job、幂等、审计、身份门闩、account/admin/job context，不能重复建一套任务设施。新迁移由固定CLI生成时间戳，顺序如下表；类型、OpenAPI、SDK、消费者和测试同任务同步。每项完成有独立commit、远端确认及`evidence/M4-xx.md`报告（执行时创建）；本次不创建虚构PASS报告。

| ID | 交付 | 依赖任务 | 初始状态 |
|---|---|---|---|
| M4-01 | 文件/恢复合同与故障矩阵冻结 | 无 | DONE（合同交付；证据见 M4-01） |
| M4-02 | 持久模型、权限与备份屏障基础 | M4-01,T18-L | PASS（Local；空库升级、结构/RLS/真实角色负向通过） |
| M4-03 | 策略、配额预约和接收状态SQL | M4-02 | PASS（Local；预约/幂等/claim/prepare/配额与审计通过） |
| M4-04 | 有界HTTP上传与可信Storage adapter | M4-03 | READY |
| M4-05 | 删除、过期、对账与持久worker | M4-04 | WAITING |
| M4-06 | Replace原子切换与竞争恢复 | M4-05 | WAITING |
| M4-07 | 列表、状态、用户/Admin下载 | M4-04 | WAITING |
| M4-08 | 文件策略与最小管理/消费页面 | M4-05,M4-06,M4-07 | WAITING |
| M4-09 | 关闭保留清理与Global Purge | M4-05,M3-R1,T12-R2 | WAITING |
| M4-10 | G4-L故障与集成验收 | M4-08,M4-09 | WAITING |
| M4-11 | G4-S实际host验收 | M4-10,T18-S | WAITING |

## M4-01 — 冻结文件与恢复合同

- 依赖任务：无。
- 改动目录：`docs/config-files.md`（仅需明确既有语义时）、M4规格、公共合同、OpenAPI/DTO设计和决策登记。任何实际公共接口变更同时同步消费者，不先暴露假成功。
- 交付：SQL入口逐一列参数/结果、授权角色、锁顺序、幂等域、允许前后状态和错误；文件6个Account操作以及Admin file-policy/files/deletion-jobs现有资源逐条映射，禁止增设浏览器complete或signed-upload路径。
- 明确`status`与`write_outcome`分离：unknown是写入结果，不新增不兼容的status枚举。定义取消、重试、恢复查询、SHA-256/size证据、partial unique、游标、文件名转义及无界metadata拒绝规则。
- 定义M4/M6共享的持久备份删除屏障：scope、恢复集标识、状态、租约、超过2小时先失败恢复集再解除、删除前再次核对；定义删除墓碑的最小非公开字段及M6外部持久化交接。没有备份任务时也能注入屏障验证删除被阻止，不另造一套lease。
- 验收：V-FILE-01～07、V-JOB-01、V-DELETE-01每个失败点有预期DB/预算/对象/Audit四方面结果；依赖无环、字段与专题一致。此项文档通过不等于G4-L。

## M4-02 — 持久模型与权限

- 依赖任务：M4-01,T18-L。
- 改动目录：新增`supabase/migrations`、`supabase/tests`、生成数据库类型、必要domain合同。
- 交付：`platform_file_policies`、`platform_config_files`、`private.file_write_attempts`及M4-01定义的屏障/墓碑持久设施；只增补既有job字段。复合FK约束同平台/账户及替换目标；每file最多一个未结算attempt；对象路径不可复用；可变表版本/updated_at、调度索引和RLS/最小授权。
- 验收：V-DB-01～04文件子集；空库reset与基线13个迁移集升级得到一致模型，真实account/admin/job角色不能直接DML，anon/authenticated不能读写私有文件或表，跨账户替换、非法active元数据和重复attempt拒绝。生成类型与迁移一致。

## M4-03 — 策略、预约与接收SQL

- 依赖任务：M4-02。
- 改动目录：新增领域迁移、SQL/并发测试、domain DTO和文件SDK元数据方法。
- 交付：Admin受控file-policy更新；`file_intent_create`、`file_receive_claim`、`prepare_store`、`finalize`及同一配额帮助函数。身份/平台/Key检查后锁账户，再按ID锁文件；平台策略修改按公共锁顺序；Storage不在事务内。
- 规则：1MiB/10个/10MiB默认；所有reserved行入SUM；每账户意图限流10/分钟、最多2个pending/receiving/storing。pending有效10分钟；降策略保留现有对象、显示over_quota，阻止新增与Replace，仍允许合规读取/删除。收齐按actual调整预算；Suspend后已授权写入可结算，Close/deleting补偿而不再开放。
- 验收：V-FILE-02/03、V-TXN-01/02；20路真实并发预约不超数量/字节，barrier控制竞争；同幂等key同/异请求、lease旧fence、策略降低竞争、身份门闩和审计回滚。超时状态本身不能释放预算。

## M4-04 — 双层有界上传与Storage适配

- 依赖任务：M4-03。
- 改动目录：`supabase/functions/_shared`、`account-api`、`packages/account-server`、Consumer BFF、上传/API故障测试。
- 交付：已有upload-intent与content PUT路由，BFF和中央分别在读body前取实例/账户接收名额；有界读取最多limit+1；15秒接收、30秒存储预算在host余量内。复用T06原型中验证过的逻辑，经审查接入领域状态。
- Storage adapter只提供putImmutable/getInfo/download/remove；独立server-only凭据，固定private bucket与不可变路径，upsert=false。prepare_store提交后才PUT，成功核验对象大小及内容证据再finalize；hash以可信完整字节为准，不把任意ETag当SHA-256。网络超时记录unknown，不重复PUT。
- 验收：V-FILE-01/03/05；伪造大小、0字节、压缩、chunked超限、断流、名额拒绝，证明入Storage调用为0；同file同内容重试返回原结果、异内容409；Storage成功DB失败、响应丢失和迟到PUT保留占用。实际Local Storage与可控故障adapter分别报告，mock不替代host测试。

## M4-05 — 删除、过期、对账与持久worker

- 依赖任务：M4-04。
- 改动目录：删除/补偿领域过程、新增迁移、`supabase/functions/maintenance`、受控调度配置、故障测试。
- 交付：DELETE返回202及现有状态；每分钟领取过期/删除/重试任务，每小时分页对账；复用claim/checkpoint/finish与fencing，job鉴权独立于用户/Admin，不能接收任意SQL/表名。
- 规则：pending/receiving仅能在证明未写入时归零；unknown/in_flight不得因一次404或租约到期释放/二次PUT；delete等待结算与备份屏障，使用Storage API remove，确认后才释放。退避1分钟起、上限1小时、10次转人工，unknown超过5分钟/deleting超过15分钟形成告警事件。
- 对账覆盖active缺失、孤儿、已删除行迟到对象、预算漂移、unknown和积压；归属不明隔离，人工审核不能绕过结算证明。M6接实际告警渠道；本任务交可验证的告警事件和人工重试受控入口。
- 验收：V-FILE-05/06、V-JOB-01；remove成功DB提交失败重试、lease过期旧worker、备份屏障、无对象但原PUT未结算、任务重启恢复均不提前归零。失效屏障先标备份失败再解除，不能仅按时间视为无屏障。

## M4-06 — Replace原子切换

- 依赖任务：M4-05。
- 改动目录：文件领域过程追加迁移、SDK输入验证、并发/故障测试。
- 交付：新对象独立预约，目标同账户active且仅一个进行中的Replace；验证成功在同事务新active/旧deleting，旧对象删除确认前双份预算。目标被独立删除时按FILE_BUSY合同处理。
- 验收：V-FILE-04/05/06、V-DB-03；满数量或字节返回REPLACEMENT_CAPACITY_REQUIRED，旧内容可下载；新写失败、DB回滚、重复finalize、Replace/Delete/Close竞争及两次替换排斥，验证对象/预算/关系/Audit。不自动删旧文件腾空间。

## M4-07 — 元数据查询与下载代理

- 依赖任务：M4-04。
- 改动目录：Account/Admin查询包装与HTTP、SDK、BFF、SQL/API测试。
- 交付：文件列表/详情及预算状态，默认20最大100稳定游标；下载逐次查同平台同账户active，Admin额外近期MFA。缺失对象不可下载并进入告警，不返回永久URL。
- 验收：V-FILE-07、V-SDK-01/02；跨用户/平台404、停用/关闭拒绝、Admin proof失效拒绝；octet-stream/attachment/nosniff/private,no-store及安全文件名。Audit区分授权、流结束、失败；流开始后失败不混入JSON或误报客户端已保存。

## M4-08 — 最小文件管理与消费UI

- 依赖任务：M4-05,M4-06,M4-07。
- 改动目录：`apps/admin`、`apps/template-preview`、相关BFF、浏览器测试。
- 交付：Admin策略页与文件状态/删除/下载；Consumer意图→上传→状态→下载→Replace/删除。展示所有预算占用、剩余空间、over_quota、unknown、取消已请求和deleting，不声称202即释放；只查询状态恢复，不自动重发上传流。
- 验收：V-UI-01、V-FILE-04/07、V-SDK-02；真实Local浏览器路径、满容量提示、断网恢复、MFA过期、无权限/空/错误状态；页面均经领域API。完整资源导航/品牌与Registry由M5完善。

## M4-09 — 关闭保留清理与Global Purge

- 依赖任务：M4-05,M3-R1,T12-R2。
- 改动目录：受控purge/匿名化过程、maintenance、Admin删除任务最小start/retry/status页面及API、故障测试。
- 交付：Close默认30天后的Profile/Preferences/文件清理，保留账户墓碑和Global Identity；Suspend不触发清理。Global Delete经Admin近期MFA批准后，请求/身份门闩/job同事务，随后分步撤全部会话→关账户→结算写入/删对象→清个人信息→匿名化历史→解除受控restrict依赖→删Auth→最终匿名化job。
- 范围：清理文件名、metadata、幂等响应个人信息、actor/IP/UA/自由文本；保持Grant业务效果及关系。删除间隙持续由job门闩阻止lazy identity/activate/Grant/upload；当前Admin须先完成离线替换，不临时去掉singleton约束。
- 交接：持久删除墓碑和受限导出边界供M6外部备份重应用；明确保留阻塞返回blocked，未知写入不猜测成功。生产清除及恢复不由本任务自动授权。
- 验收：V-DELETE-01、V-JOB-01、V-DB-03；每一步故障后重启续跑，多worker旧fence、Auth删除失败、保留阻塞、Global Delete与新Grant/上传/激活竞争。关闭A的定期清理不影响B；匿名化后所有FK完整，受控测试时钟不授予生产executor。

## M4-10 — G4-L集成与故障验收

- 依赖任务：M4-08,M4-09。
- 改动目录：测试、CI、M4证据、status；缺陷另以小提交修复。
- 验收：V-FILE-01～07、V-JOB-01、V-DELETE-01及权限/FK回归全部实际运行；收齐前、prepare后、PUT前中后、finalize前后、remove后DB提交前、lease失效和备份屏障各故障点核对DB/预算/对象/Audit。空库及上一迁移集升级、真实角色、Local Storage、双入口浏览器和bundle扫描均有证据。
- 交接：候选commit与远端核对、G4-L矩阵和托管遗留表；M4-11未过时不能宣布G4-S。M5可据此冻结文件集成细节。

## M4-11 — G4-S实际host验收

- 依赖任务：M4-10,T18-S。
- 外部条件：X02及P01/P05确认；继承T17-R3实测限制。
- 改动目录：受控Staging测试/配置、必要适配修复、G4-S证据。
- 验收：实际BFF→Edge→Storage→SQL完整链路；并发内存、1MiB硬边界、真实断流/超时/迟到写入、unknown告警和人工处理、删除重试及对账。无法确认供应商取消时，证明unknown持续占用且可运维；不设超时自动归零。缺陷修复回归G4-L，记录资源与预算实测。
- 交接：G4-S报告供M6恢复与容量验收；不是生产发布。

## M5/M6承接

M5补全Admin/SDK/Registry及独立消费者；M6早期确认备份屏障、外部墓碑和host边界，正式演练依赖M4对象模型。后续任务见[DP2路线](../roadmap-dp2.md)，本批不增加支付、组织或第三方平台能力。
