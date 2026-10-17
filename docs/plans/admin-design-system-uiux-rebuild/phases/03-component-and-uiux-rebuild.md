# 阶段 03：组件与 UI/UX 并行全面重构

状态：进行中

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## Requirements

本阶段实际实施并验证 `REQ-ADM-002`、`REQ-ADM-003`、`REQ-ADM-004`、`REQ-ADM-005`、`REQ-ADM-007`、`REQ-ADM-008`、`REQ-ADM-009`、`REQ-ADM-011`、`REQ-ADM-012`。若某 Feature 涉及其他 Domain Requirement，执行批次时必须补读并加入该批次验收。

## 阶段目标

把阶段 01/02 冻结的 Design System 与 Aisenhub Design Direction 落入真实代码。组件优化和视觉/交互优化作为两条并行轨道，在同一真实页面批次内汇合；逐批覆盖全部 Admin 路由，而不是分别建设一套“未来组件库”和一套“临时页面皮肤”。

## 进入条件

- 阶段 01、02 均已交付。
- 新 `apps/admin/DESIGN.md` 已冻结。
- 当前路由、Feature、shared component、CSS ownership 和浏览器测试入口重新 inventory。
- 根据候选完整差异按 release workflow 重新确认风险级别；默认至少 R2。

## 目标实现职责

- shared semantic theme / component skin 进入 `packages/ui` 的稳定样式层，具体路径以当前 package export/build 约束确定。
- `packages/ui/src/shadcn/**` 保留结构/交互/API，逐步减少与 shared skin 重复的视觉所有权。
- `packages/ui/src/makerkit/**` 或后续等价目录保留稳定 semantic UI；目录历史命名不影响职责。
- `apps/admin/app/globals.css` 收敛为 assembly/reset/Admin adaptation/page geometry，不再大面积覆盖共享控件 slot。
- `apps/admin/features/**` 保留业务、数据、task flow、外部 layout 和真正局部差异，不重复基础 skin。

## 页面批次工作法

每个批次固定执行以下顺序：

1. 读取该 Feature 的真实数据/安全/路由/状态模型和适用 Requirement。
2. 列出 raw controls、自绘 skin、shared primitive、semantic component 和 CSS ownership。
3. 判断缺口应属于已有 component prop、共享有限 variant、product adaptation 还是局部实现。
4. 先修改/补齐共享能力，再让 Feature 消费；禁止先用 Feature override 赶页面效果。
5. 同步优化信息 hierarchy、spacing/density、responsive、visual states、copy hierarchy 和交互反馈。
6. 清理该批次普通 UI 的自绘/零散 icon，改为标准图标库与阶段 02 冻结的语义映射。
7. 验证 Light/Dark/System 和适用 Accent/Surface 预设，确保不是只替换 primary 色，而是完整 Theme → Skin → Component 组合。
8. 验证 keyboard/focus、screen width、loading/empty/error/refresh error、selected、disabled、danger、unknown outcome，以及首屏/刷新/mutation 的 perceived performance。
9. 删除该批次被替代的旧 CSS/自绘实现，确认没有两套同时生效。
10. 小提交、记录验证，再进入下一批。

## 首批 Pilot

建议先以 Shell / Navigation / PlatformSwitcher / Topbar / Appearance Settings 为 pilot，因为它们覆盖 Global/Platform scope、responsive、浮层、搜索、键盘、主题、状态和高频 shared primitives。PlatformSwitcher 的服务端搜索、游标分页、Abort/stale-request 防护、route mapping 等业务行为保持 Feature 所有；触发 Button、Input、Popover/Listbox、状态和 Loading/Error 外观应优先复用标准能力。Appearance Settings 同时验证 Theme owner、Portal/Overlay、刷新恢复和多套 Accent/Surface 的全局一致性。

## 详细实施批次

阶段 03 不采用一次性全站重写。每个批次独立完成 shared capability、真实页面组合、旧视觉清理、浏览器验证和小提交；只有前一批 shared API / Theme owner 稳定后才进入下一批。

### 03A — Theme / Solid Glass / Shell Pilot

**当前状态**：实现 checkpoint `764193b094287ff7668588ed7068fc0e2367e86c` 已 push 到 `codex/admin-uiux-phase3`，并通过 targeted static/unit/build、synthetic production browser 与正式 clean Local Supabase R2。标准 `pnpm run verify:task:0801` 共 24 executable gates PASS；阶段 03 继续进入 03B，不能据此提前宣称 03C–03E 或整个阶段完成。

**范围**：Root layout、Theme/Appearance owner、Shell、Sidebar、Topbar、PlatformSwitcher、Command Palette、Appearance Settings、全局页面 geometry，以及这些入口依赖的 Button/Input/Dialog/Sheet 等高频标准组件状态。

