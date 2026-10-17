# 视觉职责契约

## 1. 四类职责

| 职责 | 拥有内容 | 不拥有 |
| --- | --- | --- |
| 组件结构与交互 | DOM、语义、键盘、焦点、值、选择、open/close、positioning、事件 | 色板、业务权限、页面数据 |
| Semantic Theme | 背景/前景、主操作、选择、状态、边界、字体角色、尺寸、阴影、层级、动效用途等语义值 | 组件 DOM、业务状态机 |
| Component Skin | 消费语义值形成标准组件内部布局、形状、材质、状态外观 | 业务保存、网络请求、任务完成真值 |
| Page/Feature Composition | 内容、业务状态、领域调用、外部布局、滚动、响应式组合 | 第二套控件皮肤、局部全局主题 |

## 2. 单一来源

同一用途只维护一次。例如“标准输入的 focus ring”不能同时由共享 Input、Admin globals 和页面 Tailwind override 各定义。允许主题值映射到 Tailwind、CSS custom property 或组件状态，但映射不能变成第二份字面值来源。

文档说明**用途与边界**；运行源码保存**准确实现值**。未来 Theme/Skin 落地后，文档应链接实现而不是永久手抄另一张准确色板。

## 3. 稳定组件身份与真实状态

Skin 通过稳定的组件身份、部件、有限 variant/size 和真实状态连接结构。例如 `data-slot`、组件稳定类、Base UI state、ARIA 属性或原生 pseudo-state。页面不应该再根据业务页面名制造一套 hover/focus/disabled 规则。

## 4. 视觉扩展分类

按以下顺序判断：

1. 已有标准组件 / props / variant / composition 能否满足；
2. 缺口是否稳定、通用，值得扩展标准组件；
3. 是否属于 Aisenhub 长期、可重复的 Product Adaptation；
4. 其余留在本地 Feature，实现确有业务意义的局部差异。

`className` 可以表达外部布局和内容包装。组件内部共同视觉差异应优先进入有限 variant 或 Skin；禁止以无界覆盖形成第二套皮肤。

## 5. Tailwind 与 CSS

Tailwind 可继续用于结构、响应式和 Feature layout，也可参与组件 Skin 的构建。规则不是“禁止 Tailwind”，而是禁止同一视觉事实在 Theme、组件 TSX、global CSS、页面 className 中漂移。

## 6. 例外

数据可视化、专业编辑画布、图表、品牌资产、业务状态色或第三方嵌入可能存在局部视觉所有者。例外必须有真实任务和明确 owner，不能因为“特殊页面”就重做普通 Button/Input/Dialog 皮肤。
