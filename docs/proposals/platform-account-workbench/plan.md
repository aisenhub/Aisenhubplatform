# OPT-009 单平台账户工作台与账户治理总计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从 `main@e5376b6a4c626a9c55e86d64633491c20fdfde19` 建立 Platform Account 360：服务端稳定分页、Profile/Plan/Subscription 聚合、Admin-only tags/notes、权威治理 reason/timeline、Billing/Config/Feedback 摘要与 Global Identity 只读深链。风险分级 **R3**。

任务分支：`codex/opt-009-account-workbench`。

## 阶段

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | Admin support/governance 数据模型、list v3、Account 360 聚合与 privacy cleanup | 最新 main + design 冻结 | 已完成 | [阶段 01](phases/01-domain-read-model.md) |
| 02 | Admin API/OpenAPI、reason/tags/notes 命令与合同测试 | 01 | 进行中 | [阶段 02](phases/02-admin-api-contract.md) |
| 03 | Platform Account 列表 + Account 360 UI、浏览器安全交互 | 02 | 未开始 | [阶段 03](phases/03-account-workbench-ui.md) |
| 04 | Global Delete/retention、fresh/upgrade、staging、canonical R3 与 Git closeout | 01–03 | 未开始 | [阶段 04](phases/04-lifecycle-release.md) |

阶段串行交付。migration、OpenAPI、Account API、Admin 页面和 lifecycle helper 不并行修改。

## 冻结契约

- Global Identity 与 Platform Account 严格分层；平台页只读 email/UID，不管理密码/MFA/global delete。
- 不使用 Auth `last_sign_in_at` 作为平台活跃。
- 列表稳定顺序 `(created_at desc, id desc)`，所有结构化筛选在 SQL cursor 分页前执行。
- Admin tags/notes 独立于用户 Profile；note/reason 不复制到通用 Audit metadata。
- suspend/restore/close 继续 recent-MFA + 显式确认 + replay-never/unknown-outcome 恢复。
- Config/Feedback/Billing 只读聚合，不改变各自领域状态机。
- Production 未授权。

## 总体验收

- [x] list v3 stable cursor / filters / Profile+Plan projection 完成。
- [x] Account 360 权威聚合完成。
- [x] tags/notes/governance events 与 transition v2 完成。
- [ ] reason 不再在 API 层丢失。
- [x] Global Delete/retention privacy cleanup 覆盖 tags/notes/reasons。
- [ ] Admin OpenAPI additive、breaking gate PASS。
- [ ] Account list/detail UI 与真实 browser 安全交互通过。
- [ ] fresh/non-empty upgrade、DB/API/contracts/unit/typecheck/build/lint/format/docs、canonical R3 全绿。
- [ ] 已授权 staging migration/Edge 状态与最终 main 一致。
- [ ] task branch → GitHub main → 分支清理闭环后再进入 OPT-010。

## 当前执行环境备注

整改基线的远端 `main` 已通过完整 CI。本地 Runner 已恢复；Phase 01 fresh/non-empty upgrade 与 canonical `TASK-0801` 已完整通过。Phase 02 起继续同时保留 Local R3 与 PR/main CI 证据，不降低验证门槛。
