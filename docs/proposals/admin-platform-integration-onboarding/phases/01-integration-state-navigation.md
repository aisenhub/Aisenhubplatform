# Phase 01：接入状态模型与导航连续性

状态：已完成

关联：[设计](../design.md) · [总计划](../plan.md) · [验证记录](../verification-record.md)

## 目标

先冻结“什么能算完成”的纯模型，再改变导航与平台创建后的路由，避免 UI 先出现假进度。

## 任务

- [x] MODEL-001：新增接入事实/步骤纯模型与 unit tests，覆盖 complete / incomplete / unknown / external。
- [x] NAV-001：删除 Platform Sidebar 的 Origins/Keys 独立项，新增 `接入配置`。
- [x] ROUTE-001：新增 `/settings/integration` route；旧 Origins/Keys route 定向兼容。
- [x] CREATE-001：平台创建响应使用 `PlatformResponse` 校验真实 DTO；成功后跳转首次接入页。
- [x] DOC-001：同步 Admin DESIGN / 当前前端 architecture 的导航与接入事实规则。

## 验证

- `pnpm --filter admin test:unit`
- `pnpm --filter admin typecheck`
- `pnpm docs:check`
- `pnpm format:check`
- `git diff --check`

## 退出条件

模型与导航/创建流程通过定向检查，且未提前复制 Origin/Key mutation 代码，方可进入 Phase 02。
