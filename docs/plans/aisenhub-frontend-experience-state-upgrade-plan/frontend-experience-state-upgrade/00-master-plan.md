# Frontend Experience & State Upgrade — 总执行计划

> FE-R1（2026-09-10）：按当前 `main@868e069` 维护；最新 FE-V Local 浏览器回归测试提交为 `main@68d565a`；FE-D02 批次边界仍以 `54ff797` 为产品基线。Auth 已实施，本期默认简体中文。执行须读取 [FE-R1 执行合同](references/fe-r1-execution-contracts.md) 和 [中文 UI 合同](references/chinese-ui-contract.md)。原“产品实施仍未开始”是规划创建时的历史快照，当前事实以 [verification-record.md](verification-record.md) 为准。

> 计划目录建议：`docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/`  
> 目标模块：Frontend Experience & State（Admin 为主，Consumer/Registry 同步采用共享状态语义）  
> 本轮性质：**规划基线与实施交接记录**；Phase 01–08 代码批次、本地验证和 Git 交付均已发生，未包含正式发布或生产部署。  
> 研究代码快照：`aisenhub/Aisenhubplatform main@362db831d49308d0e5ca84965af80d86e944f56c`。  
> 最新研究时远端 `main`：`0d42b4cd44a2c17777c33f616bd393c22ee78f16`，该提交仅补充“MakerKit 不作为视觉模板”的文档决定；**不得把任一研究 SHA 当执行起始 SHA**。执行时必须重新核对本地仓库、分支、HEAD 与工作区。

## 0. 当前执行状态（2026-09-10）

- Phase 01–08 的代码批次均已推送；Phase 08 本地响应式、语义化控件、legacy cleanup 和回归已完成。
- 任务分支与 `main` 已 fast-forward 合并，当前产品实现基线为 `868e069c1e9631cad09021598bc6070db23a694e`，FE-D02 代码基线为 `54ff79727dd0b7ea734822d23db2c9b58d6fe4ea`，代码与文档维护提交均已推送；无正式 Release、Staging/生产部署或生产观察。
- 本期前端代码交付与 FE-D02 Local 核验已完成，但 FE-R1 总状态仍保持开放：下面的 FE-V 故障矩阵、托管环境和上位 M4–M6 发布门槛不能由 Local PASS 推定完成。

### 剩余任务审查

| 优先级 | 任务 | 当前状态 | 下一步 / 关闭条件 |
|---|---|---|---|
| P1 | FE-D02：兑换批次重复创建与明文/receipt 恢复语义 | PASS（Local） | `54ff797` 已完成受控 API/SQL 探针：同 operation 只返回批次元数据，异参数冲突；HTTP/领域合同与 Phase 03/04 已同步。Hosted 未运行。 |
| P1 | FE-V 状态/失败矩阵补齐 | PARTIAL | FE-V08 已补 Local API/SQL 边界与浏览器 `replayed_existing` UI 分支，Consumer 敏感 mutation 已补网络 unknown/显式状态检查，Admin 已补 429/503/409 主文案与技术详情隔离矩阵，Files 已补延迟列表、状态/预算边界和删除 unknown 恢复，Settings 已补 Origins 校验/创建刷新与 Platform Key 一次性 secret→部署确认→撤销生命周期；继续补迟到响应、409/412/429/503/202 全矩阵、正向高风险 mutation、Files/Settings 全状态故障恢复证据；已有 T12/T16 Local PASS 不替代完整故障注入。 |
| P1 | Hosted / Staging 上游验收 | BLOCKED / NOT_RUN | 依赖 X02/X03/X05 及受控权限，补 OAuth/SMTP/SSR、独立 executor/TLS/pooler/CA、Storage 迟到写入和双平台 hosted E2E；对应 T17-R1～R3、T18-S、G4-S、G5-L hosted。 |
| P1 | M4–M6 发布与运维门槛 | WAITING / PARTIAL | M4-11、M6-02 外部备份、M6-03/04 恢复/轮换/容量告警、M5-06 正式 Registry 发布；需 X04/X06、受控恢复目标和明确发布授权。 |
| P2 | Future diagnostics / Search / Alerts | NOT_STARTED（有意保留） | 等真实 Observability、Search、Alert lifecycle 和权限/脱敏合同；本期不实现假指标、假搜索或假通知。 |
| P3 | 全仓格式债务 | BASELINE FAIL | `pnpm format:check` 的 61 个历史未触及文件另行治理；本期目标文件格式检查已通过，不在本任务范围内全局重排。 |

