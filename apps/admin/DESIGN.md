# Aisenhub Admin Design Direction

状态：Stable Product Adaptation · implemented in Phase 03 · governed in Phase 04

本文件是 Aisenhub Admin 的 **Product Adaptation / Design Direction**。通用设计规则、组件职责和 UI/UX 工程合同由 [`docs/development/design/`](../../docs/development/design/README.md) 维护；本文件只决定 Aisenhub Admin 应该呈现什么产品气质、主题、材质、密度、信息层级和交互表达。

旧 Admin 视觉描述、旧色板、旧 North Star、历史 `.impeccable` 生成元数据和遗留 CSS **没有设计继承权**。运行页面可以作为业务、scope、状态和任务事实来源，但不能因为某段 DOM/CSS 已存在就获得视觉继承权；后续修改继续由本 Product Adaptation、通用 Design System 与静态 governance 共同约束。

## 1. Product Character

Aisenhub Admin 的视觉目标是：

- **Professional**：像高质量运营控制面，而不是营销站或模板后台。
- **Modern**：具有清晰、安静、精确的现代界面语言，不追逐一次性潮流效果。
- **Precise**：层级、对齐、数据、状态和操作目标明确；技术信息可扫描。
- **Dense but breathable**：桌面中高信息密度，但不挤压错误说明、输入空间、键盘焦点和危险操作语义。
- **Tactile**：界面有真实材质和层级，不是纯平面，也不靠强阴影制造浮夸空间。
- **Fast-feeling**：操作立即有反馈，加载期间上下文稳定，让管理员感到系统一直在工作而不是反复重启页面。

品牌表达采用**中等强度**。Aisenhub 应该有明确识别度，但品牌装饰永远让位于数据、任务、安全和可读性。

## 2. Core Design Principles

### 2.1 信息先于装饰

管理员进入页面后应先知道：

1. 当前 Global / Platform scope；
2. 当前任务与对象；
3. 最重要的数据或异常；
4. 可以执行的下一步；
5. 当前数据是否新鲜、失败、未知或正在刷新。

视觉效果不能模糊这些事实。

### 2.2 旧页面不是新设计模板

重构顺序固定为：

> **任务 → 信息层级 → 页面骨架 → 标准组件组合 → 材质与视觉 → 交互反馈 → 浏览器验证**

不得采用“旧 DOM + 新颜色 + 新圆角”的方式完成重构。

### 2.3 材质只表达层级

玻璃质感用于表达“这是一个有厚度、有边界、有空间关系的界面表面”，不是为了炫技。数据表格、长文本、技术详情在任何主题下都必须比玻璃效果更重要。

### 2.4 颜色只承担清晰角色

Accent 用于 action / selection / focus / link 等交互强调；success / warning / danger / info / unknown 是独立语义。不能为了主题一致把所有状态一起染成 Accent。

### 2.5 一个 Theme owner

Mode、Accent、Surface 只通过统一 Semantic Theme 驱动。Feature 不读取主题来自己换颜色，也不维护页面级主题状态。

## 3. Visual North Star — Solid Glass Control Surface

Aisenhub Admin 采用 **Solid Glass / 实体感玻璃控制面**。