**实施目标**：

- 建立单一 Appearance owner，支持 `System / Light / Dark × Blue / Indigo / Violet / Azure × Neutral / Cool / Warm`，默认 `System + Blue + Neutral`。
- 在 hydration 前恢复主题并解析 System，避免首屏 Light→Dark 闪烁；本地持久化，不新增后端偏好接口。
- Root 同步 `data-theme` / `data-theme-mode` / `data-accent` / `data-surface`，并维护 `.dark` 兼容现有 shared UI。
- 建立 Solid Glass material token：Canvas / Data / Structural / Raised / Modal，blur 可降级且不作为信息语义。
- Sidebar 收敛到约 248px / 56px icon collapse；去除旧装饰 footer card；active state 使用 Accent + 非颜色结构线索。
- Topbar 增加 Appearance 入口并保持 scope / Command Palette / session actions；Appearance 不成为第七个业务导航分类。
- PlatformSwitcher 保留搜索、分页、Abort、stale-response、键盘和 route mapping，只替换基础控件/材质皮肤并改善 loading continuity。
- Command Palette 增加 Appearance action，Overlay/Popup 使用 Raised/Modal glass，并继续满足 Ctrl/Cmd+K 与键盘导航。
- 删除本批次旧 Teal/Light-first Shell 视觉 ownership；遗留业务页面可以暂时消费新 semantic token，但不得继续决定 Theme。

**验收**：Admin typecheck/unit；Shell/navigation/platform switcher 既有单测；Light/Dark/System 代表组合；刷新恢复；窄屏 Sidebar Sheet；keyboard/focus；reduced motion；无主题闪屏；无 PlatformSwitcher 行为回归。

### 03B — Standard Components + Semantic UI Skin

**当前状态**：已交付并通过 clean R2。代码 checkpoint 为 `03060ed`（shared skin/state ownership）与 `67aa0b7`（Admin native control standardization），最终收尾 `73f37f8` 已进入 main，并完成 Production READY + GitHub Workflow success；阶段 03 已继续进入 03C。03B 只代表标准控件与 semantic UI skin 收敛，不代表后续页面信息架构/排版重构已完成。

**范围**：Button/Input/Select/Textarea/Checkbox/Switch/Table/Card/Alert/Badge/Dialog/Sheet/Popover/Tooltip/Tabs，以及 AsyncState、StatusBadge、ResourceId、SupportErrorId、ConfirmActionDialog、MutationState、ResourceInspector、OneTimeSecretPanel。

**已实现**：

- 把 Admin 已真实消费的 Input/Textarea/Table/Card/Alert 等通用 skin 收回 `@kit/ui`，补齐 Alert `data-variant`、StatusBadge `data-tone`、AsyncState `data-state`、SupportErrorId slots、ResourceInspector material identity 等稳定状态/part contract。
- `NativeSelect` 成为普通枚举选择的标准能力；14 个 Admin 文件中的 29 个 raw `<select>` 全部迁移，并删除 Feature 自绘 border/background/radius/focus skin。
- 登录/MFA/Identity 搜索、Feedback Checkbox/Textarea、Storage Policy Checkbox、PlatformSwitcher 普通 action 等回到标准 Input/Label/Button/Checkbox/Textarea；普通 raw `input/select/textarea` 已为 0。
- Button 增加有限 `destructive-ghost` 与稳定 selected/active data-state skin；Button/Badge/Switch 删除 `transition-all`，只动画实际视觉属性。
- `apps/admin/app/globals.css` 删除 Table/Card/Input/Alert 与 PlatformSwitcher option 的重复基础 skin，只保留 Admin geometry、Sidebar、Solid Glass/Dialog/Inspector 等 Product Adaptation。
- Feature 对 Button/Input/NativeSelect/Textarea/Checkbox/Alert/Table/Dialog/Sheet 的 skin override 反向扫描为 `HITS 0`。仍存在 4 个 raw `<button>` 是 Deletion Jobs、Billing Order、Platform Key、Entitlement 的业务集合行交互面，保留到对应 03C/03D/03E Collection/Inspector 页面批次重构，不作为普通控件第二皮肤继续扩散。
- 未被 Admin 真实消费的组件不为“清单完整”强行改写；后续页面首次消费时继续按同一 owner/variant/state 规则审查。

**验收**：shared/Admin typecheck 与 unit PASS；production build PASS；synthetic production browser 覆盖 60 route/viewport combinations、NativeSelect/Checkbox/PlatformSwitcher/Alert/Inspector/危险确认等真实路径并 0 runtime exception；最终 clean `pnpm run verify:task:0801` 24 executable gates PASS。中间 format gate、旧 hidden checkbox selector 与旧 a11y scanner 失败均保留在 `verification-record.md`。

