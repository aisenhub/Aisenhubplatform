# 文件与持久任务

## 文件持久化

[文件表](../../../supabase/migrations/20260908150020_m4_02_file_persistence.sql)分别保存文件状态、预算、接收租约、写入结果及独立 write attempt。对象在私有 bucket 中，以平台、账户和文件 ID 构成路径；原始名称只作为 metadata。

文件策略默认单文件 1 MiB、10 个文件、总量 10 MiB。单文件上限由数据库限制为不超过 1 MiB。reserved_bytes/count 表示尚未释放的预算，包含待上传、活动对象及结果不明的写入，不能只统计 active。

## 上传与替换

1. upload-intent 在账户范围内预约预算，返回受控上传路径。
2. PUT content 取得接收租约，在有界缓冲区读取真实字节、校验大小和 SHA-256。
3. 短事务准备存储，提交后调用 Storage，再用写入 attempt 和 fencing token 结算。
4. 替换成功时在事务内切换新旧文件；旧对象由清理任务删除。

[读取器](../../../supabase/functions/_shared/upload.ts)拒绝超限、空体和 Content-Length 不匹配，默认接收超时 15 秒；UploadGate 默认每实例 16 个、每账户 2 个并发接收。该 gate 为进程内状态，不是分布式全局限流。

中央 API 实现真实上传，平台端参考页使用本地演示状态，没有相应生产上传 BFF。不能将中央能力写成参考页面已经端到端接通。

## 下载、删除与恢复

下载先通过账户或 Admin 数据库授权，再由[Storage adapter](../../../supabase/functions/_shared/storage.ts)代理字节。删除先进入 deleting；对象移除和未结算写入确认之前保留预算。unknown 不等于对象不存在，过期也不自动释放配额。

Maintenance 持有专用 token，执行文件清理、对账、账户保留清理及全局删除步骤。数据库租约/fencing token 阻止过期 worker 结算。任务 HTTP 路径和调度元数据见[运维](../../guides/operations.md)。

## 备份屏障

file_backup_barriers 在备份期间阻止物理删除；file_deletion_tombstones 保存删除摘要。数据库有 begin/checkpoint/finish 与墓碑导出确认接口，[本地模拟](../../../tests/spikes/ops/m6-02-local-backup.mjs)组合对象复制与校验。外部备份服务不由这些表自动启动。
