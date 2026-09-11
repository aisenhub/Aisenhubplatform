# 数据模型

数据库定义以 [supabase/migrations](../../supabase/migrations) 按文件名顺序执行后的结果为准。后续 ALTER 和 CREATE OR REPLACE 同样构成当前定义；不要只读取首次建表迁移。

## 领域表

| 表 | 职责与关系 |
| --- | --- |
| public.platforms | 平台、启用状态、激活开关与默认 Plan |
| public.platform_accounts | 平台内账户，唯一 platform_id/user_id；删除匿名化时可脱离 Auth 用户 |
| public.platform_profiles | 账户资料与 row_version |
| public.platform_preferences | 账户偏好 JSON 与 row_version |
| public.platform_auth_origins | 平台 Origin 和回调配置 |
| public.plans | 平台内套餐、features 与状态 |
| public.subscriptions | 当前付费权益与暂停投影 |
| public.subscription_grants | 授权区间、来源及 operation_id |
| public.subscription_events | 授予、撤销、暂停与恢复事件及 sequence |
| public.redemption_code_batches | 批次、交付和创建幂等信息 |
| public.redemption_codes | 兑换码 HMAC、状态与批次关系 |
| public.redemption_events | 兑换结果及关联授权 |
| public.platform_file_policies | 平台文件上限和开关 |
| public.platform_config_files | 文件 metadata、状态、占用预算、租约及写入结果 |
| public.audit_logs | 请求、操作主体与脱敏事件 |

## 私有设施

| 表 | 用途 |
| --- | --- |
| system_admin、identity_lifecycle | 单管理员与身份删除门闩 |
| platform_api_keys | 平台 Key HMAC、版本和部署确认 |
| idempotency_keys、admin_idempotency | 作用域内请求幂等 |
| admin_step_up、user_recent_auth_proofs | 绑定会话的近期认证证明 |
| deletion_requests、deletion_jobs | 删除请求、状态与 checkpoint |
| job_leases、rate_limit_windows | 租约/fencing token 与限流计数 |
| file_write_attempts | 存储写入尝试与未知结果 |
| file_backup_barriers、file_deletion_tombstones | 备份删除屏障与删除摘要 |

以上设施位于 private schema；public 表的位置不代表允许匿名访问。

## 可信上下文

最初定义见[核心迁移](../../supabase/migrations/20260907100355_core_platform_accounts.sql)：

- account_context：user_id、session_id、platform_id、platform_key_id、request_id。
- admin_context：admin_user_id、session_id、request_id。
- job_context：job_id、lease_owner、fencing_token、request_id。

上下文由受控服务构造，函数仍检查持久状态与资源归属。复合外键约束平台、账户与资源一致性；不能代替读取权限检查。

## 文件状态

status：pending、receiving、storing、active、deleting、deleted、failed、expired。

write_outcome：not_started、in_flight、confirmed、unknown、settled_absent。

文件可处于待清理状态而写入结果仍为 unknown；状态与预算释放不能简单等同。详见[文件与任务](../architecture/modules/files-jobs.md)。

## 数据契约

Profile/Preferences 通过 row_version 实现条件更新。Grant/Event 的业务效果通过追加事件改变；文件外部操作使用独立短事务和租约结算。字段类型、约束、索引、授权和函数签名只在迁移中维护，HTTP 序列化见 [API](api.md)。
