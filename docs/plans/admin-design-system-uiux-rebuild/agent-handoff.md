# Aisenhub Admin Design System / UIUX 重构 Agent 交接

本文件是实施 Agent 的稳定入口，不是进度日志。

## 项目与计划

- 项目目录：`E:\Projects\Aisenhubplatform`
- 优化名称：Aisenhub Admin Design System 迁移与 UI/UX 全面重构
- 总计划：[plan.md](plan.md)
- 当前阶段：阶段 01 — Design System Migration
- 当前实施分支：`codex/admin-design-system-phase1`；后续阶段仍按当前仓库规则从已确认基线建立新的短期分支。
- 远程仓库：`https://github.com/aisenhub/Aisenhubplatform.git`

## 必读顺序

1. 根 `AGENTS.md`、`docs/README.md`、`docs/development/documentation-governance.md`、`docs/development/development-release-workflow.md`。
2. 本目录 `design.md`、`plan.md`、当前 phase 和 `verification-record.md`。
3. `docs/spec/admin-console.md`、`apps/admin/PRODUCT.md`、`docs/architecture/modules/frontends.md`。
4. `docs/review/admin-frontend-architecture-audit-2026-10-15.md` 与当前 `packages/ui` / `apps/admin` 实际源码。
5. 阶段 01/02 必须读取参考项目当前 `development/design/**` 及对应 frontend design system 计划/架构资料，不能只依赖本 Plan 的摘要。
6. 阶段 01 迁移完成后以 [`docs/development/design/README.md`](../../development/design/README.md) 和 [`reference-migration-inventory.md`](../../development/design/reference-migration-inventory.md) 作为后续设计治理入口，不重复回到参考项目复制产品选择。

## 执行提示词

```text
你正在实施 Aisenhub Admin Design System 迁移与 UI/UX 全面重构计划的当前阶段。

只执行当前 phase 和满足依赖的必要工作。先核对当前分支、HEAD、工作区、远端和风险级别；计划存在不代表自动授权后续阶段。

核心冻结原则：基础控件标准化、业务界面组合化、结构行为与视觉皮肤分层、视觉定义单一所有者。迁移参考项目通用 Design System，但不复制其产品专属视觉；新的 apps/admin/DESIGN.md 必须从零建立，旧 DESIGN.md 不具有继承权。

保持现有 Next.js/React/Base UI/shadcn/Tailwind 技术底座。Standard Component 负责 DOM/ARIA/keyboard/focus/value/open-close/positioning/API，Component Skin 负责可复用视觉，Feature 负责业务和外部 layout。不要让 Feature 用无界 className override 建第二皮肤。

阶段 03 的组件优化与视觉/交互优化必须在同一真实页面批次中汇合。任何 shared component 替换都要保留并验证原有安全、MFA、scope、route、submit、focus、keyboard、unknown outcome 和恢复语义。

完成当前阶段后运行 phase 中列出的真实检查，把命令、退出码、失败、复测、commit、push 和远端核对写入 verification-record.md。未运行不得记 PASS，未 push 不得记已交付。
```

## 文件所有权和并行边界

- `docs/development/design/**`：阶段 01 由 Design System 集成人统一所有。
- `apps/admin/DESIGN.md`：阶段 02 由 Product Design 集成人统一所有。
- shared Theme/Skin/primitive/semantic component：阶段 03 必须在每个批次开始前指定唯一 owner。
- Feature 页面：可以按互不重叠目录并行，但不得同时发明 shared variant 或修改同一 shared skin 文件。
- `apps/admin/app/globals.css` 与 shared Theme/Skin ownership 迁移必须由同一集成人串行处理。

## 不可破坏边界

- 不以 UI 重构改变数据库、OpenAPI、领域规则、权限、MFA、幂等或支付/身份语义。
- 不把 UI hiding 当权限边界。
- 不把 loading/error/empty/refresh error/unknown outcome 合并成同一视觉状态。
- 不因为“标准化”把业务查询、路由、分页、写入或安全规则塞进 shared UI。
- 不为了统一视觉创建万能 Page Builder、Form DSL 或业务组件生成框架。
- 不复制旧 `DESIGN.md` 或参考产品的具体色值/品牌皮肤。

## 阶段完成门槛

- [ ] 当前阶段范围已实施。
- [ ] 当前阶段 Requirement / contract 对照已完成。
- [ ] 必要 Local 检查实际运行并记录。
- [ ] `verification-record.md` 已更新。
- [ ] 最终 diff 已审查，无无关修改和 secret。
- [ ] 阶段 commit 已创建并 push，远端 commit 已核对。
- [ ] 只有满足上述条件才更新 phase / plan 状态。
