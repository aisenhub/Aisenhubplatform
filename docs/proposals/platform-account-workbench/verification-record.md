# OPT-009 实施与验证记录

状态：In Progress

## 项目与基线

- 优化目标：单平台 Platform Account 360 / 账户治理
- 起始 main：`e5376b6a4c626a9c55e86d64633491c20fdfde19`
- 任务分支：`codex/opt-009-account-workbench`
- 风险：R3
- Production：NOT_RUN / 未授权

## 起始事实核验

| 日期 | 范围 | 来源 | 结果 |
| --- | --- | --- | --- |
| 2026-10-12 | 前序整改 main | GitHub Actions `TASK-0801` | PASS：`main@e5376b6a` 完整 CI 成功 |
| 2026-10-12 | 账户列表 UI | `apps/admin/features/accounts/platform-accounts-page.tsx` | CONFIRMED：固定 `limit=100`；只展示 Account/User ID、status、created/updated；无 cursor/Profile/Plan/Config/Feedback 聚合 |
| 2026-10-12 | 账户列表 SQL | `20260908221107_admin_resource_search.sql` | CONFIRMED：`admin_account_list_v2` 仅 q + limit，搜索 ID/status，按 created_at/id 排序但无 cursor |
| 2026-10-12 | 账户治理 reason | `20260907124124_t14_account_lifecycle.sql` + `account-api/admin.ts` | CONFIRMED：UI 提交 reason，但 API 未读取；`admin_account_transition` 无 reason 参数；Audit metadata `{}`；动作本身已走 `adminStepUp` |
| 2026-10-12 | Config/Feedback 可复用性 | 当前 main migration/API | CONFIRMED：OPT-007/008 已落地，可用于 Account 360 权威摘要，不再是预研占位 |

## 阶段状态

| 阶段 | 状态 | 证据 | 阻塞 |
| --- | --- | --- | --- |
| 01 Domain/read model | In Progress | 正式 design 已冻结 | 本地 Runner 隧道当前不可用；可使用 PR CI 作为等价 R3 门禁，但实施后仍需完整验证 |
| 02 Admin API/contract | Not Started | - | 依赖 Phase 01 |
| 03 Account 360 UI | Not Started | - | 依赖 Phase 02 |
| 04 Lifecycle/release | Not Started | - | 依赖 01–03 |

## 规则

- 不预填 PASS。
- 每个失败/修复/复测、migration/Edge/staging、commit/PR/main/branch 状态都追加到本文件。
- 未通过完整 R3 与适用远端状态核对前不得把 OPT-009 或 Intake 标记 Completed。
