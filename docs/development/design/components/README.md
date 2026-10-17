# Standard Components

标准组件层负责把稳定的交互结构和视觉契约封装成可复用能力。Aisenhub 已有 Base UI → shadcn-style source components → `@kit/ui` → Aisenhub semantic UI 的基础，本目录定义以后如何判断“标准”、如何复用和扩展，而不是要求重建一套组件库。

## 主题

- [组件准入与复用契约](contract.md)
- [常用控件契约](controls.md)
- [图标控件契约](icon-controls.md)
- [图标控件说明样例](assets/icon-control-cases.md)

## 核心原则

1. **先复用，再扩展，最后自写。**
2. 标准组件必须有清楚用途、真实 API、共同 Theme/Skin 连接、可验证行为；“在共享目录里”或“来自开源/CLI”本身不等于标准。
3. 标准组件拥有 DOM/ARIA、键盘、焦点、值、选择、打开关闭、定位和有限变体；不拥有领域状态机、权限和网络请求。
4. 业务组件可以存在，但应组合标准组件，而不是因为业务名字不同就重写 Button/Menu/Input。
5. 替换非标准实现时必须保留真实行为：role、controlled value、submit、键盘、focus recovery、cancel、业务回调和状态语义。
6. 不为了“设计系统完整”建立万能页面生成器、万能业务表单或无真实消费者的抽象。

当前 `packages/ui/src/shadcn/` 与 `src/makerkit/` 的现状只作为实施基础；哪些能力需要迁 Skin、哪些 semantic component 需要扩展，在阶段 03 逐批验证。
