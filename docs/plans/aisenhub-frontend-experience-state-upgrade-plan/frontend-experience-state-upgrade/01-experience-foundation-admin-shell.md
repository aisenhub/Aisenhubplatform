# Phase 01 — Experience Foundation、Admin Shell 与 Audit 真实闭环

> FE-R1（2026-09-10）：按当前代码基线 `main@1a8cd5e` 维护；Auth 已实施，本期默认简体中文。Phase 01 代码批次已交付；阶段剩余核验以 [verification-record.md](verification-record.md) 为准。

> 状态：**进行中**（代码批次已交付；Audit 行为级证据仍待完整关闭）  
> 上游：`00-master-plan.md`  
> 本阶段必须先完成，后续阶段不可绕过其 shared UI/state contract。

## 1. 目标

Phase 01 不能只交一个“漂亮 Sidebar”。本阶段要交付第一条真实、可浏览器验证的功能闭环：

1. 证明当前 Admin 能真实消费仓库已有 `@kit/ui` 和现有样式技术栈；
2. 建立 semantic visual tokens、Shared Experience primitives；
3. 建立 AdminShell / Sidebar / Topbar / PageHeader；
4. 建立只含真实导航/快捷动作的 Command Menu；
5. 把 **Audit** 迁移为第一条完整状态闭环：URL query/cursor → loading/success/empty/error/access/background refresh → table → row inspector → request-id/technical details；
6. 旧 Audit 不能继续 Error→`[]`→Empty；
7. 验证 desktop + 390px mobile 基础交互、keyboard/focus 和真实 Admin session 访问。

这使第一阶段本身已经提供真实产品价值并验证整个后续页面迁移所需的技术基础。

## 2. 前置条件与执行前核对

执行 agent 必须：

- 阅读根 `AGENTS.md`、`apps/admin/AGENTS.md`、`packages/ui/AGENTS.md`；
- 阅读 `docs/architecture.md`、`docs/api-sdk.md`、`docs/development/contracts.md`；
- 阅读本计划 `00-master-plan.md`、`architecture-coverage-matrix.md`、`verification-record.md`；
- 写 Next.js 代码前读取本机当前 `node_modules/next/dist/docs/` 对 App Router、layouts/loading/error、Server/Client boundaries、CSS/package transpilation 的相关文档；
- 核对 Auth 计划实际交付状态；Audit 的基本 read UI 不依赖新 SessionManager，可继续通过既有 BFF，但不能另造 refresh manager；
- 记录实际项目路径、branch、HEAD、worktree、Node/pnpm/Next 版本。

## 3. 已核实的相关文件与调用链

### 当前 Admin shell

```text
apps/admin/app/layout.tsx
  → import ./globals.css
  → <body>{children}</body>

/admin/* page
  → 每页自己 <main className="shell ...">
  → 多数页面自己插 <AdminNav />
```

已核实：

- `apps/admin/app/admin/components/admin-nav.tsx` 是平铺 `<a>`；
- `apps/admin/app/globals.css` 是 Arial + hard-coded hex + `.shell/.panel/.data-list`；
- `apps/admin/package.json` 尚未声明 `@kit/ui`；
- `packages/ui` 已导出 Sidebar/Page/Breadcrumb/Dialog/Drawer/Command/Skeleton/EmptyState/DataTable/Copy 等；
- `packages/ui/src/shadcn/*` 不能写项目行为；Aisenhub 组合应在 makerkit 或 app 范围。

### 当前 Audit

```text
/admin/audit
  → client load()
  → GET /api/v1/admin/api/v1/audit?limit=50&q=&cursor=
  → Admin BFF apps/admin/app/api/v1/[...path]/route.ts
  → Account API /admin/api/v1/audit
```

当前页面：

- 有 q、cursor、server no-store；
- 也有当前页本地 `filter`；
- 失败时 `setEntries([])` 再设置错误 status；
- Empty UI 因此可能与 Error 同时出现；
- 没有 detail inspector；
- 请求状态只有 status 字符串。

## 4. 早期硬门槛：`@kit/ui` / CSS Toolchain Probe

这是本阶段最先执行的技术验证，不能跳过。

### 要验证的问题