上述清单是当前执行入口；历史阶段报告中的 NOT_RUN/FAIL 保留为历史证据，不因本次文档更新改写为 PASS。

## 1. 执行输入

本地审查已确认项目路径为 `E:\\Projects\\Aisenhubplatform`；执行agent仍须复核实际HEAD、目录与环境并记录：

| 输入 | 本计划中的处理 |
|---|---|
| 项目路径 `[项目绝对路径]` | **待执行时验证**；不能从 GitHub URL推断本地路径 |
| 目标模块 `[模块名称]` | 本计划按 `Frontend Experience & State` 处理 |
| 架构文档 | 本目录 `references/Aisenhub_Frontend_Experience_State_Architecture.md`、`references/Aisenhub_Platform_Optimization_Architecture.md`，以及仓库 `docs/architecture.md` / `docs/api-sdk.md` / `docs/development/contracts.md` |
| 补充讨论结论 | MakerKit 仅作为工程结构和组件组织参考；视觉独立设计，以流畅、清楚、反馈及时、页面质感验收 |
| 本次范围 | 本计划 Phase 01–08；见第 4 节 |
| 暂不实施 | `future/01-diagnostics-search-alerts.md` 与第 5 节非目标 |
| 计划保存目录 | 推荐 `docs/plans/aisenhub-frontend-experience-state-upgrade-plan/frontend-experience-state-upgrade/` |

## 2. 用户问题与目标行为

当前 Admin 已经能调用真实平台、账户、权益、订阅、文件、删除任务和审计 API，但页面仍更像“工程操作面板”：平铺导航、mega-page、手输 Platform ID、单一 `status` 文本、`window.confirm`、page-level busy、一次性 secret 混入状态文本，以及加载/错误/空态不完全分离。

本次优化的目标不是给现有页面换皮，而是把前端升级为稳定的 Control Plane：

```text
Aisenhub Admin
│
├─ Global Control Plane
│  ├─ Overview
│  ├─ Platforms
│  ├─ Operations
│  ├─ Audit & Activity
│  ├─ System Health        [后续规划，依赖 Observability]
│  └─ Admin Security
│
└─ Platform Workspace
   ├─ Overview
   ├─ Accounts
   ├─ Entitlements
   │  ├─ Plans
   │  ├─ Subscriptions
   │  └─ Redemption Batches
   ├─ Files / File Policy
   └─ Settings
      ├─ General
      ├─ Origins
      └─ API Keys
```

最终用户体验必须满足：

- Global scope 和 Platform scope 一眼可辨；
- Platform context 由 URL 权威表达，刷新、返回、深链、复制链接都成立；
- 每个数据区域明确 Loading / Success / Empty / Recoverable Error / Access Error；
- Error 绝不通过 `[]` 被伪装成 Empty；
- background refresh 失败时保留 last-known data；
- mutation pending 只锁冲突的 action/row；
- destructive action 有正式确认流程，不使用 `window.confirm`；
- recent MFA 是正式状态，不是模糊失败文案；
- 202/长任务进入 accepted/running，不写“成功完成”；
- unknown outcome 先查询 authoritative state，再决定 retry；
- Platform Key、Redemption Codes 有一次性 secret 专用 UI；
- 表格筛选和 cursor 可 deep-link；
- Admin/Consumer 复用一致的基础状态语义，但文案和密度符合各自用户；
- 320/375/390/768 与桌面尺寸具备可用交互；
- 没有后端数据源的 System Health、Global Search、Alerts 等不做假 UI。

## 3. 已冻结的架构决定

