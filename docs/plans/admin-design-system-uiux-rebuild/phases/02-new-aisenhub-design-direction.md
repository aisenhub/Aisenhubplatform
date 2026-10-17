# 阶段 02：从零建立 Aisenhub Admin Design Direction

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## Requirements

主要覆盖 `REQ-ADM-002`、`REQ-ADM-003`、`REQ-ADM-004`、`REQ-ADM-005`、`REQ-ADM-007`、`REQ-ADM-008`、`REQ-ADM-009`，并冻结 `REQ-ADM-011`（统一主题/外观）与 `REQ-ADM-012`（实际与感知加载性能）的产品设计。本阶段仍是设计冻结，不等同于代码已经满足新的视觉方向。

## 阶段目标

基于新的 Aisenhub Design System、当前 Product Requirement 和真实 Admin 任务，从零创建新的 `apps/admin/DESIGN.md`。新文档定义 Aisenhub 自己的视觉语言、信息层级、交互气质、组件 adaptation、Admin pattern 和反模式，并成为后续实现唯一 Product Design Direction。

## 进入条件

- 阶段 01 已交付，Design System contract 已稳定。
- `apps/admin/PRODUCT.md` 和 Admin Active Requirements 已重新核对。
- 旧 `DESIGN.md` 仅存在于 Git 历史，不作为设计输入。

## 变更范围

主要创建 `apps/admin/DESIGN.md`，必要时补充仅用于设计方向的轻量元数据；不在本阶段大规模修改 `globals.css`、`packages/ui` 或业务页面。

## 任务清单

- [ ] 以当前 Admin 页面、导航、任务和业务状态做信息 architecture inventory，但只观察功能/内容，不继承旧视觉。
- [ ] 定义 Product Character：专业性、克制程度、密度、扫描效率、操作安全感和品牌气质。
- [ ] 从零定义 Visual Direction：色彩体系、surface、边界、圆角、阴影、字体、字号层级、spacing/density、icon 和 motion。
- [ ] 明确“旧视觉无继承权”：对 Shell、导航、列表、表格、表单、Inspector、Dialog/Sheet 等重新定义信息 hierarchy 和组件排布；当前 DOM/CSS 只能证明业务存在，不能限制新布局。
- [ ] 冻结标准图标策略：Aisenhub 普通 UI 图标统一使用项目标准库（当前 `lucide-react`），建立导航、搜索、设置、刷新、复制、删除、外链、状态等稳定语义映射；禁止页面随机自绘 SVG/PNG。
- [ ] 设计统一 Appearance / Theme System：至少 Light/Dark/System，并设计多套受控 Accent 与 Surface/Background 预设；定义默认主题、Settings 入口、预览/切换、持久化、Portal/Overlay、原生控件和状态色隔离。
- [ ] 定义信息层级：Shell、Page header、Section、Surface、Toolbar、Table、Form、Inspector、Action、Technical metadata。
- [ ] 定义 Interaction Character 和状态矩阵：hover/focus/selected/editing/loading/empty/error/refresh error/success/warning/danger/disabled/unknown outcome。
- [ ] 定义 Perceived Performance：稳定 Shell/布局、局部渐进加载、短请求避免闪烁、刷新保留可信数据、mutation 即时确认、长等待真实 busy/progress，以及 skeleton 使用边界。
- [ ] 定义 Aisenhub 对标准组件的 product adaptation：默认 size/density/variant 和适用场景，不复制组件内部结构行为。
- [ ] 定义高频 Admin patterns：搜索/筛选、列表+详情、资源标识、异步状态、危险操作、导航、PlatformSwitcher、Command Palette、表单、Dialog/Sheet。
- [ ] 定义 desktop / narrow viewport 的 responsive/density 规则。
- [ ] 建立明确 Anti-patterns，禁止页面自建基础皮肤、卡片套卡片、无意义渐变/阴影/圆角、颜色代替语义、局部无限 override 等。
- [ ] 对照旧设计历史做“非继承检查”：不得因为旧色值或旧尺寸已经存在于 CSS 就自动写回新 `DESIGN.md`。
- [ ] 审查 `apps/admin/.impeccable/design.json` 等旧设计元数据：在新 Design Direction 冻结前不得把它当设计输入；新方向确定后按实际工具需要删除、重建或同步，不能保留一份与新 `DESIGN.md` 冲突的第二设计源。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 文档检查 | `pnpm docs:check` | Local | PASS | 未运行 |
| 合同检查 | `pnpm contracts:check` | Local | PASS | 未运行 |
| Diff 格式 | `git diff --check` | Local | PASS | 未运行 |
| Requirement 对照 | 逐条审查 REQ-ADM-002/003/004/005/007/008/009/011/012 | Local | 新设计不削弱现有 Acceptance，并完整定义新增主题/感知性能要求 | 未运行 |
| Design System 对照 | 人工 review | Local | `DESIGN.md` 只做 Product Adaptation，无第二套基础合同 | 未运行 |
| 旧设计污染检查 | 与 Git 历史旧 DESIGN 仅做反向差异核对 | Local | 新方向不是旧风格换名字或简单调色 | 未运行 |
| 图标系统检查 | 语义映射与例外清单 review | Local | 普通 UI 图标统一由标准库提供，无页面级随机自绘体系 | 未运行 |
| 主题系统检查 | Appearance matrix review | Local | Light/Dark/System + 多套 Accent/Surface 预设形成完整语义组合，状态色不被 Accent 污染 | 未运行 |
| 感知性能检查 | 页面状态/加载设计 review | Local | 首屏、导航、刷新、mutation、长等待均定义稳定反馈，不以大面积闪烁 skeleton 代替性能设计 | 未运行 |

## 退出与恢复条件

新 `DESIGN.md` 必须在代码实施前被冻结为阶段 03 的产品方向。若关键视觉决策尚未形成一致方向，则继续在本阶段解决，不得让阶段 03 一边编码一边由 Feature 自行决定风格。

## 文档与交付

- [ ] 新 `apps/admin/DESIGN.md` 已创建并通过设计审查。
- [ ] Spec 中对已删除旧 DESIGN 的任何当前事实引用已同步为新来源或删除。
- [ ] `verification-record.md` 已更新。
- [ ] 阶段 commit 已 push 且远端核对后，状态才可标记已交付。
