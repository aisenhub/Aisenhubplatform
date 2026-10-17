# 阶段 02：从零建立 Aisenhub Admin Design Direction

状态：已交付

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## Requirements

主要覆盖 `REQ-ADM-002`、`REQ-ADM-003`、`REQ-ADM-004`、`REQ-ADM-005`、`REQ-ADM-007`、`REQ-ADM-008`、`REQ-ADM-009`，并冻结 `REQ-ADM-011`（统一主题/外观）与 `REQ-ADM-012`（实际与感知加载性能）的产品设计。本阶段仍是设计冻结，不等同于代码已经满足新的视觉方向。

## 阶段目标

基于新的 Aisenhub Design System、当前 Product Requirement 和真实 Admin 任务，从零创建新的 `apps/admin/DESIGN.md`。新文档定义 Aisenhub 自己的视觉语言、信息层级、交互气质、组件 adaptation、Admin pattern 和反模式，并成为后续实现唯一 Product Design Direction。

## 进入条件

- 阶段 01 已交付，Design System contract 已稳定。
- `apps/admin/PRODUCT.md` 和 Admin Active Requirements 已重新核对。
- 旧 `DESIGN.md` 仅存在于 Git 历史，不作为设计输入。

## 变更范围

主要创建 `apps/admin/DESIGN.md`，必要时补充仅用于设计方向的轻量元数据；不在本阶段大规模修改 `globals.css`、`packages/ui` 或业务页面。

## 用户已确认的设计决策

以下决策在 2026-10-17 已由用户确认，本阶段直接执行，不再作为待选项：

1. Product Character 采用 **专业、现代、精密、信息密度中高**，避免营销站式大留白、过度开发者工具化和传统 ERP 式压迫密度。
2. Appearance 默认模式为 **System**，并支持 Light / Dark / System 显式选择。
3. Accent 预设为 **Blue（默认）/ Indigo / Violet / Cyan-Azure**；Accent 不重定义 success / warning / danger / info / unknown 状态色。
4. Surface / Background 预设为 **Neutral（默认）/ Cool / Warm**，通过同一 Semantic Theme 组合，不建立独立 CSS 主题副本。
5. 默认密度为 **Balanced**：桌面中高密度、可快速扫描，但不牺牲输入目标、错误说明、键盘焦点和窄屏任务。
6. 形状采用 **小到中等圆角 + 克制阴影**；层级主要依靠 surface、spacing、border 和 typography，不使用大圆角卡片套卡片。
7. 核心管理骨架采用 **List/Table + Inspector / Detail Workspace**；集合定位对象后优先在 Inspector 查看二级信息，复杂任务再进入完整 Detail Page。
8. 品牌表达采用 **中等强度**：有明确 Aisenhub 识别度，但数据、表格、表单和管理任务优先于装饰。
9. 普通 UI icon 统一使用 **`lucide-react`** 标准库；品牌 Logo、真实业务图片和标准库无法表达的专业图形才允许例外。
10. Perceived Performance 是一级设计目标：Shell/布局稳定、可信数据尽量保留、短请求不闪 loading、长等待提供真实反馈。
11. 材质采用 **Solid Glass / 实体感玻璃**：参考 `deeplethe/solid-glass` 的“边缘体现材质、实体而非轻飘、厚度建立深度、统一材质状态”方法，强调 rim/highlight/fine border/soft shadow 和有限 backdrop blur；不采用高透明、强折射、满屏 blur 的 Liquid Glass 路线。

## 详细执行工作包

本阶段按以下顺序执行；前一工作包形成的结论是后一工作包的输入：

### WP0 — 业务与信息架构 inventory

- 盘点 Global 六类治理入口和 Platform 工作区的真实路由/任务。
- 读取 Shell、Navigation、PlatformSwitcher、Overview、Platform directory、Account 360 等代表页面，仅提取功能、scope、状态、安全和任务关系。
- 当前 DOM/CSS/卡片布局不作为视觉约束。

### WP1 — Product Character 与视觉基础

- 冻结品牌气质、排版、密度、spacing、shape、surface、border、shadow 和 motion。
- 选择适合中文/英文 Admin 的高性能字体策略，避免为品牌感引入不必要字体加载。
- 建立 Light/Dark 下各 Surface preset 的层级关系，以及四套 Accent 的 action/link/focus/selection 角色。
- 定义 Aisenhub Solid Glass 材质层级：数据面、结构 Pane、浮层/Inspector、Popover/Dialog 的厚度、rim、highlight、shadow、blur 与 fallback；玻璃感服从文本/表格可读性和性能。

