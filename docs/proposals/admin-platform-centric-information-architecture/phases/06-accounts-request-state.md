# Phase 06：Accounts 请求与失败状态收敛

状态：Completed（待整体验收收口）

关联：[总计划](../plan.md) · [Phase 04](04-global-identity-api.md) · [验证记录](../verification-record.md)

## 阶段目标

在 Phase 04 单请求 Identity API 基础上，修复 `/admin/accounts` 的请求触发、URL 状态、刷新恢复和错误诚实表达。页面不得因为输入框每个字符变化而发请求，也不得把失败状态渲染成“无数据/成功”。

## 状态契约

- `draftQuery` 只表示未提交表单；`q` URL 参数才是已提交查询。
- `platform` URL 参数是筛选范围真理来源；UI select 仅编辑/导航该参数。
- 初次读取、前台重新检索、后台刷新分别建模；后台刷新保留已有数据但明确 stale/refresh error。
- 每个 async 路径必须在 `finally` 或等价状态机中复位 `refreshing/loading`。
- generation/session epoch 继续阻止旧请求覆盖新 session/新查询。

## 任务清单

- [x] `loadIdentities` 只依赖 URL 中 committed `q/platform`，不依赖输入中的 `draftQuery`。
- [x] Submit 仅更新 URL；由 URL 变化触发一次加载，不额外直接再次调用 load。
- [x] 平台切换只保留已提交 `q` 并更新 URL 后触发一次加载；未提交输入不会被平台切换顺带提交；空平台列表不再阻断 identity 查询。
- [x] 后台刷新成功/失败都复位 `refreshing`。
- [x] 如果平台筛选选项本身加载失败，Identity 结果仍可读取；筛选器显示降级状态而不是阻断整个页面。
- [x] API 错误保留 request_id/technical detail；已有数据刷新失败显示 stale/refresh error，不伪装空结果。
- [x] 浏览器行为矩阵覆盖 typing 不请求、submit 单请求、平台筛选单请求与 URL 同步；generation/session epoch 继续丢弃旧结果。

## 验证与退出

组件行为测试必须能证明一次用户提交最多产生一个 Identity list 请求；任何 `refreshing` 永久悬挂或错误被显示为空态均视为 FAIL。
