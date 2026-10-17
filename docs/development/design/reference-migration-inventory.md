# 参考 Design System 迁移清单

本清单记录阶段 01 对参考项目 `development/design/**` 及直接相关设计实现文档的完整盘点。迁移目标是吸收**通用方法与治理**，不是复制 AisenLens 产品视觉或其文档工具链。

## 分类

- **迁移为通用规范**：设计思想适用于 Aisenhub，已改写进入本目录。
- **仅迁移语义，不迁工具**：规则/索引/生成器的内容有价值，但参考仓库实现绑定不适合 Aisenhub；已用 Markdown 保留规则语义。
- **产品适配，不迁移**：AisenLens 的视觉、字体、密度、媒体/工作区选择，只作为“Product Adaptation 应独立”的证据。
- **历史/施工证据，不迁移**：参考项目实施计划或当前源码映射，用来验证方法如何落地，不成为 Aisenhub 当前事实。

## 1. 根入口与 Foundations

| 参考文件 | 处理 | Aisenhub 落点 |
| --- | --- | --- |
| `development/design/README.md` | 迁移为通用规范 | `design/README.md` |
| `foundations/README.md` | 迁移为通用规范 | `foundations/README.md` |
| `foundations/contract.md` | 迁移为通用规范 | `foundations/contract.md` |
| `foundations/colors.md` | 迁移为通用规范 | `foundations/colors.md` |
| `foundations/typography.md` | 迁移为通用规范；去除 AisenLens 输出/字体细节 | `foundations/typography.md` |
| `foundations/spacing-density.md` | 迁移为通用规范；不继承三档具体值 | `foundations/spacing-density.md` |
| `foundations/shapes.md` | 迁移为通用规范；不继承 B/C 圆角 | `foundations/shapes.md` |
| `foundations/surfaces.md` | 迁移为通用规范；不继承石墨/玻璃材质 | `foundations/surfaces.md` |
| `foundations/motion.md` | 迁移为通用规范；不继承 80/120/160ms | `foundations/motion.md` |
| `foundations/icons.md` | 迁移为通用规范；不把参考产品图标映射当 Aisenhub 决定 | `foundations/icons.md` |
| `foundations/index.json` | 仅迁移索引思想，不迁生成器 | README 直接导航 |
| `foundations/assets/type-specimen.md` | 迁移并改成管理后台样本 | `foundations/assets/type-specimen.md` |

## 2. Components

| 参考文件 | 处理 | Aisenhub 落点 |
| --- | --- | --- |
| `components/README.md` | 迁移为通用规范 | `components/README.md` |
| `components/contract.md` | 迁移为通用规范 | `components/contract.md` |
| `components/controls.md` | 迁移为通用规范 | `components/controls.md` |
| `components/icon-controls.md` | 迁移为通用规范 | `components/icon-controls.md` |
| `components/index.json` | 仅迁移索引思想 | README 直接导航 |
| `components/assets/icon-control-cases.md` | 迁移说明样例 | `components/assets/icon-control-cases.md` |

## 3. Patterns

| 参考文件 | 处理 | Aisenhub 落点 |
| --- | --- | --- |
| `patterns/README.md` | 迁移为通用规范 | `patterns/README.md` |
| `patterns/contract.md` | 迁移为通用规范 | `patterns/contract.md` |
| `patterns/list-detail.md` | 迁移为通用规范 | `patterns/list-detail.md` |
| `patterns/settings-form.md` | 迁移为通用规范 | `patterns/settings-form.md` |
| `patterns/workspace.md` | 迁移并改写为管理工作区 | `patterns/workspace.md` |
| `patterns/results-reading.md` | 迁移并改写为权威结果/状态阅读 | `patterns/results-reading.md` |
| `patterns/index.json` | 仅迁移索引思想 | README 直接导航 |
| `patterns/assets/explicit-save-form.md` | 迁移说明样例 | `patterns/assets/explicit-save-form.md` |

## 4. Rules

