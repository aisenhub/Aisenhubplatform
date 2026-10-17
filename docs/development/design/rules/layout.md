# Layout Rules — 7

## UX-LAYOUT-DYNAMIC-VIEWPORT — SHOULD

全屏/高占用工作区适应动态浏览器工具栏、方向变化和虚拟键盘，不只依赖 `100vh`。Dialog/Sheet 使用有界高度和可访问滚动；键盘打开后当前输入与提交/取消仍可达。

## UX-LAYOUT-HORIZONTAL-SCROLL-CONTAINMENT — MUST

先修 `min-width:0`、grid/flex 收缩、长文本换行；Table 等真实二维内容再使用局部 `overflow-x:auto`。不能用根 `overflow-x:hidden` 掩盖内容不可访问。横向区域要有合理可访问名称/键盘路径。

## UX-LAYOUT-ZINDEX-SYSTEM — MUST

Overlay 使用有限语义层级和标准组件，理解 parent stacking context；不以任意大 z-index 解决 Dialog/Popover/Tooltip 层级。阶段 01 只定义规则，当前仓库尚无对应完整静态门禁。

## UX-LAYOUT-CHIP-REFLOW — MUST

标签集合随容器和文字尺寸折行，或通过可操作的 `+n` 等真实入口查看隐藏项。固定高度裁掉标签不可接受；不可避免截断时提供键盘、指针和触控都可用的全文方式。

## UX-LAYOUT-DENSITY — MUST

信息密度适应任务、文字和输入方式。桌面管理界面可紧凑，但文字、焦点、目标和错误仍可用；viewport 不等于 touch，行高不等于 hit target。具体密度由 Aisenhub Product Adaptation 决定。

## UX-LAYOUT-SAFE-AREAS — MUST

固定 header/sidebar/footer、Drawer 和虚拟键盘不能完全遮挡内容与焦点。按实际布局使用 scroll-padding/margin、安全区和可滚动容器，避免多层 fixed 互相阻塞。

## UX-LAYOUT-STABLE-UPDATES — MUST

媒体、计数、加载、错误和异步替换应有合理空间策略，避免当前操作突然跳位；同时允许长错误和放大文字自然增长。不要为可能永远不出现的说明长期预留大空白。