以下是跨阶段唯一合同，执行 agent 不得各自重设计。

### 3.1 State Ownership

| 状态 | 唯一权威来源 | 允许的本地状态 |
|---|---|---|
| Platform/resource context | URL route/search params | switcher 输入只用于导航，不是业务状态 |
| q/filter/sort/cursor/deep-link tab | URL | 输入 draft 可暂存，提交/debounce 后写 URL |
| Server data | Account/Admin API | session 内缓存/last-known data 仅用于体验 |
| Session | Authentication & Session shared runtime | 页面只能订阅，不再造 `isLoggedIn` |
| Mutation intent / idempotency | API Client/Business Workflow | UI 可保留当前非敏感 intent context |
| Drawer/Dialog/draft/selection | 组件本地 state | 不为此新建全局 store |
| Sidebar collapsed | 非敏感 preference | cookie/local preference 可用，不承载权限 |

### 3.2 Remote Data 五态

页面行为必须等价于：

```ts
type RemoteDataState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T; refreshing?: boolean; refreshError?: PresentedError }
  | { status: 'empty'; refreshing?: boolean; refreshError?: PresentedError }
  | { status: 'recoverable_error'; error: PresentedError }
  | { status: 'access_error'; error: AccessError };
```

补充约束：

- initial loading：Skeleton/Page loading；
- section loading：只影响 section；
- background refresh：保留数据 + subtle indicator；失败则数据仍保留 + Inline Alert + Retry；
- Empty 语义至少区分 True Empty、Filter Empty、Context Missing；No Permission 不是 Empty。

### 3.3 Mutation 状态

```ts
type MutationState =
  | 'idle'
  | 'confirm_required'
  | 'step_up_required'
  | 'pending'
  | 'accepted'
  | 'success'
  | 'failure'
  | 'unknown_outcome';
```

- 默认不 optimistic-confirm 安全关键事实；以 server result/refetch 为准。
- pending 只禁用冲突范围。
- `accepted` 表示请求被接受但 authoritative outcome 尚未完成。
- `unknown_outcome` 不等于 failure；必须先 query/refetch authoritative state。
- recent MFA / replay 服从 `references/auth-session-upstream-contract.md`。

### 3.4 Error Presentation

唯一展示模型：

```ts
type PresentedError = {
  title: string;
  description?: string;
  severity: 'info' | 'warning' | 'error';
  recoverability: 'retryable' | 'action_required' | 'not_retryable';
  action?: 'retry' | 'login' | 'mfa' | 'refresh' | 'contact_support';
  requestId?: string;
  technicalCode?: string;
};
```

映射原则：401/expired → session recovery；recent MFA → step-up；403 → Permission；404 → not found；409 → conflict；412 → stale-version reload；429 → rate limit；5xx/dependency unavailable → recoverable; unknown mutation → unknown outcome。

普通主文案不直接输出 `AUTHORIZATION_UNAVAILABLE` 一类内部 code；技术 code/request ID 可在折叠区或 Admin inspector 显示。

### 3.5 URL / Table Contract

目标 search params：

```text
?q=
&status=
&kind=
&sort=
&cursor=
```

只显示 API 真实支持的 filter。服务端过滤负责数据集语义；已加载当前页的 client filter 只有在 UI 明确说明时才允许。Cursor API 不强行生成总页数。

### 3.6 Platform URL Contract

目标路径：

```text
/admin/platforms
/admin/platforms/[platformId]
/admin/platforms/[platformId]/accounts
/admin/platforms/[platformId]/plans
/admin/platforms/[platformId]/subscriptions
/admin/platforms/[platformId]/redemption-batches
/admin/platforms/[platformId]/files
/admin/platforms/[platformId]/settings
/admin/platforms/[platformId]/settings/origins
/admin/platforms/[platformId]/settings/keys
```

`platformId` 的唯一权威是 route segment。PlatformSwitcher 只是导航器，不是 authorization state。

### 3.7 High-risk Interaction Contract

