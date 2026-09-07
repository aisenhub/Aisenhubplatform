# M1 数据库与安全公共设施实施规格

状态：待实施；依赖M0本地基座、SP-SQL已明确可执行角色路径。依据[数据模型](../../data-model.md)、[安全](../../auth-security.md)、[公共合同](../contracts.md)。

## 1. 范围与交付

建立核心迁移、可信SQL context、角色/默认权限、审计、幂等、限流和任务/身份门闩基础。M1不实现兑换、Storage写入或完整清除worker；提供这些模块不可绕过的原子设施。

核心表：platforms、platform_accounts、profiles、preferences、origins、plans/default FK；private system_admin、identity_lifecycle、platform_api_keys、idempotency、admin_idempotency、step_up、deletion requests/jobs、job_leases、rate_limit_windows；public audit_logs。

方案中的辅助表必须变成完整DDL，类型、NULL、unique/FK/check/index和匿名化行为不得留给调用者临时发挥。

## 2. schema补充细则

- Profile/Preferences加入row_version bigint NOT NULL default1、CHECK>0；更新函数显式compare-and-increment，updated_at trigger不能替代并发版本。
- Platform Key至少32随机字节，外观含公开keyId和version；HMAC-SHA256统一为64字符小写hex text，增加长度/字符CHECK，与兑换码HMAC存储表示一致。created_by/revoked_by可匿名化，revoked不可恢复；active允许设置expires_at，过期按时间拒绝。增加creation_operation_id UUID及unique(platform_id,creation_operation_id)，用于生成响应丢失后查元数据及撤销，不能重取明文。
- audit actor类型user/admin/job/recovery/system；request_id必填，平台字段可空但账户字段存在时平台必填；自由metadata大小受限，append-only权限落实到真实角色。
- 用户幂等scope为platform/account/operation/actor_scope/key；Admin无目标账户时使用admin_user_id+scope字符串+operation+key，scope为platform:<uuid>或global，全部非空，避免NULL唯一键。
- idem request_hash固定32字节；pending仅在业务事务内，completed含HTTP status与脱敏JSON；7天expires_at；成功业务永久operationId由领域表保证。
- deletion_requests状态为pending_admin/approved/cancelled，记录原user/session/近期证明引用；deletion_jobs保存pending/running/blocked/retry/completed、checkpoint、fence、下次运行及脱敏错误。每user同时一个未结束任务。批准请求与建立门闩/job同事务，重复批准返回同一job；approved不代表清除完成，完成状态读取job。取消仅允许尚未批准的请求。
- identity_lifecycle清除与job门闩必须联合查询，防止删除Auth前空窗期lazy insert重建active。
- step_up记录actor/session/factor/verified_at/expires_at；Admin证明仅Admin验证adapter经专用受限函数记录，不给普通业务executor该权限。
- job_leases主键(job_kind,resource_id)，fencing_token bigint单调增加；有限lease owner，过期领取原子更新。lease不能取消Storage操作。

用户近期认证proof的具体字段以SP-AUTH结论冻结后加入；不得先把is_recent boolean字段暴露给浏览器。该子项依赖验证，不阻塞无关核心DDL。

## 3. 迁移与权限

迁移按依赖分块：schema/context/role定义→platform/account/profile→plans/defaultFK→admin/identity/keys→audit/idem/limits/jobs→trigger/index→RLS/grants/helper。未完备模块的表不开放executor写入。

role password不写migration，由Local bootstrap或部署Secret流程注入；domain_owner无LOGIN及BYPASSRLS，只授予必要表DML和命名policy。executor仅EXECUTE指定包装函数，无表DML。默认REVOKE必须覆盖未来新函数，migration新增函数后做权限快照比较。

check_user_session只读取实际已验证Auth列，不能迁移或修改Supabase内部Auth表结构。SP-SQL没有确认列授权时不可通过授予auth全schema权限凑合。

## 4. 公共事务设施

审计与幂等helper由同一领域函数在同一DB事务内调用，不供HTTP分别begin/commit。返回DomainResult而不是将所有业务拒绝raise；数据库异常整体回滚。transaction helper不能在Node中拆成多次Data API请求。

审计记录domain target和脱敏前后差异；不保存完整Profile、OTP、Key、Code、文件。对失败记录的系统日志路径与事务审计分开，记录投递失败指标。

限流窗口采用原子UPSERT检查计数，键为可信平台/账户/代理来源hash；清理任务重复执行安全。限流失败拒绝敏感操作，不能当无额度限制。

## 5. 验收

V-DB-01/02/03/04、V-TXN-01/02为强制；尚未建立M3事件表时V-DB-03对应子用例标M3依赖，不能整体冒称全库FK已验证。M1完成报告列出实际覆盖表。

双连接并发测试验证unique/版本/幂等；执行权限分别用anon/authenticated/account/admin/job/recovery实际角色；append-only修改尝试失败，清除专用函数可匿名化但不得改业务效果。

交付完整迁移、类型与函数清单、权限矩阵、pgTAP fixture、事务测试、Local bootstrap和升级报告。入口只能操作其领域，不提供任意SQL/任意表更新的“通用管理函数”。
