# Motion Rules — 5

## UX-MOTION-PERFORMANCE — MUST

明确实际过渡属性，避免 `transition-all`。高频移动优先验证 transform/opacity 等合成路径；不要给所有元素永久 `will-change`。布局动画限于有用途的受控范围并实测。

## UX-MOTION-PURPOSE-TIMING — SHOULD

动效表达反馈、层级或连续性；时长/easing 由距离、复杂度、输入节奏和 Product Adaptation 决定。没有统一 150–300ms 硬门，也不把管理工作台全部装饰性动画化。

## UX-MOTION-REDUCED-PREFERENCE — MUST

尊重 `prefers-reduced-motion`；减少非必要位移、视差和装饰动画。关闭/缩短动画后最终状态和 busy 信息仍完整，流程不能依赖动画结束才能继续。

## UX-MOTION-CANCELLABLE-TRANSITIONS — MUST

快速开关/切换/卸载时旧动画和迟到回调可被取消或替换；selection/open/focus 等语义立即按最新动作更新，不依赖 animationend 才成立。

## UX-MOTION-USER-CONTROL — MUST（存在持续自动运动时）

自动轮播、持续装饰循环或自动播放媒体提供适用暂停/停止，并尊重 reduced motion。若 Aisenhub 没有该类功能，本规则不要求新增播放器设置。
