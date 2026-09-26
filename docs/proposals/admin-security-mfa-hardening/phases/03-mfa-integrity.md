# 阶段 03：MFA 证据与因子生命周期

状态：未开始

关联：[总计划](../plan.md) · [优化设计](../design.md) · [验证记录](../verification-record.md)

## 阶段目标

先保证 recent-proof 和高风险动作政策可信，再实现第二因子、安全删除、最后因子保护和会话刷新。按 `SEC-STEPUP-05`、`SEC-MFA-06` 顺序执行。

## 进入条件

- `SEC-PROBE-00` 的 Auth 行为和残余风险已有本地证据；阶段 01 完成，规范 request ID 已可进入安全审计。
- 开始前核对 Supabase 固定版本与当前官方 MFA、TOTP、session、signout 文档。
- 本地 Supabase 可启动；无法运行时只能完成独立准备，不得将阶段标记完成。

## 已核实调用链

- Admin MFA 页面：`apps/admin/app/admin/mfa/page.tsx`
- Security 页面：`apps/admin/app/admin/security/page.tsx`
- Account Auth Next.js 适配及浏览器 session manager。
- Admin proof issuance：`supabase/functions/account-api/admin.ts`
- Admin API tests 和 `tests/spikes/e2e/t12-r2-admin.mjs`。
- recent-proof、security helpers 和 factor 相关 migrations。

Agent 必须重新追踪 enroll -> challenge -> verify -> proof -> sensitive mutation -> factor unenroll -> session refresh 的真实链路。

## 任务清单

### `SEC-STEPUP-05`

- [ ] 验证 Factor ID 归属当前 user 且 verified。
- [ ] 无法证明本次使用的具体因子时降低审计精度，不信任请求头。
- [ ] 枚举全部 Admin mutation 并冻结 Step-up 矩阵。
- [ ] 每个 Admin OpenAPI operation 显式填写布尔 `x-requires-step-up`，遗漏即检查失败。
- [ ] 静态检查合同完整性，并用真实 HTTP 无 proof 负例证明标记为 true 的服务端路由执行校验。
- [ ] 覆盖本人、他人、未验证、任意 UUID、过期 proof、撤销 session。

### `SEC-MFA-06`

- [ ] 已有 verified factor 时可以新增第二因子。
- [ ] 显示名复用 Supabase `friendlyName`/`friendly_name`，不建重复表。
- [ ] 零 verified factor 的管理员允许受限首绑；已有因子时新增/删除要求现有因子的近期验证。
- [ ] 本项目在线路由拒绝最后因子删除；但已实测原生端点和双会话可删至零。删除入口保持发布阻塞，直到明确接受仅应用级保护，或设计并验证覆盖原生入口的全局策略；不得声称全局保证。
- [ ] 新 recent-proof 使同用户/会话旧 proof 失效；因子/session/管理员变化撤销 proof，并将到期数据纳入维护清理。
- [ ] 因子删除后刷新 session 状态并撤销旧 proof。
- [ ] pending 锁阻止双击 challenge/verify。
- [ ] 双标签注册不删除另一流程的未验证因子。
- [ ] UI 显示因子数和备用状态，UUID 降级到技术信息。

详细范围和验收以总计划对应任务卡为准。

## 状态与并发不变量

- 浏览器永远不决定 Factor 的所有权和 verified 状态。
- 注册流程只有在 verify 成功后才显示为可用因子。
- 应用服务端必须检查最后因子，不能只禁用按钮；本地实测证明原生 unenroll 可绕过且双会话会竞争。应用检查不能作为全局不变量，删除入口的发布决定必须独立记录。
- session/AAL 降级以 Supabase 官方行为为准；必要时刷新或重新登录。
- factor 变化立即使本项目 recent-proof 失效。
- 两个并发流程不得互相删除或认领 factor。
- 离线恢复不经过普通网页接口。

## 验证方案

| 检查 | 命令或方法 | 环境 | 预期结果 | 实际结果 |
| --- | --- | --- | --- | --- |
| Auth 单测 | `pnpm --filter @kit/account-auth-nextjs test:unit` | Local | 因子/session 行为通过 | 未运行 |
| Admin 单测 | `pnpm --filter admin test:unit` | Local | UI 状态与 pending 通过 | 未运行 |
| API | Account API Deno tests | Local | Proof/Factor 负向用例通过 | 未运行 |
| 合同 | `pnpm contracts:check` | Local | Step-up 标记一致 | 未运行 |
| 普通用户 proof | `pnpm test:api:t12-ordinary-proof` | Local Supabase | 普通用户被拒绝 | 未运行 |
| 因子生命周期 | 第一/第二/删除备用/最后因子及原生端点绕行 | Local Supabase | 记录实际允许/拒绝及最终因子集合 | 未运行 |
| 并发 | 双击、双标签 enroll/verify | Local browser + Supabase | 无重复或互删 | 未运行 |
| 会话恢复 | 删除 factor 后刷新与旧 proof | Local browser + Supabase | 旧 proof 失效 | 未运行 |

## 退出与恢复条件

- Factor 归属和 Step-up 合同测试通过后才能实现/交付因子管理 UI。
- 第二因子、最后因子拒绝、session 刷新、旧 proof 失效、双标签均有真实本地证据。
- Auth factor 不因代码回退自动删除。
- UI 入口先于 API 回退；数据库使用 forward-fix。
