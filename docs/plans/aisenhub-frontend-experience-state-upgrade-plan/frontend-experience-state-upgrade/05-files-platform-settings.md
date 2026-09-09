# Phase 05 — Files、File Policy 与 Platform Settings

> FE-R1（2026-09-09）：按本地 main@b563a98 校准，Auth 已实施；本期默认简体中文。执行须读取 [FE-R1 执行合同](references/fe-r1-execution-contracts.md) 和 [中文 UI 合同](references/chinese-ui-contract.md)。本修订替代旧快照中的冲突描述；产品实施仍未开始。

> 状态：**未开始**  
> 前置：Phase 01–03 已交付并 push。  
> 可与 Phase 04、07 并行。  
> 文件所有权建议：`apps/admin/features/files|platform-settings|origins|platform-keys/**` 及对应 nested routes；不要修改 Entitlements/Consumer/shared contract。

## 1. 目标

完成 Platform Workspace 中：

- Files + Usage/Policy summary + File Inspector；
- File Policy 保持归 Files，不塞进巨大 Settings；
- Platform Settings / General；
- Origins；
- API Keys 最终页面收口；
- row/action pending；
- file `accepted` / `unknown_outcome` / deleting 的正式状态；
- 退出旧 `/admin/files` 和 legacy Platform mega-page 中 Origins/Keys/General mutation UI。

## 2. 必读

- Phase 01–03 + record
- `docs/config-files.md`
- `docs/api-sdk.md`
- `docs/development/contracts.md`
- 当前 `apps/admin/app/admin/files/page.tsx`
- 当前 legacy `platforms/page.tsx`
- Phase 03 API Keys implementation
- 文件相关 API/OpenAPI/测试脚本
- 本地 Next docs

## 3. Files 业务不变量（前端不得改）

当前 API/架构已经要求：

- 文件是后端受控 opaque object；
- 浏览器不直连 Storage；
- `write_outcome=unknown` 时预算保持占用；
- deleting 不代表物理对象已删除或容量已释放；
- 202 DELETE 是 accepted，不是 success；
- binary download 经后端；
- upload/stream 不能偷偷 auto replay；
- cross-user/platform 由 server authorization；
- quota/policy 由 server authoritative。

前端只做正确表达和恢复入口。

## 4. Route 与页面结构

Route：`/admin/platforms/[platformId]/files`

```text
Files Page
├─ Usage / Policy Summary
├─ Attention Alerts
├─ Toolbar / Filters
├─ File Table
└─ File Inspector Drawer
```

File Policy 直接在 Files scope 中以 collapsible section/Drawer/Settings section 表达；如果编辑字段较多，可用同 route 下子页，但不迁到全局 Settings 大杂烩。

## 5. File RemoteData 与并行读取

当前旧页把 platforms、policy、files 捆在一个 `load()` 中。新结构：

- Platform metadata 由 Phase 02 parent layout/context；
- Policy 有独立 state；
- File list 有独立 state；
- 一部分失败不清空另一部分；
- background refresh list 时 policy 不回 skeleton；
- filter/cursor 写 URL；
- latest list data 可保留展示。

不要求引入 React Query；现有 fetch/state 能实现就用现有栈。

## 6. File Status Presentation

至少映射：

```text
active          → Active
receiving       → Receiving / 正在接收
storing         → Storing / 正在写入
pending         → Pending
cancel requested→ Cancel requested（若字段存在）
deleting        → Deleting / 删除处理中
deleted         → Deleted
write_outcome=unknown → Unknown outcome / 正在确认写入结果
failed/blocked  → 只有合同存在才显示
```

主文案人类可读；Inspector Technical 区保留 raw status/write_outcome。

### unknown

Inline warning：

- 配额仍保留；
- 禁止 UI 提供强制释放/重复上传绕过按钮；
- 提供 refresh/check authoritative state；
- 后续 Operations 中可出现 attention entry。

### deleting

- row 状态明确 running/accepted；
- 不显示容量已释放；
- delete button disabled；
- download/replace 能否使用按 server/current state；
- 提供 operation/deletion status link only if real ID exists。

## 7. Row-level Mutation State

禁止旧式 `busy` 锁全表。

建议局部集合/intent：

```text
deletingFileIds
 downloadingFileIds
policySavePending
refreshPending
```

实际实现可以更类型化，但语义：

- 删除 File A 时 File B 仍可查看/下载（如果没有共享冲突）；
- policy save 只锁 policy fields；
- refresh 有 subtle indicator；
- download pending 只对应 row；
- unknown outcome 单独存在，不归入 generic pending。

## 8. Delete Flow

```text
Delete action
 → Phase 03 ConfirmActionDialog
 → recent MFA if API requires
 → DELETE with existing idempotency contract
 → 202 => accepted
 → row = deleting after authoritative response/refetch
 → background check/manual refresh
 → deleted only when API reports deleted
```

### Network failure

- 不立即重发第二个 delete；
- 如果 Idempotency-Key 已创建，保留 logical intent；
- 先 GET file state；
- state deleting/deleted → 收敛 accepted/success；
- state unchanged + contract permits retry → same key retry；
- 无法确认 → unknown outcome。

## 9. Download Flow

- response binary；
- recent MFA required → step-up；
- network failure 不显示“文件不存在”；
- object URL 要 revoke；
- “下载流已返回”不宣称 OS 已保存成功；
- Filename 安全处理按现有 `Content-Disposition`/metadata；不从不可信名称制造 HTML。

## 10. File Policy

字段按实际 API：

- enabled；
- max_file_bytes；
- max_files；
- max_total_bytes。

规则：