### 03C — High-frequency Platform / Account Workspaces

**当前状态**：已交付并通过 clean R2。基于生产已验证 main `73f37f8` 建立 `codex/admin-uiux-phase3c`；`5fbb922` 先删除 03B 审查中发现的 Admin 全局 control 第二 skin，`9426d18` 重建 Platform Directory / Platform Accounts / Account 360，`7fff7f7` 重建 Global Overview / Platform Overview / Global Accounts / Identity Detail，verification checkpoint `e90dbb8` 已 push 且远端 SHA 核对一致。目标路由已全部从旧 `.panel` hierarchy 迁出；阶段 03 进入 03D，03D/03E 尚未完成。

**范围**：Global Overview、Platform Directory、Platform Overview、Global Accounts、Platform Accounts、Identity Detail / Account 360。

**已实现**：

- 新增轻量 `AdminTaskToolbar` / `AdminWorkspaceSection` product composition primitives，只表达稳定的 Toolbar / Section heading / body 结构，不建立 Page Builder 或业务 DSL。
- Platform Directory / Platform Accounts / Global Accounts 使用 Toolbar + Collection/Table；搜索、筛选、URL、cursor、scope、横向滚动、empty/read-error/refresh-error 语义保持原合同。
- Account 360 从 9 个同权 `.panel` 重排为“账户事实 + 集中治理 / 资料与权益 / 关联业务 / 支持与治理记录”，危险动作保持 reason + recent-MFA + unknown-outcome no-auto-replay。
- Global Overview 改为 Attention-first：先展示真实待处理信号，再展示紧凑运行摘要与平台概况；不把读失败解释为 0 或健康。
- Platform Overview 把暂停账户、异常订单、待审核配置、待处理反馈提升到首个业务章节；账户/付费/订单与用户变化作为后续事实组，不再为每个 Metric 建独立 Card。
- Identity Detail 改为 compact Global Identity summary → Platform Account collection → Global Delete governance；request/job 使用时间线/事实行，不再各自形成 Card。
- 03C 七个目标页面的 `className="panel`、raw `button/input/select/textarea` 静态扫描均为 0；旧 `admin-resource-toolbar/surface/primary/secondary` 无消费者后删除。
- 03B corrective 删除 `globals.css` 对标准 Input/NativeSelect/Textarea 的 broad border/background/radius/hover/focus 第二 owner，并把全局 focus outline 收窄到非标准 raw button/link/summary。

**验收**：Admin unit 17 files / 77 tests PASS；typecheck/lint/production build PASS；synthetic production browser 覆盖 60 route/viewport combinations、Platform Overview period/refresh、Global/Platform Account 搜索/筛选、Identity/Account 360 deep link + dangerous confirmation、mobile/security，0 runtime exception；最终 clean `pnpm run verify:task:0801` 24 executable gates PASS。

### 03D — Billing / Audit / Security

**范围**：Global/Platform Billing、Audit、Security、Subscriptions/Entitlements 等高状态密度工作区。

**实施目标**：强化异常/状态层级，统一 technical metadata 与 support ID；accepted/success/failure/unknown outcome 不混淆；高风险动作保持 reason、recent MFA、no-auto-replay。

**验收**：服务端错误分类、危险确认、unknown outcome、表格/Inspector、键盘与主题矩阵。

### 03E — Config / Feedback / Settings / Remaining Routes

**范围**：Files/Config、Feedback、Plans、Redemption、Integration、Keys、Origins、Platform Settings、Deletion Jobs 及 inventory 中剩余 Admin route。

**实施目标**：完成长尾页面全量覆盖；清理剩余 raw control / icon / duplicate skin；所有 Admin route 明确归属某批次并留下验证证据。

**验收**：全路由 desktop/narrow、主题、键盘、异步状态、危险操作；最终运行完整 R2 本地门槛并为阶段 04 提供可治理基线。

## 批次提交与停止条件

- 03A–03E 每批至少一个独立 commit；共享 Theme/Skin/API 在批次中由唯一 owner 修改。
- 若 shared component 改动导致行为回归，先在 shared 层修复，不允许用多个 Feature override 掩盖。
- 若某页面需要改变 API/数据库/权限业务合同，停止该子项并拆新计划，不把后端改动混进 UI 批次。
- 阶段 03 可以在单次会话中完成一个或多个完整批次；不得把未验证的后续批次标成已完成。

## Shared Component 优先清单

