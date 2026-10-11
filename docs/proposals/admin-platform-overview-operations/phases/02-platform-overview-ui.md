# 阶段 02：平台运营 Overview UI

状态：实现与 Local R3 完成，待 Git closeout

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把 `/admin/platforms/:platformId` 从技术状态页改为业务摘要页，保留紧凑平台元数据与快捷入口，并完成浏览器/R3/Git 闭环。

## 任务

- [x] UI-001：7/30/90 天 URL 状态与服务端聚合读取。
- [x] UI-002：用户/商业 KPI + 上一周期比较。
- [x] UI-003：暂停账户/异常订单待办与可用下钻。
- [x] UI-004：Feedback/Gallery 明确“尚未接入”，不显示假 `0`。
- [x] UI-005：平台 status/code/id 收敛为紧凑元数据。
- [x] TEST-001：unit/browser/窄屏/加载/错误/重试/范围切换。
- [ ] REL-001：canonical R3、最终 diff、main、分支清理。

## 已完成证据

- `pnpm --filter admin test:unit`：12 files / 55 tests PASS。
- `pnpm --filter admin typecheck`：PASS。
- `pnpm --filter admin build`：PASS。
- `node tests/spikes/e2e/admin-ux-local.mjs`：OPT-004 KPI/周期切换/未接入域/刷新恢复专项与原 60 route/viewport 响应式语义矩阵全部 PASS。
- synthetic browser 首次受 stale `.next` 影响使既有账户子路由返回 404；清理 `.next` 并重启后直接 HTTP 为 200，完整 browser 复测 PASS，未修改账户页产品代码。
- `pnpm verify:task:0801`：21 executable gates PASS；包含 fresh migration、62 files / 1146 SQL tests、API 97/97、build/typecheck/unit、contract breaking、Registry/Consumer Harness、Admin/Consumer browser、docs/OpenAPI 等。

## 退出条件

所有必需 Local R3 与浏览器证据 PASS 后才能合并 main。

