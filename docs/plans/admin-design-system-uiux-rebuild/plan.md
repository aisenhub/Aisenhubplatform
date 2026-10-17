# Aisenhub Admin Design System 迁移与 UI/UX 全面重构总计划

状态：In Progress

关联：[优化设计](design.md) · [Agent Handoff](agent-handoff.md) · [验证记录](verification-record.md)

## Requirements

本计划主要重新验证并优化 `REQ-ADM-002`、`REQ-ADM-003`、`REQ-ADM-004`、`REQ-ADM-005`、`REQ-ADM-007`、`REQ-ADM-008`、`REQ-ADM-009`，并实施本轮新增的 `REQ-ADM-011`（统一主题/外观切换）与 `REQ-ADM-012`（实际与感知加载性能）。Requirement 权威来源为 [`docs/spec/admin-console.md`](../../spec/admin-console.md)。

## 总体目标

把当前 Admin UI/UX 工作从“局部修样式”升级为一次受 Design System 驱动的完整重构：先迁移参考项目成熟的通用设计治理，再从零建立新的 Aisenhub Product Design Direction，然后让组件优化与视觉/交互优化按真实页面批次并行推进，最后通过静态治理和全站验证收敛为长期可维护体系。

冻结总原则：

> **基础控件标准化、业务界面组合化、结构行为与视觉皮肤分层、视觉定义单一所有者。**

旧 `apps/admin/DESIGN.md` 不参与新设计决策。参考项目只提供通用方法、设计合同和实施经验，不提供 Aisenhub 的最终产品皮肤。

## 当前代码证据与关键缺口

- 当前 UI 技术底座已经足够：Next.js 16、React 19、TypeScript、Tailwind CSS 4、Base UI、shadcn-style source components 和 `@kit/ui` 无需替换。
- `packages/ui/src/shadcn/` 与项目语义组件已经形成 primitive / semantic 的合理基础。
- 当前视觉规则仍分布在 Tailwind utility、Admin `globals.css`、共享组件 TSX/variant 和 Feature TSX 中，存在多所有者和漂移风险。
- `apps/admin/app/globals.css` 当前既承担 theme/global/layout，也覆盖部分 component slot 外观；而多个 `packages/ui` primitive 同时在 TSX 中包含完整视觉 utility。
- Feature 层仍存在自绘基础控件皮肤的情况，例如 PlatformSwitcher 的业务逻辑值得保留，但其触发控件和局部状态外观不应继续形成独立基础皮肤。
- 旧 `apps/admin/DESIGN.md` 已删除，因此当前不存在需要“融合”的旧视觉规范；新的设计方向必须重新建立。

## 已冻结的目标契约

