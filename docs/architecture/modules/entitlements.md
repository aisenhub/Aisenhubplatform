# 权益与兑换

## 数据与入口

[领域迁移](../../../supabase/migrations/20260907133149_m3_entitlement_ledger.sql)实现 subscriptions、subscription_grants、subscription_events 和兑换表。Grant/Event 是权益事实，subscriptions 是投影。普通兑换和管理员命令共同使用 private.entitlement_apply；HTTP 层不计算期限。

## 授权规则

- 没有有效付费授权时，读取回退到当前默认 Free；没有默认 Free 时返回 none。Free 不写永久 Grant。
- 同 Plan 有限续期从当前时间与未撤销期限最大值中取较晚者。不同未结束 Plan 冲突；已有永久权益拒绝重复续期。
- 暂停影响访问，不冻结时间；暂停时 features 为空。撤销通过追加事件保留原 Grant。
- source 与 operation_id 保证授权操作唯一；幂等请求重试仍需鉴权。
- 时间由数据库生成。日、月、年计算使用 UTC；[日期函数](../../../supabase/migrations/20260908073108_m3_calendar_interval_fix.sql)处理日历期限。

## 投影计算

entitlement_recompute 选择当前时间覆盖的未撤销 Grant，读取最后一条 paused/resumed 事件；有限期投影的结束时间取同 Plan 未撤销未来结束时间的最大值，next_transition_at 考虑未来开始时间和结束边界。它不是任意历史 as_of 快照接口，也不能描述成逐段合并连续区间的实现。

entitlement_read 在读取中调用重算并返回当前 Plan/features；以实际 effective_status 和 entitlement_kind 判断授权，不能只检查 plan 非空或期限为空。

## 兑换批次

中央 API 生成兑换码及交付 receipt，数据库保存 HMAC 与掩码。批次确认交付后才能使用。创建请求携带 creation_operation_id；首次返回明文，重复相同操作返回既有批次和 creation_state=replayed_existing，不再次返回明文。参数不同返回幂等冲突。

[批次重放约束](../../../supabase/migrations/20260910095731_m3_batch_replay_boundary.sql)限制重复创建行为；[双密钥兑换](../../../supabase/migrations/20260908103340_m3_dual_secret_redeem.sql)支持当前与上一 HMAC 候选。码的账户、平台、批次和 Plan 校验在事务中进行。

接口字段见[API](../../reference/api.md)，持久字段见[数据模型](../../reference/data-model.md)。
