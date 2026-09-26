# 阶段 00：固定版本 Auth 行为探针

状态：进行中（本地 Auth 行为已实测；status 路由尚不存在）

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## `SEC-PROBE-00`：范围与门槛

- 分级：独立文档与验证 R0；任何运行时代码或 Auth 合同修改按 R3 重新分级。
- 消费者：后续 `SEC-ADMIN-02`、`SEC-STEPUP-05`、`SEC-MFA-06`、`SEC-AUDIT-07`，Admin 操作员和运维。
- 只用本地 Supabase 2.111.0、合成管理员和普通用户；先核对 CLI、Docker、端点与当前官方 MFA 文档。不得用生产会话或管理员因子探测。
- 记录准确命令、版本、HTTP 结果、最终因子/AAL/session/proof 状态和脱敏证据；缺环境标 BLOCKED，不将静态代码推断写成实测。

## 执行顺序

1. 读取 `apps/admin/app/api/auth/mfa/`、`supabase/functions/account-api/admin.ts`、现有 recent-proof 迁移、Admin OpenAPI 和测试入口，确认当前首因子注册和状态门槛。
2. 核对固定版本 Supabase Auth 的 `enroll`、`verify`、`unenroll`、`refreshSession` 和 Auth audit 资料；记录与本地版本可能不同的官方最新行为。
3. 在两个独立合成会话中验证：零因子首绑、已有因子再绑、删除备用因子、最后因子删除竞争、直接调用原生 Auth unenroll 绕行、删除后的 AAL 刷新与 session 状态。观察服务端拒绝和最终因子集合，不只看按钮。本地已确认：原生 API 允许删最后因子；两个会话可同时删至零；删除后 AAL2 在 refresh 前仍可见，refresh 后降为 AAL1。
4. 用普通用户、AAL1 管理员、AAL2 管理员实际 HTTP 请求验证 status 入口能否置于全局 AAL2 gate 前；当前无 status 路由时记录基线缺口，不伪称成功。
5. 核对 Auth audit 来源是否启用、可读取、保留期是否明确。未启用时把后续安全事件范围限定为应用处理的操作。
6. 记录现有 `pnpm test:api` 的真实测试类型；为后续 Admin 实际 HTTP 身份与 Step-up 负例指定或建立可运行入口，不能把 Deno mock 用例当实际 HTTP。

官方核对入口：[Supabase MFA 指南](https://supabase.com/docs/guides/auth/auth-mfa)、[unenroll 合同](https://supabase.com/docs/reference/javascript/auth-mfa-unenroll)、[Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)。这些页面说明当前公开行为；最终结论仍以仓库固定版本和本地双会话证据为准。

## 退出条件

- 各项均有本地 Supabase / 实际 HTTP 证据或明确 BLOCKED 原因；绕行风险和后续发布判断写入验证记录。
- 首因子例外、最后因子保证边界、AAL 刷新时点及 Auth audit 来源在设计和阶段计划中一致。
- 后续 R3 任务的适用本地 Supabase 门槛不会因本探针阻塞而被豁免。
