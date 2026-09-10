# Phase 02 — Platform Context 与 Workspace

> FE-R1（2026-09-10）：按当前代码基线 `main@1a8cd5e` 维护；Auth 已实施，本期默认简体中文。Phase 02 代码批次已交付；阶段剩余核验以 [verification-record.md](verification-record.md) 为准。

> 状态：**进行中**（代码批次已交付；平台错误/切换行为级证据仍待完整关闭）  
> 前置：Phase 01 已完成必要验证、commit 并 push；`verification-record.md` 已记录 UI toolchain 和 shell contract。

## 1. 目标

把 Platform 从“各页面自己的 selectedId / input / select”提升为 Admin 的正式 URL 上下文，并交付可深链的 Platform Workspace：

- `/admin/platforms` 成为 Global Platform Directory；
- `/admin/platforms/[platformId]` 成为 Platform Overview；
- PlatformSwitcher 只通过 URL 导航切换；
- Platform Header 固定展示 name/code/status/id/local nav；
- disabled 平台显示 persistent warning，但管理员诊断入口仍可见；
- 为 Accounts/Plans/Subscriptions/Redemption/Files/Settings 建立 nested route shell；
- 当前 `platforms/page.tsx` 的真实能力必须被保留，不能因拆页面丢失 create/toggle/origin/key/account 操作；本阶段只迁移 Platform directory/general context，具体资源 mutation 分别交后续阶段。

## 2. 必读与前置记录

- `00-master-plan.md`
- Phase 01 文档与 `verification-record.md`
- `docs/architecture.md`：Platform=Tenant，不引入 Organization/Workspace 产品模型
- `docs/api-sdk.md` / `docs/development/contracts.md`：Admin platform/origin/account/key routes
- `apps/admin/AGENTS.md` + 当前本地 Next docs（dynamic segment/layout/searchParams/link/navigation）
- 当前 `apps/admin/app/admin/platforms/page.tsx`
- 当前 Admin BFF route

## 3. 已核实调用链与问题

当前：

```text
/admin/platforms
  → GET /api/v1/admin/api/v1/platforms?limit=100&q=
  → local selectedId
  → Promise.all:
      /platforms/:id/origins
      /platforms/:id/accounts
      /platforms/:id/keys
```

其他页面分别：

- Entitlements：手输 `platformId`；
- Subscriptions：手输 `platformId` + accountId；
- Files：自己的 platform selector；
- Platform Operations：自己的 `selectedId`。

这导致 context 刷新丢失、不可分享、back/forward 不稳定、每个页面重复选择平台。

## 4. 唯一 Platform Context Contract

```text
route segment [platformId] = 唯一权威
```

不允许：

- 全局 React store 作为 Platform authority；
- localStorage 保存 platformId 并覆盖 URL；
- PlatformSwitcher 通过 state 改页面但不更新 URL；
- 客户端 platform context 被当 authorization。

允许：

- Switcher 记住“最近访问 route”作为非敏感导航 convenience，但当前页面 scope 永远由 URL 决定；
- server loader 根据 `[platformId]` 读取 metadata；
- 404/permission/disabled 通过状态 surface 表达。

## 5. 目标路由与职责

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

本阶段必须真实实现：

- `/admin/platforms`
- `/admin/platforms/[platformId]`
- nested layout/header/navigation

其余 nested route 可以在本阶段建立**真实导航目标的最小 route skeleton only when immediately consumed by later committed phases**；不要放 fake resource rows/button。更推荐由 04/05 创建其内容，Phase 02 只冻结 route contract。

## 6. 建议文件职责

先确认当前分支是否已有等价文件。

```text
apps/admin/app/admin/platforms/page.tsx
  Global platform directory

apps/admin/app/admin/platforms/[platformId]/layout.tsx
  load/validate platform context + PlatformHeader + local nav

apps/admin/app/admin/platforms/[platformId]/page.tsx
  Platform Overview

apps/admin/components/platform-context/
  platform-switcher.tsx
  platform-header.tsx
  platform-navigation.tsx

apps/admin/features/platforms/
  platform-directory.tsx
  platform-overview.tsx
  platform-presenters.ts
```

如果 Phase 01 已形成不同 feature convention，沿用它，不为文件名机械迁移。

## 7. Platform Directory

### 查询状态

URL：

```text
/admin/platforms?q=&status=&cursor=
```

仅使用 API 实际支持的 `q/limit/cursor/status`。若 status filter 当前 endpoint 不支持服务端过滤：

- 不伪造为全量 status filter；
- 可明确做“当前页筛选”并标注，或等待 API Contract 未来扩展；
- 不前端无界拉取所有平台。

### 列字段

至少：

- name；
- code；
- status；
- allow_activation；
- platform ID（copy/inspector）；
- open workspace action。

Accounts/file/subscription counts 只有真实 API 支持聚合字段时才展示。

### Create Platform

保留当前真实 create 能力：

- 使用 Drawer/Dialog（字段少）；
- 客户端 validation 只做快速反馈，server authoritative；
- pending 只锁 create form；
- success refetch directory；
- failure Error Presenter；
- 不把 create mutation 结果写成 page status string。

## 8. Platform Workspace Header

稳定展示：

```text
Breadcrumb
Platform name + code
StatusBadge
Platform ID + Copy
Context actions
Local navigation
```

### Disabled

如果 platform disabled：

