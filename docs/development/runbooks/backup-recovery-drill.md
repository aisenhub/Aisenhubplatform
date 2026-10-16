# DB + Storage 备份恢复演练

适用：季度恢复演练、重大迁移前后，或需要声明 RPO/RTO/对象恢复能力。目标 RPO<=24h、RTO<=4h 只有真实演练测量后才能 PASS。

## 恢复集必须包含

- 数据库 + 必要 Auth metadata；
- private Storage 对象与 `size/SHA-256` manifest；
- migration/config/runtime version；
- `file_backup_barriers` / deletion tombstones；
- Secret、Platform Key、SQL role 的**重新签发步骤**（不是明文 Secret 备份）；
- 恢复点时间和对象清单。

## 备份阶段

1. 创建受控 recovery set / backup barrier，记录 lease/fence/deadline；不跨网络持有 DB 事务。
2. 取得数据库一致快照与 active object manifest。
3. 复制 manifest 对象到独立备份介质，逐对象核对 size/hash。
4. 缺任一 active object、barrier 超时或 manifest 不完整时把恢复集标记失败并解除屏障；保留上一完整恢复集。

## 隔离恢复演练

1. 在隔离项目恢复 DB/Auth metadata 与对应配置，不接收真实外部回调/邮件/任务。
2. 恢复 Storage 对象并核对 manifest。
3. 重新应用 deletion tombstones，证明恢复点之后已经删除的对象/Identity 不会复活。
4. 撤销恢复出的旧 Auth sessions；禁用恢复出的 Platform Key；禁用恢复点内仍未兑换的旧 Code/Batch。
5. 对 unknown write、deleting object、job lease/fence、idempotency、Billing backlog 重新对账。
6. 运行租户/权限、Admin、Entitlement、Checkout（Mock）、Config/Storage、Feedback、删除链路验证。
7. 记录实际恢复耗时和数据丢失窗口。

仓库 Local 演练入口：`pnpm test:ops:m6-02-local`。它只能证明 Local 逻辑，不替代真实备份介质/托管环境演练。

## PASS

需要同时证明 DB 和实际 Storage bytes 可恢复、墓碑重应用有效、旧 session/key/code 不会因恢复复活、RPO/RTO 有测量值。只看到 Supabase backup 开关或成功 DB restore 不足以 PASS。
