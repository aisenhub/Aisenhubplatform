# UI/UX Engineering Rules

本目录将参考项目十类、62 条结构化规则迁为 Aisenhub 可直接引用的长期 Markdown 规范。规则 ID 保持稳定，便于 Plan、Review、测试和代码审查引用；参考项目的 TypeScript 查询器、生成 MANUAL、AisenLens `adaptation` 和仓库专属 gate 不迁移。

## 规则模型

每条规则包含：

- **ID**：稳定引用标识；
- **等级**：`MUST` / `SHOULD` / `RECOMMENDED`，表示约束强度，不等同缺陷 P0–P3；
- **适用条件**：只在真实功能/场景存在时生效；
- **规则与检查**：应有行为及评审问题。

验证类型由实际改动选择：代码审查、静态检查、单测、真实浏览器、键盘/读屏、窄屏、性能测量等。**没有安装对应检查器就不能声称自动门禁。** 阶段 04 才评估哪些规则值得建立静态 gate。

## 十类规则

| 分类 | 数量 | 入口 |
| --- | ---: | --- |
| Visual | 5 | [visual.md](visual.md) |
| Layout | 7 | [layout.md](layout.md) |
| Content | 6 | [content.md](content.md) |
| Navigation | 4 | [navigation.md](navigation.md) |
| Forms / Controls | 8 | [forms.md](forms.md) |
| Feedback | 6 | [feedback.md](feedback.md) |
| Motion | 5 | [motion.md](motion.md) |
| Accessibility | 9 | [accessibility.md](accessibility.md) |
| Performance | 5 | [performance.md](performance.md) |
| Workflow | 7 | [workflow.md](workflow.md) |

合计 **62 条**。

说明素材：[原则评审说明场景](assets/review-scenario.md)。它只用于练习如何组合读取规则，不新增规则，也不代表任何页面已经通过评审。

## 使用方式

不要每次 UI 任务默认加载全部规则。先根据任务选择相关分类，例如：

- 新表单：forms + feedback + accessibility；
- Table/Inspector：layout + navigation + content + accessibility；
- Dialog/Popover：components contract + accessibility + motion；
- 长任务/unknown outcome：feedback + workflow；
- 视觉主题：foundations + visual。

评审记录实际 viewport、输入方式、状态和操作结果。规则说明“应该怎样”，不能把静态扫描、Tooltip 存在、某个类名或文档完成当作真实界面已经通过。