```text
Action intent
 → ConfirmActionDialog(target + consequence + reversibility + async + reason)
 → API/Auth indicates recent MFA if needed
 → Step-up
 → mutation according to replay contract
 → pending / accepted / success / failure / unknown
 → authoritative refetch
 → request ID / Audit link where available
```

不允许 `window.confirm`，不允许 Dialog 自己绕过 recent MFA，不允许因前端隐藏按钮替代服务端授权。

### 3.8 One-time Secret Contract

```text
not_generated → generating → presented_once → acknowledged
```

Secret：

- 只在专用 Panel/Dialog 展示；
- 不进 URL、toast、普通 status、localStorage、analytics payload、console/log；
- 支持 copy 与明确安全保存提示；
- refresh/离开后不能假装恢复；
- Redemption acknowledged 后清掉 plaintext 和 receipt；
- Platform Key 保持“创建 → 一次显示 → 部署 → 确认部署 → 撤旧”的真实生命周期。

### 3.9 Visual / Design System Contract

保持 Next.js / TypeScript / Tailwind / Base UI + shadcn / `@kit/ui`，但**不把 MakerKit 视觉模板当设计目标**。Feature 层使用语义 token，不继续扩张 hard-coded hex UI。状态颜色必须同时有文字/图标，满足 reduced motion。

`packages/ui/src/shadcn/*` 视为 upstream-owned，不放项目行为；跨 App 的 Aisenhub 组合组件放 `packages/ui/src/makerkit/*` 并通过 `@kit/ui/<name>` export；Admin-only 组合留 `apps/admin`。

### 3.10 Planned-only Contract

以下能力没有真实后端数据源前不得假实现：

- System Health/metrics；
- Global Resource Search；
- Alerts/Notification Center；
- Request Inspector 完整诊断；
- unified operation feed / cross-domain retry / worker metrics / incident correlation。

本期只在 `future/` 固定页面/接口依赖和开启条件。

## 4. 本次范围（Phase 01–08 必须完成）

1. Shared Experience Foundation 与 `@kit/ui` 真实接入验证。
2. AdminShell、Sidebar、Topbar、PageHeader、导航 Command（只做真实导航/快捷动作）。
3. 将 Audit 作为第一条真实闭环迁移到统一状态模型。
4. Global/Platform 双层信息架构与 URL-based Platform Workspace。
5. Accounts / Plans / Subscriptions / Redemption Batches / Files / Platform Settings 拆页和迁移。
6. 高风险确认、recent MFA 呈现、一次性 secret、accepted/unknown outcome 的正式 UX。
7. Operations Center：用现有 deletion jobs + file deleting/unknown 形成真实第一版。
8. Overview：只展示 API 能真实提供且语义明确的数据/attention/快捷入口。
9. Audit Detail Inspector、request-id UX；Resource Activity 只在 endpoint 能精确过滤时实现。
10. Consumer protected shell、统一 state/error/pending/retry、Profile/Preferences 412 conflict、Subscription redeem intent、Files 状态。
11. Registry 同步 Consumer 真实模板入口，保持业务规则不复制。
12. Responsive 320/375/390/768 + desktop、keyboard/focus/ARIA/semantic table/reduced motion。
13. 旧页面/旧状态/旧 CSS/`window.confirm`/manual Platform ID 主路径退出与最终回归。

完整架构覆盖映射见 [architecture-coverage-matrix.md](./architecture-coverage-matrix.md)。

## 5. 明确非目标

本期不实施：

- Organization / Team / Workspace 产品模型；
- 通用 RBAC 编辑器；
- 支付 Checkout / Invoice；
- Chat / CRM / Kanban / 用户消息中心；
- SQL Console / API Shell / arbitrary DB CRUD browser；
- Category 04 的全项目 API Client 重构；若执行时该 shared client 已存在则消费，否则不借本期造第二套；
- Category 05 Observability 后端、指标采集和完整 tracing；
- 新数据库业务规则或领域状态机；
- 为视觉效果增加假 chart、假 alert、假 health 状态；
- 为“现代化”引入 React Admin、Refine、第二套 UI/Form/Query 框架；
- 大规模性能优化；只做避免体验退化所需的局部边界，性能专题另行实施。

