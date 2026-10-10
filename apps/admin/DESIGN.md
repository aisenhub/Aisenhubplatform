---
name: Aisenhub Admin
description: 平台与账户管理的操作账簿
colors:
  primary: "#087b76"
  primary-dark: "#05635f"
  primary-soft: "#e7f3f1"
  background: "#f4f6f8"
  foreground: "#18232f"
  card: "#ffffff"
  secondary: "#eaf0f3"
  secondary-foreground: "#344654"
  muted: "#eef2f5"
  muted-foreground: "#5c6c7b"
  border: "#dce3e9"
  input: "#b9c6d0"
  success: "#157047"
  warning: "#93601a"
  warning-foreground: "#805216"
  danger: "#b53342"
  info: "#2866a3"
  sidebar: "#182631"
  sidebar-foreground: "#d9e4eb"
  sidebar-primary: "#9ae6d9"
  sidebar-primary-foreground: "#123a35"
  sidebar-accent: "#2b444e"
  sidebar-accent-foreground: "#b8f2e7"
  sidebar-border: "#354651"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "1.75rem"
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "0.875rem"
  label:
    fontSize: "0.75rem"
    fontWeight: 600
  identifier:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
    fontSize: "0.75rem"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.625rem"
  xl: "0.875rem"
  surface: "0.75rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
  page: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  button-ghost:
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "2rem"
    padding: "0 0.625rem"
  search-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.75rem"
  navigation-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
    rounded: "{rounded.md}"
  resource-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.surface}"
    padding: "{spacing.lg}"
  table-selected:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.foreground}"
---

# Design System: Aisenhub Admin

## Overview

**Creative North Star: "操作账簿 / Operations Ledger"**

深墨色导航承载管理范围，冷纸色工作区承载数据，青绿色引导操作。界面使用紧凑搜索、细分隔线和可比较的表格行，让管理员先找到平台和账户，再查看详情并确认变更。

这是当前实现的视觉记录，依据 [全局样式](app/globals.css)、[Shell](components/shell/admin-shell.tsx)、[导航](components/navigation/admin-navigation.ts)及平台、账户、概览页面。视觉方向由用户交由 Agent 决定；方向 seed 为 `5b78f793`。组件预览、动效和断点元数据见 [.impeccable/design.json](.impeccable/design.json)，不代表后端能力或验收结果。

**Key Characteristics:**

- 深色导航与浅色数据表面。
- 固定字号、等宽标识与对齐数字。
- 以中文任务名称组织搜索、列表、详情与操作。
- 通过明确文字区分失败、旧数据、处理中和结果未确认。

## Colors

### Primary

青绿主色用于主要操作、链接和工作区焦点；深青绿用于强调链接与认证按钮悬停，浅青绿用于选择和文本选区。状态颜色分别表达成功、警告、危险与处理中；状态始终有文字标签。

### Neutral

冷纸背景与白色表面通过细灰边界分层，正文为深墨色，辅助信息为灰蓝色。导航使用独立的深墨、浅文字、薄荷标记和青灰活动背景。

**The Scope Rule.** 深色导航表示管理范围，青绿操作色不替代危险、警告或结果未确认的语义。

## Typography

正文使用系统无衬线字体及中文回退，不依赖远程字体。ID、Code 和次级资源标识使用系统等宽字体；表格数字使用等宽数字特性。

全局一级标题采用 frontmatter 的 headline；页面标题组件另声明小屏与宽屏字号工具类，实际层叠以全局样式与组件共同为准。二级标题为 title，说明和表格为 body，表头、数量提示和资源 ID 为 label / identifier。认证页说明最大行宽为 65ch。字号固定，不使用视口插值或装饰性展示字体。

**The Identity Rule.** 人类名称先读，机器标识次读；保留 ID 的复制入口与完整详情，长标识按场景换行或截断。

## Layout

桌面导航展开宽 16rem，图标模式宽 3rem；窄屏为 18rem 抽屉，并在路由变化后关闭。白色上下文条置顶，最小高度 3.5rem，可换行；大屏显示范围路径，窄屏显示当前页面名称。

工作区全宽且允许收缩；页面默认内边距为 2rem、区块间距为 1.5rem。40rem 以下页面内边距改为横向 1rem，区块内边距为 1rem，操作区扩展至整行。搜索工具栏使用横向密集布局并可换行，窄屏表单堆叠。

