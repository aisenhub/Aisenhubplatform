# OPT-007 配置资源系统计划

状态：In Progress

关联：[优化设计](design.md) · [实施交接](agent-handoff.md) · [验证记录](verification-record.md)

## 总体范围

从 `main@ec997111969c6abfda42f57abd179e6fc0bdfb8e` 在不破坏 Account v1 既有 `/config-files` 的前提下，把 private file ledger 升级为 Config / Version / Gallery 业务系统，并完成 Admin 审核治理、平台容量、Overview 待办、Global Delete 与 Consumer conformance。

风险分级：**R3**。

当前分支：`codex/opt-007-config-resource-system`。

## 阶段

| 阶段 | 目标 | 状态 | 详细计划 |
| --- | --- | --- | --- |
| 01 | Config/Version/Gallery 领域模型、物理容量与 legacy file 兼容 | 已完成 | [阶段 01](phases/01-domain-storage-compat.md) |
| 02 | Account v1 增量 API、private Storage 内容流、Consumer contract/Harness | 未开始 | [阶段 02](phases/02-account-consumer-contract.md) |
| 03 | Admin 审核/资源池/容量治理、Plan 槽位配置与 Overview 聚合 | 未开始 | [阶段 03](phases/03-admin-governance.md) |
| 04 | Global Delete/retention、备份真值、完整 E2E/R3/Git closeout | 未开始 | [阶段 04](phases/04-lifecycle-release.md) |

## 阶段发布规则

- Phase 01–03 每阶段数据库/Edge 合同完成并通过 Local 验证后，同步到授权 staging `workendstaging` 并记录 migration/function/Edge 证据。
- 不把 staging PASS 替代 Local Supabase R3。
- Production 未授权，不执行 Production migration/function deploy。
- 任一阶段出现权限、兼容或 unknown-outcome 阻塞时，不进入下一阶段。

## 总体验收

- [ ] legacy `/v1/config-files` 保持 v1 兼容并只暴露 legacy files。
- [ ] Config / Version / Gallery / Like / Usage 领域与权限边界落地。
- [ ] `config_slot_limit` 与平台总容量由服务端强约束，Admin 有明确配置入口。
- [ ] private Storage 状态机、unknown write、异步删除与 backup barrier 未被旁路。
- [ ] Account 新 API/OpenAPI/Harness 提供“我的配置 + 配置广场 + 一键应用交付”。
- [ ] Admin 可审核、移出/恢复/阻断 Gallery，且这些动作不删除个人 Config。
- [ ] Platform Overview 使用真实 pending review 聚合。
- [ ] Global Delete / retention 能停止公开访问并清理/匿名化新增数据。
- [ ] onboarding / architecture / Admin DESIGN / contracts 文档同步当前事实。
- [ ] canonical R3、staging、GitHub/main/分支清理闭环后再进入 OPT-008。

## 回退

- Schema 为 expand-first；Phase 01 起不删除 legacy file 列/函数/API。应用回退可以停止使用新 Config 路由，但不能回滚已经产生的 Config/Gallery 数据或删除迁移历史。
- 新 Gallery 入口可关闭读取/提交而保留个人 Config；private Storage 对象继续由现有 ledger/cleanup 管理。
- 容量下调不会自动删除数据；回退时恢复应用行为即可，不应通过 SQL 人工释放 reserved bytes。
