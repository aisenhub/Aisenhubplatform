# 阶段 06：Admin 状态流、导航与规模边界

状态：Completed（2026-10-14）；本阶段成果已随 Phase 07 发布，准确验证与交付版本见总验证记录。

前置：阶段 01、05。

覆盖：R-13、R-14、R-15、LC-09。

## R-13 Onboarding stale response

所有依赖 `platformId` 的异步 load 使用 request generation 或 AbortController：

- 每次 platformId 改变递增 generation / abort previous；
- resolve/reject 前同时验证 auth epoch + platformId/generation；
- 新请求开始时清理属于旧平台的 subscription/offers state；
- error state 也必须 scoped，不能留下旧 offers。

测试必须模拟 A 慢、B 快、A 最后返回，最终 UI 只能显示 B。

审查同类页面：Platform Overview、Plans/Commerce、Config、Feedback、Accounts 页面若采用“只校验 auth epoch”模式，同步修正，不只修一个组件。

## R-14 PlatformSwitcher

- API 支持 server-side q + cursor；
- Switcher 初始加载一页，搜索输入走 debounce server query；
- current platform 可固定展示，但不能用它掩盖未加载其他平台；
- 支持加载更多/虚拟列表之一；
- >100 platforms fixture 证明第 101+ 平台可搜索和选择。

## R-15 Cross-platform route mapping

定义 scope-safe route 分类：

- scope-level：overview/settings/plans/billing/configs/feedback 等，可映射到 target platform 同一 section；
- entity-level：`accounts/{accountId}`、config detail、order detail 等不得携带旧 platform entity id。

切平台时 entity-level route 默认落到 target platform 对应 collection/root；只有服务端已经证明实体属于 target platform 才可构造 target detail。

增加 accounts/config/order 等 entity detail route tests。

## LC-09

确认 compatibility URL 已在阶段 01 删除，navigation tests 不再断言 alias active。

## 验收

- stale response race deterministic unit test；
- Switcher >100/search/pagination browser test；
- entity route switch 不产生 `/targetPlatform/.../oldEntityId`；
- Admin E2E canonical URLs 全绿。