- 客户端 min/max 只做 UX；server final；
- policy lower than current usage 不自动删除 file；
- over quota/over policy 用 Inline Alert；
- save success refetch；
- recent MFA requirement 正式 step-up；
- 不在客户端计算“允许上传”作为 authorization，只做 display estimate。

## 11. File Inspector

```text
Header: name + StatusBadge
IDs + copy
Size / reserved bytes / actual size
Content type
Created/updated
Raw status/write_outcome
Blocked reason
Actions
Danger Zone
```

不展示内容 preview，除非架构/安全以后明确允许；当前 config file 是不可信 opaque object。

## 12. Platform Settings / General

Route：`/admin/platforms/[platformId]/settings`

只放 Platform 自己的 General：

- name/code；
- status active/disabled；
- activation policy。

**先核对 API 哪些字段可更新。** code 若 immutable，不做 editable field；只显示。

Disable：

- Phase 03 ConfirmActionDialog；
- 说明影响普通用户授权，不影响管理员诊断；
- recent MFA按 API；
- success refetch parent context，顶部 persistent disabled alert。

## 13. Origins

Route：`/admin/platforms/[platformId]/settings/origins`

当前 real create/list capability 保留：

- environment；
- origin；
- oauth callback URL；
- password reset URL；
- confirmation URL；
- status。

只有 API 真实支持 edit/disable/delete 时才放对应 action；不能为了 CRUD 完整性造按钮。

创建：Drawer/Dialog；field-level validation；server errors；success refetch。Origin/URLs 是配置事实，不在浏览器自行“修正”为用户猜测的 URL。

## 14. API Keys

Phase 03 已建立 lifecycle/secret contract。本阶段完成：

- Settings local navigation；
- Key table/filter；
- metadata Inspector；
- create → secret → acknowledge；
- confirm deployment；
- revoke old key；
- responsive table surface基础；
- legacy Platform page key UI 完全退出。

不再新增第二 OneTimeSecretPanel。

## 15. 文件职责建议

```text
apps/admin/app/admin/platforms/[platformId]/files/page.tsx
apps/admin/app/admin/platforms/[platformId]/settings/page.tsx
apps/admin/app/admin/platforms/[platformId]/settings/origins/page.tsx
apps/admin/app/admin/platforms/[platformId]/settings/keys/page.tsx

apps/admin/features/files/*
apps/admin/features/platform-settings/*
apps/admin/features/origins/*
apps/admin/features/platform-keys/*  # 复用 Phase 03
```

若 API Keys feature 已由 Phase 03 建立，不移动文件只为目录美观。

## 16. 旧路径退出

当新 routes 实际验证后：

- `/admin/files` → redirect 到 `/admin/platforms` 或明确 context chooser；没有 platformId 时不猜默认平台；
- legacy `platforms/page.tsx` 中 Origin/Key/General mutation 删除；
- old file policy form删除；
- old global `status`/`busy` file code删除；
-旧 `.file-row/.data-list` class不再被这些新页使用；Phase 08 最终清 CSS。

## 17. 测试矩阵

### Files

- initial/success/true empty/filter empty/error/access/background refresh；
- active/receiving/storing/deleting/deleted/unknown；
- unknown keeps budget warning；
- delete confirm + double click；
- 202 accepted not success；
- delete network unknown → GET state before retry；
- same logical idempotency key where applicable；
- row A pending doesn’t disable B；
- download success/error/MFA；
- cursor URL/back；
- inspector copy/technical metadata；
- no Storage direct access。

### Policy

- load independent from file list；
- save pending；
- server rejection；
- lower-than-usage warning；
- MFA；
- no automatic delete。

### Settings/Origins/Keys

- disabled platform header update；
- create Origin error/success；
- Key secret once；
- deployment confirm persisted；
- revoke；
- no secret leak。

## 18. 验证命令

```bash
pnpm --filter admin typecheck
pnpm --filter admin build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm contracts:check
```

按实际仍存在的文件链路测试：

```bash
pnpm test:api:t16-m2-management
pnpm test:sql:m4-03-file-intent
pnpm test:sql:m4-05-file-cleanup
pnpm test:sql:m4-06-replace-switch
pnpm test:api:m4-07-file-query-download
pnpm test:api:m4-04-upload
```

只运行与实际改动风险相关且当前 package.json 真存在的命令；不要把没有修改 backend 的测试 failure 隐瞒为 UI pass。Admin browser flow 优先扩展现有 Playwright；执行时核对 `test:e2e:t12-r2` 是否覆盖对应路径。

## 19. 完成门槛与 Git

- Files/Policy/General/Origins/Keys 新 scope 实际可用；
- file 202/unknown/deleting 语义正确；
- no global busy；
- no secret leak；
- legacy mutation UI退出；
-必要验证实际记录；
- `verification-record.md` 更新；
- `git diff --check` + diff/secret review；
- commit，例如：`frontend(admin): phase 05 migrate files and platform settings`；
- push + remote confirmation；
- 向 Phase 06提供 deletion/unknown query capability 与 new routes。

## FE-R1 阶段补充：平台文件查询硬依赖

- 平台Files依赖FE-D01实际通过。当前API不支持platform_id精确列表，禁止延续global page再client filter；必验交错多平台、多页、空平台和跨平台cursor。
- 文件列表排除deleted，列表消失不能证明物理删除。通过detail/领域合同确认状态；404本身不得写“容量已释放”。
- 没有真实usage来源时仅展示策略，不从有界文件页汇总假额度/总量。global file attention保持后续能力，不借FE-D01扩成统一运维feed。
- 文件策略字段按当前enabled/max_file_bytes/max_files/max_total_bytes，中文标签与单位统一，原API字段不翻译。
- 验收FE-V05、FE-V09、FE-V11、FE-V13、FE-V16；FE-D01阻塞时只交独立设置准备，不标整阶段已交付。