1. `apps/admin` 当前 workspace 直接依赖 `@kit/ui` 后，Next 16.3（以实际 lock 为准）能否编译其 TSX；
2. `@kit/ui` 使用的语义 Tailwind classes 在 Admin app 是否有真实 CSS pipeline 生成样式；
3. Sidebar/Dialog/Drawer/Skeleton/EmptyState/Command 至少各一个最小组合能否 build 和 browser render；
4. `@kit/ui` 的 runtime dependencies 是否在实际 package metadata 中正确可用；尤其不要因为 `enhanced-data-table` 或 TanStack 被列为 devDependency 就假设 Admin runtime 可安全消费；
5. 当前 webpack build 约束是否需要 Next 的 workspace/transpile 配置；只按本地 Next docs 和实际 build 决定。

### 推荐验证方法

先搜索实际 repo 是否已有可复用 app Tailwind/PostCSS/global style setup；若有，复用而不是复制 upstream。然后做最小真实接入：

- `apps/admin/package.json` 增加现有 workspace `@kit/ui` **仅当当前分支仍缺少**；
- 增加/接入现有 Tailwind/style pipeline 所需的最小配置/stylesheet；具体文件名由当前项目/Next/Tailwind 版本决定，计划不编造 `postcss.config` 等文件一定需要；
- 在一个临时或最终 shell surface 使用 Button/Sidebar/Skeleton/EmptyState/Dialog；
- `pnpm --filter admin typecheck` + `pnpm --filter admin build`；
- 浏览器确认 semantic class 有样式，而不是 unstyled HTML。

### 成功标准

- Admin build/typecheck 成功；
- 无第二 UI framework；
- semantic classes 实际生效；
- 不修改 upstream `src/shadcn/*`；
- 没有为了 UI 导入无必要外部依赖；
- 组件只从 `@kit/ui/<name>` 导入。

### 不成立时

- 做最小现有栈适配：workspace dependency、CSS import/content discovery、Next compilation config、package runtime dependency classification；
- 在 `verification-record.md` 记录真实原因和改动；
- 若必须大幅升级 Tailwind/Next 才能接入，**停止大规模 UI 迁移**，标 Phase 01 阻塞并提出最小兼容方案；不能偷升级整个项目。

下游 Phase 02–08 必须等待该门槛成立并 push。

## 5. Shared Frontend Contract 与文件职责

### 5.1 优先修改/复用

- `packages/ui/package.json`
  - 仅在新增 Aisenhub makerkit export 时修改；不要改变 upstream primitive export 语义。
- `packages/ui/src/makerkit/*`
  - 放跨 Admin/Consumer 真正通用的组合组件。
- `apps/admin/package.json`
  - 增加已有 workspace UI package 等**实际必要**依赖。
- `apps/admin/app/layout.tsx`
  - 全局 provider/style/toast 等最小接入；Auth provider 不在此阶段重造。
- `apps/admin/app/admin/layout.tsx`
  - **建议新增，仅在当前分支没有等价 layout 时**；成为 protected AdminShell 布局。
- `apps/admin/app/globals.css`
  - 从 feature hard-coded UI 迁向语义 token/app base；不要一次删除仍被旧页面使用的 class，按 phase 逐步退出。
- `apps/admin/app/admin/audit/page.tsx`
  - 迁为 route/page + feature surface；具体 Server/Client 切分按本地 Next docs。

### 5.2 建议新增的 shared 组合

先搜索等价实现；有则复用。按实际复用范围选择文件，不要求机械每个组件一个文件。

```text
packages/ui/src/makerkit/
  async-state.tsx            # loading/empty/error/access surface composition
  status-badge.tsx           # semantic status presentation
  support-error-id.tsx       # request-id / technical details
  resource-id.tsx            # safe ID + copy
  data-table-toolbar.tsx     # shared toolbar composition，若跨 Consumer 也值得复用
```

`EmptyState`、Skeleton、Button、Alert、Drawer 本身已有则直接复用，不复制一份。

### 5.3 建议新增 Admin-only

```text
apps/admin/components/shell/
  admin-shell.tsx
  admin-sidebar.tsx
  admin-topbar.tsx
  admin-page-header.tsx

apps/admin/components/navigation/
  admin-command-menu.tsx
  admin-navigation.ts

apps/admin/features/audit/
  audit-table.tsx
  audit-inspector.tsx
  audit-state.ts / presentation.ts   # 只有纯逻辑需要时
```

目录和文件应按实际规模收敛；若一个文件足够，不为架构图凑目录。

## 6. Semantic Visual Tokens

至少建立并消费以下语义，不再扩张 feature hard-coded hex：

```text
background
surface
surface-subtle
border
text
text-muted
primary
success
warning
danger
info
focus
```

