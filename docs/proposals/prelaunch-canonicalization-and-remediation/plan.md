# 预上线单轨化清理与缺陷修复总计划

状态：Completed（2026-10-14）；R-01～R-15、LC-01～LC-13、Local fresh 验收、指定测试环境、Git/main 与 Admin 托管发布已闭环。

关联：[设计](design.md) · [Agent 交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体策略

实施顺序固定为：

**冻结 canonical contract → 删除旧公共入口 → 收敛 Commerce → 收敛 Config → 收敛治理/幂等 → 修读模型/分页 → 修前端状态流 → schema rebaseline + 全量验证。**

任何阶段都禁止先为即将删除的 legacy 路径补 Bug。删除和修复有依赖关系时，以删除旧路径优先。

## 阶段与依赖

| 阶段 | 目标 | 主要覆盖 | 前置依赖 | 状态 | 详细计划 |
| --- | --- | --- | --- | --- | --- |
| 00 | 冻结预上线 breaking rebaseline 与环境删除边界 | 全局 | 无 | 已交付 | [阶段 00](phases/00-freeze-prelaunch-rebaseline.md) |
| 01 | 清理公共 Contract、Harness 与旧 URL surface | LC-03/05/08/09/10/11/13 | 00 | 已交付 | [阶段 01](phases/01-contract-and-surface-cleanup.md) |
| 02 | Commerce 数据模型与写路径单轨化 | LC-01/02/03/04/06/07/12；R-02/03/04/08/09/10 | 01 | 已交付 / ab27712 checkpoint | [阶段 02](phases/02-commerce-canonicalization.md) |
| 03 | Config / Storage 单轨化 | LC-05/07/10；R-12 | 01 | 已交付 / ab27712 checkpoint | [阶段 03](phases/03-config-storage-canonicalization.md) |
| 04 | 状态机、治理事件与幂等统一 | R-01/R-04/R-11；LC-07 | 02、03 | 已交付 / ab27712 checkpoint | [阶段 04](phases/04-governance-idempotency.md) |
| 05 | Summary、Pagination 与 QA 事实修复 | R-05/R-06/R-07/R-12 | 02、03、04 | 已交付 / ab27712 checkpoint | [阶段 05](phases/05-read-model-pagination-qa.md) |
| 06 | Admin 前端异步、切换、导航与规模边界修复 | R-13/R-14/R-15；LC-09 | 01、05 | 已交付 | [阶段 06](phases/06-admin-state-navigation-scale.md) |
| 07 | Prelaunch schema/migration rebaseline、reset 与完整验收 | LC-13 + 全部 R/LC | 02～06 | 已交付；fresh Local / workendstaging / main / Admin PASS | [阶段 07](phases/07-schema-rebaseline-and-release-verification.md) |

## 串行与并行

- 00、01 必须先串行完成，因为后续代码要以新 canonical contract 为目标。
- 02 Commerce 与 03 Config 在 01 以后可以并行，但不得同时修改共享 migration rebaseline 文件；各自只完成领域最终 schema/函数。
- 04 依赖 02/03，避免给 retired function 做幂等/状态机修复。
- 05 可以在 04 的 canonical 写模型稳定后进行。
- 06 的 R-13/R-14/R-15 可部分提前实现，但最终 E2E 必须等 05 数据合同稳定。
- 07 只能由一个集成人执行 schema squash/reset/contract baseline 更新，避免并发重写迁移与 snapshot。

## 环境与 destructive change 门槛

执行任何 reset/squash 前必须重新记录：

- Production 未部署/未使用本 schema；
- 目标 Supabase project 是 Local/Test/Staging；
- 测试平台数据可丢弃；
- 需要保留的 secret/config 已通过环境配置而非数据表人工记录；
- 当前 migration history 与 Edge version 已记录到 verification record。

若任一条件不成立，停止 destructive rebaseline，改为 forward cleanup migrations，但仍不重新引入业务兼容层。

## 全局验证门槛

计划中不预填 PASS。最终至少运行：

- `pnpm db:reset --yes`
- `pnpm test:db`
- `pnpm test:api`
- `pnpm test:unit`
- `pnpm test:consumer-harness`
- `pnpm test:e2e:consumer-harness`
- `pnpm test:e2e:t12-r2`
- `pnpm contracts:check`
- 新 contract baseline 建立后运行 `pnpm contracts:breaking`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm docs:check`
- `git diff --check`

针对并发/恢复必须额外加入本 Proposal 新测试，不能只依赖现有 settlement concurrency。

## 完成标准

- [x] R-01～R-15 均有关闭证据和回归测试。
- [x] LC-01～LC-13 已从最终 runtime/contract/schema/test/docs 清除或明确保留理由。
- [x] Account/Admin API 只有一套 canonical 商业/Config 行为。
- [x] retired function 无 executor grant。
- [x] 新 v1 contract 已成为新的 compatibility baseline，默认 breaking gate 恢复绿色。
- [x] Local fresh reset 与完整 gate 通过。
- [x] workendstaging 已完成 reset/deploy/只读核验，仅重建已授权测试数据。
- [x] 独立 Production Supabase/真实交易 NOT_RUN；现有 Admin Production 托管渠道经追加授权发布并核验。
