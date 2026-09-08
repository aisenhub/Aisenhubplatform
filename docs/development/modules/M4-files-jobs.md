# M4 配置文件与持久任务实施规格

状态：IN_PROGRESS；M4-02持久模型与权限基础已通过Local，后续实现仍依赖M2账户/授权、M1任务/门闩、SP-UPLOAD结论。依据[文件合同](../../config-files.md)、[安全清除流程](../../auth-security.md)。

DP2已细化为[第三批11项任务](../tasks/batch-03.md)：规格可先做，实现须T18-L确认G1/G2-L；G4-S另依赖完整托管门槛。M4/M5/M6衔接见[后续路线](../roadmap-dp2.md)。

## 1. 范围和产物

文件策略、预算预约、受控后端字节上传、状态查询、下载代理、Replace、删除、对账、任务重试和Global Purge对象阶段。同步交付最小文件Admin与Consumer UI。

不提供签名直传、外部complete、对象覆盖、在线解析/预览/解压、隐藏临时配额或未经确认释放未知写入预算。

## 2. 持久模型补齐

落实platform_file_policies、platform_config_files及replace复合FK；复用现有private.job_leases和删除job，不重复创建。所有有reserved占用的行参与SUM，状态不是释放预算的充分条件。M4-01定义备份删除屏障/墓碑接口，M4-02持久化基础，M4-05删除流程消费，M6接入真实联合备份。

增加private.file_write_attempts：attempt_id PK、同平台/账户fileId复合FK、fence、started_at、settled_at、state(in_flight/confirmed/unknown/settled_absent)、provider_request_id nullable、error_code。每file最多一个未结算attempt的部分unique索引，结果只由可信adapter或恢复流程写入。

cancel_requested_at、retry_count、next_attempt_at、last_error_code为文件/任务恢复字段；客户端不能改。provider_request_id只存非Secret相关ID，hash只校验实际已收齐内容。

## 3. 流程分解

file_intent_create：验证用户/Key/政策→账户锁→检查count/bytes与并发意图→预留声明size→新pending10分钟→Audit/idem同事务。

receive_claim：用户重新鉴权+行租约→pending变receiving。BFF与Edge分别在body读取前申请并发名额，有界读取actual<=min(requested,policy)，拒绝压缩体/0字节/超限，过量时不调用Storage。

prepare_store：收齐后重新查身份/平台/Key/策略/fence，记录actual/hash/attempt并调整预算，变storing后提交；Storage网络调用在事务外，upsert=false、路径不可复用。

finalize：可信存储结果确认大小/hash关联，账户锁+fence检查→active或关闭中转deleting。Suspend后已授权写入可结算，访问继续拒绝；Close/Delete不能重新开放。

client retry：同fileId同hash返回既有；不同hash409。in_flight/unknown不能启动新并发PUT；前端先查状态，不能以自动重试产生第二路径。

## 4. 删除、Replace与未知写入

Replace用新对象独立占用预算，旧对象保留至新对象验证成功；事务切active/deleting，旧对象实际删除后才释放。满容量返回REPLACEMENT_CAPACITY_REQUIRED，旧文件必须完整；不自动删除目标腾空间。

Delete先标deleting并审计，任务等未结算写入和备份屏障解除，调用Storage remove并确认，然后归零预算。重复Delete幂等；网络超时不是已删。

unknown必须持续计费；一次HEAD404不证明迟到PUT不可能发生。接收租约仅保护DB更新，不能声称Storage支持fencing。M4提供人工处理界面所需状态/证据：fileId、attemptId、时间、fence、hash、provider request ID和预算；人工动作也必须由受限恢复函数验证并审计。

没有可验证结算依据时保持unknown并告警，不设“过15分钟自动归零”的捷径。后端停止等待和供应商操作终结是不同事实。

## 5. 任务和清除

每分钟领取删除/过期/重试任务，每小时分批对账；claim原子分配owner/fence，checkpoint只接受有效fence。多worker不重复执行状态切换，10次失败转人工，不静默丢任务。

Global Delete由M2请求经Admin近期MFA批准启动：持久门闩→撤销会话→关账户→处理未结算写入→删对象→清资料/匿名化历史→账户脱离user→解除restrict依赖→删除Auth→最终匿名化job。任一步可恢复，备份删除墓碑交给M6持久化外部副本。

任务门闩早于lazy identity row检查；清除过程中不允许新激活/Grant/文件。Policy保留阻塞标blocked，不返回完成。recovery/job函数不能接受任意表名或任意SQL。

## 6. 下载和UI

用户及Admin下载均经后端鉴权代理，attachment/nosniff/no-store；Admin近期MFA。Audit区分授权、流结束和失败，不把HTTP流结束当作客户端保存证明。

UI展示active、pending、deleting、unknown、实际占用及剩余预算；删除请求202展示“处理中”，不能立刻宣称释放容量。Replace前展示双份占用需求。

## 7. 验收

G4-L覆盖V-FILE-01～07、V-JOB-01、V-DELETE-01与事件/账户FK；G4-S必须补真实host的超限、内存、断流和未知结果恢复证据。模拟Storage调用计数证明超限之前未写入。

故障点包括：收齐前、prepare后、PUT前/中/后、finalize前/后、remove后DB提交前、lease过期旧worker、备份屏障、Delete与Replace竞争、GlobalDelete和新上传竞争。所有结果验证预算、对象、DB与Audit四方面。
