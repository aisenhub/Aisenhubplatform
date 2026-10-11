# Phase 02：接入配置工作区与 R3 收口

状态：验证完成，待 Git closeout

关联：[设计](../design.md) · [总计划](../plan.md) · [验证记录](../verification-record.md)

## 目标

在同一页面承载中央接入进度、Origin 管理、Key 生命周期和外部验收说明，并完成真实浏览器/R3/Git 闭环。

## 任务

- [x] UI-001：实现首次接入/维护两用 `PlatformIntegrationPage`。
- [x] ORIGIN-001：提取可嵌入 Origin section；新页可直接登记并刷新权威 facts。
- [x] KEY-001：提取可嵌入 Key section；保留 recent-MFA、确认、一次性明文、unknown outcome。
- [x] STATUS-001：新页读取 subscription config 并展示非阻塞商业配置状态；外部验证始终明确非自动。
- [x] E2E-001：synthetic browser 验证创建→接入页、进度变化、旧 URL、响应式和失败态。
- [x] E2E-002：Local Admin T12 覆盖 Key recent-MFA/创建/部署事实在新主入口不回归。
- [x] DOC-001：同步 onboarding guide、architecture、Admin DESIGN。
- [ ] REL-001：canonical R3 已通过；待 final diff/hygiene、GitHub main 与分支清理。

## 验证

- `pnpm --filter admin test:unit`
- `pnpm --filter admin typecheck`
- `pnpm --filter admin build`
- `node tests/spikes/e2e/admin-ux-local.mjs`
- `pnpm lint`
- `pnpm format:check`
- `pnpm docs:check`
- `git diff --check`
- `pnpm verify:task:0801`（最终候选，Local Supabase）

本阶段不新增 Supabase 远端状态；Hosted staging/Production 部署不适用。