概览顶部使用四列状态表面展示系统状态、待处理事项、失败/阻塞和计费告警；64rem 以下变为两列，40rem 以下单列。主要“需要关注”与平台概况在 xl 断点分为两列。概览不再加载或展示审计流水，也不再用审计事件派生“最近变更平台”；平台列表达到有界读取上限时使用“≥N”表达，不把窗口数量冒充全局精确总量。完整操作追踪统一进入全局审计中心。

**The One Scroll Rule.** 平台与账户表格的外层区域承担唯一横向滚动，内部 Table 容器不重复滚动。区域有可访问名称、tabIndex、焦点轮廓和窄屏方向键提示；账户表格保留 52rem 最小宽度。

## Elevation & Depth

常驻卡片不使用阴影，以白色、背景色和细边框建立层次。详情 Sheet 与对话框沿用共享浮层组件的遮罩、边界与阴影；不要把工作区的平面规则扩展为取消浮层提示。

输入边界和任务链接采用 160ms ease 过渡；Sidebar 与 Sheet 使用共享组件的 200ms 过渡。减少动态效果偏好关闭过渡，动画缩短为一次 1ms。

## Shapes

全局圆角基值为 lg；小型控件使用 md / sm，数据区域使用 surface，认证卡使用 xl。细边框构成主要轮廓，状态标记采用胶囊形与小圆点；品牌为带圆角的字母 A 方块。

## Components

- **Buttons:** 主操作为青绿实体；次操作为描边；低强调操作为 ghost；危险操作保留危险文字色。默认高度 2rem，sm 为 1.75rem；40rem 以下按钮最小高度 2.75rem。禁用态降低透明度并阻止操作。共享主按钮的悬停透明色仅用于链接实例，认证按钮另有深青绿悬停。
- **Search / fields:** 白底、输入色边界、md 圆角，最小高度 2.5rem；搜索有隐藏或可见标签。悬停边界变青绿，键盘焦点显示边界与轮廓；无效、提交中和禁用态保留共享组件语义。
- **Navigation:** 中文任务分组，Global 与 URL 指定的 Platform 范围使用不同菜单。活动项使用青灰背景、薄荷图标与较重文字，并设置 aria-current；图标折叠模式保留 tooltip。平台切换、返回目录与全局管理入口保留范围线索。
- **Tables / status:** 表头高度 2.75rem，字体较小；单元格纵向留白 0.875rem。行悬停为 muted，详情所选账户行为 primary-soft；状态胶囊有文字、小圆点和色调，unknown 使用更强警告底色。
- **Audit center:** 全局审计中心的一级表格固定围绕“操作者 / 平台范围 / 对象 / 操作 / 结果 / 时间”组织。已知 event/target code 使用中文业务语义，原始 code、UUID、request_id 只在详情技术区保留；缺失 outcome 明确显示“未记录”，不得默认成功。操作者、平台、动作、对象类型、结果与关键词筛选写入 URL，并由服务端在游标分页前组合执行。
- **Resource details:** 右侧 Sheet 展示账户状态、标识与时间，窄屏全宽，宽屏最大 28rem。选择写入 URL，列表同步高亮；关闭详情后尝试回到触发按钮焦点。详情列表窄屏由标签和值两列改为单列。
- **Async / safety:** 加载、空结果、访问失败、读取失败与后台刷新失败分别呈现；后台失败保留已知数据并说明可能过期，附重试与支持 ID。账户操作继续显示目标、影响、理由及近期 MFA；accepted、success、failure 和 unknown_outcome 保持不同文字与恢复入口。

跳到内容链接仅在聚焦时出现；工作区焦点为青绿，导航焦点为薄荷色。装饰图标隐藏于辅助技术，数量变化以 polite 状态区域通知。视觉文档不代替权限、MFA、确认、幂等与服务端权威结果边界。

## Do's and Don'ts

### Do:

- **Do** 使用现有 token 与共享组件，并维持中文任务名称。
- **Do** 在平台范围、当前操作目标及读取窗口旁保留明确说明。
- **Do** 保留表格的单一滚动区域、可聚焦入口、选择态与详情焦点返回。
- **Do** 为旧数据、危险动作与结果未确认提供明确文字和恢复步骤。

### Don'ts:

- **Don't** 将数据源读取失败、受理中或结果未确认表现为成功。
- **Don't** 用颜色、图标或按钮可见性代替状态文字或授权边界。
- **Don't** 在详情之外让每个表格单元成为单独滚动容器。
- **Don't** 用装饰图片替代当前以任务与数据为主的界面；本方向没有 shipping raster。
