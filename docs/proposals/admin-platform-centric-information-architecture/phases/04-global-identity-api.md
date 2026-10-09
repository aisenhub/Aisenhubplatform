# Phase 04：全局 Identity API 与真实统一用户工作台

状态：Completed（待整体验收收口）

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

把 `/admin/accounts` 从“浏览器逐个平台拉取 `platform_accounts` 后拼接”改为真正的 **Global Identity** 工作台。主对象必须是 `auth.users` 身份；平台账户只是 identity 下的关联集合。管理员可以按 Auth UID / email 检索，并可选择平台范围过滤关联关系。

## 进入条件与冻结合同

- 基线为 `main@9dd9adc5b380cb999b05c8d74842959e4b132276`。
- 整次变更按 R3 执行；数据库只新增 forward-fix migration，不修改历史 migration。
- 浏览器仍只访问同源 `/api/v1/...`，BFF 仍使用显式 Admin OpenAPI allowlist。
- `platform_id` 过滤只影响“是否属于该平台范围”，不得把浏览器传入的平台 ID 当作权限来源。
- 返回结果以 identity 为一行；`accounts` 为有界 JSON 关联列表。没有平台过滤时允许展示尚无平台账户的 Auth identity；指定平台时只返回在该平台有关联账户的 identity。
- Supabase Auth schema 不授予项目 executor/`domain_owner` 直接读取权限；Identity 主记录由 Account API 使用 server-only Supabase Auth Admin 能力读取，private SQL 只接受候选 `user_id[]` 并聚合 AisenHub lifecycle/platform account 关联。
- 第一版是只读 Identity 检索；全局强制登出/锁定/Global Delete 不在没有既有领域入口时伪造 UI。

## 变更范围

- `supabase/migrations/*_admin_identity_search.sql`
- `supabase/functions/account-api/admin.ts`
- `contracts/admin/v1/openapi.json`
- `apps/admin/app/api/v1/[...path]/route.ts`
- `apps/admin/features/accounts/account-types.ts`
- `apps/admin/features/accounts/central-accounts-page.tsx`
- Account/Admin Edge、BFF allowlist、SQL/contract tests

## 任务清单

- [x] 用固定 `Supabase CLI 2.111.0` 创建新 forward migration。
- [x] 新增 `private.admin_identity_accounts`：验证 singleton Admin + active session；候选 `user_id[]`/`platform_id` 有界；只读取 `private.identity_lifecycle`、`public.platform_accounts`、`public.platforms`；`security definer` + 固定 `search_path`；仅授予 `admin_executor` execute。
- [x] Account API 使用 server-only Supabase Auth Admin API 读取 Identity；email filter 下推 Auth，Auth UID 走单用户读取；分页硬上限为 5×200，无法在有界窗口内确认完整平台筛选时 fail closed，不返回静默 partial result。
- [x] 返回 `user_id/email/identity_state/created_at/last_sign_in_at/account_count/accounts`；`accounts` 项包含 platform id/code/name、platform_account_id、status 和关键时间戳。
- [x] 新增 `GET /admin/api/v1/accounts?q=&platform_id=&limit=` canonical Admin endpoint；输入非法 UUID/超长查询 fail closed。
- [x] OpenAPI 增加 operation，并让 BFF allowlist 自动合同测试覆盖。
- [x] 将 `/admin/accounts` 改为一次请求全局 endpoint；表格第一列为 identity/email，关联平台账户在同一 identity 下展示并保留到平台账户 workspace 的深链。
- [x] 删除页面端 `Promise.allSettled` 的 N 平台 fan-out，不再依赖平台列表才能查询 identity；平台列表只作为筛选选项。
- [x] 增加 API/SQL/UI 模型测试：email/UID 搜索、平台过滤、无平台账户 identity、越权 executor、非法输入。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期 |
| --- | --- | --- | --- |
| migration 结构/权限 | `pnpm test:db` 中新增 pgTAP | Local Supabase | admin_executor 可执行，其他 executor 不可执行；候选 identity 的平台关联正确聚合 |
| Admin HTTP | `pnpm test:api` / 定向 Edge test | Local | `/admin/api/v1/accounts` AAL2 Admin 成功，非法输入/非 Admin 拒绝 |
| Contract/BFF | `pnpm contracts:check` + Admin route unit | Local | OpenAPI 与显式 allowlist 一致 |
| UI | Admin unit/浏览器行为 | Local | 一次检索只发一个 identity 请求；正确显示 identity 与关联账户 |

## 退出与恢复条件

- 只有 global identity endpoint、SQL 权限和 UI 消费全部落地后才退出。
- Local 验证已确认 Supabase Auth schema 不应由项目数据库角色直接读取，因此实现固定采用 Auth Admin server boundary + private association SQL；不回退为浏览器 fan-out，也不扩大数据库角色权限。
- 回退应用版本时新函数保持向后兼容；migration 不删除历史数据，不需要 destructive rollback。

## 下一阶段交接

Phase 05 可以复用 Admin `adminStepUp()` 和 recent-proof cookie/BFF 转发边界；不得在 identity API 内新增身份写算法。
