# 原则评审说明场景

自编用例：平台列表中的名称和 ID 很长，页面在窄工作区、键盘操作和后台刷新失败状态下仍要可用。此素材不新增规则，也不证明当前页面已通过。

- 文本完整性：读 [content](../content.md)。
- 容器/横向表格：读 [layout](../layout.md)。
- 列表→Inspector 与 URL：读 [navigation](../navigation.md) 和 [patterns/list-detail](../../patterns/list-detail.md)。
- 键盘、焦点和状态：读 [accessibility](../accessibility.md)。
- 后台刷新错误与保留旧数据：读 [feedback](../feedback.md) 和 [workflow](../workflow.md)。

评审应记录实际 viewport、输入设备、scope、操作步骤和结果。不要因为 Tooltip 存在、代码里有 `aria-*` 或静态扫描无命中就直接判定完整通过。