### WP2 — Appearance / Theme System

- 定义 Mode × Accent × Surface 的组合模型、默认值和语义隔离。
- Appearance 作为全局偏好设置从 Topbar Settings 与 Command Palette 进入，不新增第七个 Global 业务导航分类。
- 定义刷新恢复、System 跟随、首屏无主题闪烁、Portal/Overlay、原生控件和窄屏行为的实施契约。

### WP3 — Shell、信息层级与核心页面骨架

- 从零定义 Sidebar / Topbar / Scope / Page Header / Toolbar / Main Surface / Inspector / Detail 的 hierarchy。
- 冻结 List/Table + Inspector 的宽屏、普通桌面和窄屏降级规则。
- 为 Overview、Platform directory、Account/Identity、Billing/Audit/Security 等页面类型定义组合方式，禁止“所有内容都是同权 Card”。

### WP4 — Components、Icons 与 Interaction Character

- 冻结 Button/Input/Table/Dialog/Sheet/Popover/Badge/Alert 等标准组件的 Aisenhub 默认 density、shape 和强调关系。
- 建立稳定 Lucide “语义 → icon”映射及例外规则。
- 定义 hover/focus/selected/editing/disabled/loading/success/warning/danger/unknown 等状态矩阵。

### WP5 — Perceived Performance 与异步体验

- 设计 initial load / navigation / query / refresh / mutation / long-running task 的反馈层级。
- 冻结 skeleton、spinner、busy、progress、background refresh 和 stale-data 的使用边界。
- 保持 Shell、Toolbar、当前选择和最后可信数据稳定，避免整页闪烁和无意义重置。

### WP6 — Anti-patterns 与页面重构准则

- 明确旧视觉无继承权，并列出“只换颜色/圆角”“卡片套卡片”“Feature 自建主题/图标/基础 skin”等禁止模式。
- 给阶段 03 明确重构顺序：任务 → 信息层级 → 页面骨架 → 标准组件组合 → 视觉与反馈 → 浏览器验证。

### WP7 — 单一设计源收敛与交付

- 创建全新 `apps/admin/DESIGN.md` 作为唯一 Admin Product Adaptation / Design Direction。
- 审查并处理 `.impeccable/design.json`；若无运行硬依赖则删除旧生成视觉元数据，历史 Review 只保留历史事实。
- 同步 Product/Spec/Plan/Handoff/Verification 中的当前设计来源与阶段状态。
- 运行 `docs:check`、`contracts:check`、`git diff --check` 和人工 Requirement / Design System 对照。

## 任务清单