状态：

- neutral = inactive/archived；
- success = active/confirmed；
- warning = pending/expiring/attention；
- danger = failed/revoked/destructive；
- info = processing/running；
- unknown = warning + explicit icon/text，不能与 failed 同色同文案。

颜色永远不是唯一信号。

Typography：产品不再以 Arial 为目标；优先采用仓库已有 Web/system font strategy。ID/code 使用 monospace token。Admin 数据页 row density 目标 40–48px，但以可访问性和现有组件实际尺寸为准。

## 7. Admin Shell 行为

### Desktop

```text
Sidebar | Topbar
        | PageHeader
        | Content
```

- Sidebar expanded 约 240–260px；collapsed 为 icon rail，具体值可以基于已有 Sidebar component token；
- 数据页允许宽 content，不再固定 70rem；
- form/detail 有可读宽度；
- active route 清晰；
- global nav 分组：Overview / Platforms / Operations / Audit / Security；System Health 只显示为未来规划时**不要给可点击假页面**，除非 future 阶段明确启用真实 route。

### Command Menu

本阶段真实支持：

- 导航页面；
- 当前 Platform（如果 URL 中已有，Phase 02 后增强）快捷页面；
- 明确安全的 create/open action；
- recent route history 仅保存 route，不存 resource secret/authorization。

**不做 Platform/Account/File 全局资源假搜索。**

### Mobile 基础

本阶段只要求 shell 在 390px 可打开 Sidebar Sheet、页面不溢出、Audit 可操作；完整 320/375/768 收口在 Phase 08。

## 8. Audit 纵向真实功能闭环

### 8.1 URL state

目标：

```text
/admin/audit?q=<query>&cursor=<cursor>
```

如果 API 当前不支持其他 filter，不显示 actor/time/outcome 假 filter。当前页临时即时 filter 如保留，必须明确标为 “filter current page”；推荐优先把现有 q 输入收敛为 server query 的唯一主搜索。

### 8.2 Remote data behavior

- 初次进入：table skeleton；
- success + rows：table；
- success + empty：`True Empty`；
- query 有值 + empty：`Filter Empty` + 清除筛选；
- 401/session：交给 Auth orchestration/AccessState；若上游 manager 尚未交付，至少显示明确登录/session state，不用“暂无数据”；
- 403：PermissionState；
- 429/503/network：Recoverable Error + Retry + request ID；
- background refresh：保留旧 rows；失败只显示 inline warning；
- query change：URL 是 authority，back/forward 能恢复查询。

### 8.3 Inspector

点击 row 打开 Drawer（mobile 为 full-screen Sheet 或已有 responsive Drawer 行为）：

```text
Header: action + outcome/status
Target
Actor（API 有字段才显示）
Created at
Resource/target IDs + copy
Request ID（API 实际返回/row 有字段才显示）
Safe technical metadata
```

Audit 是只读：没有编辑、删除、重放按钮。

### 8.4 Error ≠ Empty 不变量

禁止：

```ts
catch/error => setEntries([]) => EmptyState
```

允许：last known rows 保留，state 另记 error；或没有 last-known 时直接 ErrorState。

## 9. Server / Client boundary

按当前 Next docs 选择最小 client surface。目标方向：

```text
admin/audit/page.tsx          # server-capable route/page context
  → AuditSurface             # client only where URL interaction/drawer/refresh needed
```

不为了一个 Drawer 把整个 Admin tree `use client`。

是否使用 server prefetch/TanStack Query **不是本阶段必选**。如果当前 app 没有正式 query layer，不为“像 Kiranism”新加依赖；使用 Next + fetch +局部 state 也可以，只要满足冻结状态合同。

## 10. Toast / Alert / Error 使用

- Audit first-load failure：Page/Section Error，不 toast；
- background refresh failure：Inline Alert；
- Copy ID success：Toast；
- Command open/close：无不必要 toast；
- 技术 code 折叠；主文案人类可读。

## 11. Accessibility / Interaction 基线

本阶段必须至少：

- Sidebar/Command/Drawer keyboard 可用；
- visible focus；
- Audit 使用 semantic table 优先；
- Drawer close 后 focus 回到触发 row；
- loading/result 使用合适 `aria-live`/`role=status`，错误用 `role=alert`；
- icon-only control 有 accessible name；
- `data-test` 覆盖关键互动；
- prefers-reduced-motion 不被自定义动画破坏。

## 12. 旧路径退出

阶段结束后：

