# Aisenhub Admin Design System 迁移与 UI/UX 全面重构设计

状态：Proposed

关联：[总计划](plan.md)

## Requirements

本设计不新增后端产品能力，目标是在保持现有业务、安全和作用域语义不变的前提下，重新建立 Admin 的设计治理、视觉语言和组件实现方式。主要支撑并重新验证 [`docs/spec/admin-console.md`](../../spec/admin-console.md) 中以下 Active Requirement：

- `REQ-ADM-002`：Global / Platform 作用域必须始终明确。
- `REQ-ADM-003`：管理员高频任务优先、桌面高密度但窄屏可用。
- `REQ-ADM-004`：高风险操作必须说明影响并支持恢复。
- `REQ-ADM-005`：数据源失败必须可见。
- `REQ-ADM-007`：管理导航必须支持快速定位。
- `REQ-ADM-008`：可访问状态不得仅依赖颜色。
- `REQ-ADM-009`：Admin 安全状态与错误语义必须统一。
- `REQ-ADM-011`：Admin 必须提供统一的全局主题与外观切换。
- `REQ-ADM-012`：Admin 必须优化实际与感知加载性能。

若新视觉设计需要改变现有 Product Requirement、导航职责、危险操作语义、权限、安全状态或业务流程，必须先修改对应 Spec，再冻结该部分设计；本 Plan 不能自行创造新的产品 Requirement。

## 背景与当前问题

当前 Admin 的底层技术栈不需要替换。现有架构已经形成 `Tailwind CSS → Base UI → shadcn-style source components → @kit/ui → Aisenhub Admin Components → Feature UI` 的链路，`packages/ui/src/shadcn/` 与项目语义组件分层也已有正确基础。2026-10-15 前端架构审查同时指出，当前主要 UI 技术债集中在 Tailwind utility、Admin 全局 CSS、共享 UI 样式和组件 variant 多处拥有视觉定义，容易出现 token、CSS class 和 component variant 漂移。

历史 Admin 视觉规范已退出设计来源。旧色板、形状、密度、组件外观和生成视觉元数据不得作为新设计的继承来源；Git 历史只允许追溯旧实现。`apps/admin/PRODUCT.md` 继续作为产品背景和业务约束来源。

参考项目 `docs` 中已经存在一套更成熟的 Design System 方法：把设计基础、语义主题、组件皮肤、组件结构/交互、页面组合和产品适配分开，并明确“先复用、再扩展、最后自写”的组件治理原则。本项目需要迁移这套通用方法，而不是复制参考产品的具体颜色、字体、密度、工作区视觉或 AisenLens 专属 UI。

## 目标与范围

总目标是先建立 Aisenhub 可长期执行的 Design System，再由它驱动一次完整 Admin UI/UX 重构与收敛。最终结果同时包含：

1. **视觉统一**：设计值、组件视觉、页面层级和状态表达只有明确所有者。
2. **交互优化**：导航、检索、列表、详情、表单、浮层、异步状态、危险操作和响应式体验按统一模式优化。
3. **UI 架构收敛**：基础控件标准化，业务 UI 组合化，结构/行为与视觉皮肤分层，Feature 不再重复发明基础控件皮肤。
4. **长期治理**：Design System、Product Adaptation、代码静态规则、浏览器验证和文档职责形成闭环。
5. **视觉重构而非换肤**：当前页面只提供功能、内容和业务状态依据；布局、信息层级、组件组合、颜色、表面和节奏可按新设计重新建立，不为兼容旧视觉降低新方向。
6. **统一主题系统**：Settings 作为 Appearance 入口统一控制 Light/Dark/System、Accent 与 Surface/Background 预设，所有标准组件与页面只消费语义主题。
7. **快速感知**：真实加载性能与 perceived performance 同时优化，让点击、导航、查询、刷新和 mutation 尽快产生可靠反馈，并尽量维持布局和上下文稳定。

本计划覆盖 `docs/development/design/**`、`apps/admin`、`packages/ui` 及与 Admin UI 验证直接相关的测试和文档。默认不修改数据库、OpenAPI、领域 DTO、Account API、Maintenance、Storage、支付事实、权限规则或其他后端能力。

## 非目标

- 不为了 UI/UX 重构替换 Next.js、React、Base UI、shadcn 或 Tailwind。
- 不把所有业务组件强行抽象成通用组件；只要求基础控件标准化、稳定跨页面语义组件复用化。
- 不把参考项目的产品皮肤原样复制到 Aisenhub。
- 不开放未经设计约束的任意颜色组合器；主题系统先提供经过完整状态、对比度和浏览器验证的受控预设。
- 不因为工作区已经安装 React Query、React Hook Form、Zod 或 TanStack Table 就强制改造全部数据、表单或表格架构。若某项技术迁移确有必要，必须以真实复杂度和当前 Requirement 为依据。
- 不在本阶段计划中改变 Admin 安全语义、MFA、幂等、unknown outcome、作用域或服务端授权边界。

## 参考 Design System 的迁移边界