- [x] 以当前 Admin 页面、导航、任务和业务状态做信息 architecture inventory，但只观察功能/内容，不继承旧视觉。
- [x] 定义 Product Character：专业性、克制程度、密度、扫描效率、操作安全感和品牌气质。
- [x] 从零定义 Visual Direction：色彩体系、surface、边界、圆角、阴影、字体、字号层级、spacing/density、icon 和 motion。
- [x] 定义 Solid Glass 材质语言：只借鉴开源参考的材质原则，不复制其产品皮肤或直接把第三方 stylesheet 变成第二 Theme owner；限制 blur/透明层叠并提供近不透明 fallback。
- [x] 明确“旧视觉无继承权”：对 Shell、导航、列表、表格、表单、Inspector、Dialog/Sheet 等重新定义信息 hierarchy 和组件排布；当前 DOM/CSS 只能证明业务存在，不能限制新布局。
- [x] 冻结标准图标策略：Aisenhub 普通 UI 图标统一使用项目标准库（当前 `lucide-react`），建立导航、搜索、设置、刷新、复制、删除、外链、状态等稳定语义映射；禁止页面随机自绘 SVG/PNG。
- [x] 设计统一 Appearance / Theme System：至少 Light/Dark/System，并设计多套受控 Accent 与 Surface/Background 预设；定义默认主题、Settings 入口、预览/切换、持久化、Portal/Overlay、原生控件和状态色隔离。
- [x] 定义信息层级：Shell、Page header、Section、Surface、Toolbar、Table、Form、Inspector、Action、Technical metadata。
- [x] 定义 Interaction Character 和状态矩阵：hover/focus/selected/editing/loading/empty/error/refresh error/success/warning/danger/disabled/unknown outcome。
- [x] 定义 Perceived Performance：稳定 Shell/布局、局部渐进加载、短请求避免闪烁、刷新保留可信数据、mutation 即时确认、长等待真实 busy/progress，以及 skeleton 使用边界。
- [x] 定义 Aisenhub 对标准组件的 product adaptation：默认 size/density/variant 和适用场景，不复制组件内部结构行为。
- [x] 定义高频 Admin patterns：搜索/筛选、列表+详情、资源标识、异步状态、危险操作、导航、PlatformSwitcher、Command Palette、表单、Dialog/Sheet。
- [x] 定义 desktop / narrow viewport 的 responsive/density 规则。
- [x] 建立明确 Anti-patterns，禁止页面自建基础皮肤、卡片套卡片、无意义渐变/阴影/圆角、颜色代替语义、局部无限 override 等。
- [x] 对照旧设计历史做“非继承检查”：不得因为旧色值或旧尺寸已经存在于 CSS 就自动写回新 `DESIGN.md`。
- [x] 审查 `apps/admin/.impeccable/design.json` 等旧设计元数据：确认无运行硬依赖后删除，避免成为与新 `DESIGN.md` 冲突的第二设计源。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 文档检查 | `pnpm docs:check` | Local | PASS | PASS：115 documents，required entries / local links / navigation consistent |
| 合同检查 | `pnpm contracts:check` | Local | PASS | PASS：Account/Admin OpenAPI、Platform integration、consumer compatibility 均通过 |
| Diff 格式 | `git diff --check` | Local | PASS | PASS |
| Requirement 对照 | 逐条审查 REQ-ADM-002/003/004/005/007/008/009/011/012 | Local | 新设计不削弱现有 Acceptance，并完整定义新增主题/感知性能要求 | PASS：10 个 Requirement/material coverage groups 完整，补齐 recent MFA / step-up / security classification |
| Design System 对照 | 人工 review | Local | `DESIGN.md` 只做 Product Adaptation，无第二套基础合同 | PASS：通用合同仍由 `docs/development/design/**` 拥有；Theme/Skin 准确运行值留待阶段 03 |
| 旧设计污染检查 | 当前权威文档 legacy term scan | Local | 新方向不是旧风格换名字或简单调色 | PASS：当前规范/计划/架构无旧 North Star/旧色板术语；旧运行 CSS 仅作为实现债务 |
| 图标系统检查 | 语义映射与例外清单 review | Local | 普通 UI 图标统一由标准库提供，无页面级随机自绘体系 | PASS：`lucide-react` + 稳定语义映射 + 品牌/专业图形例外 |
| 主题系统检查 | Appearance matrix review | Local | Light/Dark/System + 多套 Accent/Surface 预设形成完整语义组合，状态色不被 Accent 污染 | PASS：System default；4 Accent × 3 Surface；状态色独立 |
| 感知性能检查 | 页面状态/加载设计 review | Local | 首屏、导航、刷新、mutation、长等待均定义稳定反馈，不以大面积闪烁 skeleton 代替性能设计 | PASS：稳定 Shell、短请求阈值、background refresh、mutation/unknown outcome 均已定义 |
| 材质/性能检查 | Solid Glass material matrix review | Local | 玻璃通过边缘/厚度/层级表达；数据区可读；blur 有边界与 fallback；不形成第三方 Theme owner | PASS：五级 Surface、有限 blur、近不透明 fallback、第三方仅作方法参考 |

## 退出与恢复条件

新 `DESIGN.md` 必须在代码实施前被冻结为阶段 03 的产品方向。若关键视觉决策尚未形成一致方向，则继续在本阶段解决，不得让阶段 03 一边编码一边由 Feature 自行决定风格。

## 文档与交付

- [x] 新 `apps/admin/DESIGN.md` 已创建并通过设计审查。
- [x] Spec/Architecture/Design System 中设计来源已同步为新 `DESIGN.md`，且没有把阶段 03 目标冒充当前实现。
- [x] `verification-record.md` 已更新到提交前验证事实。
- [x] 阶段 commit `30ff8f14167abeb19566ce84f3e5e85dfde18b20` 已 push，远端分支 SHA 核对一致。
