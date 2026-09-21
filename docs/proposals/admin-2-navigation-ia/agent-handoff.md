# Admin 2.0 收尾记录

> 用途：记录 Admin 2.0 修改的最终审查、验证、commit 与 push 结果。  
> 本文是本任务当前唯一可信的收尾入口；设计与验证细节分别见 [design.md](design.md)、[plan.md](plan.md) 和 [verification-record.md](verification-record.md)。

## 1. 当前状态

- 项目：Aisenhubplatform
- 任务：Admin 2.0 Navigation IA
- 风险分级：用户已明确指定本任务前端改动统一按 **R1**
- 工作分支：`codex/admin-2-navigation-ia`
- 当前 HEAD：`600af066c0f62db358a38c832305c4dd4e6c9db8`
- 远程：`https://github.com/aisenhub/Aisenhubplatform.git`
- upstream：`origin/codex/admin-2-navigation-ia`
- 工作区：仅保留 4 个并发规则文档改动；Admin 2.0 白名单已审查、commit、push
- 最终 commit：`600af066c0f62db358a38c832305c4dd4e6c9db8`
- 后端/API/Auth/SQL/支付/权限协议：本任务未有意修改
- 浏览器人工验收：`NOT_RUN`，当前执行环境没有浏览器工具

开始收尾前先重新执行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
```

如果分支或 HEAD 已被其他工作改变，不要直接套用本文的提交步骤；先重新审查差异。

## 2. 本次已经完成的产品改动

### Navigation / Shell

- Global Sidebar 已重组为：
  - 工作台：概览
  - 业务管理：平台、Billing
  - 系统管理：Operations、Audit
  - 管理员：安全与账户
- Platform Workspace 使用独立 Platform Sidebar：
  - 平台：概览、账户
  - 商业化：套餐、订阅、兑换码
  - 资源：文件
  - 配置：基本设置、Origins、Platform Keys
  - 底部保留 Billing / Operations / Audit 全局入口
- Platform Sidebar 顶部显示“所有平台”、当前平台名称/状态/code 和 Platform Switcher。
- 平台上下文仍只由 URL `platformId` 决定；Shell context 只接收 `PlatformWorkspace` 已读取的平台对象用于展示。
- 原 `PlatformNavigation` 横向一级导航已删除，避免双轨导航。
- Topbar 现在显示 `Aisenhub / 平台 / 资源` 上下文。
- Command Palette 已支持当前平台资源跳转，不再只是 Global Sidebar 镜像。
- `/admin/mfa` 不再作为 Sidebar 一级页面；仍从 Security 和 recent-MFA flow 进入。

### Workspace / Accounts

- PlatformHeader 已简化，只保留必要 actions 和 disabled-platform warning。
- Admin 页面宽度从内容站式 max-width 调整为桌面管理工作区。
- AdminPageHeader、表格和 panel 密度已收敛。
- Accounts 作为 Admin 2.0 样板：
  - 紧凑 Resource Toolbar
  - 主/次信息合并
  - 状态、创建时间、更新时间和操作列
  - 后台刷新继续保留旧数据
  - loading / empty / error / refresh-error / unknown-outcome 原有语义保留
- Account Inspector selection 写入 URL：
  - `?selected=<platform_account_id>`
  - refresh / deep-link 可重新加载详情
  - 关闭时删除 `selected`
  - 逻辑上请求把焦点恢复到来源按钮

### Inspector

- 共享 `ResourceInspector` 从居中 Dialog 改为右侧 Sheet。
- 桌面宽度约 28rem，窄屏全宽。
- 现有 Accounts / Files / Operations / Platform Keys 使用者会共同得到新的右侧 Inspector 行为。
- 未改变各页面的 API、权限和 mutation 协议。

### Naming / Documentation

页面命名已与新 IA 对齐，包括：

- 管理员总览 → 概览
- 中央 Billing → Billing
- 审计记录 → Audit
- 安全设置 → 安全与账户
- 平台概览 → 概览
- 平台计划 → 套餐
- 订阅投影 → 订阅
- 兑换批次 → 兑换码
- 配置文件 → 文件
- 平台设置 → 基本设置

`docs/architecture/modules/frontends.md` 已同步当前真实实现。

## 3. 本任务必须提交的文件

以下是截至本交接时确认属于 Admin 2.0 的文件。**不要使用 `git add -A` 或 `git add .`。**

### Admin 应用

```text
apps/admin/app/admin/audit/page.tsx
apps/admin/app/admin/platforms/[platformId]/page.tsx
apps/admin/app/admin/security/page.tsx
apps/admin/app/globals.css
apps/admin/components/navigation/admin-command-menu.tsx
apps/admin/components/navigation/admin-navigation.ts
apps/admin/components/navigation/admin-navigation.test.ts
apps/admin/components/platform-context/platform-header.tsx
apps/admin/components/platform-context/platform-navigation.tsx   # 删除
apps/admin/components/platform-context/platform-switcher.tsx
apps/admin/components/platform-context/platform-workspace.tsx
apps/admin/components/shell/admin-page-header.tsx
apps/admin/components/shell/admin-shell-context.tsx
apps/admin/components/shell/admin-shell.tsx
apps/admin/components/shell/admin-sidebar.tsx
apps/admin/components/shell/admin-topbar.tsx
apps/admin/features/accounts/platform-accounts-page.tsx
apps/admin/features/billing/central-billing-page.tsx
apps/admin/features/files/platform-files-page.tsx
apps/admin/features/overview/admin-overview-page.tsx
apps/admin/features/plans/platform-plans-page.tsx
apps/admin/features/platform-settings/platform-settings-page.tsx
apps/admin/features/redemption/platform-redemption-batches-page.tsx
apps/admin/features/subscriptions/platform-subscription-page.tsx
```

### Shared UI

```text
packages/ui/src/makerkit/resource-inspector.tsx
```

### Docs / Proposal

```text
docs/architecture/modules/frontends.md
docs/proposals/README.md
docs/proposals/admin-2-navigation-ia/design.md
docs/proposals/admin-2-navigation-ia/plan.md
docs/proposals/admin-2-navigation-ia/agent-handoff.md
docs/proposals/admin-2-navigation-ia/verification-record.md
docs/proposals/admin-2-navigation-ia/phases/01-navigation-shell.md
docs/proposals/admin-2-navigation-ia/phases/02-resource-workspace.md
docs/proposals/admin-2-navigation-ia/phases/03-inspector-command.md
docs/proposals/admin-2-navigation-ia/phases/04-rollout-validation.md
```

其中以下未跟踪文件/目录是**预期的新文件，不是临时垃圾**：

```text
apps/admin/components/navigation/admin-navigation.test.ts
apps/admin/components/shell/admin-shell-context.tsx
docs/proposals/admin-2-navigation-ia/
```

## 4. 明确禁止混入本提交的并发修改

本任务执行期间发现以下文件被其他工作并发修改：

```text
AGENTS.md
docs/README.md
docs/agents.md
docs/guides/development-release-workflow.md
```

这些修改**不是 Admin 2.0 任务产生的**。

收尾 AI 必须：

1. 不回退这些文件。
2. 不格式化这些文件来“顺手整理”。
3. 不把它们 stage 到 Admin 2.0 commit。
4. 不执行会覆盖它们的 checkout/reset/restore。
5. 如果在收尾过程中又出现新的非白名单文件变化，同样视为并发修改，先隔离再提交。

## 5. 已完成的验证

详细记录见 [verification-record.md](verification-record.md)。当前已得到以下结果：

| 检查 | 结果 |
| --- | --- |
| `pnpm toolchain:check` | PASS |
| `pnpm --filter admin test:unit` | PASS，2 files / 9 tests |
| `pnpm --filter admin typecheck` | PASS |
| `pnpm docs:check` | PASS，77 documents |
| `pnpm format:check` | PASS，387 files |
| `pnpm lint` | PASS，0 warnings / 0 errors，322 files |
| `pnpm contracts:check` | PASS，Account 22 operations / Admin 44 operations / 4 consumer contracts |
| `git diff --check` | PASS |
| `pnpm typecheck` | PASS，9/9 tasks |
| `pnpm build` | PASS，Admin + template-preview production build |
| 真实浏览器桌面/窄屏/键盘验收 | NOT_RUN |

第一次 `pnpm format:check` 曾因两个本任务文件失败；随后只格式化：

```text
apps/admin/components/navigation/admin-navigation.test.ts
apps/admin/features/accounts/platform-accounts-page.tsx
```

之后全仓 format PASS。不要删除这条历史失败记录。

`git diff --check` 期间 Windows Git 曾提示 `apps/admin/app/globals.css` 未来可能 LF → CRLF；检查本身 exit 0。不要仅为了消除该提示去大范围改行尾。

## 6. 仍然需要收尾的事项

### 必做

1. 重新检查当前工作区，确认没有新的并发变化。
2. 审查本任务白名单 diff，尤其是：
   - `admin-navigation.ts`
   - `admin-sidebar.tsx`
   - `admin-topbar.tsx`
   - `platform-workspace.tsx`
   - `platform-accounts-page.tsx`
   - `resource-inspector.tsx`
3. 做敏感信息检查；本任务不应包含 Token、Key、用户数据或 Secret。
4. 重新运行最少：

```bash
pnpm --filter admin test:unit
pnpm docs:check
pnpm format:check
pnpm lint
git diff --check
```

如果代码在交接后又被修改，则还应重新跑：

```bash
pnpm typecheck
pnpm build
pnpm contracts:check
```

5. 只按白名单 stage。
6. 用 `git diff --cached --check` 和 `git diff --cached --stat` 再检查 staged 内容。
7. 确认 staged diff 中没有第 4 节四个并发文件。
8. commit。
9. push `codex/admin-2-navigation-ia` 并核对远端 commit。
10. 回写 `verification-record.md` 中最终 commit / push 信息；如果该回写发生在 commit 后，建议做一个小的 docs follow-up commit，而不是修改已提交历史。

### 可选但推荐：真实浏览器验收

如果另一处 AI 有浏览器/Computer Use 能力，建议在 commit 前补做：

- Global 页面：
  - `/admin`
  - `/admin/platforms`
  - `/admin/billing`
  - `/admin/operations`
  - `/admin/audit`
  - `/admin/security`
- Platform 页面：
  - `/admin/platforms/:platformId`
  - accounts / plans / subscriptions / redemption-batches / files
  - settings / settings/origins / settings/keys
- 验收重点：
  - Global / Platform Sidebar 切换
  - active state
  - collapsed Sidebar tooltip
  - Platform Switcher
  - Cmd/Ctrl+K
  - Accounts `?selected=` deep-link
  - browser Back
  - Inspector Escape/关闭
  - 关闭后焦点恢复
  - 窄屏 Sheet
  - disabled platform warning
  - MFA 页面仍是独立 auth flow，不出现 Admin Shell

如果无法做浏览器验收，保持 `NOT_RUN`，不要把 build 写成视觉 PASS。

## 7. 推荐的安全暂存方式

先再次确认 status。然后使用**显式白名单**，例如：

```bash
git add -- \
  apps/admin/app/admin/audit/page.tsx \
  "apps/admin/app/admin/platforms/[platformId]/page.tsx" \
  apps/admin/app/admin/security/page.tsx \
  apps/admin/app/globals.css \
  apps/admin/components/navigation/admin-command-menu.tsx \
  apps/admin/components/navigation/admin-navigation.ts \
  apps/admin/components/navigation/admin-navigation.test.ts \
  apps/admin/components/platform-context/platform-header.tsx \
  apps/admin/components/platform-context/platform-navigation.tsx \
  apps/admin/components/platform-context/platform-switcher.tsx \
  apps/admin/components/platform-context/platform-workspace.tsx \
  apps/admin/components/shell/admin-page-header.tsx \
  apps/admin/components/shell/admin-shell-context.tsx \
  apps/admin/components/shell/admin-shell.tsx \
  apps/admin/components/shell/admin-sidebar.tsx \
  apps/admin/components/shell/admin-topbar.tsx \
  apps/admin/features/accounts/platform-accounts-page.tsx \
  apps/admin/features/billing/central-billing-page.tsx \
  apps/admin/features/files/platform-files-page.tsx \
  apps/admin/features/overview/admin-overview-page.tsx \
  apps/admin/features/plans/platform-plans-page.tsx \
  apps/admin/features/platform-settings/platform-settings-page.tsx \
  apps/admin/features/redemption/platform-redemption-batches-page.tsx \
  apps/admin/features/subscriptions/platform-subscription-page.tsx \
  packages/ui/src/makerkit/resource-inspector.tsx \
  docs/architecture/modules/frontends.md \
  docs/proposals/README.md \
  docs/proposals/admin-2-navigation-ia