- 顶部 persistent Inline Alert；
- 不把所有 Admin diagnostic pages 隐藏；
- ordinary user authorization 规则不在前端重定义；
- mutation 是否允许仍以 Admin API 返回为准。

### Context loading/error

- invalid/not-found：ResourceNotFound；
- forbidden：PermissionState；
- session expired：Auth state；
- dependency unavailable：RecoverableError + retry；
- 不 fallback 到第一个平台掩盖错误 URL。

## 9. PlatformSwitcher

### 数据

可使用 bounded platform list；如果平台数未来超过 API 合理 limit，则切换为 API search。当前不可假设有无限列表。

### 行为

- 选择新平台 → 生成 URL；
- 在平台资源页切换时，优先保持同类子路由，例如 `/files`→新平台 `/files`，若目标 route 不适用才回 overview；
- keyboard/Command 可触发；
- mobile 放 Sidebar Sheet；
- 不持久化任何 Platform Key/secret。

## 10. Platform Overview

必须回答“当前平台需要关注什么”，但只用真实数据。

第一版可安全包含：

- Platform Status + activation policy；
- Quick links 到 Accounts/Entitlements/Files/Settings；
- API Keys metadata 摘要（若 existing endpoint bounded 且不展示 secret）；
- File policy / attention 摘要（若 existing endpoint 可读）；
- 最近 activity 只有 audit endpoint 能按 target 精确查询时才展示；否则放“打开 Audit”链接，而不 client-side 拉全量 audit。

不要为了 Overview 一次请求所有 100 accounts/files 再计算“总数”。需要 aggregate count 但 API 不支持时，省略 count。

## 11. General Platform mutation 边界

当前平台 active/disabled 切换真实存在。本阶段可以：

- 将基本状态编辑从 mega-page 迁到 Overview/General entry；
- 对 disable 使用 Phase 03 将提供的正式 high-risk Confirm contract **如果 Phase 03 尚未到达，则不要在 Phase 02 发明临时第二 Confirm 组件**。

推荐：Phase 02 保留非 destructive create/open/context；平台 disable mutation 最终迁移留 Phase 05 General Settings，旧页面在这之前继续承载该 mutation 但导航不作为主路径。这样避免短期 `window.confirm` 新实现。

## 12. 旧路径与兼容

阶段结束：

- Entitlements/Subscription/Files 尚未完全迁移，但所有新链接必须带 platform route；
- 不再新增任何“请输入 Platform ID” UI；
- `platforms/page.tsx` 不再用 `selectedId` 作为主 workspace；点击 platform 进入 `[platformId]`；
- 旧 mega-page 中尚未迁出的 mutation 可以临时保留为 legacy direct route/section，但必须列入 Phase 03–05 退出清单；
- 不能同时在 directory 和 legacy mega-page 提供两套同一 Platform create mutation。

## 13. 状态与用户流程测试

1. 直接打开 `/admin/platforms/<valid>`；
2. invalid UUID/unknown ID；
3. disabled platform warning；
4. directory initial/success/true-empty/filter-empty/error/access；
5. q URL reload/back/forward；
6. create platform pending/double click/failure/success；
7. Switcher A→B URL 和 header 同步；
8. 在 nested route 切平台时上下文正确；
9. browser refresh 后 platform 不丢；
10. copied workspace URL 新 tab 正确；
11. 390px switcher/sidebar/header；
12. keyboard focus/accessible names。

## 14. 验证命令

按实际 package scripts 核对后至少：

```bash
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm format:check
pnpm lint
pnpm typecheck
```

复用/扩展 Admin browser E2E：

```bash
pnpm test:e2e:t12-r2
```

如 Platform API 交互本阶段发生 transport/contract 改动（原则上不应）：

```bash
pnpm contracts:check
pnpm test:api:t16-m2-management
```

没有改 API contract 就不要为了凑检查改 OpenAPI。

## 15. 完成门槛与 Git

- Platform URL context 真实闭环；
- directory/create/switcher/workspace browser 验证完成；
- 无 manual ID 新入口；
- 不新增 Organization/RBAC；
- Phase 01 state/shell contract 未被私改；
- record 更新、`git diff --check`、diff/secret review；
- commit，例如：`frontend(admin): phase 02 establish platform workspace context`；
- push 并确认 remote SHA；
- push 失败不得进入 Phase 03。

## 16. 交接

交给 Phase 03/04/05：

- `[platformId]` route contract；
- Platform metadata loader/context interface；
- header/navigation/switcher API；
- legacy platform mega-page 剩余 mutation 清单；
- actual API-supported filters/counts；
- disabled/error behavior；
- 当前 Auth/shared UI commit SHA。

## FE-R1 阶段补充：能力保留与请求上下文

- 平台当前仅q/limit，无实现cursor；不生成虚假分页/全量状态筛选。切换平台保留资源类型但清理不属于新平台的account、file、drawer及cursor参数。
- 按执行合同§6记录旧能力→临时可达入口→最终入口→验证用例；尚未迁出的账户/Key/Origin/General操作不能因替换platforms/page丢失，也不能复制第二套。
- 平台切换必须通过FE-V02乱序测试；上下文不匹配时不能展示旧平台数据。未知/无权限/无效ID分别呈现中文状态。
- 明确派发FE-D01平台文件查询依赖；可以准备合同，未验收前不得声称平台Files具备完整数据集。默认单任务串行，不自动启动并行Agent。
- 验收 FE-V02、FE-V11、FE-V13。