参考规则包含十类、62 条原则。Aisenhub 保留稳定规则 ID、通用约束和评审问题，但**不复制**参考项目的 TypeScript 查询器、`adaptation`、`gate`、项目路径和生成 MANUAL 流程。

| 参考文件 | 处理 | Aisenhub 落点 |
| --- | --- | --- |
| `rules/README.md` | 迁移规则治理思想 | `rules/README.md` |
| `rules/MANUAL.md` | 内容由十类规则吸收；不迁生成物 | `rules/*.md` |
| `rules/schema.ts` | 仅迁移字段思想：ID/级别/适用条件/检查 | `rules/README.md` |
| `rules/index.ts` | 不迁查询运行时 | README 分类导航 |
| `rules/visual.ts` | 5 条规则迁移 | `rules/visual.md` |
| `rules/layout.ts` | 7 条规则迁移 | `rules/layout.md` |
| `rules/content.ts` | 6 条规则迁移 | `rules/content.md` |
| `rules/navigation.ts` | 4 条规则迁移 | `rules/navigation.md` |
| `rules/forms.ts` | 8 条规则迁移；移除 AisenLens vault 绑定 | `rules/forms.md` |
| `rules/feedback.ts` | 6 条规则迁移 | `rules/feedback.md` |
| `rules/motion.ts` | 5 条规则迁移；移除旧静态 gate | `rules/motion.md` |
| `rules/a11y.ts` | 9 条规则迁移 | `rules/accessibility.md` |
| `rules/performance.ts` | 5 条规则迁移；改为 Admin/浏览器任务语境 | `rules/performance.md` |
| `rules/workflow.ts` | 7 条规则迁移；AI 条款改为条件规则 | `rules/workflow.md` |
| `rules/assets/index.json` | 不迁资产索引运行时 | README 直接导航 |
| `rules/assets/review-scenario.md` | 迁移说明场景 | `rules/assets/review-scenario.md` |

## 5. `products/aisenlens/**`

以下全部分类为 **AisenLens Product Adaptation，不直接迁移**：

- `README.md`, `contract.md`, `colors.md`, `fonts.md`, `icons.md`, `typography.md`, `surfaces.md`, `motion.md`, `localization.md`, `index.json`。
- `assets/surface-color-comparison.png`、`control-shape-comparison.png`、`density-comparison.png`、`light-theme-comparison.png`。

不迁移的主要内容包括：石墨/静衡视觉、柔和蓝色、默认深色策略、B/C 轮廓数值与预览、compact/standard/comfort 的具体产品选择、Geist/Noto 字体组合、视频/时间轴/报告/工作区边界、特定 motion 时长、AisenLens 本地化流程和四张方向图。

Aisenhub 将在阶段 02 自行建立 Product Adaptation；参考产品只证明“产品选择必须与通用层分开”。

## 6. 直接相关的施工/架构资料

| 参考文件 | 处理 |
| --- | --- |
| `plans/2026-10-13_frontend_design_system/DESIGN_DIRECTION.md` | 仅吸收结构/交互、视觉材质、页面组合分离；Theme → Skin → Component → Feature 的唯一所有者思想；不复制 AisenLens 目标命名和值。 |
| `plans/2026-10-13_frontend_design_system/IMPLEMENTATION_PLAN.md` | 仅吸收“规则、源码事实、验证证据分离”“真实页面批次验收”“静态检查不能冒充完整 UI 验收”等方法；历史任务、页面清单和证据不迁。 |
| `architecture/PROJECT_ARCHITECTURE.md` | 只用于确认参考项目最终实际形成 `theme.css + components.css + workspace.css` 的职责分层；不把其路径当 Aisenhub 已实现结构。 |

## 7. 完整性结论

本阶段已覆盖参考 `development/design/**` 的所有 tracked 文档、规则源、文本资产、产品适配和四张产品图资产，并核对直接相关方案/执行计划/当前架构。Aisenhub 的迁移结果保留全部通用主题和 62 条规则语义，同时明确排除参考产品皮肤、仓库工具和历史实现事实。