1. Design System 长期治理层进入 `docs/development/design/`；迁移参考项目完整通用设计体系，但不复制参考产品专属视觉。
2. 新 `apps/admin/DESIGN.md` 是 Aisenhub Admin Product Adaptation，不是基础 Design System；它从零定义产品视觉与交互方向。
3. 代码职责按 `Semantic Theme → Component Skin → Standard Component → Aisenhub Semantic UI → Feature/Page` 收敛。
4. Standard Component 负责 DOM/ARIA/keyboard/focus/value/open-close/positioning/API；Skin 负责可复用视觉；Feature 负责业务和外部布局。
5. Tailwind 保留，但 Feature 默认不拥有基础控件的 background/text/border/radius/shadow/hover/focus-ring。
6. 业务组件不强行通用化；基础控件必须标准化，稳定跨页面语义能力才进入 shared semantic UI。
7. 不改变现有后端、权限、MFA、幂等、unknown outcome、Global/Platform scope、Admin BFF 和 canonical contract，除非后续发现真实 Requirement 缺口并另行批准。
8. 第三阶段不是“组件先做完、页面后美化”，而是每个页面批次同时完成共享组件能力和视觉/交互优化。
9. 普通 UI 图标统一从项目选定的标准图标库导入；不允许 Feature 随意自绘 SVG/PNG 图标形成第二套视觉语言。品牌标识、真实业务图片和标准库确实无法表达的专业图形必须单独说明例外。
10. 当前页面只提供业务事实和任务信息，不拥有视觉继承权。阶段 02/03 可重新设计页面结构、信息层级、组件排布、颜色、surface、spacing 和交互反馈，禁止把“旧页面换颜色/圆角”当作完成重构。
11. Admin 建立统一 Appearance / Theme System，由设置集中控制 Light/Dark/System、Accent 和 Surface/Background 预设，并通过 Semantic Theme → Skin → Component → Page 全链路生效。
12. 实际性能与 perceived performance 同时优化：稳定 Shell/布局、保留可信数据、避免短 loading 闪烁、长等待给予真实反馈，并处理请求取消、stale response 和关键资源加载。
13. Aisenhub 材质采用 Solid Glass / 实体感玻璃：边缘体现材质、实体优先、深度来自厚度、材质状态统一；有限 blur 不能牺牲数据可读性、主题一致性或加载/滚动性能。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 预期风险级别 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- | --- |
| 01 | 迁移参考项目通用 Design System，冻结设计治理与 ownership | 当前 Plan | R0 | 已交付 | [阶段 01](phases/01-design-system-migration.md) |
| 02 | 从零建立新的 Aisenhub Admin `DESIGN.md` / Product Adaptation | 01 | R0 | 已交付 | [阶段 02](phases/02-new-aisenhub-design-direction.md) |
| 03 | 按真实页面批次并行执行 Foundation/Component 与 UI/UX 全面优化 | 01、02 | 至少 R2 | 进行中（03A–03C 已实现并完成 clean R2；进入 03D Billing / Audit / Security） | [阶段 03](phases/03-component-and-uiux-rebuild.md) |
| 04 | 全站收敛、清旧实现、建立静态治理并完成全量回归 | 03 | 至少 R2 | 未开始 | [阶段 04](phases/04-convergence-and-governance.md) |

阶段 01 → 02 → 03 → 04 的主链必须串行。阶段 03 内部允许多个页面批次并行，但共享 Theme、Skin、primitive、semantic component 文件必须先分配唯一所有者，并由同一集成人冻结 API/variant，禁止并行 Agent 各自创造组件契约。

## 阶段 03 的覆盖策略

阶段 03 在开始时先根据当前实际路由重新生成页面/Feature 清单，再按任务关系分批；初始建议顺序如下，最终以阶段 03 实际 inventory 为准：

1. Shell、Navigation、Topbar、PlatformSwitcher、Command Palette、Appearance Settings 与全局页面骨架，作为 Design System 落地 pilot。
2. Button/Input/Select/Textarea/Checkbox/Table/Card/Alert/Dialog/Sheet/Popover/Tooltip 等高频 primitive 与 AsyncState/StatusBadge/ResourceId/ConfirmActionDialog/ResourceInspector 等 semantic UI。
3. Platform directory / Platform overview / Accounts / Identity 等高频管理链路。
4. Billing / Audit / Security 等对状态、危险操作和信息层级要求高的工作区。
5. Config / Feedback / Settings / 剩余 Admin 路由和长尾状态。

每一批都必须同时改组件与页面；不得以“共享组件以后再统一”为理由在 Feature 中新增临时皮肤。

## 并行与串行边界

可并行：

- 阶段 01 中参考项目文档 inventory 与 Aisenhub 当前 UI ownership inventory 可以并行，最后由 Design System 文档集成人统一术语。
- 阶段 03 中不同业务 Feature 批次可并行，但前提是它们消费的共享 component API 已冻结，且没有同时修改相同 Theme/Skin/primitive 文件。
- 浏览器验证、可访问性检查和文档同步可在每个已稳定批次后并行准备。

必须串行：