`System Health / Global Resource Search / Alerts / Request Inspector` 的未来计划见 [future/01-diagnostics-search-alerts.md](./future/01-diagnostics-search-alerts.md)。

## 6. 当前代码证据与已存在能力

### 6.1 Admin 当前事实

已核实路由：`/admin`、login、mfa、platforms、entitlements、subscriptions、files、deletion-jobs、audit。

关键缺口：

- `AdminNav` 是平铺链接；
- `admin/page.tsx` 是内部 M2/M3/M4 panel 跳转；
- `platforms/page.tsx` 将 Platform/Origin/Accounts/Keys 挤在一个 client page；
- `entitlements/page.tsx` 手输 Platform UUID，Plans + Batch 同页；
- `subscriptions/page.tsx` 手输 Platform/Account ID，使用 page-level `busy` 和 `window.confirm`；
- `files/page.tsx` 已尊重 deleting/unknown 的安全语义，但 policy/list 共用状态且没有 row pending/inspector；
- `deletion-jobs` 已具有 state/checkpoint/retry 的真实 operation 数据，可作为 Operations 第一版；
- `audit` 已有 q/cursor，但 failure 时会 `setEntries([])`，存在 Error→Empty 表达风险；
- 登录/MFA 页面仍有 status-string 与因素空态/错误混合问题；相关 Auth server/session 修正属于上游 Auth 计划，本期只消费。

### 6.2 Consumer 当前事实

`template-preview` 已有 login/signup/forgot/update-password/pricing/account/subscription/files。Account 的 Profile/Preferences 已使用 row_version/If-Match；Files 已展示真实预算与 unknown/deleting；Subscription Redeem 已用 Idempotency-Key，但每次 submit 新建 key，执行时必须与 Business/API 上游冻结的“一个逻辑操作一个 key”语义核对后迁移。

### 6.3 BFF/API 安全边界

Admin BFF 已校验 Origin/CSRF、透传 Admin session/recent proof、保持 no-store、输出 request-id，并对 binary download 做受控代理。前端改造不得绕过它。

API 合同已经定义 Admin resources、错误 envelope、cursor、no-store、202 文件删除、If-Match 412、上传断线先查询状态、兑换码生成不可无脑重试等语义。前端只做 presentation/orchestration。

### 6.4 `@kit/ui` 已有能力

已有 Sidebar、Page、Breadcrumb、Card、Table/DataTable、EmptyState、ErrorBoundary、Alert/Badge、Skeleton/Spinner/LoadingOverlay、Dialog/AlertDialog、Drawer/Sheet、Command、Toast、Copy、Tabs、Input OTP、Chart、ModeToggle、Stepper、FileUploader 等。

**重要工程缺口：当前 `apps/admin/package.json` 和 `apps/template-preview/package.json` 未声明 `@kit/ui`；两 App 仍靠独立 `globals.css`。仓库快照中未发现这些 App 已完成 Tailwind/PostCSS 产品样式接入。Phase 01 必须先验证 UI package + style pipeline 的真实构建接入，不能假设可直接 import。**

### 6.5 测试与命令事实