阶段 01 执行前必须重新盘点参考项目的 `development/design/**`，以其完整目录为通用设计系统迁移主来源；同时阅读参考项目 `plans/2026-10-13_frontend_design_system/DESIGN_DIRECTION.md`、`IMPLEMENTATION_PLAN.md` 和 `architecture/PROJECT_ARCHITECTURE.md`，理解设计系统怎样落到真实代码。迁移时把内容分成三类：

- **通用设计治理**：设计基础、语义主题、组件职责、状态连接、有限 variant、复用/扩展/自写规则、页面组合边界、可访问性与验证方法。此类迁移到 Aisenhub 长期文档。
- **产品适配**：参考产品具体颜色、字体、密度、布局气质、workspace 规则、品牌表达。此类不迁移，由新的 Aisenhub `DESIGN.md` 重新定义。
- **历史实施细节**：只用于理解来源项目如何落地，不直接变成 Aisenhub 当前架构事实。

通用 Design System 的长期目标位置为 `docs/development/design/`。执行阶段应在完整盘点后确定目录树，优先保留 `foundations`、`components`、`patterns`、review/verification 等职责分层，而不是把所有规则塞进一份大文档。

## 目标 UI 架构

目标分层冻结如下，具体文件名在阶段 01/03 根据现有包导出边界确定：