- Design System 通用规则冻结 → 新 Aisenhub Design Direction。
- 新 Design Direction → Theme/Skin 具体实现。
- 共享 component API/variant 的修改。
- `globals.css` / shared theme / shared component skin 的 ownership 迁移。
- 最终静态门禁启用和旧规则删除。

## 总体验收

- [ ] `docs/development/design/` 已形成完整 Aisenhub Design System，通用原则来自参考项目但没有携带参考产品专属皮肤。
- [ ] 新 `apps/admin/DESIGN.md` 已从零建立，旧设计没有被重新引用或隐式复制。
- [ ] Theme/Skin/Standard Component/Semantic UI/Feature 的职责在文档和代码中一致。
- [ ] 所有 Admin 路由都经过至少一个明确 UI/UX 优化批次，并有桌面/窄屏/键盘/焦点/加载/空/错/危险操作等适用状态验证。
- [ ] `packages/ui` 提供稳定标准控件和 semantic UI；Feature 不再系统性重复绘制基础控件皮肤。
- [ ] 普通 UI 图标已经统一到标准图标库和稳定语义映射，无无理由自绘 SVG/PNG 图标体系。
- [ ] Appearance / Theme System 支持冻结的 Light/Dark/System、Accent、Surface 预设，并能从设置统一切换整个 Admin，而非只改变局部 primary 色。
- [ ] 页面重构以新信息层级与任务组织为准，旧排版、旧色板、旧组件组合没有因“实现成本低”而被默认继承。
- [ ] 关键导航、列表、Inspector、搜索、刷新和 mutation 对 perceived performance 做过真实浏览器验证，加载过程中结构稳定、反馈及时、可信数据不被无意义清空。
- [ ] 可复用视觉从 Admin 全局 CSS 和 Feature CSS/utility 回收到单一 shared ownership，Admin CSS 保留真正的产品 adaptation 与页面 geometry。
- [ ] 静态规则能够阻止普通 Feature 新增无理由 raw control / 大量基础 skin utility，并提供必要 allowlist/例外说明机制。
- [ ] `REQ-ADM-002/003/004/005/007/008/009/011/012` 的适用 Acceptance 逐项留下真实证据。
- [ ] `pnpm docs:check`、`pnpm contracts:check`、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build` 及适用 Admin unit/browser/E2E 检查在最终候选上实际执行并记录；阶段 03/04 按 R2 规则完成适用 Local Supabase/Admin UI 验证。
- [ ] 完成后同步 `docs/architecture/modules/frontends.md`、`docs/spec/admin-console.md`、适用 development 指南和 review 结论；Plan 不把未落地目标提前写成 Architecture。

## 风险与阻塞

- 参考项目完整 Design System inventory 未完成前，阶段 01 不得声称“已完整迁移”。
- 若阶段 02 发现新的视觉方向需要改变 Product Requirement，应先停在设计层修改 Spec，不能直接让 CSS/组件成为事实来源。
- 阶段 03 若共享组件重构改变 keyboard/focus/submit/route/危险操作行为，视为行为回归风险而非纯视觉改动，必须补相应测试。
- 若某页面确实需要特殊视觉能力，应先判断是否为通用 variant、Aisenhub product adaptation 或局部实现，禁止通过无界 `className` override 建第二皮肤。
- 阶段 03/04 若触及身份、权限、资金或高风险 mutation 业务语义，必须重新分级；必要时从本 UI Plan 拆成独立 R3 任务。

## 回退策略

阶段 01/02 为文档层，可通过 Git 回退独立文件。阶段 03/04 必须按批次小提交，优先保证新旧实现不长期双写视觉规则；若某批次浏览器回归失败，应回退该批次到上一已验证 shared component / page 状态，而不是在 Feature 上新增临时 override 掩盖问题。

## 验证与交付

所有真实执行命令、退出码、失败、修复、复测、commit、push 和远端核对写入 [verification-record.md](verification-record.md)。计划状态使用 `Proposed → In Progress → Completed`；只有所有阶段实际交付、长期文档同步并满足 Requirement Acceptance 后才能标记 Completed。