已存在：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm contracts:check
pnpm test:e2e:t12-r2
pnpm test:e2e:t16-r2
pnpm test:api:t12-ordinary-proof
pnpm test:api:t16-m2-management
pnpm test:registry:m5-04
pnpm test:consumer:m5-05
```

Admin app 当前只核实 `build/dev/start/typecheck`，**没有已核实 unit test script**。Template app 有 `test:unit`。根 `pnpm test:api` 是明确 not-enabled placeholder，不得计作验证。

现有 E2E 是 `tests/spikes/e2e/t12-r2-admin.mjs` 和 `t16-r2-account.mjs`；本计划要求优先扩展/复用现有 Playwright browser infrastructure，不为 UI 优化单独引入第二套 E2E 框架。若执行时已有新的正式 E2E 结构，以实际代码为准并记录偏差。

## 7. 文档/代码差异与旧计划替代关系

1. `docs/development/status.md` 含历史任务 PASS 与旧 main/branch 摘要。这些是历史证据，不等于本次 Frontend 优化已验证；每阶段必须重新运行与风险相匹配的验证。
2. `docs/development/evidence/M5-03.md` 说明旧版 Admin 工程 UI 已完成 Local 基础资源操作。这是当前改造的**功能保留基线**，不是新 UX 验收凭据。
3. 最新文档决定已经明确 MakerKit 不是视觉模板；本计划替代任何“沿用 MakerKit 视觉即可”的旧解释，但不替代现有工程组件边界。
4. Authentication & Session 计划与本计划是上游依赖关系：本计划不得重复实现 SessionManager/replay/MFA proof；实际交付状态由执行环境的 Auth `verification-record.md` 决定。
5. 旧 `/admin/entitlements`、`/admin/subscriptions`、`/admin/files`、`/admin/deletion-jobs` 在对应新路由完成后必须退出为 redirect/兼容导航，不继续维护第二套 mutation UI。

## 8. 阶段与依赖

```text
Phase 01  Experience Foundation + Admin Shell + Audit vertical slice
   ↓
Phase 02  Platform Context + Workspace
   ↓
Phase 03  High-risk Interaction Contract + Accounts/Keys vertical slices
   ↓
   ├───────────────┬────────────────┐
   ↓               ↓                ↓
Phase 04        Phase 05          Phase 07
Accounts &      Files &           Consumer &
Entitlements    Settings          Registry
   └───────┬───────┘                │
           ↓                        │
Phase 06  Operations + Audit + Overview
           └──────────┬─────────────┘
                      ↓
Phase 08  Responsive + Accessibility + Integration + Legacy Cleanup
                      ↓
                    STOP

