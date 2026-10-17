# 颜色与状态语义

颜色设计先定义**用途**，再由 Product Adaptation 选择实际值。通用层不规定 Aisenhub 必须使用哪一种主色或深浅默认。

## 语义角色

至少区分：

- 页面与内容表面：background、card/surface、popover/overlay、必要输入表面；
- 主要与次要前景：foreground、muted/secondary foreground；
- 交互强调：primary/action、selection、link；
- 边界：结构边界、弱分隔、输入辨识、focus ring；
- 业务状态：success、warning、danger/destructive、info、unknown；
- 导航或其他确有独立用途的扩展角色。

状态色必须消费真实状态，不能以视觉方便合并 `warning`、`danger`、`unknown outcome` 等不同含义。

## 对比度与真实背景

普通文字、必要控件边界和状态应按适用 WCAG 要求在**真实计算背景**上验证，尤其包括透明表面、hover、selected、focus、error 和支持的主题。静态色板通过不代表真实组合通过。

关键状态不能只靠颜色表达；文字、结构、图形或 ARIA 需要提供第二线索。

## 深浅与主题

只有 Product Requirement 明确支持主题切换时才要求多主题。支持多个主题时，同一语义在不同主题保持含义，不通过整页 filter/opacity 改变数据、图片或业务内容。

当前 Admin 是否最终支持完整 Dark Mode 仍由阶段 02 决定；本规则不把现有 `.dark` token 预留升级为产品需求。
