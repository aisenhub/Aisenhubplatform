# 常用控件契约

本文件描述常见标准控件的职责。具体 props 以实际 `@kit/ui` 代码为准，不在文档复制第二套 API。

## Button

**用途**：执行动作。链接导航与按钮动作保持语义区分。

组件应拥有激活、键盘、disabled、focus、pressed（如适用）、busy 呈现接口和有限 variant/size。调用方决定具体动作、权限、提交、危险性和结果。

危险动作的 destructive 外观不能替代确认、MFA 或服务端授权。

## Input / Textarea

**用途**：编辑文本或结构化字符串。

组件负责输入语义、disabled/invalid/focus 等状态和共同 Skin。Label、帮助、错误关联应由表单结构正确组合。页面拥有值、业务校验和提交。

不要仅用 placeholder 作为字段名称；ID/code 等看似数字的值不机械使用 `type=number`。

## Checkbox / Switch / Radio / Toggle

选择和开关必须说明实际含义，并让 selected/checked/pressed 语义与行为一致。视觉上的“高亮卡片”如果实际是一个选择，也需要正确输入模型，而不是只依赖 `onClick`。

## Select / Menu / Command

短枚举、长列表搜索和命令导航是不同任务，不强制都使用同一控件。标准能力负责键盘遍历、焦点、active/selected、open/close 和定位；业务负责数据源、搜索、分页和选择后的领域行为。

## Dialog / AlertDialog / Sheet / Popover / Tooltip

它们不能仅按外观互换：

- Dialog/AlertDialog：模态交互和焦点管理；
- Sheet：适合侧边详情/编辑等有明确空间用途的浮层；
- Popover/Menu：非模态上下文操作；
- Tooltip：辅助解释，不承载核心动作或唯一可访问名称。

调用方选择适合任务的结构；Skin 可共享表面语言，但交互模型保持差异。

## Table

普通数据表保留 table 语义、表头关系、选中/操作可达性和有界横向滚动。Table primitive 不自动成为 Data Grid；排序、筛选、虚拟化、列配置和行选择只在真实需求出现时增加。

## Status / Async semantic UI

`StatusBadge`、`AsyncState`、`MutationState` 等属于 Aisenhub semantic UI：它们把重复管理语义收敛成共享表达，但不创造状态真值。状态 label、tone、request ID、retry 等必须来自业务/领域状态。
