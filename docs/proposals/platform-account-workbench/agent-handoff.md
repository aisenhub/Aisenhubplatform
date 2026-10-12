# OPT-009 实施交接

- 优化名称：OPT-009 单平台账户工作台与账户治理
- 总计划：[plan.md](plan.md)
- 当前阶段：Completed / handoff to OPT-010
- 任务分支：`codex/opt-009-account-workbench`（已合并并清理）
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
8. Production 不属于 OPT-009 发布目标，NOT_RUN。

## 当前执行环境

OPT-009 四阶段已完成：最终本地 canonical `TASK-0801` 20/20 gates，DB 71/1472、API 107/0；`workendstaging` 已同步至 migration `20261012094715` 与 `account-api` v61；PR #15 的 GitHub Actions run #155 PASS，并以 rebase 合并至 `main@0bb6e7f835f75698b10cabdfebd59b5b7609e224`。原任务分支本地/远端均已清理。

下一步只允许从最新 `main` 重新核对 OPT-010 的 intake/预研架构与现有商业代码，不沿用 OPT-009 分支或旧基线。

## 退出条件

- [x] 四阶段交付。
- [x] Local 与 GitHub CI canonical R3 无 FAIL/BLOCKED。
- [x] migration/API/OpenAPI/Browser/Privacy 证据完整。
- [x] 已授权 staging 与最终 main 对齐。
- [x] main/原任务分支 closeout 完成，可以从最新 main 进入 OPT-010。
