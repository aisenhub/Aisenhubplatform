# Admin 安全管理与 MFA 整改 Agent 交接

本文件是实施 Agent 的稳定入口，不记录日常进度。

## 项目与计划

- 项目目录：`E:\Projects\Aisenhubplatform`
- 优化名称：Admin 安全管理与 MFA 整改
- 总计划：[plan.md](plan.md)
- 设计：[design.md](design.md)
- 验证记录：[verification-record.md](verification-record.md)
- 远程仓库：`https://github.com/aisenhub/Aisenhubplatform.git`
- 当前阶段：`SEC-PROBE-00` 已开始；后续任务按依赖与实际验收推进

## 必读顺序

1. 根 `AGENTS.md`、`docs/README.md`、`docs/agents.md`。
2. `docs/guides/development-release-workflow.md`。
3. 本 Proposal 的 `design.md`、`plan.md`、当前阶段文件和 `verification-record.md`。
4. `docs/architecture/modules/identity-security.md`、`docs/architecture/modules/frontends.md`。
5. `docs/reference/api.md`、`docs/reference/contracts.md`、`docs/reference/configuration.md`。
6. `docs/guides/operations.md`；涉及 BFF/Auth/API 时再读 `docs/guides/platform-onboarding.md`。
7. 当前任务涉及的实际源码、迁移和测试。

## 通用执行提示词

```text
你正在实施 Admin 安全管理与 MFA 整改计划中的当前任务 ID；本轮用户已授权按修订计划开始执行。

先读取 docs/proposals/admin-security-mfa-hardening/agent-handoff.md、design.md、plan.md、对应 phase 文件和 verification-record.md，再核对真实代码、迁移、合同与测试入口。依赖未满足时只完成可独立准备，不能把阶段验收写成 PASS。

开始前报告任务 ID、起始 HEAD、分支、已有改动、R0/R1/R2/R3 及依据、受影响消费者、本地验证、本地 Supabase 验证、生产门槛和当前授权边界。基于最新已确认 main 创建 codex/<任务ID小写> 分支；工作区存在其他任务修改时不得自动 stash、覆盖或混入提交。

遵守已冻结契约：保持单管理员模型；授权只在服务端执行；错误码语义统一；Step-up 后不自动重放副作用；Account API 生成 request ID，异步最终事件以 operation/job ID 关联；原因优先允许列表代码；Factor ID 未验证不能作为证据；首因子注册有受限例外，应用在线路由拒绝删除最后因子，并记录 Supabase 原生绕行边界。

先保留失败用例，再做最小根因修复。同步所有受影响 OpenAPI、共享类型、BFF、API、SQL、UI、测试和当前架构文档。已应用迁移不得修改，使用新迁移 forward-fix。不得新增 RBAC、认证方式、依赖、外部服务或网页恢复后门。

完成后运行当前任务列出的真实验证。R3 必须完成适用的本地 Supabase、权限、并发、失败恢复和消费者兼容验证；没有证据不得写 PASS。更新 verification-record.md，检查最终 diff 和敏感信息，仅提交当前任务文件。生产部署、真实恢复、真实会话撤销、强制 CSP 和费用操作不在授权范围。
```

## 阶段文件与任务

- [阶段 00](phases/00-auth-probe.md)：`SEC-PROBE-00`
- [阶段 01](phases/01-operator-semantics.md)：`SEC-ADMIN-01`、`SEC-ADMIN-02`
- [阶段 02](phases/02-audit-integrity.md)：`SEC-TRACE-03`、`SEC-ACTION-04`
- [阶段 03](phases/03-mfa-integrity.md)：`SEC-STEPUP-05`、`SEC-MFA-06`
- [阶段 04](phases/04-observability-web-hardening.md)：`SEC-AUDIT-07`、`SEC-WEB-08`
- [阶段 05](phases/05-end-to-end-verification.md)：`SEC-VERIFY-09`

同一阶段中的任务仍然逐个派发和验收，不因为位于同一文件就自动连续执行。

## 共享文件与并行限制

以下文件或职责可能跨任务共享，不允许多个 Agent 同时修改：

- Admin OpenAPI 和合同检查脚本；
- `supabase/functions/account-api/admin.ts` 及入口 dispatch；
- Admin BFF catch-all route；
- Auth/MFA 适配与 Cookie/session 管理；
- 审计 SQL 迁移和投影；
- `admin-resource-utils.ts` 与共享确认框；
- Security、MFA 和 Audit 页面。

默认串行执行。如果用户明确启用多 Agent，只能并行研究或修改没有共享文件的独立范围，并指定单一集成人。

## 每个任务完成门槛

- [ ] 当前任务范围和验收条件全部完成。
- [ ] 必需检查和测试实际运行并按 PASS/FAIL/NOT_RUN/PARTIAL/BLOCKED 记录。
- [ ] R3 的本地 Supabase、权限、并发/恢复和合同证据完成。
- [ ] 相关 architecture/reference/guides 已同步。
- [ ] `verification-record.md` 已更新。
- [ ] 最终 diff 和敏感信息检查完成。
- [ ] commit、push、远端 SHA 按项目流程记录；生产部署状态单独记录。
