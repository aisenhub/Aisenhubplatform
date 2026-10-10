# 阶段 02：全局审计中心 UI 与 Overview 去审计化

状态：实施完成；最终 R3/Git 闭环 BLOCKED

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

在 Phase 01 的 v2 合同基础上，把 `/admin/audit` 重构成业务可读的全局审计中心，并完全移除 Overview 对审计流水的展示和数据依赖。

## 进入条件

- Phase 01 v2 API 已在任务代码中完成并通过适用合同/测试。
- `workendstaging` migration + account-api 已同步并验证兼容。
- 若 Local Supabase 必需验证仍因环境 BLOCKED，可继续编写 UI，但不能跳过最终 R3 合并门槛。

## 变更范围

- `apps/admin/app/admin/audit/page.tsx`
- 新 `apps/admin/features/audit/admin-audit-model.ts` + tests
- `apps/admin/features/overview/admin-overview-page.tsx`
- `apps/admin/features/overview/admin-overview-model.ts` + tests
- `apps/admin/components/navigation/admin-navigation.ts`
- `apps/admin/DESIGN.md`
- Browser E2E / synthetic fixture
- architecture/reference/proposal 文档同步

## 任务清单

- [x] UI-001：建立 Audit action/target/actor/outcome 中文展示模型，未知 raw code 可回退。
- [x] UI-002：筛选区增加 actor/platform/action/target/outcome/q，并以 URL 作为可分享查询状态；变更筛选清 cursor。
- [x] UI-003：主列表改为“操作者 / 平台范围 / 对象 / 操作 / 结果 / 时间 / 详情”。
- [x] UI-004：Inspector 上层业务摘要、技术详情保留 raw code/UUID/request id。
- [x] UI-005：平台选择读取 Admin platform list；有界列表不伪装为全量，仍保留 q/UUID 能力。
- [x] OVERVIEW-001：删除 audit SourceState/loadAudit/最近活动/最近变更平台及相关 health 依赖。
- [x] OVERVIEW-002：同步 Overview/nav/Admin DESIGN 文案。
- [x] TEST-001：更新 Overview model tests，新增 Audit model tests。
- [x] TEST-002：浏览器覆盖组合筛选、清除、分页、Inspector、空/错/加载、桌面/窄屏，以及 Overview 不再调用 audit fixture。
- [ ] REL-001：全量适用验证、最终 diff 审查、Git push/main、Supabase/main 一致性和分支清理。

## 验证矩阵

| 检查 | 环境 | 预期 | 实际 |
| --- | --- | --- | --- |
| Admin unit/typecheck/build | Local | PASS | PASS：unit 48/48、typecheck、production build |
| lint/format/diff | Local | PASS | lint/format PASS；final diff 收口中 |
| docs/contracts | Local | PASS | PASS：docs、contracts、breaking check |
| Admin Browser E2E | Local + synthetic/Local API | 新筛选和 Overview 去审计化均 PASS | PASS：60 个 route/viewport 组合 + Audit v2/Overview 专项断言 |
| R3 Local Supabase/API | Local | Phase 01 + Admin consumer 最终版本 PASS | BLOCKED：Docker Engine 服务权限/pipe 不可用 |
| Remote compatibility | workendstaging | 远端 v2/API 与最终 main 一致 | PASS：migration/function/权限/filter/index 均核对；UI 尚未合并 main |
| GitHub | Remote | final main SHA 可核对，branch 清理 | 未运行 |

## 退出与恢复

所有必需 R3 本地证据、UI 证据、远端已授权 Supabase 同步和最终 diff 均无 FAIL/BLOCKED 后才可自动合并 main。若 UI 需要回退，Phase 01 的 v2 是向前兼容扩展，旧 UI/旧 Edge v1 路径仍可运行。
