# OPT-008 实施交接

- 项目目录：`E:\Projects\Aisenhubplatform`
- 优化名称：OPT-008 平台用户反馈系统
- 总计划：[plan.md](plan.md)
- 当前阶段：[Phase 02](phases/02-account-consumer.md)
- 当前分支：`codex/opt-008-feedback-system`
- 基线：`main@67620082f43f2e608f24a5d301bb5adacbfc887f`
- 风险：R3

## 必读顺序

1. 根 `AGENTS.md`、`docs/agents.md`、开发发布流程。
2. `design.md`、`plan.md`、当前 phase、`verification-record.md`。
3. files-jobs/frontends/account-auth architecture、API/contracts/data-model、platform onboarding。
4. 当前 migrations/functions/tests；Intake 只作为需求输入，不作为实现证据。

## 不可回退约束

1. Feedback 图片使用独立 private bucket/table，不进入 Config ledger 或配额。
2. Storage adapter 只扩展受控 bucket union，不允许任意 bucket。
3. 浏览器不提供 email/platform/account/user/status；email 由服务端 Auth 快照。
4. JPEG/PNG/WebP；单张 ≤4 MiB、每反馈 ≤5 张/12 MiB；DB + HTTP 双重保证。
5. `unknown` Storage 结果不是失败；写入/删除保留可恢复状态。
6. Admin delete、Global Delete、retention 复用同一 privacy/delete helper；不直接删除 `storage.objects`。
7. Audit 不写 body、email、internal note、图片内容或原始 client context。
8. 数据库备份不等于对象备份；无对象 backup 证据时不显示“已备份”。
9. Production 未授权。

## 执行规则

只执行当前阶段和必要依赖。每阶段先建立失败用例/边界，再实现最小领域能力；Local 验证真实执行后更新 verification record。共享 migration/OpenAPI/API/Harness 文件串行修改。阶段结束检查 diff/secret/hygiene，创建小 commit 并 push/核对远端后再进入下一阶段。

## 最终退出条件

- [ ] 四阶段均已交付。
- [ ] Local canonical R3 无 FAIL/BLOCKED。
- [ ] Account/Admin v1 additive 且 breaking gate PASS。
- [ ] Storage/权限/并发/恢复/Global Delete/retention 证据完整。
- [ ] main/远端/任务分支 closeout 完成。