```

注意：上面的 `platform-navigation.tsx` 是删除项，显式 `git add` 会正确 stage deletion。

暂存后必须检查：

```bash
git status --short
git diff --cached --stat
git diff --cached --check
git diff --cached --name-status
```

如果 staged 列表出现：

```text
AGENTS.md
docs/README.md
docs/agents.md
docs/guides/development-release-workflow.md
```

立即从 index 取消这些路径的 staged 状态，但保留工作区内容。

## 8. 建议 commit / push

建议 commit message：

```text
feat(admin): implement context-aware workspace navigation
```

push：

```bash
git push -u origin codex/admin-2-navigation-ia
```

push 后核对：

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/codex/admin-2-navigation-ia
```

不要仅凭本地 commit 就声称已上传。

是否继续合并 main，应以**收尾时仓库最新规则、用户授权和远端状态**为准；不要因为本文提到 R1 就跳过当时仍然适用的合并前检查。

## 9. 不要“顺手修”的边界

本任务不要扩大到：

- Auth / Login / refresh / logout 协议重构
- Admin BFF / Account API / OpenAPI 行为变更
- SQL / migration
- Billing / Subscription / Entitlement 业务语义
- 权限模型、MFA / recent-auth 服务端规则
- Secret 或环境变量
- 新依赖、新 UI 框架
- 生产部署
- 与 Admin 2.0 无关的规则文档整理

