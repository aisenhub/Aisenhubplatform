# OPT-002 Agent 执行交接

## 项目与计划

- 项目：`E:\Projects\Aisenhubplatform`
- 任务：OPT-002 全局审计中心与概览去审计化
- 起始 main：`70beed4db0d7a39c641cb97683272f1730ee6bd5`
- 当前分支：`codex/opt-002-global-audit`
- 风险：R3
- 远端开发/预发 Supabase：`workendstaging / egsokuicabbxspkdccqe`
- 正式设计：[design.md](design.md)
- 总计划：[plan.md](plan.md)

## 必读顺序

1. `AGENTS.md`、`docs/README.md`、`docs/agents.md`、`docs/guides/development-release-workflow.md`。
2. 本 Proposal 的 design/plan/当前 phase/verification-record。
3. `apps/admin/DESIGN.md`、`docs/architecture/modules/frontends.md`。
4. `audit_logs` schema、`admin_audit_list`、Account API Admin audit 路由、OpenAPI、Audit/Overview 页面。

## 关键架构结论

- 底表已有权威 `platform_id/platform_account_id`；不要新增重复 scope 或从 target 推断。
- `platform_account_id` 可能是受影响账户，不是通用 actor profile 指针。
- actor 以 `actor_type + actor_user_id` 为权威；用户 display_name 仅在账户 owner 与 actor_user_id 一致时补充。
- outcome 为空就是“未记录”，不能默认成功。
- v1 SQL 保留，新增 v2 兼容投影。
- Overview 必须连同“最近变更的平台”一起解除 audit 依赖。

## 执行边界

只实施 OPT-002。不要提前迁移 OPT-003 的 Operations 路由，不做 OPT-004 指标，不调整 OPT-005 平台 sidebar。

Phase 01 含远端 Supabase 变更：本地适用验证完成后同步 `workendstaging` migration + account-api，并在进入 Phase 02 前记录远端事实。本机 Docker 不可用时不能伪装 Local Supabase PASS。

## 完成门槛

- [ ] Phase 01 数据/API/合同与远端同步完成。
- [ ] Phase 02 Admin UI/Overview 与回归完成。
- [ ] 必需 R3 Local 验收不存在未豁免 BLOCKED。
- [ ] GitHub/main 与 Supabase 最终状态一致。
- [ ] 本地/远端任务分支删除后才进入 OPT-003。