Future only: Diagnostics / Global Search / Alerts / full Request Inspector
```

### 必须串行

- Phase 01 → 02 → 03：先冻结 shared UI/state、再冻结 Platform URL、再冻结 high-risk interaction。
- Phase 06 等待 04+05；否则 Operations/Overview 会基于旧资源页面重复实现。
- Phase 08 等待 04+05+06+07。

### 可并行

Phase 03 已推送后：

- Phase 04：Accounts / Plans / Subscriptions / Redemption；
- Phase 05：Files / File Policy / Origins / Platform Settings；
- Phase 07：Consumer / Registry。

三者共享 `packages/ui`/state contract 时，不允许各自直接发散修改；shared bug 交给 Integrator 单独修复并先推送。

## 9. 阶段交付物

| Phase | 文档 | 主要交付 |
|---|---|---|
| 01 | [01-experience-foundation-admin-shell.md](./01-experience-foundation-admin-shell.md) | UI toolchain gate、shared states、Admin shell、Command、Audit 真实闭环 |
| 02 | [02-platform-context-workspace.md](./02-platform-context-workspace.md) | Global/Platform scope、URL context、Platform directory/workspace/overview |
| 03 | [03-high-risk-state-interactions.md](./03-high-risk-state-interactions.md) | Confirm/MFA/pending/accepted/unknown/secret，Accounts+Keys 纵切 |
| 04 | [04-accounts-entitlements-resource-pages.md](./04-accounts-entitlements-resource-pages.md) | Accounts、Plans、Subscriptions、Redemption 独立资源页 |
| 05 | [05-files-platform-settings.md](./05-files-platform-settings.md) | Files/Policy/Origins/General/Keys 最终归属与状态 |
| 06 | [06-operations-audit-overview.md](./06-operations-audit-overview.md) | Operations、Audit inspector、真实 Overview、request-id UX |
| 07 | [07-consumer-registry-adoption.md](./07-consumer-registry-adoption.md) | Consumer shell/state/error/forms/files/subscription + Registry |
| 08 | [08-responsive-accessibility-integration-cleanup.md](./08-responsive-accessibility-integration-cleanup.md) | 响应式、A11y、全量回归、旧路径退出 |
| Future | [future/01-diagnostics-search-alerts.md](./future/01-diagnostics-search-alerts.md) | 第二期依赖与页面规划，不参与本期验收 |

## 10. 全局实施约束

1. 写 Next.js 代码前必须读取当前本地 `node_modules/next/dist/docs/` 相关文档。
2. 执行时先确认当前锁文件/Next/React/Tailwind/Base UI 版本；不凭研究快照猜 API。
3. 对“建议新增”的文件先搜索当前分支是否已有等价实现；已有则复用。
4. 不修改 `packages/ui/src/shadcn/*` 注入项目行为。
5. 不为 ephemeral UI state 新建 Zustand/Redux 等 store；若现有项目已有 store，也不能把 server authority 转移过去。
6. 不为了 Kiranism 风格额外引入 React Query/nuqs/kbar；仅在当前依赖已存在且确有价值时消费已有能力。Command 优先复用 `@kit/ui/command`。
7. 不绕过 BFF、Origin、CSRF、MFA、recent proof、RLS、If-Match、idempotency、no-store。
8. 视觉 refactor 不能删除真实 warning/blocking/recovery 行为。
9. 不把错误重置成空数组来“清界面”。
10. 不在日志、DOM debug、URL、localStorage 持久化 secret/OTP/proof/token。
11. 页面中的业务状态标签可以翻译成人类文案，但 detail 必须保留安全的稳定 raw status 以便诊断。
12. 所有新 interactive element 按 UI package 规则加 `data-test`。

## 11. 主要风险与处理

### R1 — `@kit/ui` 尚未在 App 中真实接入

**风险**：直接大规模 import 后构建失败或样式不生效。  
**处理**：Phase 01 先做最小 integration probe；确认 workspace dependency、CSS/Tailwind pipeline、Next compilation、runtime dependency。成功后才迁更多页面；失败则做最小现有栈适配并记录，不换框架。

### R2 — Auth 已实施后的回归风险

**风险**：Frontend agent 为解决 session error 自造第二套 refresh/MFA。  
**处理**：Auth已实施，直接复用现有runtime、stepUp、epoch与scoped Cookie；每阶段复核上游证据和本期受影响回归，不重新创建SessionManager。

### R3 — Category 04 shared API client 当前成熟度未知

**风险**：页面重复 fetch/CSRF/error classifier。  
**处理**：本计划允许建立**presentation-only** helper，但不造全项目第二 API client。若 shared API client 已交付，立刻消费；否则保留 app/BFF 调用，重复 transport 的最终收敛由 Category 04 承担。

### R4 — URL cursor 的 back/previous 能力取决于 API

**风险**：UI 假装能随机跳页。  
**处理**：只呈现 API 真实支持的 Next/previous 语义；不计算不存在的 total/page count。Cursor 历史可由 URL/browser history 提供，但不能改变 API 事实。

### R5 — Operations 聚合没有统一 backend feed

**风险**：前端合并不同来源后把派生结果当新业务事实。  
**处理**：第一版明确 source type，只读取 deletion jobs + files deleting/unknown，详情链接回 authoritative resource；不实现跨域统一 retry command。

### R6 — Overview 数据源不足

**风险**：为了“Dashboard 感”做假数字或前端拉全量计算。  
**处理**：只显示已有 bounded list/API 能合理得到的数据；需要全局聚合但 API 不支持时显示快捷入口/attention list，不显示假 metric。

### R7 — 一次性 Secret 导航丢失

**风险**：新 route/drawer 造成 plaintext 丢失或错误缓存。  
**处理**：Dedicated flow 在生成响应当前页面内完成；离开前显式警告/ack；不尝试重新获取明文，不持久化到 URL/localStorage。

### R8 — UI 改造破坏已有安全业务语义

**风险**：202 显示成功、unknown 显失败、deleting 显容量释放、subscription conflict 被 optimistic overwrite。  
**处理**：每阶段验收矩阵包含这些负向状态，并在 Phase 08 做全局 legacy/semantic scan。

## 12. 完成标准

本期只有同时满足以下条件才算完成：

- Phase 01–08 代码实施完成；
- 关键用户链路和失败/恢复路径实际验证；
- Admin Global/Platform 信息架构稳定；
- Platform URL context 已替代各页面手输/本地 selectedId 主路径；
- 旧 `AdminNav`/mega-page/`window.confirm`/global status/busy 主路径退出；
- 高风险、secret、accepted、unknown、If-Match conflict 等语义正确；
- Consumer/Registry 采用同一状态语义；
- 规定 responsive/a11y 浏览器验证完成或明确阻塞，不得虚构；
- 未后端支持的 future capabilities 没有假实现；
- 每个阶段相关 commit 均成功 push 到远程任务分支；
- `verification-record.md` 与实际 Git/代码/测试一致。

## 13. GitHub 阶段规则

原稿只规定后续执行规则；FE-R1为文档修订，可按仓库授权commit/push文档任务分支，不执行任何产品Phase、merge或deploy。

每阶段开始：

```bash
pwd
git remote -v
git branch --show-current
git status --short
git rev-parse HEAD
git log -1 --oneline
node --version
pnpm --version
```

有 upstream 时再记录：`git rev-parse @{u}`。

每阶段结束：

1. 实际运行阶段必要验证；
2. `git diff --check`；
3. 审查 diff/status，排除 secret、`.env`、用户媒体、缓存、无关修改；
4. 更新 `verification-record.md`；
5. 创建含义明确的阶段 commit（允许多个）；
6. push 到同一任务分支；
7. 通过 Git/GitHub 实际确认远程包含对应 SHA；
8. 记录 branch、SHA、GitHub URL、push 状态；
9. 只有“实施完成 + 必要验收通过 + push 成功”才能写 `已交付`。

允许正常 commit/push，无需每阶段重复询问；本轮用户明确要求最终核对后合并 main；仍禁止 force push、重写已发布历史、Release、部署。

## 14. 执行记录入口

- 稳定执行指令：[agent-handoff.md](./agent-handoff.md)
- 实际进度与证据模板：[verification-record.md](./verification-record.md)
- 架构覆盖自检：[architecture-coverage-matrix.md](./architecture-coverage-matrix.md)

执行 agent 必须先读 `verification-record.md` 再核对 Git；记录与代码不一致时先查明和修正记录，不能盲目续做。

## 15. FE-R1 执行入口与新增门槛

- 当前产品实现基线 `main@868e069`；FE-D02 批次边界基线为 `main@54ff797`；最新 FE-V Local 浏览器回归测试提交为 `main@68d565a`；原审查基线 `main@b563a98` 仅保留供追溯。后续实施/验证仍须重新记录 HEAD，冲突以本节及修订合同为准。
- 先读取 [执行合同与能力矩阵](references/fe-r1-execution-contracts.md) 和 [中文优先UI合同](references/chinese-ui-contract.md)。架构正文唯一维护于上一级同名架构文件，references内同名文件只是入口。
- FE-D03在Phase01完成独立UI安装最小验证；FE-D02已在Phase03/04完成 Local 核验与消费；FE-D01在Phase05平台Files前通过。三项均有明确目录/合同/测试边界，属于必要依赖，不授权其他后端扩张。
- 所有页面中文优先，必要英文技术标识保留；公开Auth/Pricing及Registry也在范围内。FE-V01～16均为新的运行验收；当前已有 Phase 08、T12-R2、T16-R2 及相关 Local 集成证据，Admin 429/503/409 错误文案、Files 状态/删除 unknown、Settings Origins/Platform Key 生命周期边界已补，但完整状态/故障恢复矩阵仍为 PARTIAL，Hosted/Staging/生产项保持 NOT_RUN 或 BLOCKED，详见 [verification-record.md](verification-record.md)。
- 默认按已派发任务串行执行。04/05/07的并行图只表达依赖可并行，不代表自动授权多Agent开发。
- 路由/布局、请求隔离、mutation恢复、视觉样例和安装产物在基础阶段冻结，后续不得各自重新决定。
