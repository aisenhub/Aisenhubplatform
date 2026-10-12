# 阶段 03：Platform Account 360 UI

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把平台账户页升级为服务端分页的运营列表，并新增完整 Account 360 详情，不复制 Global Identity 治理。

## 任务

- [x] UI-001：重构账户列表为 URL-backed filters + cursor；移除固定 `limit=100`。
- [x] UI-002：一级列表展示 avatar/display name、status、Plan/Subscription、tags、joined time。
- [x] UI-003：新增 `/admin/platforms/:platformId/accounts/:accountId` 详情路由与 Account 360 页面。
- [x] UI-004：展示只读 Global Identity email/UID + `/admin/accounts/:userId` 深链。
- [x] UI-005：展示 Billing/Config/Feedback 权威摘要与已有工作台深链。
- [x] UI-006：tags replace、note append、governance timeline。
- [x] UI-007：suspend/restore/close 继续 recent-MFA + reason + replay-never/unknown recovery。
- [x] TEST-001：Admin unit/typecheck/build。
- [x] TEST-002：真实 browser 覆盖列表筛选/分页、detail、tags/notes、reason timeline、step-up、IDOR、窄屏/键盘/错误恢复。

## 完成证据

- Admin unit 15 files / 67 tests、typecheck、production build PASS；独立 Account 360 dynamic route 已进入构建产物。
- `t31` 40/40，覆盖 paid projection 与 effective default free Plan；全 DB 71 files / 1460 tests PASS。
- Admin T12 的 Account workbench detail/support/governance/pagination/filters/IDOR 全 PASS；responsive/a11y 为 5 viewports × 20 routes = 100 observations。
- canonical `TASK-0801` 20/20 executable gates PASS；API 107/0、OpenAPI 46/65、breaking/Consumer/contracts/docs 全绿。

## 退出条件

真实 Admin browser 与 Admin 静态/单测门禁全绿，且无 Global Identity 边界回退后进入 Phase 04。
