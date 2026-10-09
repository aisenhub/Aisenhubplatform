# Phase 05：近期 MFA 安全边界收敛

状态：Completed（待整体验收收口）

关联：[总计划](../plan.md) · [设计](../design.md) · [ADR-0001](../../../decisions/0001-platform-account-boundaries.md) · [验证记录](../verification-record.md)

## 阶段目标

让账户生命周期敏感变更和 Billing 人工管理动作统一依赖服务端 recent-MFA proof，禁止只依赖 AAL2 或 UI 提示。沿用仓库当前已实施的 **Admin recent-MFA 最长 30 分钟** policy，不重新发明窗口算法。

## 安全不变量

- proof 必须绑定当前 Admin user + session，由 `private.admin_step_up_valid` 权威验证。
- 浏览器不直接提交任意 proof；Next BFF 仅从受控 recent-proof cookie 转发 `X-Recent-Auth-Proof`。
- `RECENT_MFA_REQUIRED` 必须由服务端返回，UI 只能提示，不构成授权边界。
- 账户 `PATCH status` 不能成为绕过 suspend/restore/close step-up 的旁路。
- Billing requery/resolve 保留 `If-Match`、`operation_id`、原因、未知结果恢复和审计；新增 MFA 不得破坏原幂等语义。

## 任务清单

- [x] `PATCH /platforms/:id/accounts/:accountId` 在状态写入前调用 `adminStepUp`，关闭敏感状态旁路。
- [x] suspend/restore/close POST 显式限制 method 并在数据库 transition 前调用 `adminStepUp`。
- [x] Billing `requery` 与 `resolve` 在产生 side effect 前调用 `adminStepUp`。
- [x] OpenAPI 为上述操作增加 `x-requires-step-up: true` 与 `StepUpRequired` 403 响应。
- [x] 更新 Admin OpenAPI info/ADR/architecture，明确当前 30 分钟最长窗口以及涵盖的动作，并区分普通用户 5 分钟 recent proof。
- [x] 增加 Edge/Local HTTP 负向测试：AAL2 但无 proof 明确拒绝；有效 server-issued proof 才进入领域函数。
- [x] 保留现有 BFF recent-proof HttpOnly cookie 自动转发边界，页面不拼 `X-Recent-Auth-Proof`。

## 验证方案

| 检查 | 环境 | 通过依据 |
| --- | --- | --- |
| Edge unit | Deno/Node unit | 敏感 endpoint 在领域 SQL 前调用 `admin_step_up_valid`；无效 proof 得 403 |
| Local HTTP | Local Supabase + Account API | AAL2 但无 recent proof 被拒；新 proof 成功；过期/其他 session proof 被拒 |
| Billing 恢复 | Local Provider Mock/SQL | 同 operation_id 重放仍恢复原结果；MFA 不改变 If-Match/unknown outcome 语义 |
| Contract | `pnpm contracts:check` | x-requires-step-up 与响应合同一致 |

## 退出条件

任何账户状态旁路或 Billing 管理写入口仍可仅靠 AAL2 成功，则本阶段不得完成。
