# Admin 平台中心化 IA 收口 Agent 交接

## 项目与计划

- 项目目录：`E:\Projects\Aisenhubplatform`
- 优化名称：Admin 平台中心化与双轨透镜信息架构收口
- 总计划：[plan.md](plan.md)
- 当前收口阶段：Phase 04 → Phase 11 串行执行
- 工作分支：`codex/admin-platform-centric-ia-hardening`
- 远程仓库：`https://github.com/aisenhub/Aisenhubplatform.git`
- 起始基线：`9dd9adc5b380cb999b05c8d74842959e4b132276`
- 发布分级：R3

## 必读顺序

1. 根 `AGENTS.md`、`docs/README.md`、`docs/agents.md`、`docs/guides/development-release-workflow.md`。
2. 本 Proposal 的 `design.md`、`plan.md`、当前 phase、`verification-record.md`。
3. `docs/decisions/0001-platform-account-boundaries.md`、`docs/architecture/modules/frontends.md`、Admin OpenAPI、`supabase/functions/account-api/admin.ts`、相关 migrations/tests 与 `apps/admin` 实现。

## 稳定执行规则

- 不恢复浏览器多平台 fan-out 作为 Global Identity 实现；identity 查询由受控 server/database boundary 完成。
- Admin recent-MFA 沿用当前数据库权威 policy，不在页面复制过期算法；proof 绑定 user/session。
- Billing 的 requery/resolve/Timeline/operation_id/If-Match 只有一套共享实现。
- URL 是 scope/filter/selected 对象的可复制真理来源；客户端隐式状态不能决定平台授权。
- 不制造不存在的 Global Delete、Identity Lock、Settlement 或“创建平台”假入口。
- 不修改历史已应用 migration；所有 SQL 修复用新 forward-fix migration。
- 每个阶段修改后重跑与风险匹配的测试；最终 R3 必须使用 Local Supabase 证据。
- `.tmp-admin-dashboard/` 是任务开始前已有未跟踪目录，不修改、不提交。

## 文件所有权

当前由同一实施 Agent 串行修改 migration/OpenAPI/Admin Edge/BFF/UI/tests/docs；这些共享合同文件不并行拆给其他 Agent。阶段间以最终 schema/API 兼容为前提。

## 禁止事项

不 force push、不删除生产数据、不部署生产、不发起真实支付、不改变费用、不关闭 MFA/RLS/权限来让测试通过。