按实际引用量和页面批次推进，优先审查 Button、Input、Textarea、Label、Select、Checkbox、Switch、Table、Card、Alert、Badge、Dialog、Sheet、Popover、Dropdown、Tooltip、Tabs，以及 AsyncState、StatusBadge、ResourceId、SupportErrorId、ConfirmActionDialog、MutationState、ResourceInspector、OneTimeSecretPanel 等 semantic UI。

不要求这些组件一次性全部重写；只要一个页面批次使用它，就必须先确定该组件在新 Design System 下的 owner、variant/state 和视觉来源。

## 变更范围

主要涉及 `packages/ui/**`、`apps/admin/app/**`、`apps/admin/components/**`、`apps/admin/features/**`、Admin unit/browser/E2E。原则上不改变 API、数据库或领域写入；若发现 UI 无法在不改变业务合同的情况下满足 Requirement，应停止该子项并拆出新计划/任务。

## 验证方案

每个页面批次至少选择与改动匹配的检查；阶段最终候选必须重新执行完整适用集。

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| 格式 | `pnpm format:check` | Local | PASS | 03A final candidate PASS；首次发现 3 个新增文件格式差异，定向格式化后复测通过 |
| Lint | `pnpm lint` | Local | PASS | 03A PASS：358 files，0 warnings / 0 errors |
| TypeScript | `pnpm typecheck` | Local | PASS | 03A targeted：`pnpm --filter admin typecheck` 与 `pnpm --filter @kit/ui typecheck` PASS；全仓最终候选仍在阶段末复跑 |
| Production build | `pnpm build` | Local | PASS | 03A targeted：`pnpm --filter admin build` PASS；Next.js 16.3.8 完整 Admin route tree 构建成功 |
| Unit | `pnpm test:unit` | Local | 受影响 shared/Admin tests PASS | 03A Admin PASS：17 files / 77 tests，含 Appearance model 与既有 navigation/platform switcher tests |
| Admin browser/E2E | `pnpm test:e2e:t12-r2` 或执行时确认的当前 Admin E2E 入口 | Local + Local Supabase | 受影响页面真实路径 PASS | 03A PASS：标准 clean `pnpm run verify:task:0801` 24 gates 全部通过，包含 Admin T12、Consumer Harness、64 SQL files / 1398 DB tests；一次 `--reuse-local` 复测因旧 fixture 污染失败，reset Local 合成测试库后同一测试及完整 gate PASS |
| 文档 | `pnpm docs:check`、`pnpm contracts:check` | Local | PASS | 03A PASS：115 documents；Account/Admin OpenAPI、Platform integration、consumer compatibility 均通过 |
| 浏览器人工矩阵 | 当前支持 desktop/narrow viewport + keyboard | Local | 页面可完成任务，无遮挡/焦点丢失/状态混淆 | 03A synthetic production browser PASS：60 route/viewport combinations + mobile nav + keyboard/listbox/Inspector/危险确认，0 runtime exception |
| Appearance matrix | Light/Dark/System × 冻结 Accent/Surface 代表组合 | Local browser | Shell、标准组件、Overlay、focus、状态语义一致 | 03A PASS：默认 System+Blue+Neutral、Dark+Violet+Warm、刷新持久化、`.dark` 同步、Command Palette/Topbar 双入口；其余组合由同一 token model 驱动，阶段后续继续抽查 |
| Perceived performance | 首屏/导航/查询/refresh/mutation 真实路径 | Local browser | 反馈及时、布局稳定、可信数据保留、无无意义 loading 闪烁 | 03A PASS：PlatformSwitcher 已知 scope 不再因首轮列表读取清空；background refresh error 保留现有 rows；Shell/Toolbar 稳定 |

任何组件替换都必须验证原有 submit、focus restoration、Escape、Arrow key、controlled state、route mapping 和 dangerous-action confirmation 等真实行为，不允许用“视觉一致”代替行为验收。

## 退出与恢复条件

阶段 03 只有在全部 Admin 路由已经被明确归入并完成某个批次、shared ownership 已实际落地、批次测试和最终 R2 本地验证通过后才能退出。任何未覆盖路由必须列为剩余工作，不能用“主要页面已完成”代表全量完成。

回退以批次小提交为单位；出现 shared component 回归时优先修复或回退 shared 层，禁止在多个 Feature 上增加临时补丁长期共存。

## 文档与交付

- [ ] 每批次记录涉及路由、shared component、visual/UX 改动和验证。
- [ ] 当新结构成为真实运行路径后同步 `docs/architecture/modules/frontends.md`。
- [ ] `apps/admin/DESIGN.md` 只在设计决定真的改变时更新，不记录实现流水。
- [ ] `verification-record.md` 记录真实命令、失败、复测、commit/push。