```text
Design Principles / Contracts
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

各层职责：

- **Design Principles / Contracts**：定义设计决策方法、组件准入、复用顺序、可访问性、验证与反模式。
- **Semantic Theme / Foundations**：拥有颜色、前景/背景、边界、字体、字号、间距、密度、圆角、阴影、层级、动效等语义设计值。普通 UI 的同一目的只能有一个定义来源。
- **Component Skin**：使用语义值定义 Button、Input、Select、Table、Dialog、Popover、Card、Alert、Badge 等标准组件的内部布局、形状、材质和真实状态外观。
- **Standard Components**：以 Base UI / shadcn-style source component 为基础，负责 DOM、语义、ARIA、键盘、焦点、controlled value、open/close、positioning、事件和有限 variant API；不在多个 TSX 文件内重复维护第二套颜色/阴影/边框体系。
- **Aisenhub Semantic UI**：承载稳定、跨页面可复用的 Admin 语义，例如 AsyncState、StatusBadge、ResourceId、SupportErrorId、ConfirmActionDialog、MutationState、ResourceInspector 等；不吸收业务数据查询、权限策略或领域写入逻辑。
- **Feature / Page Composition**：负责业务内容、数据协调、外部布局、滚动、响应式组合和任务流。Feature 的 `className` 默认只表达 grid/flex/gap/width/overflow/position/responsive 等外部布局，不随意拥有基础控件的 background/text/border/radius/shadow/hover/focus-ring。

允许专业可视化、特殊业务状态或无法由标准组件表达的真实产品差异保留局部视觉实现，但必须说明为什么不能成为标准 variant，并避免形成第二套基础控件皮肤。

## Tailwind 与 CSS 的职责

Tailwind 继续保留。问题不是“是否使用 Tailwind”，而是“谁拥有视觉定义”。目标是：

- Tailwind 可用于 Feature 外部布局、结构性响应式组合，以及标准组件内部经 Design System 允许的实现。
- 可复用基础控件视觉不能同时由组件 TSX、`globals.css` 和 Feature TSX 三处定义。
- 共享 Theme 和 Component Skin 优先进入 `packages/ui` 的稳定样式层；Admin 专属 CSS 只保留 Shell、Page geometry、产品级 adaptation 和真实局部布局。
- `apps/admin/app/globals.css` 最终应向 assembly/reset/theme hookup 方向收敛，而不是继续成为按钮、输入、表格、卡片、Alert 等共享视觉规则的第二所有者。

## 新 Aisenhub DESIGN.md 的职责

阶段 02 从零建立新的 `apps/admin/DESIGN.md`。它不是 Design System 本身，而是 **Aisenhub Admin Product Adaptation / Design Direction**，至少定义：

- Product Character：Aisenhub Admin 应呈现的专业性、密度、克制程度、可扫描性和操作安全感。
- Visual Direction：新的色彩关系、明暗层级、表面、边界、圆角、阴影、字体、密度、留白和强调方式。
- Material Direction：采用 Solid Glass / 实体感玻璃，通过 edge/rim、厚度、细边和克制阴影表达材质，有限使用 blur；参考 `deeplethe/solid-glass` 的方法但不引入第二 Theme owner。
- Icon Language：普通 UI 图标统一来自标准图标库，建立稳定“语义 → 图标”映射；品牌 Logo、真实业务图片和确有专业缺口的图形才允许例外。
- Appearance System：定义 Light/Dark/System，以及多套 Accent / Surface / Background 预设的组合边界、默认值、设置入口、持久化和状态色隔离规则。
- Information Hierarchy：Page / Section / Surface / Table / Form / Inspector / Action 的优先级。
- Interaction Character：hover、focus、selected、editing、loading、success、warning、danger、disabled、unknown outcome 的体验规则。
- Perceived Performance：首屏、页面切换、查询、refresh、mutation 的稳定骨架、渐进填充、可信数据保留、即时反馈和长等待表达。
- Component Adaptation：标准组件在 Aisenhub 中的默认 size、density、variant 选择，不重新发明基础组件。
- Admin Patterns：列表/筛选/搜索、List + Inspector、表单、危险操作、异步/空/错状态、导航、Command Palette、PlatformSwitcher 等任务模式。
- Responsive / Density：桌面密集工作区与窄屏降级规则。
- Anti-patterns：明确禁止页面自行造皮肤、无意义卡片嵌套、过度圆角/阴影、颜色滥用、每个 Feature 独立设计状态等行为。

新 `DESIGN.md` 可以观察当前产品功能和信息架构，但不得以任何历史 Admin 视觉色值、概念、旧组件尺寸或当前遗留 CSS 作为起点。

## 第三阶段的并行工作模型

组件优化与风格/体验优化采用“两条轨道、同一页面批次汇合”的方式推进，而不是先改完整组件库再单独美化页面，也不是每个 Feature 各自画一套。

每个真实 Feature/Page 批次都必须同时完成：

1. 识别该页面依赖的 primitive、semantic component 和当前自绘控件。
2. 先补齐或调整共享标准组件/有限 variant/skin，避免页面 workaround。
3. 同步优化该页面的信息层级、密度、视觉、响应式和交互状态。
4. 保留原业务、安全、URL、权限、MFA、unknown outcome 和恢复语义。
5. 在桌面、窄屏、键盘、Loading/Empty/Error/Refresh Error、危险操作等真实状态下验证。
6. 同时检查主题切换、标准图标、首屏/刷新/局部加载的 perceived performance，避免重构后视觉更统一但更“慢”。
7. 批次完成后清理被替代的 CSS/自绘实现，再进入下一个批次。

`PlatformSwitcher` 是典型 pilot：它的业务搜索、服务端游标、路由映射和 stale-request 防护继续属于 Feature；触发按钮、输入、Popover/Listbox、状态、Loading/Error 等基础外观与交互应尽量消费标准能力。

## 风险与取舍

- **大爆炸重构风险**：全量 UI/UX 目标不等于一次性修改全站。采用可验收批次逐步覆盖全站，每个批次都要求共享组件与页面一起收敛。
- **设计污染风险**：旧 `DESIGN.md` 和参考产品皮肤均不得作为默认方向；阶段 02 必须从 Product Requirement + 新 Design System 出发。
- **双轨漂移风险**：Theme、Skin、Component、Feature 的职责若不先冻结，视觉优化会重新产生 CSS 多所有者。阶段 01/02 未完成前不得大规模执行阶段 03。
- **行为回归风险**：UI 重构可能意外改变 focus、keyboard、submit、route、MFA、confirm、unknown outcome。标准组件替换必须验证真实行为而不仅是截图。
- **旧布局惯性风险**：不得因为旧 DOM/CSS 已存在就只做换色和圆角调整；阶段 02 要先冻结新信息层级，阶段 03 再按真实任务重组页面。
- **主题碎片化风险**：Appearance 只允许一个 Theme owner，Accent/Surface 切换不能演化成 Feature 局部色板，状态色也不能跟随强调色失去语义。
- **感知性能回归风险**：新视觉若增加大面积 skeleton、blur、动画或反复卸载内容，会让界面比旧版更慢；每批必须同时观察真实请求与用户感知。
- **抽象过度风险**：不建立万能 Page Builder、万能 Form 配置框架或业务组件生成器。只抽取已经出现稳定复用价值的能力。
- **发布风险**：阶段 03/04 涉及共享 UI、全局样式、响应式和交互，默认至少按 R2 处理；若触及资金、权限、身份或高风险 mutation 语义则必须升级分级或拆出独立任务。

## 验收条件

- Aisenhub 拥有独立、长期可维护的 Design System 文档层，完整覆盖从参考项目迁移的通用设计治理，不包含参考产品专属皮肤。
- 新 `apps/admin/DESIGN.md` 从零建立并成为 Admin Product Adaptation 的唯一当前来源，旧设计不再被当前文档或实现规则引用。
- Theme → Skin → Standard Component → Semantic UI → Feature/Page 的职责在代码与文档中一致，视觉定义不再由多层随意重复拥有。
- 基础控件优先由 `@kit/ui` 标准能力提供，业务页面优先组合；Feature 自绘基础控件皮肤显著收敛并受静态规则约束。
- 所有 Admin 路由按批次完成 UI/UX 优化，并在最终阶段完成全路由、多个 viewport、键盘/焦点、状态语义和本地质量门槛验证。
- `REQ-ADM-002/003/004/005/007/008/009/011/012` 的适用 Acceptance 均有真实验证证据，且没有因为视觉改造降低服务端安全与失败恢复语义。

## 待确认项

没有阻塞总计划编写的产品决策。具体色板、字体、圆角、密度、表面风格等视觉决定属于阶段 02 的新 Design Direction 工作，不在本总设计中预先沿用旧值。