发现这些问题可以记录，但不要混入本 commit。

## 10. 已知设计意图，避免误判

- `AdminShellContext` 不是新的平台权限来源；它只把 `PlatformWorkspace` 已获取的平台对象提供给 Sidebar/Topbar 展示。
- Platform URL 仍是唯一上下文源。
- Account Inspector 的 URL selection 是有意设计，不要改回纯本地 state。
- `ResourceInspector` 改成 Sheet 是有意的共享行为变化；Files / Operations / Platform Keys 的 Inspector 同样会变成右侧面板。
- MFA 从 Sidebar 消失是有意的；Security 页面和 recent-MFA flow 仍然可以进入 `/admin/mfa`。
- 不应重新恢复旧 `PlatformNavigation`。
- Accounts 不展示后端没有合同支持的文件摘要、活动时间线等假数据。
- 原有 unknown-outcome、request ID、MFA step-up、If-Match/幂等语义不能因 UI 收尾被删掉。

## 11. 最终交接完成标准

收尾 AI 可以把任务标记完成的最低条件：

- 本任务白名单 diff 已审查。
- 并发四文件未被 stage、未被回退。
- 关键本地检查再次 PASS。
- 无 Secret / 无无关文件 / 无 API 或权限协议漂移。
- commit 已创建。
- 分支已 push 且远端 commit 与本地一致。
- `verification-record.md` 能准确说明最终 commit / push 和浏览器验收状态。
- 若浏览器验收未执行，仍明确写 `NOT_RUN`。
