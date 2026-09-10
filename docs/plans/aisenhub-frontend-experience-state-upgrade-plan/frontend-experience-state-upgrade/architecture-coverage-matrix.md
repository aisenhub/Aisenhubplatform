# Architecture Coverage Matrix

> FE-R1（2026-09-10）：按当前代码基线 `main@94631ff` 维护；Auth 已实施，本期默认简体中文。Phase 01–08 与 FE-D02 已有代码实现；本矩阵仍只证明架构映射，不替代 [verification-record.md](verification-record.md) 的运行证据。

> 用途：证明 `Aisenhub_Frontend_Experience_State_Architecture.md` 中的内容没有在执行计划拆分时遗漏。  
> 状态：规划映射，不代表任何功能已实施。

| 架构主题 | 执行阶段 | 本期状态/说明 |
|---|---|---|
| 范围、目标、安全不变量 | Master + 全阶段 | 全局约束；不得削弱 Auth/MFA/CSRF/Origin/RLS/Idempotency/If-Match |
| Admin 现状、路由、mega-page、status string | Master + 01/02/04/05/06/08 | 逐步迁移并在 08 扫描旧路径 |
| Vercel Global/Project scope 模式 | 02 | 落为 Global Control Plane + Platform Workspace，不引入 Organization |
| Stripe Search/Workbench 启发 | 01 Command；Future Search/Diagnostics | 本期只真实导航 Command；资源搜索依赖后端 |
| Supabase 设置归属/三段式日志模式 | 05/06 | File Policy 归 Files；Audit/Operations table→inspector |
| Kiranism URL state/server-prefetch/独立边界参考 | 01/04/05/06 | 只借鉴模式；不迁 Clerk/Org/Billing，不强制新增 React Query/nuqs |
| Developer Platform Control Plane 视觉原则 | 01 + 08 | 建立 semantic tokens、density、视觉验收；不复制 MakerKit 视觉 |
| 就近完成：Drawer/Dialog/Full Page 分级 | 01/03/04/05/06 | 组合组件与各资源页统一应用 |
| Global Navigation | 01 | Overview/Platforms/Operations/Audit/Security；System planned |
| Overview | 06 | 只显示真实数据源；无假 chart/metric |
| Platforms global directory | 02 | Search/status/open/create；只显示 API 支持字段 |
| Operations Center | 06 | deletion jobs + file deleting/unknown 真实第一版 |
| Audit & Activity | 01 Audit vertical slice + 06 inspector/activity | 失败≠空；q/cursor URL；精确 target 支持后才做 activity |
| System Health | Future | Observability gate；不参与本期功能验收 |
| Admin Security | 03 | Session/MFA/recent MFA 展示；具体 Auth 行为由上游 Auth 维护 |
| URL-based Platform context | 02 | `[platformId]` 唯一权威，Switcher 只导航 |
| Platform Header/disabled banner | 02 | breadcrumb/name/code/status/id copy/local nav |
| Platform Overview | 02/06 | 先真实资源状态/快捷入口，聚合不足不造假 |
| Accounts | 03 vertical slice + 04 complete | list/inspector/status actions/reason/dialog/danger zone |
| Plans | 04 | 独立 table/create/edit/archive/default UX |
| Subscriptions | 04 | 独立 list/detail/commands/conflict/idempotent intent |
| Redemption Batches | 04 | 独立 list/dedicated create+secret delivery flow |
| Files | 05 | Usage/Policy/Table/Inspector/row pending/accepted/unknown |
| File Policy 归 Files | 05 | 不放大 Settings |
| Platform General | 05 | name/code/status/activation policy，按实际 API editable 能力 |
| Origins | 05 | 独立 Settings 子页 |
| API Keys 生命周期 | 03 vertical slice + 05 final | create→secret→deploy→confirm→revoke |
| AdminShell desktop/sidebar/topbar | 01 | 真实 shell，mobile 最终收口 08 |
| Command Palette | 01 | navigation/actions/current platform/recent routes；无假 global search |
| RemoteData 五态 | 01 contract；全阶段 adoption | loading/success/empty/recoverable/access |
| initial/section/background loading | 01 + adoption phases | background failure 保留 last-known data |
| Empty 四义 | 01 + adoption | true/filter/context；permission 不算 empty |
| Access Error | 01 + Auth-dependent phases | session/MFA/forbidden/domain access 分开 |
| Recoverable Error + request ID | 01/06/07 | Human message + retry + support ID |
| Mutation 八态 | 03 contract；04/05/06/07 adoption | confirm/step-up/pending/accepted/success/failure/unknown |
| `confirm_required` | 03 | 不再 `window.confirm` |
| `step_up_required` | 03 | 消费 Auth/API，不自行算 proof TTL |
| `accepted` | 03/05/06/07 | 202/long job 不写 success |
| `unknown_outcome` | 03/04/05/06/07 | 先查 authoritative state，不立即 duplicate mutation |
| URL Data Table | 01 Audit + 02/04/05/06 | q/filter/sort/cursor deep-link；只展示真实 filter |
| server/client filter 边界 | 01/04/05/06 | 不让同一输入有双重模糊语义 |
| Table Toolbar/Row action/Pagination | 01 + resource phases | action pending row-level；cursor 无假总页数 |
| Mobile table behavior | 08 | condensed/card/sheet/scroll by table type |
| Resource Inspector | 01 base + 02/04/05/06 | safe technical metadata/no secret |
| ID copy | 01 | 复用 CopyToClipboard |
| High-risk UX | 03 | target/consequence/reversibility/async/reason/MFA/result |
| Danger Zone | 03/04/05 | destructive 与普通 edit 分层 |
| One-time Secret | 03 base + 04/05 | dedicated panel；不 URL/toast/status/storage/log |
| Operations Detail Timeline | 06 | 基于真实 deletion checkpoint/file state；无跨域假 timeline |
| Global Search | Future | 依赖 Search API；本期只 Command |
| Visual semantic tokens | 01 | feature 层停止扩张 hard-coded hex |
| Status semantic colors | 01/08 | text/icon + color；unknown 不等于 failed |
| Typography/Admin density/motion | 01/08 | font/monospace ID/40–48 row/reduced motion |
| Shared components | 01 base + 03 additional | AsyncState/Error/Permission/Status/Confirm/Secret/Inspector/Toolbar 等 |
| 不改 upstream shadcn | 全阶段 | 项目组合放 makerkit；interactive 加 data-test |
| Admin-only shell components | 01/02/06 | shell/sidebar/topbar/header/switcher/command/security/operation indicator |
| State Ownership | 01 contract + 全阶段 | URL/API/Auth/local UI 各归其位；不新造全局 store |
| Error Presenter contract | 01 | classifier/presentation，不新造服务器 error taxonomy |
| Toast/Alert/Field/Page error 边界 | 01/03/04/05/07 | secret/confirm/initial load 不用 toast |
| Form 2–4 field/complex/destructive/secret | 03/04/05/07 | Dialog/Drawer/Full Page/Confirm/Dedicated flow |
| Dirty state | 04/05/07 | 只有确有丢失风险才 leave warning |
| Responsive 1280–1600 / 768 / 390 / 375 / 320 | 08 | 实际浏览器矩阵 |
| WCAG 2.2 AA 方向 | 08 + 各阶段基础 | keyboard/focus/table/dialog/live/labels/reduced motion |
| Consumer protected IA | 07 | Account Overview/Subscription/Files/Profile/Preferences/Security |
| Consumer shared state语义与更轻文案 | 07 | technical details 默认折叠 |
| 页面成熟度清单 | 02–07 + Future | 已有后端先迁；不完整能力明确 future |
| 不建议新增 Org/RBAC/Checkout/Chat/CRM/Kanban/SQL/API shell | Master | 明确非目标 |
| feature-based Admin 目录 | 01–06 渐进迁移 | 只按实际复用创建，不为目录形式凑文件 |
| Server/Client boundary | 01–07 | page server 优先，交互 surface client；实施时先读本地 Next docs |
| React Query/Cache 边界 | 01/04/05/07 | 可复用既有，不新增无必要库；authorization/MFA 不能成为缓存权威 |
| Overview metrics rules | 06 | 真实、定义清晰、时间范围/操作价值明确、失败不冒充当前值 |
| Resource Activity | 06 | 可从 Audit 精确 target filter 派生才实现，否则仅规划 |
| 旧页面退出策略 | 02/04/05/06/08 | redirects，移除双 mutation UI、manual ID、AdminNav、window.confirm、旧 CSS 扩张 |
| 架构 Phase A–G | 本计划 Phase 01–08 + Future | 细化并增加 Git/验证门槛 |
| 每页状态测试矩阵 | 各阶段 + 08 | initial/success/true empty/filter empty/error/permission/background refresh |
| 每 mutation 测试矩阵 | 03–08 | pending/double click/business/auth/MFA/network/unknown |
| Admin 高风险测试 | 03–08 | focus/reason/MFA/double click/result/request id/refetch/reload |
| Responsive/A11y 测试 | 08 | Chromium sizes + keyboard/focus/ARIA/table semantics |
| 完成标准 1–16 | 08 final gate | 全项扫描并写入 verification record |

## 覆盖规则

- 本表中的 `Future` 项不允许被执行 agent 偷偷纳入 Phase 01–08 验收。
- 若实际代码已提前实现某项，先验证是否满足架构合同；满足则复用并把阶段工作改成迁移/验证，不复制第二份。
- 若实际 API 不支持架构中“只有 API 支持时才显示”的字段，页面保留信息架构但不得显示假数据。

## FE-R1新增覆盖

| 主题 | Owner | 验收 |
|---|---|---|
| Auth真实类型/布局/终态与乱序隔离 | 01～03/07 | FE-V01～04 |
| 平台文件精确查询 | FE-D01/05 | FE-V05 |
| 同页MFA、intent和批次恢复 | FE-D02/03/04/07 | FE-V06～09 |
| UI分发与独立安装 | FE-D03/01/07 | FE-V10 |
| 旧能力保留与有界运维 | 02～06/08 | FE-V11～12 |
| 中文Admin/Consumer/Registry、排版、技术值保真 | 01～08 | FE-V13～16 |
