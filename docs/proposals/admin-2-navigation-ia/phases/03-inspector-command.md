# 阶段 03：Inspector 与 Command Palette

状态：已完成（浏览器人工验收 NOT_RUN）

关联：[总计划](../plan.md) · [优化设计](../design.md)

## 阶段目标

建立“列表 → 选中对象 → Inspector”的桌面级对象流，并让 Command Palette 理解当前平台上下文。

## 进入条件

- Phase 02 Accounts 工作区稳定。
- 已有 ResourceInspector 的行为和窄屏能力已核实。

## 变更范围

- `apps/admin/features/accounts/platform-accounts-page.tsx`
- `packages/ui` 中已有 ResourceInspector 仅在确有必要时修改
- `apps/admin/components/navigation/admin-command-menu.tsx`
- 必要的路由 selection helper

## 任务清单

- [x] P03-01：Accounts selection 写入 URL query。
- [x] P03-02：selection 由 URL 驱动，刷新/deep-link 可重新加载详情；浏览器 Back 由 Next Router 历史恢复。
- [x] P03-03：共享 ResourceInspector 改为右侧 Sheet，窄屏使用全宽 Sheet。
- [x] P03-04：关闭 Inspector 后请求恢复来源按钮焦点。
- [x] P03-05：Command Palette 提供当前平台各资源导航。
- [x] P03-06：未增加后端不支持的对象搜索或假入口。

真实浏览器中的 Back / Escape / focus restore 交互验收当前环境 NOT_RUN。

## 验证

- URL selection / Back / refresh。
- 键盘 Enter / Escape / focus restore。
- 现有 Account mutation 与 recent-MFA 流不受影响。
