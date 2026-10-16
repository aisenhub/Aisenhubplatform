# 个人数据 Retention Policy 落地

`private.account_retention_policy` 是代码已经实现的 fail-closed policy source。没有 row 时匿名化任务必须失败关闭；本 Runbook 只描述如何把**已经批准的业务/法务/财务政策**安全落地，不替组织决定天数。

## 决策输入

政策所有者必须提供：

- `personal_data_retention_days`（schema 允许 1..36500）；
- `policy_source`（1..128 chars，说明决策来源/责任域）；
- `policy_reference`（1..512 chars，指向可审计政策/工单/决议）；
- 生效环境、批准人、生效时间、复审日期。

数据库/Storage backup retention 不是 personal-data retention，不能直接把“备份保留 30 天”写成个人信息政策。

## 仓库与环境步骤

1. 在 Local 使用合成政策验证 `private.account_retention_cutoff()` 完全由 row 决定；缺 row 必须得到 `retention_policy_not_configured`。
2. 生产写入前生成受控变更清单；不得修改 canonical 已应用 migration 来硬编码天数，也不得把政策值埋进应用默认值。
3. 在批准的目标环境通过受控 SQL/配置发布路径 upsert singleton row；证据只记录 days/source/reference，不包含 Secret。
4. 先以只读方式计算候选账户/cutoff，确认范围后再允许 retention worker 正常运行。
5. 验证 durable Billing/Grant/Audit 最小业务事实保留，Profile/Preferences/可识别自由文本按政策最小化；blocked requirement 不得伪报完成。

## 回退

若政策输入被撤回或存在争议，移除/禁用目标 policy row 使匿名化重新 fail closed，不能用另一个猜测天数替换。已经依法执行的匿名化不通过恢复旧备份“回滚”；恢复旧数据时必须重应用 deletion tombstone/清除事实。
