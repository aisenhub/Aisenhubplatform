# OPT-002 全局审计中心与概览去审计化计划

状态：Completed

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

把现有全局 Audit 从工程日志浏览页升级为可读、可组合筛选的审计中心，同时从 Overview 完整移除审计流水和审计派生的“最近变更平台”依赖。

起始基线：`main@70beed4db0d7a39c641cb97683272f1730ee6bd5`。

风险分级：**R3**，因为包含新数据库 security-definer 查询函数/索引、Admin API/OpenAPI Contract、Edge Function 和 Admin UI 消费者变更。

受影响消费者：Admin Audit、Admin Overview、Account API Admin 路由、Admin OpenAPI、SQL 权限/测试。Consumer API 不变。

## 阶段与依赖

| 阶段 | 目标 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- |
| 01 | 建立权威 Audit v2 只读投影、结构化筛选 API/Contract，并同步已授权远端 Supabase | design 冻结、最新 main 已核对 | 完成 | [阶段 01](phases/01-audit-contract-data.md) |
| 02 | 重构全局 Audit UI，移除 Overview 审计依赖，完成整体回归与 Git 闭环 | Phase 01 源码/合同/远端兼容已验证 | 完成 | [阶段 02](phases/02-admin-audit-ui-overview.md) |

## 总体验收

- [x] `admin_audit_list_v2` 提供权威 platform scope、可信 actor 摘要和可组合服务端过滤，v1 保持兼容。
- [x] Admin Audit OpenAPI 与 Edge 行为一致，非法 UUID/过长筛选拒绝。
- [x] workendstaging 的 migration history、v2 函数权限和 `account-api` 部署与 Phase 01 源码一致。
- [x] `/admin/audit` 一级展示业务语义，技术字段只在详情中。
- [x] Overview 不再发起 audit 请求，不再显示最近活动/最近变更平台。
- [x] outcome 空值显示“未记录”，没有假成功。
- [x] SQL/API/contract/Admin unit/typecheck/build/lint/format/docs/browser 回归通过；Local Supabase fresh/upgrade 与真实 Admin HTTP/浏览器 R3 门槛均已验证。
- [x] 最终 diff、GitHub/main、Supabase 状态核对完成，任务分支删除。

## 环境与发布边界

用户已明确要求开发/预发远端 Supabase 随 phase 同步，因此 Phase 01 在本地可完成的验证后，把兼容 migration 与 `account-api` 部署到已连接的 `workendstaging` 并做只读/合成验证。

这不把远端 staging 当作开发流程要求的 Local Supabase 替代品。2026-10-10 Docker Engine 恢复后，已完成 Local Supabase fresh reset、从 `20261010004924` 到 `20261010092449` 的 upgrade、60 个 SQL 文件 / 1113 个断言，以及 canonical `verify:task:0801 --reuse-local` 20 个 executable gates。最终实现与验证提交已 fast-forward 到 `main`，任务分支已完成本地和远端清理。

当前没有证据表明 GitHub `main` push 绑定自动 Production 前端部署；Production Supabase 仍不在当前授权范围。

## 回退

- 数据库：v1 保留；v2/索引为向前兼容扩展，故障优先让 Edge/UI 回到 v1，数据库使用 forward-fix 而非 destructive rollback。
- Edge：可回退上一 `account-api` 版本，仍调用 v1。
- UI：可回退到上一 main；新 v2 不破坏旧 UI。

## 验证与交付

实际命令、远端 migration/function 版本、测试退出码、Git commit/main SHA 和环境缺口统一记录在 [verification-record.md](verification-record.md)。
