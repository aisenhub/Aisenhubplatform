# M6-01 环境、配置、备份与运维协议

更新：2026-09-08  
任务：M6-01  
前置：M4-01合同冻结  
状态：设计交付；真实备份、恢复、发布和生产操作未授权

本文把现有架构、运维合同和M4-01屏障字段整理为可执行的后续runbook输入。真实host、凭据和渠道只在受控环境确认，不写入仓库。

## 1. 环境与责任矩阵

| 资源 | Local | Staging | Production | 最小责任/输入 | 漂移证据 |
|---|---|---|---|---|---|
| Supabase项目/Auth | 仓库CLI/虚构用户 | X01项目与版本 | 独立项目，禁止复用Staging | 平台owner；区域、项目标识、迁移版本 | CLI版本、迁移历史、Auth配置摘要 |
| BFF/Account API/Edge | 本地进程 | X02 host、代理链、部署版本 | 独立host与发布窗口 | 应用owner；Origin、函数版本、网关合同 | 请求ID/版本/health脱敏记录 |
| SQL executor/pooler | Local角色探针 | T17-R1确认独立角色/TLS | 独立Account/Admin/Job/Recovery凭据 | 安全owner；连接URL由Secret Manager注入 | 角色权限快照、TLS/连接参数摘要 |
| Storage/bucket | Local私有bucket | X02真实Storage | 独立私有bucket | 文件owner；bucket policy、对象限额 | policy摘要、对象manifest |
| 备份/墓碑/告警 | 隔离模拟 | X04目标与渠道 | 独立加密恢复目标 | 运维owner；加密、保留、接收人 | manifest、送达测试、恢复记录 |
| Registry/正式产物 | 不部署 | X05或固定本地tarball | 受授权host/scope | 发布owner；scope、host、凭据 | 版本、校验和、安装报告 |

## 2. 配置和Secret清单

配置模板只登记变量名、环境别名、owner、版本和是否必需；真实值由受控配置注入。Publishable key可以进入浏览器，但Secret key、SQL URL、Platform Key、HMAC和备份凭据只能存在server/worker Secret Manager。

| 类别 | 变量/配置 | 轮换与验证 |
|---|---|---|
| Auth | `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、Auth redirect/Origin allowlist | 部署后密码登录/refresh/logout；OAuth/SMTP由T17验证 |
| Account/Admin/Job DB | `ACCOUNT_DB_URL`、`ADMIN_DB_URL`、`JOB_DB_URL` | 独立角色、TLS、prepare/连接回收；不得以postgres替代 |
| 平台/兑换 | 当前/上一 `PLATFORM_KEY_HMAC_SECRET`、`REDEMPTION_HMAC_SECRET` 及 `REDEMPTION_HMAC_*_VERSION` | 新版本 verify-only→部署→验证→撤旧；不恢复明文 |
| Storage | bucket固定为`platform-config-files`、Storage server credential | get/put/remove权限与私有下载验证；无signed upload |
| 备份 | 加密目标、manifest key、墓碑副本、告警webhook | 独立凭据；不与普通dump明文混放 |
| 运行参数 | P01～P08默认值、迁移/函数/调度版本 | owner在G4-S/G6前确认，变更需记录原因与受影响用例 |

## 3. 联合备份协议

每天由受控job以有效 `job_context` 获取租约并创建恢复集。流程固定为：

1. `file_backup_barrier_begin` 持久化scope、recovery_set_id、manifest版本、owner/fence和deadline；只暂停物理删除，不阻止新上传。
2. 取得数据库一致快照和active/未结算文件清单，记录平台/账户/文件引用、不可复用对象path、size、SHA-256、状态和migration/config版本。
3. 从私有Storage复制清单对象到独立加密目标，逐对象校验size/hash；任一active对象缺失或复制失败，恢复集不能成功。
4. 写入完整manifest和完成时间，`file_backup_barrier_finish` 标记complete；快照后新上传不纳入该恢复点。
5. 失败或超过2小时：先将恢复集标记failed并记录错误，再解除屏障；保留上一完整恢复集并触发告警。

manifest不得包含Secret、完整Cookie、原始文件内容或兑换码明文。删除墓碑沿用M4-01最小非公开字段；主库外保存后，恢复流程必须先重应用墓碑再开放业务。数据库备份不替代对象备份，RPO 24小时/RTO 4小时仅为待演练目标。

## 4. 运维任务与告警矩阵

| 任务 | 频率/租约 | 关键检查 | 告警/退出条件 |
|---|---|---|---|
| 文件删除/过期/重试 | 每分钟；job lease/fence | unknown不归零、备份屏障、remove后确认 | unknown>5分钟、deleting>15分钟、10次转人工 |
| 文件对账 | 每小时分页 | active缺失、孤儿、迟到对象、预算漂移 | 归属不明隔离；不得自动猜测删除 |
| 联合备份 | 每日；2小时deadline | DB快照、active对象hash、manifest完整 | 失败/超时先failed再解除；渠道送达 |
| Secret/Key轮换 | 按变更窗口 | 新凭据成功调用、旧凭据拒绝/verify-only | 撤旧前未成功验证则退出不变更 |
| 容量/授权压测 | G6前受控执行 | 100rps/15min、p95≤500ms、错误率<1%候选目标 | 资源/成本不达标则不宣称通过 |

每项告警记录operation_id、request_id、环境别名、版本、状态和脱敏错误码，不记录文件内容、Token或凭据。告警渠道未由X04提供时只能隔离模拟，不能写成实际送达。

## 5. 恢复与退出标准

首次恢复必须在隔离项目，关闭邮件、业务流量和对外Webhook。按manifest恢复DB与对象并校验hash，然后按顺序：重应用外部删除墓碑、撤销全部恢复出的Auth会话、禁用恢复出的Platform Key、禁用未用旧Code、重设/轮换各SQL/Storage/备份凭据、恢复任务lease和unknown/deleting状态，最后运行Auth/Principal/兑换/文件/删除权限回归。

恢复点之后的业务记录只有独立可信事件才能按operation_id幂等补录；否则记录RPO窗口和人工补偿，不凭用户陈述猜测Ledger。任一active对象缺失、hash不符、墓碑无法应用、旧凭据仍有效或未知写入被释放时，恢复集失败并停止开放流量。

生产发布前必须具备G0-S、G1、G2-S、G3、G4-S、G5-L/P及V-OPS-01/02/03证据；M6-06仍需用户明确授权，Git push、CI成功或Staging通过均不构成生产发布授权。

## 6. 外部输入与承接

X02（host/代理链）、X04（独立备份/告警）、X05（Registry scope/host/权限）、X06（区域/预算/容量）仍未在本地证据中确认。M6-02实现联合备份与外部墓碑，M6-03在隔离环境恢复/轮换，M6-04执行容量/告警；M6-05才做G6候选审查。任何外部输入缺失时，保留明确BLOCKED/NOT_RUN，不用本地模拟替代真实门槛。
