# 阶段 04：跨页面推广与最终验收

状态：已完成（浏览器人工验收 NOT_RUN）

关联：[总计划](../plan.md) · [优化设计](../design.md)

## 阶段目标

把 Admin 2.0 工作区规则推广到其余核心页面，删除旧导航遗留，并完成最终候选验证。

## 进入条件

- Phase 01–03 已稳定。
- Accounts 已证明新工作区模型可用。

## 变更范围

- Platform Plans / Subscriptions / Redemption / Files / Settings / Origins / Keys
- Global Billing / Operations / Audit / Security
- Admin CSS、导航遗留代码
- `docs/architecture/modules/frontends.md`

## 任务清单

- [x] P04-01：通过共享 Header、工作区宽度、Inspector 与导航命名规则收敛平台资源页；Accounts 作为完整 Toolbar/Table 样板。
- [x] P04-02：Billing / Operations / Audit / Security 对齐 Global IA 与共享 Header。
- [x] P04-03：删除退出的 PlatformNavigation 和无用 CSS。
- [x] P04-04：构建核对所有现有 Admin route；账户 deep-link selection 使用 URL。
- [x] P04-05：同步当前架构文档，只描述已实际落地内容。
- [x] P04-06：执行最终 format/lint/typecheck/build/unit/docs/contracts/diff 检查。
- [ ] P04-07：真实浏览器桌面、窄屏、键盘验证结果（当前环境 NOT_RUN）。

## 完成条件

- Admin 不再存在两套并行一级导航。
- 现有权限、Auth、MFA、Billing/Subscription 状态语义未改变。
- 最终 diff 只包含本 Proposal 范围。
