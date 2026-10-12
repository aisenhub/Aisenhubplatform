# 阶段 03：Admin Commerce Workspaces

状态：Not Started

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把现有工程对象页面升级为可运营商业工作台，并复用 OPT-004/006/009 的既有上下文。

## 任务

- [ ] UI-001：Global Billing 增加经营摘要，并与原 Payment Operations 指标明确分区。
- [ ] UI-002：Platform Billing 增加平台商业概览与订单深链。
- [ ] UI-003：Plan 页面可读权益展示 + Offer/Price 管理；多 Paid Plan 可运营。
- [ ] UI-004：Subscription 页面改为 stable cursor 权益用户列表，显示 Profile/Plan/source/period，详情复用安全治理动作。
- [ ] UI-005：Redemption 页面升级 Campaign stats/filter/detail，脱敏单码与兑换用户深链。
- [ ] UI-006：OPT-004 Overview、OPT-006 Onboarding readiness、OPT-009 Account 360 商业深链/来源同步。
- [ ] TEST-001：Admin unit/typecheck/build。
- [ ] TEST-002：真实 browser 覆盖目录发布、legacy/new checkout、权益来源/治理、Campaign、Global/Platform scope/IDOR、recent-MFA/unknown outcome。
- [ ] TEST-003：responsive/a11y 与 Consumer harness 回归。

## 退出条件

核心商业工作流和跨 OPT 深链通过真实 browser，且没有假 recurring/假 revenue/客户端伪总数后进入 Phase 04。