- protected Admin 页面应通过新 `admin/layout.tsx` 获得 shell；
- `AdminNav` 不再作为新页面依赖；旧页面若尚未迁，允许暂时仍渲染旧内容在 shell 中，但不得同时出现第二套平铺 nav；
- Audit 不再使用旧 `.data-table`/status-string 作为唯一状态系统；
- 旧 CSS class 只有仍未迁页面需要时暂时保留，注明 Phase 08 删除候选；
- 不建立 “new-audit” 第二 route 与旧 audit 双写。

## 13. 测试场景

### UI toolchain

- `@kit/ui` minimal import build；
- semantic tokens/styles rendered；
- no server/client import violation；
- no console/build secret warning。

### Audit

1. initial loading；
2. rows success；
3. true empty；
4. q filter empty；
5. query error 不能显示 empty；
6. 503/network recoverable + retry；
7. background refresh failure 保留 rows；
8. permission/session error；
9. next cursor URL + browser back；
10. row inspector open/close/focus restore；
11. long ID copy；
12. 390px shell/table/inspector；
13. keyboard-only Command + Audit row inspector。

## 14. 实际已有命令与计划验证

执行时先核实 `package.json` 未漂移。当前已核实：

```bash
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm format:check
pnpm lint
pnpm typecheck
```

若修改 `packages/ui`：

```bash
pnpm --filter @kit/ui typecheck
pnpm --filter @kit/ui test:unit
```

Browser/Auth regression 可复用当前：

```bash
pnpm test:e2e:t12-r2
```

但现有 t12-r2 是否覆盖新 shell/Audit UI 要以测试内容为准；如不覆盖，优先在现有 Playwright infrastructure 中添加本阶段场景。**不得因为没有 `admin test:unit` script 而编造 `pnpm --filter admin test:unit` 已存在。**

## 15. 可观察验收结果

真实浏览器中必须可观察：

- 登录后的 `/admin/audit` 在新 AdminShell；
- Sidebar active item 正确；
- 直接打开带 `?q=` URL 结果一致；
- loading/error/empty 明确不同；
- retry 不清空 last-known data；
- inspector 显示安全 metadata；
- 390px Sidebar 以 mobile surface 展开；
- 无 fake system health/search result。

## 16. 阶段完成门槛与 Git

只有全部满足才可进入 Phase 02：

- UI toolchain gate 成立；
- Audit 真实闭环完成并实际浏览器验证；
- 必要 typecheck/build/tests 实际运行并记录；
- 关键 a11y keyboard/focus smoke 实际验证；
- `verification-record.md` 更新，失败历史不删除；
- `git diff --check` + diff/status/secret review；
- 创建含义明确 commit，例如：`frontend: phase 01 establish experience foundation and admin shell`；
- push 到任务分支并确认远程包含阶段 code commit；
- 在 record 写真实 SHA/GitHub URL/push 结果；
- push 失败则阶段不能标 `已交付`，停止进入 Phase 02。

禁止 force push、merge main、Release、deploy。

## 17. 交给 Phase 02

必须提供：

- `@kit/ui` App 接入的实际约定；
- semantic token/style entry；
- Shared Async/Error/Status/ResourceId API；
- AdminShell/navigation config；
- URL query helper 约定（如有，不得演变成第二 API client）；
- Audit state 实现作为后续 Data Table reference；
- 未删除的 legacy CSS class 清单；
- Auth 上游当前交付状态和任何阻塞。

## FE-R1 阶段补充：基础合同与中文视觉基线

- 先完成 FE-D03：共享 UI 分发方案、运行时依赖/CSS 入口、仓库外最小中文样例安装验证；不能只验证 Admin workspace build。允许修改必要 sdk-pack、Consumer安装/Registry验证脚本，正式发布不在授权内。
- 明确认证与受保护布局边界，/admin/login 和 /admin/mfa 不进入要求 AAL2 的数据加载布局；参照现有 Auth runtime，保留 scoped cookie、epoch 与终态清理。
- RemoteData采用独立刷新维度；统一请求身份、资源generation、上下文变化与cursor重置规则，不创建第二个API transport。中文 Error Presenter 同时处理HTTP与runtime异常。
- 定稿中文Shell/Audit/空错加载态/390px与确认框样例；建立术语与文案组织约定，复用控件默认英文、aria-label和分页提示也必须适配。
- 必验 FE-V01～04、FE-V10、FE-V13、FE-V15；产品测试保持 NOT_RUN直到实际运行。
