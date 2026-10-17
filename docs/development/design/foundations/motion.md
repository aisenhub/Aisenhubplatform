# 动效

动效表达反馈、层级和连续性，不能创造业务真值，也不能成为完成操作的前置条件。

## 用途

- control feedback：hover/pressed/颜色等即时反馈；
- overlay enter/exit：帮助理解浮层来源；
- layout transition：只有布局关系需要解释时使用；
- progress/busy：只反映真实状态；
- feature-specific：专业业务动画留在所属组件/feature。

具体时长与 easing 由 Product Adaptation 和真实浏览器体验确定，不继承参考项目固定数值。

## 规则

- 明确过渡属性，避免 `transition-all`。
- 高使用频率的位移动画优先验证 transform/opacity 等实际成本，但不能假设 transform 一定无成本。
- 状态更新不能依赖 `transitionend/animationend` 才成立。
- 快速反向、重复点击、上下文切换和卸载时，应取消过时动画与迟到回调。
- `prefers-reduced-motion` 下移除非必要位移/装饰动效，最终状态和必要反馈仍完整。
- 进度百分比只有在存在可靠分母时使用，动画不能假装进度。
