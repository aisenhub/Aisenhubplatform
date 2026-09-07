# M3 权益与兑换实施规格

状态：待实施；依赖M1审计/幂等和M2身份/账户。依据[订阅兑换合同](../../subscription-redemption.md)、[公共合同](../contracts.md)。本模块生产计算唯一位于Postgres领域函数。

## 1. 交付范围

Plan管理/default Free、subscriptions读Projection、不可变Grant、有序事件、重算/重放、Admin授予/撤销/暂停/恢复/修正、兑换批次/码生成与交付、用户兑换。同步交付最小Admin页面和Consumer兑换测试，M5再完善交互与发布。

不做支付、费用换算、自动升级降级、历史features版本或前端自行汇总Grant。

## 2. 数据和迁移

落实专题全部SQL约束，尤其code↔batch相同platform/plan、Grant↔redeemed code相同账户/plan、成功事件↔该Grant同code的复合FK。code授予关系采用后置可延迟FK，同事务最终一致。

Batch补齐delivery_session_id、delivery_receipt_hmac、delivery_confirmed_by、delivery_deadline、delivered_at与生成operation_id；创建结果缓存不存Code/receipt原文。数量1～1000、期限必填、duration>0，active必须已确认交付。

subscription_events的sequence按账户锁串行分配，Grant/事件effect字段不可改。Projection只存付费区间/暂停和last_event_sequence；default Free读取回退，不能写永久Free Grant。

Plan归档停止新Grant、保留历史权益；归档默认Free须同事务更换或清空。features修改实时读，无缓存授权；需要历史版本时另评审。

## 3. 领域过程

entitlement_apply只给已授权包装调用：检查账户/Plan及冲突→计算operation_now与新Grant区间→写Grant/有序Event→重算Projection→Audit→返回DomainResult。同操作source/operation_id永久唯一。

同Plan有限续期从max(now,未撤销同Plan结束时刻)起；不同尚未结束Plan拒绝；同Plan永久续期拒绝；首次永久Admin授权须无未结束付费Grant。暂停不冻结时间；revoke不压缩后续Grant。

recompute按sequence重建，区间为[start,end)，合并相接同Plan段；next_transition包含未来开始和当前结束。读取发现边界或事件版本变化时同步重算，不等待cron。重放Shadow不删除历史关联。

Admin correct限一次原Grant reversal+一次新Grant，两事件同事务/operation_id、分别event_type区分；多个Grant换Plan须明确逐项撤销再授予，不用含糊批量命令。

## 4. 兑换码与交付

后端安全随机均匀采样31字符集26字符，HMAC域分隔含platform，版本在code外观；记录hash/mask，无明文持久化。生成器单测检查长度/字符集/采样拒绝逻辑，不用小样本统计“证明密码学安全”。

生成Batch pending_delivery→一次no-store返回明文和receipt→管理员确认已保存→同session校验receipt hash/近期MFA/10分钟deadline→active。确认幂等；生成响应丢失只能查询pending元数据或新建批次，旧批次过期禁用。禁止恢复明文、重复导出已持久码。

Admin页显示pending/active/disabled和mask，下载完成不自动等于用户确认；禁用不追溯撤销已经授予的Grant。

## 5. 兑换事务与错误

用户/Key验证后申请idem，按identity→platform→key→idem→account→batch→code→plan→projection顺序。码lookup仅定位，锁后重查Batch、Code、期限、Plan、账户状态。

业务拒绝在无业务副作用情况下提交idem错误+rejected event；异常回滚所有Grant/Code/Event/Audit；网络丢响应用原key取结果。相同key重放前仍重新授权，7天后由code和operationId唯一约束防重复。

IP限流使用可信代理链而非用户自填头；跨平台猜码返回INVALID_CODE，不泄露其他平台Code状态。Admin与用户代码路径共用entitlement_apply，不直接PATCH Projection。

## 6. 测试和退出门槛

V-ENT-01/02/03、V-REDEEM-01～04、V-DB-03/真实角色、V-TXN-01/02必须通过。并发用真实双连接+barrier，至少验证同码10竞争、同账户两个新码、AdminGrant竞争、禁用先/后提交。

向每个写入步骤后注入异常验证事务一致性；重建缺口、永久、暂停/恢复、month/year边界；same Idem不同body冲突、提交后响应丢失、过期idem后重试operationId。期望错误还要断言Code未消耗、Grant未创建。

交付migration/函数、OpenAPI扩展、Server SDK方法、Admin最小页面、用户兑换页面、对照重放测试和脱敏报告，满足G3后再接入完整文件与发布工作。
