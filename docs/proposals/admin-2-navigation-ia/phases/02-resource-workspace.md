# 阶段 02：Resource Workspace 与 Accounts 样板

状态：已完成（浏览器人工验收 NOT_RUN）

关联：[总计划](../plan.md) · [优化设计](../design.md)

## 阶段目标

把平台资源页从“普通页面”升级为稳定的桌面工作区，并以 Accounts 验证统一 Header、Toolbar、Table、刷新和状态密度。

## 进入条件

- Phase 01 导航骨架稳定。
- Platform 一级横向导航已退出。

## 变更范围

- `apps/admin/components/shell/admin-page-header.tsx`
- `apps/admin/components/platform-context/platform-header.tsx`
- 新增或复用 ResourceToolbar
- `apps/admin/features/accounts/platform-accounts-page.tsx`
- `apps/admin/app/globals.css`

## 任务清单

- [x] P02-01：简化 PlatformHeader，只保留必要上下文和 disabled warning。
- [x] P02-02：统一 Workspace Header 的标题、描述、actions。
- [x] P02-03：建立统一 ResourceToolbar 规则。
- [x] P02-04：Accounts 表格主次信息层级、搜索、刷新、状态展示收敛。
- [x] P02-05：后台刷新保留旧数据；首次加载、刷新失败、空态明确区分。
- [x] P02-06：管理数据页放宽内容宽度，认证页面布局不受影响。
- [ ] P02-07：真实浏览器桌面和窄屏布局验证（当前环境 NOT_RUN）。

## 验证

- Admin 单测、typecheck、build。
- 桌面宽屏、普通 laptop、窄屏人工浏览器验证。
- 键盘 Tab 顺序和搜索输入焦点可用。
