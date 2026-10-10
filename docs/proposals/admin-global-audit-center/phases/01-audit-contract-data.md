# 阶段 01：Audit v2 数据投影、API Contract 与远端同步

状态：完成

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

先建立向后兼容的审计读取基础，让 Admin UI 在 Phase 02 只消费已经部署并验证过的结构化合同。

## 进入条件

- 起始 `main@70beed4db0d7a39c641cb97683272f1730ee6bd5`，工作区 clean。
- 当前任务分支 `codex/opt-002-global-audit`。
- 已确认 `audit_logs` 本身存在 `platform_id/platform_account_id`，不需要猜测或回填 scope。
- 已确认远端当前 outcome 样本均可为空，UI/合同不得默认 success。

## 变更范围

- 新 forward migration：`private.admin_audit_list_v2` + 必要结构化筛选索引。
- `supabase/tests/`：v2 权限、search_path、过滤、匿名化/安全投影相关测试。
- `supabase/functions/account-api/admin.ts` / `core.ts` / `index.test.ts`。
- `contracts/admin/v1/openapi.json`。
- 如合同检查生成/同步其他 canonical 派生文件，按现有工具链处理。

本阶段不改 Audit/Overview 页面布局。

## 任务清单

- [x] DB-001：使用固定 Supabase CLI 创建新 migration，不修改已应用 migration。
- [x] DB-002：实现 `admin_audit_list_v2`，保留 v1；校验 q/actor/action/target/outcome/limit，组合 SQL 过滤。
- [x] DB-003：按实测查询需要添加结构化时间索引，不引入未证明必要的 pg_trgm。
- [x] DB-004：验证 security definer、search_path、admin-only execute 与敏感字段不暴露。
- [x] API-001：Admin GET `/audit` 解析新参数并调用 v2；非法 platform UUID 等返回 400。
- [x] API-002：DTO 暴露安全 scope/actor 摘要；不返回 metadata/IP/user-agent。
- [x] CONTRACT-001：OpenAPI 同步新参数和 400 响应。
- [x] TEST-001：Deno fake DB、Local Supabase fresh/upgrade、v1/v2 权限/排序/过滤测试均通过；受限 `admin_executor` 查询先写入临时快照，再切回测试角色执行 pgTAP 断言，避免测试扩展可见性污染真实权限验证。
- [x] REMOTE-001：核对后确认 migration `20261010092449` 与 `account-api` v55 已在 `workendstaging` 生效；migration history、函数权限、结构化筛选、`unrecorded` 语义和索引已远端验证。

## 验证矩阵

| 检查 | 环境 | 预期 | 实际 |
| --- | --- | --- | --- |
| `pnpm toolchain:check` | Local | PASS | PASS |
| `pnpm contracts:check` / `contracts:breaking` | Local | PASS | PASS |
| Account API Deno tests | Local | PASS | PASS：45/45 |
| SQL audit tests + migrations fresh/upgrade | Local Supabase | PASS | PASS：fresh reset；从 `20261010004924` 单独 upgrade v2；两次完整 DB suite 均为 60 files / 1113 tests |
| `pnpm test:api` 或适用定向 Admin Audit HTTP | Local Supabase/Edge | 新旧 query 均兼容、结构化筛选生效 | PASS：API 97/97；canonical R3 启动当前 Account API + Admin 并完成真实 T12 浏览器 HTTP 链路 |
| Remote migration apply | workendstaging | 只新增兼容 v2/索引 | PASS：migration `20261010092449` 已记录，三个 Audit v2 索引存在 |
| Remote Edge deploy | workendstaging | account-api active，现有旧 audit query 仍工作 | PASS：`account-api` ACTIVE v55，代码已包含 v2 route/DTO |
| Remote read-only/synthetic assertions | workendstaging | v2 scope/filter/权限符合设计 | PASS：admin-only execute、组合过滤及 `unrecorded → outcome IS NULL` 已验证 |

## 退出条件

Phase 02 之前必须至少满足：源码/合同测试通过、migration/API 已同步 workendstaging 且远端状态可核对；开发流程要求的 Local Supabase 必需项如果仍 BLOCKED，则不能把本阶段标记为完整验收并继续自动合并 main，但可以继续准备不依赖该缺口的 Phase 02 代码。

## 恢复

新 v2 与索引不替换 v1。远端 Edge 如发现问题可部署上一兼容版本重新调用 v1；数据库不 drop v2，后续用 forward-fix 修正。
