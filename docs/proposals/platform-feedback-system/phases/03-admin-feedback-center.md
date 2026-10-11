# Phase 03 — Admin Feedback 处理中心

状态：未开始

## 目标

新增单平台 Feedback 工作台、Admin API 与 Overview 聚合，让管理员可检索、处理、导出和受控删除反馈。

## 修改范围

- Admin SQL projections/commands migration + pgTAP。
- Account API Admin handler / Admin OpenAPI。
- `/admin/platforms/[platformId]/feedback`、`features/feedback/*`、navigation、DESIGN。
- Platform Overview `pending_feedback` 权威聚合。
- synthetic browser + T12 Local Admin E2E。

## 页面与交互

- 列表：时间、用户、摘要、分类/状态、标签、附件数；URL 保存服务端 filters/cursor。
- 详情：正文、联系许可+邮箱、受控图片、client context、timeline、raw IDs 技术区。
- status/labels/flagged/note 走受控命令；并发更新用 row version/If-Match。
- CSV 支持 selected ids 或当前 filters；浏览器不拼当前页数据。
- 批量 delete：recent-MFA + reason + operation id + confirm；202 显示处理中，不冒充已删除。
- loading/empty/access/error/background-refresh/unknown outcome 独立呈现；窄屏与键盘可用。

## 验证

Admin SQL 权限/筛选/聚合 pgTAP、Admin API Deno、contracts/breaking、Admin unit/typecheck/build/lint/format、synthetic + T12 browser。

## 退出条件

Admin 与 Overview 使用同一权威事实，浏览器不直连 Storage，阶段 commit/push/远端核对完成。
