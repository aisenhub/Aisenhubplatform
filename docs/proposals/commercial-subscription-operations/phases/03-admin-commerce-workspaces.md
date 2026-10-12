# 阶段 03：Admin Commerce Workspaces

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把现有工程对象页面升级为可运营商业工作台，并复用 OPT-004/006/009 的既有上下文。

## 任务

- [x] UI-001：Global Billing 增加经营摘要，并与原 Payment Operations 指标明确分区。
- [x] UI-002：Platform Billing 增加平台商业概览与订单深链。
- [x] UI-003：Plan 页面可读权益展示 + Offer/Price 管理；多 Paid Plan 可运营。
- [x] UI-004：Subscription 页面改为 stable cursor 权益用户列表，显示 Profile/Plan/source/period，详情复用安全治理动作。
- [x] UI-005：Redemption 页面升级 Campaign stats/filter/detail，脱敏单码与兑换用户深链。
- [x] UI-006：OPT-004 Overview、OPT-006 Onboarding readiness、OPT-009 Account 360 商业深链/来源同步。
- [x] TEST-001：Admin unit/typecheck/build。
- [x] TEST-002：真实 browser 覆盖目录发布、legacy/new checkout、权益来源/治理、Campaign、Global/Platform scope/IDOR、recent-MFA/unknown outcome。
- [x] TEST-003：responsive/a11y 与 Consumer harness 回归。

## 退出条件

核心商业工作流和跨 OPT 深链通过真实 browser，且没有假 recurring/假 revenue/客户端伪总数后进入 Phase 04。

## 当前验证证据（2026-10-13）

- Admin unit：**15 files / 68 tests PASS**；Admin typecheck PASS；production build PASS；workspace lint **0 warning / 0 error**；workspace format check PASS。
- Consumer harness：contract boundary / forbidden import / public secret marker / **43 canonical operations** / dynamic route / workspace isolation 全 PASS；smoke 的 process/static UI/CSRF/contract meta/unsupported route/origin rejection 全 PASS。
- 真实 Local Admin browser：登录、AAL1/AAL2、recent-MFA、Config/Feedback/Global Capacity/Account governance、IDOR/恢复路径均 PASS；Commerce Summary / Catalog / Entitlement / Campaign / recent-MFA no-auto-replay 全 PASS。responsive/a11y 覆盖 **5 viewports × 20 routes = 100 observations**，overflow / semantic controls / dialog focus / tab navigation 全 PASS。
- Browser 调试中确认并修复 Commerce 写函数的复合返回求值问题：`select (volatile_function(...)).*` 可能重复执行写函数，已统一改为 `select * from function(...) as result`；Offer 显式重试由 409 恢复为 201，且成功 MFA 后仍不会自动 replay 原写入。