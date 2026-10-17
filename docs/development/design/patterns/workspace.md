# Admin Workspace / Toolbar

Aisenhub Admin 是持续操作型管理工作区。工作区模式优先保证 scope 清楚、主要任务可发现、信息高密度但不压迫，而不是追求对称卡片布局。

## 结构原则

- Shell/Topbar/Sidebar 负责持续导航和 scope，不把页面业务操作塞入全局壳。
- 页面一级标题和主要动作数量保持克制；高频动作就近放置，低频动作可进入菜单/Inspector。
- Toolbar 围绕当前集合/筛选/选择提供操作；不用为了“专业感”堆满按钮。
- 横向二维内容使用局部滚动，页面根不靠 `overflow-x:hidden` 掩盖问题。
- 窄屏优先保持核心导航、对象识别和关键操作可达，再调整布局；不简单把桌面界面等比缩小。

## 状态连续性

切换筛选、进入详情、关闭浮层、异步刷新和 resize 时，尽量保留用户当前对象、滚动、已输入内容和焦点。迟到请求不能覆盖新的 scope/selection。

## 密度

页面可以密集，但 ordinary controls 仍消费共同组件尺度；专业表格、图表等特殊密度由真实 owner 独立管理。最终 Admin 密度由新 Product Adaptation 选择。
