# Visual Rules — 5

## UX-VISUAL-SURFACE-MATERIALS — MUST

**材质服务可读性、层级与资源成本。** 表面材质在真实背景、支持主题和设备上保持可读；不要因为 `fixed/absolute` 就自动添加透明/模糊。长期 blur/透明层需要真实价值和性能证据。

检查：复杂背景、普通内容、Overlay 上文字是否清楚？材质是否真的帮助层级而不是装饰？

## UX-VISUAL-SEMANTIC-TOKENS — MUST

**视觉值与组件变体遵循单一维护入口。** 颜色、排版、间距、圆角、状态样式通过 Theme/Skin/标准组件消费，不在 Feature 复制第二套值。

检查：同用途控件是否从同一 owner 获得外观？页面是否靠大量局部 className 重做内部状态？

## UX-VISUAL-CONTRAST — MUST

**必要文字与控件在实际背景上满足适用对比度。** 普通文字至少 4.5:1，大字至少 3:1；识别操作或状态所需的非文字信息按适用 WCAG 条款至少 3:1。按实际文字大小/粗细判断，不把所有标题当大字。

检查真实背景、hover/selected/error/focus 及 Product 实际支持的主题；禁用/装饰例外要明确。

## UX-VISUAL-STATUS-MEANING — MUST

**状态含义不只依赖颜色或形状。** success/warning/danger/unknown/selected 等通过文字、结构、图形或可访问语义提供第二线索。

检查：去掉颜色后，管理员仍能判断影响任务的状态吗？

## UX-VISUAL-THEME-CONSISTENCY — MUST（仅产品支持主题切换时）

**主题切换保持组件语义与用户选择。** 同一组件和状态在不同主题保持含义；只有一个 Theme owner。刷新、首屏、系统变化、Overlay 和原生控件按产品契约一致。

本规则不会因为当前 CSS 存在 `.dark` 就要求 Aisenhub 必须提供完整 Dark Mode；是否支持由 Product Requirement/Design Direction 决定。
