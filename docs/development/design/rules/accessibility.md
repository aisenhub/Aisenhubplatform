# Accessibility Rules — 9

## UX-A11Y-FOCUS-VISIBLE — MUST

键盘焦点清楚可见且不被固定层/浮层完全遮挡。可替换默认 outline，但不能移除所有可见指示。焦点外观在真实背景验证；更高 AAA 指标不能误称 AA 必须项。

## UX-A11Y-KEYBOARD-ESCAPE — MUST

模态打开后按其模型管理焦点，背景不可操作；非模态 Popover 不机械套 focus trap。嵌套 Escape 关闭当前顶层，关闭后焦点回到合理位置；触发元素已删除时选择后续合理入口。

## UX-A11Y-KEYBOARD-SHORTCUTS — SHOULD

高频快捷键尊重编辑目标、`defaultPrevented`、IME `isComposing`、浏览器和辅助技术组合键。单字符快捷键按上下文激活，不能抢走输入。

## UX-A11Y-TOUCH-TARGET-SIZE — MUST

Web AA 指针目标至少 24×24 CSS px 或满足适用例外；44 CSS px 可作为触控舒适目标，但不能误称统一 AA 阈值。宽屏也可能触控，扩展热区不得覆盖相邻动作。

## UX-A11Y-SEMANTICS-NAMES — MUST

优先 button/a/label/table/nav/main 等原生语义；heading、表头关系和 accessible name 匹配用途。图标按钮有名称，装饰图形隐藏；复杂 Tabs/Menu/Combobox/Listbox 使用对应组件模型，不只给 clickable div 加 role。

## UX-A11Y-COMPLETE-KEYBOARD — MUST

核心任务可以不用指针完成，并能离开每个控件。Tab 顺序自然，复合控件按模式使用方向键，禁止正 tabindex 强排。滚动区、虚拟列表、Dialog 和 Command Palette 都按完整任务验证。

## UX-A11Y-TEXT-REFLOW-SPACING — MUST

200% 文本放大、约 320 CSS px 重排以及适用用户文字间距覆盖后，正文、错误和操作仍可访问。真正二维内容可局部滚动；固定高度不得裁切必要内容。

## UX-A11Y-DRAG-ALTERNATIVES — MUST（存在作者实现拖拽时）

重排、移动、resize 等提供不依赖持续拖动的单指针替代，并保留键盘操作；本质拖拽等标准例外按实际场景判断。

## UX-A11Y-CONTEXTUAL-STATUS — MUST

重要异步状态按上下文用 `role=status`/`aria-live` 等适度播报，不抢焦点，不让多个徽章重复朗读裸数字。播放时钟、每个计数或整段流式文本不机械 live。
