# 运维入口

## Maintenance

[worker](../../supabase/functions/maintenance/index.ts)只接受 POST 和有效 MAINTENANCE_JOB_TOKEN Bearer。它直接匹配下列完整路径：

| 路径 | 作用 |
| --- | --- |
| /maintenance/v1/files/cleanup | 按 file_id 清理 |
| /maintenance/v1/files/run | 领取候选并执行清理 |
| /maintenance/v1/files/reconcile | 文件对账 |
| /maintenance/v1/accounts/retention | 关闭账户保留清理 |
| /maintenance/v1/deletion-jobs/claim | 领取删除任务 |
| /maintenance/v1/deletion-jobs/step | 推进删除 checkpoint |
| /maintenance/v1/deletion-jobs/files | 删除任务中的文件步骤 |
| /maintenance/v1/deletion-jobs/auth | 删除任务中的 Auth 外部步骤 |

run 和 retention 使用空 JSON 对象。其余 body 字段按对应 handler 校验，携带需要的任务 ID 和 fencing token；不能自行跳过领取步骤或修改 checkpoint 表。

[schedule.json](../../supabase/functions/maintenance/schedule.json)定义每分钟 file-cleanup、每小时 file-reconcile、每日 account-retention。需要外部调用者执行这些声明；配置文件本身不会注册调度。全局删除步骤也没有由这份清单自动编排。

## 排查文件与删除任务

1. 从 Admin 文件列表或 Account 文件查询读取状态、预算和 request_id。
2. pending/receiving/storing 检查意图、租约与写入结果；unknown 保持未结算处理。
3. deleting 检查清理结果与备份屏障，不直接归零预算。
4. 全局删除从 Admin deletion-jobs 查看状态；重试走 API，仍需管理员与近期 MFA。
5. 外部 Auth/Storage 失败保留错误和 checkpoint，修复配置后通过受控入口继续。

记录脱敏错误码与请求 ID，不记录 Token、对象内容或兑换码明文。

## 备份协议与本地模拟

[备份迁移](../../supabase/migrations/20260909003356_m6_02_backup_barrier_protocol.sql)实现屏障、checkpoint、完成/失败和墓碑导出确认。屏障保护物理删除，恢复集完成与失败由数据库状态明确区分。

pnpm test:ops:m6-02-local 使用本地 Supabase 和夹具，模拟复制对象、hash 校验、墓碑持久化与失败路径；脚本在 E:\AppData 下创建临时目录。它不是生产数据库一致快照、独立加密备份或恢复命令。

仓库没有完整的生产部署/恢复 CLI。真实环境的迁移执行、密钥轮换、恢复和生产上线需要具体目标与执行授权；Git push 和构建均不会替代这些操作。
