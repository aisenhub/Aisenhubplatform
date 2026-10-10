# OPT-004 单平台运营概览计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从最新 `main@80a260bc43738b168d6521ccdbe51cb99eef929f` 为每个平台建立权威运营聚合边界，并把 `/admin/platforms/:platformId` 改成以用户、商业和待处理摘要为主体的 Overview。

风险分级：**R3**。

当前分支：`codex/opt-004-platform-overview`。

## 阶段

| 阶段 | 目标 | 状态 | 详细计划 |
| --- | --- | --- | --- |
| 01 | 聚合 SQL + Admin API/OpenAPI + 权限/合同 | 执行中 | [阶段 01](phases/01-platform-overview-contract.md) |
| 02 | Overview UI + browser/R3 + Git closeout | 待开始 | [阶段 02](phases/02-platform-overview-ui.md) |

## 总体验收

- [ ] 服务端权威返回平台账户、增长、有效付费账户和订单摘要。
- [ ] 7/30/90 天范围与上一周期对比可用。
- [ ] 收入、Feedback、Gallery 未实现能力不伪造数据。
- [ ] 平台状态/Code/ID 降级为紧凑元数据。
- [ ] KPI 下钻到已有账户/订阅/订单视图且保持平台作用域语义。
- [ ] fresh/upgrade、DB/API/contracts、Admin unit/typecheck/build/browser、lint/format/docs、canonical R3 全通过。
- [ ] GitHub/main/分支清理闭环后再进入 OPT-005。

## 风险

- `platform_accounts` closed 墓碑不能从总账户里静默消失，否则净变化口径失真。
- paid account 必须依赖 Plan kind 与有效订阅区间，不能把任意 subscription row 算付费。
- Billing 的订单事实与收入事实不同，本项不推导收入。
- 后续 OPT-007/008/010 会扩展 Overview 数据源；本项 API 应保持向后兼容，未来用新字段/版本扩展而不是重解释已发布字段。

