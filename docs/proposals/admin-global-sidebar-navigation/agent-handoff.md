# OPT-011 Agent 执行交接

## 项目与计划

- 项目：Aisenhubplatform
- 优化名称：OPT-011 Admin 全局侧边栏导航收敛
- 总计划：[plan.md](plan.md)
- 当前阶段：[阶段 01：Global Sidebar 与 PlatformSwitcher 收敛](phases/01-sidebar-navigation.md)
- 当前分支：`codex/optimization-batch-20261015`
- 远程仓库：`https://github.com/aisenhub/Aisenhubplatform.git`

## 必读顺序

1. 根 `AGENTS.md`、`docs/README.md`、`docs/agents.md`、`docs/guides/development-release-workflow.md`。
2. 本 Proposal 的 `design.md`、`plan.md`、`phases/01-sidebar-navigation.md`、`verification-record.md`。
3. `apps/admin/components/navigation/admin-navigation.ts`、`admin-sidebar.tsx`、`admin-shell.tsx`、`platform-switcher.tsx`、`apps/admin/app/globals.css`、共享 Sidebar 与相关测试。

## 执行提示词

```text
你正在实施 OPT-011。只执行本 Proposal 的 Global Sidebar、折叠短名和 PlatformSwitcher UI 范围。

先核对当前分支和已有 Intake 修改，不覆盖本批次其他工作。必须保留现有 Global / Platform 路由、scope 映射、安全权限、PlatformSwitcher name/code 服务端搜索、cursor、Escape/外部关闭和错误恢复。

Global 展开名固定为：仪表盘、平台中心、用户中心、业务中心、审计中心、安全中心；Global 折叠短名固定为：仪表盘、平台、用户、业务、审计、安全。Platform 展开分组不改，只为同一 collapsed sidebar 增加必要短名。

不要修改共享 packages/ui Sidebar 默认宽度；通过 Admin 局部 CSS 变量和样式实现“图标 + 短文字”。PlatformSwitcher sidebar dropdown 不得宽于 sidebar 内容，平台 option 只显示平台名，但 code 搜索必须继续有效；修复 search icon 与文本重叠并写浏览器几何断言。

完成后运行阶段列出的真实验证，更新 verification-record。OPT-011 本地闭环后按优化批次策略统一执行 GitHub 收口；2026-10-15 用户已明确要求本轮直接提交全部有效改动、合并 main 并删除已合并批次分支。无 Supabase 变更，不执行任何远端 Supabase 部署。
```

## 文件所有权和交接

- 本阶段负责：Admin navigation/sidebar/shell/platform switcher、相关 CSS/测试/DESIGN 和本 Proposal。
- 不能并行修改：`admin-navigation.ts`、`admin-sidebar.tsx`、`platform-switcher.tsx`、`admin-ux-local.mjs`。
- 集成人：当前批次 Agent。
- 下一项输入：无；OPT-011 已通过验证，当前进入批次 GitHub 收口。

## 阶段完成门槛

- [x] 本阶段功能与文档已实施。
- [x] R2 适用本地与 Local Supabase 浏览器验证已实际运行并记录。
- [x] 无 API/数据库/Supabase 变化。
- [x] verification record 已更新。
- [x] 本轮已进入用户明确要求的批次 GitHub 收口流程。
