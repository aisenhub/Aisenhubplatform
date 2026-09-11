# 运维、备份、恢复与发布

本文件描述当前运维、备份、恢复和发布规则。实际环境、备份送达、恢复演练和生产观察必须以对应环境的真实记录为准；本文件不替代运行记录。

## 1. 环境和发布

Local 和 Production 使用独立 Supabase 项目/实例，不共享 Auth 用户、数据库、对象、Secret、Platform Key、HMAC、兑换码或数据库凭据。本项目不设置 Staging 环境；Preview 仅作为 Local 的开发预览，只接 Local，禁止连接 Production。生产数据不作为 Local fixture。

迁移由Supabase CLI生成时间戳文件，版本固定后先读CLI help。Auth/Storage/Origin/调度配置纳入受控配置与漂移检查，不能依赖开发者手工Dashboard操作。Secrets只存各环境Secret Manager，仓库保存变量名与配置模板。

CI 负责执行仓库中已配置的格式、lint、typecheck、构建、领域单测、运行时和文档检查；空库 reset、升级、角色权限、攻击、并发、故障注入、真实消费项目 E2E 等检查只有在对应脚本存在并实际运行时才能计入结果。测试期间仅使用虚构数据。

安全、审计、并发和恢复测试在对应功能开发时建立；发布前执行统一回归。生产迁移是独立release gate，不随普通merge执行。数据库变更采用expand→兼容部署→验证→contract；已产生业务数据后优先forward-fix，不通过删除Ledger来“回滚”。

发布路径固定为 Local → Production。Local 验证通过并取得上线授权后，才执行生产迁移和部署；不创建、不维护、也不把 Staging 验证作为发布条件。高风险数据库、Auth、Storage、权限或并发变更仍须在 Local 完成定向验证，并准备生产迁移的回退/前向修复方案。

发布证据包含依赖锁、上游commit/license、迁移结果、测试报告、备份manifest、恢复演练、Key轮换、配置漂移检查和实际Edge/BFF限制报告。缺证据标为未验收，不用勾选符号假装已完成。

## 2. 分层备份和恢复指标

V1基线目标：数据库及配置对象联合RPO<=24小时，RTO<=4小时；均为待演练证明的目标，不是Supabase承诺。任一每日备份超过24小时未成功立即告警并禁止声明满足RPO。若业务要求更短丢失窗口，须同时升级DB与对象备份，而非仅开启PITR。

| 资产 | V1策略 |
|---|---|
| Database/Auth元数据/业务历史 | 每日可恢复数据库备份；保留30天的受控异地恢复集，托管平台保留期不足时补足独立备份 |
| Config文件对象 | 每日复制到独立备份存储，保存不可变版本、路径、size、SHA-256，与数据库恢复集manifest关联 |
| 配置/迁移/Registry | 版本库及已发布不可变产物，记录Auth allowlist、bucket policy、函数和调度版本 |
| Secrets/自定义SQL角色密码 | 单独加密备份或可执行重新签发步骤，不与普通数据dump明文混放 |
| 恢复与清除记录 | 独立于主库保留恢复批次、删除墓碑和轮换记录，防止恢复旧库后丢失安全处置 |

