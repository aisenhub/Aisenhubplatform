# Design Foundations

Foundations 定义普通 UI 的视觉语言和唯一所有者边界。它不决定 Aisenhub 的最终品牌值；阶段 02 的 Product Adaptation 选择具体值，后续实现把运行值收敛到唯一 Theme/Skin 来源。

## 主题

- [视觉职责契约](contract.md)
- [颜色与状态语义](colors.md)
- [文字排版](typography.md)
- [尺度、间距与密度](spacing-density.md)
- [形状与边界](shapes.md)
- [表面、层级与浮层](surfaces.md)
- [动效](motion.md)
- [图标](icons.md)
- [文字排版样本](assets/type-specimen.md)

## 核心要求

1. **同一用途只有一个设计值所有者。** 文档、TSX、CSS 和页面不能各维护一套同义值。
2. **语义先于数值。** 先说明一个值服务 background、foreground、focus、destructive、control-size 等什么职责，再选择实际值。
3. **结构行为与视觉皮肤分离。** DOM/ARIA/键盘/焦点/受控值属于组件结构；颜色/形状/材质/状态外观属于 Theme/Skin。
4. **Product Adaptation 不能反向污染通用层。** Aisenhub 的实际色板、字体、圆角和动效参数以后由新 `DESIGN.md` 选择，不写成本目录的跨产品硬要求。
5. **业务真值独立。** success/warning/error/unknown 的视觉只呈现真实领域状态，不能由颜色或页面逻辑创造新状态。

具体实现路径在阶段 03 冻结前仍是目标，不把本目录描述成代码已经完成分层。
