# OPT-009 实施交接

- 优化名称：OPT-009 单平台账户工作台与账户治理
- 总计划：[plan.md](plan.md)
- 当前阶段：Phase 02 / In Progress
- 任务分支：`codex/opt-009-account-workbench`
- 基线：`main@e5376b6a4c626a9c55e86d64633491c20fdfde19`
- 风险：R3

## 必读顺序

1. 根 `AGENTS.md`、`docs/agents.md`、开发发布流程。
2. `design.md`、`plan.md`、当前 phase、`verification-record.md`。
3. `docs/proposals/optimization-intake/platform-account-workbench-architecture.md` 只作为历史输入；实施以最新 main 为事实。
4. Admin accounts page、Account API admin routes、Admin OpenAPI、account/profile/subscription/config/feedback/billing migrations/tests。

## 不可回退约束

1. Global Identity 与 Platform Account 分层；平台页不能管理密码/MFA/global delete。
2. Auth email 仅服务端只读，不扩大数据库 Auth PII 权限。
3. 不把 Auth `last_sign_in_at` 伪装成平台最近活跃。
4. Admin tags/notes 与用户 Profile 分离；note/reason 不复制到通用 Audit metadata。
5. suspend/restore/close 继续 recent-MFA、显式确认、reason、unknown-outcome 不自动重放。
6. Config/Feedback/Billing 只读聚合，不修改其领域状态机。
7. Global Delete/retention 必须最小化 Admin notes/reasons/tags。
8. Production 未授权。

## 当前执行环境

远端 GitHub 主线与 Actions 可用，本地 Runner 已恢复。Phase 01 已完成 fresh/non-empty upgrade、71/1456 DB 回归与 canonical `TASK-0801` 20/20 gates；当前从该已验证基线进入 Phase 02 Admin API/OpenAPI。

## 退出条件

- [ ] 四阶段交付。
- [ ] Local 或等价 GitHub CI canonical R3 无 FAIL/BLOCKED。
- [ ] migration/API/OpenAPI/Browser/Privacy 证据完整。
- [ ] 已授权 staging 与最终 main 对齐。
- [ ] main/任务分支 closeout 完成，之后才进入 OPT-010。
