# Phase 03 — Admin 配置资源治理与平台容量

状态：已完成

## 目标

把 Platform scope 的“文件”升级为业务可读配置资源中心，同时在 Global scope 提供平台物理容量分配并把 Pending Review 接入 Overview。

## 实施项

- [x] ADMIN-API-001：新增 Config resource list/detail、review queue、approve/reject、Gallery remove/restore/block 与 usage summary Admin functions/routes/OpenAPI；所有 platform filter 服务端执行。
- [x] ADMIN-API-002：扩展平台 file policy/usage DTO，提供 `max_platform_total_bytes`、platform reserved/actual/available/over-capacity；容量修改写审计并保留 unknown outcome 恢复语义。
- [x] PLAN-001：Plan SQL 校验 `config_slot_limit`；Admin Plan editor 增加专用数字输入，保留其他 features key。
- [x] OVERVIEW-001：`private.admin_platform_overview` 新增 `pending_config_reviews`，Admin Overview planned card 替换为真实 metric + review deep link。
- [x] UI-001：Platform Sidebar/quick links 将“文件”文案升级为“配置资源”；`/files` 主页面展示资源池、审核队列、Gallery 状态和 usage。
- [x] UI-002：保留现有 file policy/ledger/download/delete/unknown outcome 为“Storage 技术状态”次级诊断区，不复制高风险逻辑。
- [x] GLOBAL-001：`/admin/platforms` 增加容量治理入口；只在 Global scope 编辑总容量，Platform scope 只读展示。
- [x] E2E-001：Admin synthetic/T12 覆盖 pending→approve、旧 approved 版本保持、remove 不删个人 Config、capacity overage、Plan slot UI、Overview 深链与 step-up/confirm。
- [x] STAGE-001：部署 Admin/Account API 与相关 migration 到授权 staging，验证审核、Overview、容量和 advisors；Production NOT_RUN。

## 完成门槛

- Admin 业务表默认不暴露 raw Storage ID；技术 ID/状态进入 Inspector/技术区。
- remove/block 与个人删除动作视觉和 API 完全分离。
- Pending Review 统计来自数据库权威聚合，不由浏览器列表长度推断。
- staging Admin/Edge 与当前 commit 同步后才进入 Phase 04。

## 验证记录

- Local canonical `TASK-0801 --reuse-local`：20 executable gates PASS；Edge/API 101/0，pgTAP 65 files / 1260 tests，contracts breaking PASS，Consumer Harness 与 Admin T12 全绿。
- Admin synthetic：资源中心主视图、Storage 次级区、Plan `config_slot_limit`、Overview 待审核深链、Global 容量入口及既有响应式/语义矩阵 PASS。
- Admin T12：真实 Local Supabase 下 `configReviewGovernance`、`globalCapacityStepUp`、`overCapacityNoDelete` PASS，并验证 recent-MFA 后不会自动重放容量写入。
- Staging `workendstaging`：dry-run 仅含 `20261011070729_config_resource_admin_governance.sql`，已部署；`account-api` ACTIVE v60，`verify_jwt=false` 保持既有函数内认证模型。
- Staging 权限：Phase 03 private functions 均为 `domain_owner` + security definer + pinned `pg_catalog, private, public` search_path；仅 `admin_executor` 可执行。
- Staging HTTP：Config resources / review queue / Overview / file-policy 未认证均真实返回 401 `UNAUTHORIZED`、`Cache-Control: no-store`、有效 `X-Request-Id`，无 timeout。
- Staging Advisor：Security 仅保留既有 `pg_net` public schema 与 leaked-password protection WARN；Performance 为既有 unindexed-FK / fresh-unused-index 信息，无 Phase 03 新安全告警。
