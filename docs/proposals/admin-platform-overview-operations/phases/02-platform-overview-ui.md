# 阶段 02：平台运营 Overview UI

状态：执行中

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

把 `/admin/platforms/:platformId` 从技术状态页改为业务摘要页，保留紧凑平台元数据与快捷入口，并完成浏览器/R3/Git 闭环。

## 任务

- [ ] UI-001：7/30/90 天 URL 状态与服务端聚合读取。
- [ ] UI-002：用户/商业 KPI + 上一周期比较。
- [ ] UI-003：暂停账户/异常订单待办与可用下钻。
- [ ] UI-004：Feedback/Gallery 明确“尚未接入”，不显示假 `0`。
- [ ] UI-005：平台 status/code/id 收敛为紧凑元数据。
- [ ] TEST-001：unit/browser/窄屏/加载/错误/重试/范围切换。
- [ ] REL-001：canonical R3、最终 diff、main、分支清理。

## 退出条件

所有必需 Local R3 与浏览器证据 PASS 后才能合并 main。

