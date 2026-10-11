# Phase 01：Platform Sidebar scope 收敛

状态：Local R2 完成，待 Git closeout

关联：[设计](../design.md) · [总计划](../plan.md) · [验证记录](../verification-record.md)

## 任务

- [x] NAV-001：`AdminSidebar` 的 Platform 路由只使用 `platformNavigationGroups(platformId)`。
- [x] NAV-002：删除无消费者的 `adminGlobalUtilityNavigation` 及旧测试预期。
- [x] NAV-003：新增/强化测试，证明 Global 与 Platform 常驻菜单集合互斥且 mapper 不回归。
- [x] E2E-001：synthetic browser 证明平台范围无 Global 常驻入口，可通过 Switcher 返回 Global。
- [x] DOC-001：同步 `architecture/modules/frontends.md`、`apps/admin/DESIGN.md`，并在旧双透镜 Proposal 标注被 OPT-005 替代的导航条款。
- [ ] REL-001：完成 R2 适用验证、final diff、GitHub main 与分支清理。

## 验证

- `pnpm --filter admin test:unit`
- `pnpm --filter admin typecheck`
- `pnpm --filter admin build`
- `node tests/spikes/e2e/admin-ux-local.mjs`
- `pnpm lint`
- `pnpm format:check`
- `pnpm docs:check`
- `git diff --check`
- R2 canonical/local gate（按当前 release workflow 实际入口执行并记录）

本项无数据库、Edge、OpenAPI 或 Supabase 项目配置变更，远端 Supabase 部署不适用。

