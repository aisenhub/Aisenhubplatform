# Aisenhub Design System

本目录是 Aisenhub 的长期 Design System 规范入口，维护跨页面、跨组件可复用的设计原则、视觉基础、标准组件契约、页面模式和 UI/UX 评审规则。它描述**应该如何设计、实现和验证界面**，不保存业务真值，也不代替产品 Requirement、Architecture、OpenAPI 或实际代码。

当前体系由参考项目 `development/design/**` 的通用部分迁移而来，并已移除 AisenLens 专属配色、字体、密度默认、轮廓参数、动效时长、媒体/工作区规则、图片资产和仓库脚本。逐文件处理见 [参考迁移清单](reference-migration-inventory.md)。

## 1. 权威关系

读取顺序按任务选择，不把任一层当另一层的替代品：

1. [`docs/spec`](../../spec/README.md) 定义产品必须满足什么及 Acceptance。
2. 本目录定义通用设计、组件和 UI/UX 规则。
3. [`apps/admin/DESIGN.md`](../../../apps/admin/DESIGN.md) 定义 **Aisenhub Admin Product Adaptation / Design Direction**；它不能重建第二套通用规则或第二份运行 Token。
4. [`docs/architecture`](../../architecture/README.md) 和源码描述当前真实实现。
5. [`docs/plans`](../../plans/README.md) 描述尚未完成的改变；验证记录证明实现是否满足规则。

历史 Admin 视觉描述已退出当前设计来源。当前 Product Adaptation 以新的 [`apps/admin/DESIGN.md`](../../../apps/admin/DESIGN.md) 为准；旧 CSS、历史 Review、已删除的生成视觉元数据和参考产品风格都不能反推新的视觉方向。

## 2. 设计系统分层

Aisenhub UI 采用以下职责链：

```text
Design Principles / Rules
          ↓
Semantic Theme / Foundations
          ↓
Component Skin
          ↓
Standard Components
          ↓
Aisenhub Semantic UI
          ↓
Feature / Page Composition
```

核心原则是：**基础控件标准化、业务界面组合化、结构行为与视觉皮肤分层、视觉定义单一所有者。**

| 层次 | 负责 | 不负责 |
| --- | --- | --- |
| Design Rules | 可达性、内容、布局、反馈、表单、导航、动效、性能、工作流等判断规则 | 产品色板、业务状态机 |
| Semantic Theme / Foundations | 背景/前景、状态、排版角色、间距/密度、形状、表面、层级、动效用途等语义 | 页面业务、组件 DOM/键盘行为 |
| Component Skin | 标准组件内部视觉、有限视觉变体和真实状态的外观 | 业务授权、数据请求、任务生命周期 |
| Standard Components | DOM/ARIA、键盘、焦点、受控值、打开关闭、定位和稳定 API | 产品业务和页面特有流程 |
| Aisenhub Semantic UI | AsyncState、StatusBadge、ResourceId、ConfirmActionDialog、ResourceInspector 等稳定管理语义 | 任意页面布局和领域算法 |
| Feature/Page | 业务数据、任务、权限消费、外部布局、滚动、响应式组合 | 第二套基础控件皮肤、局部全局主题 |

这是一组职责，不要求每层建立 package、Provider 或运行时引擎。

## 3. 当前技术映射

当前 Admin 继续使用 Next.js、React、TypeScript、Tailwind CSS、Base UI、shadcn-style source components 和 `@kit/ui`；本设计系统不要求为了统一 UI 更换这些技术。当前共享 UI 事实见 [`frontends.md`](../../architecture/modules/frontends.md) 和 `packages/ui`。

目标实现映射在后续阶段落地：

- `packages/ui/src/shadcn/`：优先承担标准 primitive 的结构与交互。
- `packages/ui/src/makerkit/`：保留经验证的 Aisenhub semantic UI；目录名仅是历史来源追踪。
- Shared Theme / Skin：后续阶段建立明确唯一所有者；不得同时由 Button TSX、Admin globals 和 Feature className 定义同一视觉事实。
- `apps/admin/features/**` 与页面：主要拥有业务组合和外部布局。

## 4. Tailwind、className 与局部实现

Tailwind 本身不是问题；**视觉所有权漂移**才是问题。

- Feature/Page 的 `className` 默认可表达外部布局：grid/flex/gap/width/position/overflow/responsive、内容包装和确有业务意义的局部几何。
- 标准组件内部的颜色、背景、边界、圆角、阴影、字号、hover/focus/pressed/disabled 等共同皮肤，优先由 Theme + Skin + component variant 持有。
- 调用方先使用现有 component / prop / variant；只有稳定、通用的能力缺口才扩展标准组件。
- 产品长期且可重复的选择属于 Product Adaptation；一次性业务需要留在 feature。
- 不用无限制 `className` 覆盖形成第二套组件皮肤。
- 原生元素不是自动违规。file/color/range 等原生能力，以及简单语义元素，在满足真实任务、可达性和共同外观契约时可以保留。

## 5. 分类入口

- [Foundations](foundations/README.md)：Theme、Skin 与视觉基础的职责、颜色、排版、尺度、形状、表面、动效、图标。
- [Components](components/README.md)：标准组件准入、复用/扩展/自写顺序、基础控件与图标控件契约。
- [Patterns](patterns/README.md)：列表详情、设置表单、管理工作区、结果阅读等可复用任务组织方式。
- [Rules](rules/README.md)：十类、62 条可引用的 UI/UX 工程规则。

## 6. Product Adaptation 边界

通用 Design System 不决定 Aisenhub 最终长什么样。当前 [`apps/admin/DESIGN.md`](../../../apps/admin/DESIGN.md) 选择：

- 产品气质与品牌表达；
- 实际色板、支持的主题模式和具体视觉层级；
- 字体及排版具体值；
- 控件圆角、密度、阴影和动效参数；
- Aisenhub Admin 的默认组件 adaptation 与业务 pattern；
- 明确的 anti-patterns。

Product Adaptation 不能削弱 [`REQ-ADM-002/003/004/005/007/008/009/011/012`](../../spec/admin-console.md) 的作用域、安全、错误、导航、主题、加载体验和可达性约束，也不能改变服务端权限、MFA、幂等、unknown outcome 或领域真值。

## 7. 开发与评审顺序

普通 UI 任务按以下顺序判断：

1. 明确用户任务、领域真值和 Requirement。
2. 查适用 [Rules](rules/README.md) 与 [Patterns](patterns/README.md)。
3. 先复用现有标准组件及 semantic UI。
4. 若能力不足，先尝试现有 prop/variant/composition；稳定通用缺口再最小扩展。
5. 只有确实无法由成熟系统表达的专业交互才自写，并仍复用基础控件、Theme 和状态规则。
6. 真实浏览器验证键盘/焦点、窄屏、长内容、异步/错误/空态、危险动作及适用主题；静态代码或文档不能替代行为证据。

Design System 文档给出“应有行为”，源码给出“当前实现”，测试/浏览器给出“是否满足”。三者必须分开记录。
