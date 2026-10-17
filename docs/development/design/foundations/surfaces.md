# 表面、层级与浮层

表面系统回答“哪些内容属于同一层、哪些必须浮在其上”，不预设 Aisenhub 必须使用玻璃、阴影或某一种材质。

## 表面职责

- Base/Page：页面底；
- Content：普通内容、表格、表单；
- Raised：需要从内容区分离的局部面板；
- Overlay：Menu、Popover、Tooltip、Sheet、Dialog；
- Modal mask：阻断背景交互的模态遮罩；
- Critical/Status：只有业务意义要求时使用，不成为装饰卡片类型。

普通层级优先用背景、边界、空间和排版建立。阴影、透明或 blur 只在有层级用途且真实背景可读时使用，不因为 `fixed/absolute` 自动加“玻璃感”。

## z-index 与堆叠

使用有限、语义化的 overlay 层级；局部 stacking context 和全局 Portal 分开理解。任意大 z-index 不能解决 focus、pointer 或 parent transform/opacity 造成的实际层级问题。

## Overlay 验证

检查嵌套浮层、视口边缘、滚动裁切、焦点进入/恢复、Escape、背景可操作性、长内容和窄屏。视觉层级正确不能替代正确的交互模型。