材质灵感参考开源项目 [`deeplethe/solid-glass`](https://github.com/deeplethe/solid-glass)，只吸收其材质方法，不复制其产品皮肤、具体 token 或 AI-agent 专属组件，也不把第三方 stylesheet 直接作为 Aisenhub Theme owner。

采用四条材质原则：

1. **Finish at the edge**：玻璃首先通过 rim、hairline、内高光和接触阴影被感知，而不是靠把整个面板做得很透明。
2. **Heavy, not airy**：表面从远处看应接近实体；近看才看到透明、blur 和边缘光。
3. **Depth is thickness**：层级通过不同“厚度”表达，越靠前的 Overlay/Popover 越有明显边缘和空间阴影。
4. **One material state**：hover/open/pressed/selected 共享一致的材质激活语言；语义 selection 再叠加 Accent 与非颜色线索。

这不是 Liquid Glass。以下做法明确禁止：

- 高透明内容面板让背景穿透到影响阅读；
- 大范围强折射、色散、动态光斑；
- 整个页面长期处于高成本 backdrop blur；
- 每张 Card 都做独立玻璃层；
- 玻璃效果替代真实 border、focus、selection 或状态语义。

## 4. Material Hierarchy

Aisenhub 只使用有限的材质层级。

| 层级 | 用途 | 材质特征 |
| --- | --- | --- |
| Canvas | 页面最底层 | 稳定、接近不透明，不做 backdrop blur；Surface preset 决定冷暖关系 |
| Data Surface | Table、长文本、主内容区 | 接近实体；细 edge/rim，可无 blur；优先可读性 |
| Structural Pane | Sidebar、Topbar、Toolbar、Inspector 容器 | 高不透明 tint + 有限 blur + 细 rim + 轻 contact shadow |
| Raised Pane | Sheet、Dropdown、Popover、Command Palette | 更明确 rim、层级阴影和适度 blur |
| Modal Pane | Dialog、危险确认、关键阻塞浮层 | 最厚材质；最强空间分离，但仍保持内容清晰 |

### 4.1 Edge treatment

普通 Pane 使用同一组材质语义：

- 顶部/朝向内容的一侧有轻微 rim highlight；
- 内侧使用极弱 inner line 表示厚度；
- 外侧使用 1px 级 hairline 表示边界；
- contact shadow 只用于从 Canvas 分离；
- Raised/Modal 再增加更大的 ambient shadow。

Sidebar 是“竖立的玻璃 Pane”，主要在朝向内容区的一侧体现 edge light；不需要四边都很亮。

### 4.2 Blur policy

Blur 是材质增强，不是层级本身。

- Data Surface 默认不要求 blur。
- Structural Pane 使用轻到中等 blur；只在背景真的可见时才有价值。
- Raised/Modal 可使用更明显 blur，但背景 tint 必须足够实体，保证文字不受干扰。
- Table row、Cell、Badge、普通文本容器不得各自 backdrop-filter。
- 嵌套 Pane 不重复 blur 同一背景。
- 普通页面目标不超过约 3 个同时可见、真正使用 backdrop-filter 的大面积表面；阶段 03 必须以真实浏览器 GPU/滚动表现验证，而不是死守数量。

当浏览器不支持、系统要求降低透明度、性能不足或背景过于复杂时，直接使用更高不透明度的同语义 Surface，并保留 rim / border / shadow。无玻璃效果时页面仍必须成立。

## 5. Appearance System

Appearance 由三个正交维度组成：

```text
Mode × Accent × Surface
```

### 5.1 Mode

- `System` — 默认；跟随系统 Light/Dark。
- `Light` — 永久浅色，直到用户再次修改。
- `Dark` — 永久深色，直到用户再次修改。

首屏必须在 React hydration 前得到最终 Mode，避免 Light → Dark 闪屏。System 模式监听系统变化，但 Feature 不直接监听。

### 5.2 Accent presets

首批只提供受控预设：

| 名称 | 用途 | Light anchor | Dark anchor |
| --- | --- | --- | --- |
| Blue | 默认、清晰可信 | `#2563EB` | `#60A5FA` |
| Indigo | 更沉稳、技术感 | `#4F46E5` | `#818CF8` |
| Violet | 更有品牌个性 | `#7C3AED` | `#A78BFA` |
| Azure | 更清亮、偏冷 | `#0284C7` | `#38BDF8` |

这些是 Product Design anchor，不是要求 Feature 写死的颜色。阶段 03 Theme 实现可为实际对比度微调明度/彩度，但不能改变色相身份或语义职责。

Accent 驱动：

- primary action；
- selection indicator；
- focus ring；
- link；
- active navigation；
- 图表中“当前选择/主要比较对象”的强调色。

### 5.3 Surface presets

| 名称 | 默认 | 性格 | Light canvas anchor | Dark canvas anchor |
| --- | --- | --- | --- | --- |
| Neutral | 是 | 中性、精确 | `#F6F7F9` | `#111318` |
| Cool | 否 | 冷静、偏技术 | `#F3F7FB` | `#0F141C` |
| Warm | 否 | 柔和、偏人文 | `#F8F6F2` | `#171412` |

Surface preset 只改变 neutral family、玻璃 tint 和阴影环境色，不改变状态语义，也不改变 Accent 身份。

### 5.4 Status semantics

状态色始终独立：

- Success：稳定绿色族；
- Warning：琥珀/橙色族；
- Danger / Destructive：红色族；
- Info：信息蓝/青色族，但 token 与 Accent 分离；
- Unknown：中性高对比 + 文本/图标，不用“灰掉就算未知”。

任何状态必须有文字或结构线索，不能只靠颜色。

### 5.5 Appearance entry and persistence

Appearance 属于**全局偏好**，不是第七个 Global 业务导航分类。

阶段 03 的目标入口：

- Topbar 的 Settings / Appearance icon；
- Command Palette 中的“外观设置”；
- 打开全局 Settings Sheet / Panel 的 Appearance section。

首批偏好保存在浏览器本地，不新增后端账户偏好能力。后续如果要跨设备同步，应另立 Requirement。

推荐根属性：

```text
data-theme = light | dark        // 解析后的真实主题
data-theme-mode = system | light | dark
data-accent = blue | indigo | violet | azure
data-surface = neutral | cool | warm
```

Feature 不依赖这些属性做业务判断。

## 6. Typography

优先性能和中英文一致性，不为了品牌感加载额外 Webfont。

Sans stack：

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif
```

技术 ID / code / request ID 使用系统 monospace stack。

默认层级：

| Role | Target |
| --- | --- |
| Page title | 24px / 30px, 650–700 |
| Section title | 16–18px / 24px, 600–650 |
| Body / control | 14px / 20px |
| Dense table | 13–14px / 20px |
| Metadata / helper | 12px / 18px |
| Technical ID | 12–13px mono, tabular when numeric |

数字比较场景优先 `font-variant-numeric: tabular-nums`。

## 7. Density, Spacing and Shape

默认密度：**Balanced**。

### 7.1 Control sizing

- 普通 Button/Input/Select：约 36px 高；
- 紧凑 Toolbar control：约 32px，只用于桌面精确指针场景；
- Icon button：36px 视觉尺寸，窄屏/粗指针保证约 44px 可点击目标；
- Table row：常规约 44px；需要双行信息时 52–56px；
- Textarea/Dialog 等按内容任务决定，不强行压缩。

### 7.2 Spacing rhythm

基础节奏使用 4px 网格，主要间距：4 / 8 / 12 / 16 / 24 / 32。

页面层级优先用 16–24px 建立块关系，不通过给每个块加 Card 建层级。

### 7.3 Radius

- control：8px；
- compact/small control：6px；
- standard surface：10–12px；
- raised overlay/dialog：12–14px；
- Badge/Tag 可以 pill；普通 Card/Button/Input 不使用夸张 pill。

## 8. Shell and Navigation

Global scope 保留六类治理入口：仪表盘、平台、用户、业务、审计、安全。

Platform workspace 保留真实业务分组：平台运营、商业化、资源与接入、平台设置。

### 8.1 Sidebar

- expanded：约 248px；
- icon collapsed：约 56px；
- 使用 Structural Glass Pane；
- active item 使用 Accent indicator + 文本/背景材质状态，不只改文字颜色；
- group label 弱化，但仍可扫描；
- 不再保留为了填空间而存在的装饰性 footer card。

### 8.2 Topbar

目标高度约 52–56px，保持 sticky。

职责：

- Sidebar trigger；
- 当前 scope / breadcrumb；
- Command Palette；
- Appearance / global settings；
- session / account actions。

Topbar 不承载页面主要业务动作。

### 8.3 Platform scope

PlatformSwitcher 是 scope control，不是普通下拉。必须始终让当前 Platform 名称可见；搜索、异步、stale request 和 route mapping 行为继续由现有业务逻辑负责。

## 9. Page Information Hierarchy

默认页面从上到下使用：

```text
Page Header
  ├─ Scope / title / short description
  └─ Primary page action (0–2)

Task Toolbar
  ├─ Search / Filter / Sort / Refresh
  └─ Collection actions

Main Workspace
  ├─ List / Table / Summary
  └─ Inspector / Detail context
```

Page Header 不做巨型 Hero。描述只保留任务所需的一到两行。

## 10. Core Pattern — List/Table + Inspector

平台、账户、订单、审计、Feedback、Config 等集合型任务优先采用：

> **集合定位对象 → 保持集合上下文 → Inspector 查看二级详情 → 复杂任务进入 Detail Page**

### 10.1 Desktop wide

当主内容宽度允许时，List/Table 与 Inspector 可并排：

- 主数据区尽量占 65–75%；
- Inspector 建议 360–420px；
- Inspector 是 Raised/Structural Pane，但内部不要继续 Card 套 Card；
- 选择对象后保持列表滚动、筛选和搜索状态。

### 10.2 Medium desktop / tablet

Inspector 使用右侧 Sheet，宽度约 400–460px；背景数据仍可见但不应通过过强 blur 失去上下文。

### 10.3 Narrow

Inspector 近全宽或进入 Detail route。列表不强行保持桌面所有列；优先展示对象识别、状态和关键操作。

## 11. Page Type Adaptations

### Overview

Overview 不是“若干同权 KPI Card”。优先结构：

1. Attention / current health；
2. 关键数字摘要；
3. 需要处理的任务；
4. 低优先级系统状态。

如果没有真实异常，不制造彩色告警块。

### Platform Directory / Accounts / Orders / Audit

统一为高质量 Collection Workspace：Page Header + Toolbar + Table/List + Inspector。

### Account 360 / Identity Detail

复杂对象进入完整 Detail Workspace：

- 顶部 compact identity summary；
- 重要状态与 scope 固定可见；
- 内容按业务章节分隔，不默认每节一个 Card；
- 风险操作集中在明确 Danger / Governance 区域；
- notes/tags/commerce/identity 等只在需要时形成独立 Surface。

### Billing / Security

强调状态、异常和操作安全。视觉层级不能把普通事实和高风险动作画得一样重。

## 12. Component Product Adaptation

### Button

- Primary：Accent solid-glass pane；面本身偏实体，玻璃感主要来自 rim 和 contact shadow。
- Secondary/Outline：clear/control glass；不靠厚 border。
- Ghost：只用于低强调动作；hover 才出现轻材质状态。
- Destructive：始终使用 Danger semantic，不跟 Accent。

### Input / Select / Textarea

- 接近实体 Surface，保证输入内容清楚；
- hover 轻微提升 edge；
- focus 使用 Accent ring + edge，不用强 glow；
- error 使用 Danger border/ring 与文本说明。

### Table

- Table 是主要信息工具，不是 Card 集合；
- header 与 body 通过 typography / surface / divider 区分；
- row hover 很轻；selected 使用统一 material state + Accent indicator；
- 不给每行独立 shadow、blur 或大圆角。

### Card / Surface

Card 不是默认布局单元。只有一个内容块确实需要独立语义、边界或可操作性时才使用 Surface。

### Dialog / Sheet / Popover / Dropdown

使用更厚的 Raised/Modal Glass。Overlay 必须保证文字、菜单项和危险动作对比度稳定。

### Badge / Status

Badge 尺寸小、文字优先。状态 Badge 不跟 Accent。简单 metadata Tag 可以中性 glass chip。

## 13. Icon Language

普通 UI icon 统一从 `lucide-react` 导入。

首批稳定映射：

| 语义 | Lucide |
| --- | --- |
| Overview | `LayoutDashboard` |
| Platforms | `Boxes` |
| Accounts | `Users` |
| Billing | `CreditCard` / `Receipt` |
| Audit | `ScrollText` |
| Security | `ShieldCheck` |
| Search | `Search` |
| Filter | `ListFilter` |
| Refresh | `RefreshCw` |
| Add/Create | `Plus` |
| Settings | `Settings2` |
| Appearance | `Palette` 或 `SunMoon`，阶段 03 选定其一后全局固定 |
| Copy | `Copy` |
| Delete | `Trash2` |
| External | `ExternalLink` |
| More | `Ellipsis` |
| Back | `ArrowLeft` |
| Success | `CircleCheck` |
| Warning | `TriangleAlert` |
| Error | `CircleX` |
| Info | `Info` |

默认 icon 视觉尺寸 16px；主要 navigation 18px。stroke 使用库默认风格，不允许 Feature 改成另一套粗细体系。

品牌 Logo、真实业务图片、QR、用户上传附件和标准库无法表达的专业图形是例外，不构成第二套 icon set。

## 14. Interaction Character

### Hover

轻微提高 rim / Surface 密度或 edge 对比；不做明显上浮动画。

### Pressed / Open

与统一 Material Active State 一致：表面略更实体、rim 更明确、阴影更贴近；不改变组件尺寸。

### Selected

Material Active State + Accent indicator + ARIA/结构语义。颜色消失后仍能判断 selection。

### Focus

清晰 focus-visible ring；不依赖 hover；Dark/Light 和所有 Accent 都必须满足可见性。

### Disabled

降低层级但保留可读文字。不要只用极低 opacity 导致无法辨认。

### Danger

危险动作通过位置、copy、Danger semantic 和确认流程共同表达；不能只把按钮染红。

高风险治理动作必须在确认面板中同时表达：target、实际 impact、是否可恢复、reason、审计/异步后果，以及当前是否需要 recent MFA。`step_up_required` 是独立交互状态：完成 MFA 后回到原任务上下文，但**不自动重放原 mutation**，由管理员再次明确提交。

## 15. Async, Error and Security State Matrix

Admin 不能把所有“没有数据显示”画成同一种 Empty，也不能把所有 401/403 画成同一种权限错误。

读取类状态至少区分：

- `loading`：尚未得到可信结果；
- `read_error`：数据源读取失败；
- `access`：服务端明确的 session / MFA / admin permission 边界；
- `empty`：权威结果确实没有对象；
- `filtered_empty`：有集合，但当前筛选无结果；
- `refreshing`：保留最后可信数据并在后台更新；
- `refresh_error`：保留最后可信数据，同时说明刷新失败；
- `not_found / stale target`：URL/selected 对象已不存在或失效。

安全错误 UI 必须消费共享服务端分类：session 失效、`MFA_REQUIRED`、`RECENT_MFA_REQUIRED`、`ADMIN_REQUIRED`、真实策略拒绝、冲突、限流和服务故障不能由页面根据裸 HTTP 403 自己猜。

Mutation 至少区分：

```text
confirm_required → step_up_required → pending → accepted | success | failure | unknown_outcome
```

`accepted` 只表示服务端已受理，不等于完成；`unknown_outcome` 不等于 failure，也不得触发自动重试。错误面板保留 request/support ID 的技术追踪入口，但业务说明优先。

## 16. Perceived Performance

用户点击后必须尽快得到可靠响应。

### Initial load

- Shell / Navigation / 页面骨架先稳定；
- 已知结构可保留空间避免 layout shift；
- 不默认整页 Skeleton；
- Skeleton 只模拟确定的内容形状，不做装饰 shimmer 大面积扫屏。

### Fast request

约 150–200ms 内完成的请求不应闪一下 spinner/skeleton。

### Local wait

超过短等待阈值后，只在发生等待的局部区域显示 busy/loading；Toolbar、已加载数据和 scope 尽量保持。

### Background refresh

- 保留最后可信数据；
- Refresh control 显示 busy；
- 失败显示 refresh error，不切换成 Empty；
- 不因为刷新重置 selection/scroll。

### Mutation

- 点击后立即进入 pending/accepted 等真实状态；
- 能乐观更新的低风险状态才考虑 optimistic UI；
- 高风险/非幂等 mutation 不因为“感觉快”自动重放；
- unknown outcome 必须引导重新读取权威状态。

### Long-running task

只有服务端提供真实分母时显示百分比。否则显示阶段/busy 状态，不制造假进度或假 ETA。

## 17. Motion

动效只解释状态变化和空间关系。

- hover/focus：约 100–140ms；
- menu/popover：约 140–180ms；
- Sheet/Dialog：约 180–220ms；
- 不做持续 ambient 动画、光斑追踪或背景流动；
- reduced motion 下关闭位移/缩放型转场，保留必要即时状态变化。

阶段 03 可根据真实浏览器手感微调具体时间，但不能改变“短、克制、用于反馈”的方向。

## 18. Responsive Strategy

Admin 以桌面工作区为主，但窄屏必须能完成关键任务。

### Wide desktop

- Sidebar + fluid workspace + inline Inspector；
- 数据表格优先完整列；
- 页面 gutter 24–32px。

### Standard desktop

- Sidebar 可收起；
- Inspector 改为 Sheet 或压缩宽度；
- Toolbar 可以换行，但 primary action 保持清楚。

### Narrow

- Sidebar 使用 Sheet；
- Page gutter 16px；
- Table 可转重点列 + row action / detail；
- Inspector 近全宽；
- Icon control 保证触控目标；
- 不把桌面三栏简单缩成窄屏三栏。

## 19. Accessibility and Material Safety

- 所有文字/控件在实际玻璃背景上验证对比度，不能只测不透明 token。
- Focus ring 不被 blur、overflow 或 shadow 裁切。
- `prefers-reduced-motion` 必须生效。
- 如果环境支持 reduced transparency / forced colors，应优先进入更不透明、更简单的表面表达。
- backdrop-filter 不是信息表达必要条件；关闭它仍能完整使用产品。
- Glass edge 不替代真实 selected/focus/error 语义。

## 20. Anti-patterns

明确禁止：

- 旧页面只换颜色、圆角、阴影；
- 页面自行定义 `primary` / `card` / `border` 等第二套主题；
- Feature 自绘普通 SVG icon；
- 页面里 Card 套 Card 套 Card；
- 每个区域都有 blur、shadow 和高光；
- 透明度低到文字与背景竞争；
- 用 gradient/aurora 背景制造“高级感”；
- 每个状态都做彩色 Badge；
- 用 Skeleton 覆盖本可保留的真实数据；
- 加载时卸载整个页面 Shell；
- Accent 改变 Danger/Success 等状态含义；
- 通过全局 `filter` 或 `opacity` 实现 Dark Mode；
- 让 Appearance 成为某个 Platform 的设置，导致全局偏好跟 scope 混淆；
- 为实现玻璃效果直接引入一套第三方 Theme 并与 `@kit/ui` Theme 并存。

## 21. Phase 03 Implementation Order

阶段 03 每个页面批次必须遵循：

1. 读取真实 Requirement、数据、scope、安全和状态；
2. 重新设计信息层级，不继承旧布局；
3. 判断所需能力属于 Theme / Skin / standard component / semantic UI / feature；
4. 先补 shared capability，再组合页面；
5. 应用 Appearance 与 Solid Glass material；
6. 统一 Lucide icon；
7. 优化 initial/refresh/mutation perceived performance；
8. 验证 Light/Dark/System × 代表 Accent/Surface；
9. 验证 desktop/narrow、keyboard/focus、error/empty/unknown/danger；
10. 删除本批次被替代的旧 CSS 和旧视觉实现。

首批实现：

> **Shell / Navigation / Topbar / PlatformSwitcher / Command Palette / Appearance Settings**

首批必须先证明 Theme owner、Solid Glass Skin、Overlay、响应式和 perceived performance 能成立，再扩展到 Overview 与业务页面。

## 22. Design Acceptance Matrix

阶段 03/04 最终至少验证：

- Light / Dark / System；
- Blue / Indigo / Violet / Azure 代表组合；
- Neutral / Cool / Warm 代表组合；
- 标准 component、Popover、Dialog、Sheet、Table、Inspector；
- scope 和 selected 状态在所有主题下清楚；
- status semantic 不被 Accent 污染；
- blur disabled/fallback 后仍可用；
- initial load / background refresh / mutation / unknown outcome；
- desktop / medium / narrow；
- keyboard / focus-visible / reduced motion；
- 长文本、技术 ID、大表格和危险确认。

## 23. Authority

本文件冻结的是**设计方向和 Product Adaptation**。阶段 03 的 Theme/Skin 代码是准确运行值来源；如果实现验证发现某个数值需要为 WCAG、性能或浏览器兼容微调，可以在保持本方向不变的前提下调整，并同步本文件中真正改变的设计决定。

任何 Feature 不能因为实现方便绕开本文件和通用 Design System 建立第二套视觉语言。