Supabase数据库备份不包含Storage实际文件；对象恢复必须独立验证。[官方备份说明](https://supabase.com/docs/guides/platform/backups)

每日一致性任务：建立备份屏障暂停物理对象删除→取得数据库一致快照及对应活跃对象清单→复制清单中的不可变对象并校验hash→提交manifest/时间点/配置版本→解除删除屏障。新上传不阻塞，快照后对象不纳入该恢复点。备份失败记录未完成集并解除屏障，保留上一完整集，不将部分备份标记为成功。

屏障必须持久化且有任务租约；达到2小时未完成告警，先将恢复集标记失败再解除屏障。删除中的对象是否需要复制由快照状态决定，active必须完整；缺任一active对象则该联合恢复集不合格。主存储配额与备份存储费用分别计量。

每季度及重大迁移后在隔离项目演练：

1. 选定完整manifest，冻结对外业务、任务和邮件发送，恢复DB及配套配置。
2. 恢复全部active对象，按size/hash核对；自定义SQL角色密码按runbook重设或轮换。
3. 应用独立保存的删除墓碑，防止已删除身份/文件恢复后重新出现；删除清单自身受限访问并按保留期处理。
4. 撤销恢复出的全部Auth会话；所有恢复出的Platform Key先禁用，重新生成/部署有效Key。
5. 禁用恢复集里所有尚未兑换的旧Code/Batch，避免恢复点之后已兑换的码再次使用；已确认恢复的历史Grant保留。
6. 若有独立可信的恢复点后业务记录，按operation_id幂等补录；否则明确标记RPO内数据丢失并走人工补偿，不从用户陈述猜测重放。
7. 对unknown上传、deleting对象、任务租约和幂等缓存重新对账；失效worker不能继续更新。
8. 验证租户约束、Admin恢复、公开套餐、授权、兑换、文件上传下载和删除，再开放流量。

记录恢复耗时、丢失窗口、对象缺失数、hash不符、步骤失败和修复结果。RTO未满足就更新容量/流程并重新演练，不能只写“已开启备份”。

关闭账户的资料/文件默认30天后清理；成功Global Delete尽快清除在线副本。备份最多保留30天并隔离访问，恢复必须重应用删除墓碑。业务历史默认保留365天后按运营策略归档最小字段；若保留要求阻止清除，任务显式blocked，不返回删除完成。

## 3. Key、HMAC 与会话轮换

Platform Key：创建新active Key→部署BFF→确认新Key有成功请求→撤销旧Key；每次都审计，管理员近期MFA。凭据外观含key id/version，数据库只存HMAC；撤销不缓存，后续授权立即检查实时状态。

Key HMAC与兑换码HMAC分开。新Secret版本生成新凭据，旧Secret verify-only；不可在没有明文时重新计算旧HMAC。平台旧Key通过重新签发退出；兑换码旧版本保留到相关Batch全部失效，疑似泄露时禁用未用Code/Batch并重发。

Supabase Secret、SQL账户密码、备份凭据分别轮换，各有部署顺序和撤销验证；Account/Admin/Job不共用一组SQL登录密码。Secrets命名模板包括SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY、ACCOUNT_DB_URL、ADMIN_DB_URL、JOB_DB_URL、PLATFORM_API_KEY、PLATFORM_KEY_HMAC_SECRET、PLATFORM_KEY_HMAC_SECRET_PREVIOUS、REDEMPTION_HMAC_SECRET、REDEMPTION_HMAC_SECRET_PREVIOUS、REDEMPTION_HMAC_KEY_VERSION、REDEMPTION_HMAC_PREVIOUS_KEY_VERSION。上一 Secret 仅用于 verify-only，确认所有旧 Key/Code/Batch 已失效后才撤销。

## 4. 管理员恢复

覆盖MFA设备/邮箱丢失、Auth封禁或损坏、singleton映射损坏、Admin部署不可达与Auth故障。正常运行最多一名active管理员，无隐藏常驻第二账号。

离线操作需要项目所有者控制的基础设施入口；建立工单/恢复ID、备份当前singleton、确认新专用用户已完成MFA，再以限时recovery_executor在事务内替换singleton。替换后撤销旧Admin所有会话/step-up，轮换恢复中接触的Secret，审计并关闭恢复入口。

Auth完全不可用时不绕过认证开放Admin网页；通过基础设施运维恢复Auth/部署。应用可保持不可用直至验证通过。新账号准备阶段不是第二名应用管理员，只有singleton切换后才获得权限。

## 5. Durable任务与容量

清理/删除重试每分钟运行，对象对账每小时分批运行，联合备份每天运行。Billing processing 使用独立的 job lease/fencing：`/maintenance/v1/billing/jobs/claim` 领取批次，`/maintenance/v1/billing/jobs/process` 在事务外调用 Provider adapter 后进入 `billing_order_query_target`/`billing_order_verify_and_settle`，`/maintenance/v1/billing/jobs/finish` 以 lease 结算成功/失败；Provider 网络等待不持有数据库事务。任务用数据库job lease、fencing_token、retry_count和next_attempt_at，禁止将Edge响应后的未跟踪Promise作为可靠任务。

当前仓库调度清单只声明每分钟领取最多20个 Billing job；process/finish 由同一受控 worker 在领取后完成，不能仅凭存在HTTP入口宣称已自动调度。发现游标和处理游标独立记录，Admin metrics 同时展示两者的最后成功时间、pending/retryable/manual_review 和 oldest pending。Checkout、Webhook、后台领取和自动结算分别由 `BILLING_CHECKOUT_ENABLED`、`BILLING_WEBHOOK_INGRESS_ENABLED`、`BILLING_BACKGROUND_PROCESSING_ENABLED`、`BILLING_AUTO_SETTLEMENT_ENABLED` 控制；关闭 Checkout 不会误关已付款入站，关闭结算不会删除积压任务。真实调度密钥、Provider 限流预算、告警接收人和停机恢复演练属于 G-OPS，当前 NOT_RUN。

数据库临界区短事务，不跨Storage网络等待。失效lease的worker不能提交新状态；不把fencing等同Storage的写入取消。未知Storage写入保留配额直到确认结算，无法确认时转人工，不无限释放预算重试。

重试指数退避1分钟起、上限1小时，最多10次后转人工队列并持续告警；任务本身幂等。deleting超过15分钟、unknown写入超过5分钟、备份失败/超时、配额漂移立即告警。

V1授权API目标p95<=500ms，上线前在 Local 按预期平台数及至少100次/秒聚合授权查询进行有界压力探针，连续15分钟错误率<1%；达不到则降低已承诺容量或优化连接/查询后重测，不能靠缓存授权隐藏一致性问题。Production 上线后继续记录真实延迟、连接/锁等待和错误率，发现偏差时按生产观察结果修复。

记录每平台授权延迟、DB连接/锁等待、兑换冲突、限流次数、上传内存/并发、未结算对象、主存储及备份占用。BFF与Edge的实际内存/请求/CPU限制必须验证，单文件1MiB不是无限并发的许可。[Edge限制](https://supabase.com/docs/guides/functions/limits)

## 6. 必需测试矩阵

| 领域 | 必测证据 |
|---|---|
| 租户与角色 | 两用户三平台，同名套餐；错误FK、事件同账户/码关联；真实executor权限；浏览器Data API/Storage负向测试 |
| 身份 | issuer/audience/session、SSO不作承诺、同项目正常跨平台身份、BFF CSRF、Origin同步、Link冲突、管理员专用身份 |
| 生命周期 | allow_activation、Suspend/Close、deleting期间并发激活、身份墓碑与所有FK、管理员替换后旧会话 |
| 权益 | Free→Pro、到期/无默认、永久、不同Plan、暂停/恢复、月末/闰年、撤销缺口、影子Projection重放 |
| 兑换 | 同码竞争、多码首次、Admin并发、Batch禁用并发、同key同/异body、超时/提交后响应丢失、交付未确认不可用 |
| 文件 | 入存储前真实字节拒绝、chunked/伪造size、并发预算、满额Replace不损旧文件、unknown写入、DB/Storage各故障点、删除与备份屏障 |
| 集成 | 全新消费项目SDK/Registry安装、公开Pricing、Auth/SSR、业务授权、账户/兑换/文件全链路、Secret bundle扫描 |
| 运维 | 空库与升级、联合恢复、hash核对、删除墓碑、Code/Key恢复禁用、全部轮换、任务重复/超时与告警 |

验证记录必须分清“文档静态检查”“自动化测试”“Local 演练”“生产观察”。没有实际运行的检查只能标为未验证。
