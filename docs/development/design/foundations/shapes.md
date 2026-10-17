# 形状与边界

形状服务层级和交互辨识，不能通过“所有东西都圆/都描边”制造统一感。

## 角色

- control：按钮、输入、选择等普通控件；
- surface：内容容器；
- overlay：Popover/Menu/Dialog/Sheet 等浮层；
- pill/circle：只用于状态点、Avatar、明确的胶囊语义或图标圆形动作；
- structure border：区域结构边界；
- subtle divider：弱分隔；
- input boundary：需要清楚辨识的输入边界；
- focus/error：独立交互反馈，不能被普通边界弱化。

具体 radius 和 border 强度由 Product Adaptation 决定。不要从参考项目 B/C 圆角直接量取 Aisenhub 值。

## 组合规则

外容器圆角、内间距和子元素形状应形成合理几何关系；不是把同一个 radius 套到所有后代。表格网格、数据可视化和专业线条按其任务处理。

页面不通过全局 `border: none`、大面积透明度或局部 override 一次性消除结构；每条边界必须能说明职责。
