# System Admin 多管理员与灾备韧性实施计划

状态：Completed（2026-10-14）  
制定日期：2026-10-14  
设计：[design.md](design.md)  
执行规则：[Agent 开发与发布流程](../../guides/development-release-workflow.md)  
实施入口：[Agent 交接](agent-handoff.md) · [验证记录](verification-record.md)

## 1. 任务目标

把当前单例 `private.system_admin` 改造成至少两名独立 System Admin 可在线互相接管的管理员 membership 模型，并把双 TOTP、管理员生命周期、last-two 保护、审计与 break-glass 形成可验证闭环。

计划生成本身为 R0 文档变更；后续实际实施涉及数据库/Auth/MFA/权限/恢复，整体按 **R3** 执行。

## 2. 已冻结的跨阶段契约

1. System Admin 只有一个权限级别，不引入 RBAC。
2. `private.system_admin` 是管理员 membership 的权威来源；JWT metadata 不是授权来源。
3. membership 至少有 `pending / active` 两个语义状态；只有 active 计入可用管理员数量。
4. 正常运行 active System Admin 数量必须 `>= 2`。
5. 新管理员满足至少 2 个 verified TOTP 后才能从 pending 激活。
6. 在线 add/activate/remove 全部要求 active actor + AAL2 + recent MFA + audit。
7. membership mutation 必须在数据库 private domain function 中串行化；Admin API/BFF/UI 不复制“最少管理员数量”算法。
8. 正常路径与 break-glass recovery 都不得使 active 数量 `< 2`；recovery 的特殊性只在于可从受控离线基础设施入口恢复 membership，不降低安全下限。
9. System Admin 使用专用 Auth identity，不直接提升已有 Consumer 业务账号。
10. 开发 fixture 可以直接准备合成 membership；Production 日常操作不以手工 SQL 作为产品路径。

## 3. 影响范围

| 层 | 预期影响 |
| --- | --- |
| PostgreSQL | `private.system_admin` schema、membership domain functions、权限、审计、并发保护 |
| Account/Admin API | membership 判定、pending onboarding、add/activate/remove、session/recent-proof 撤销 |
| Supabase Auth | 专用管理员用户、factor 可信查询、session 撤销 |
| Admin BFF/UI | Security 管理员列表、readiness、添加/激活/移除流程 |
| Contracts | Admin OpenAPI/security status/错误码和 mutation 合同 |
| Tests | DB 并发、API Auth/MFA、Admin E2E、bootstrap/recovery 演练 |
| Docs | architecture、reference、operations、旧 MFA proposal 的关系说明 |

普通 Consumer HTTP contract 不应增加管理员管理接口，但必须回归“任意 System Admin identity 不能构造普通业务 Principal”。

## 4. 阶段与依赖

| 阶段 | 目标 | 风险 | 依赖 | 文档 |
| --- | --- | --- | --- | --- |
| 01 Membership 基础 | 去除 singleton 假设，建立 pending/active membership 与并发安全最小数量规则 | R3 | 无 | [阶段 01](phases/01-membership-foundation.md) |
| 02 Onboarding 与 MFA readiness | 建立 Admin add/activate/remove、双 TOTP 激活和 UI/API 闭环 | R3 | 01 | [阶段 02](phases/02-onboarding-and-mfa-readiness.md) |
| 03 灾备与总体验收 | 建立 bootstrap/break-glass、readiness、恢复演练并同步当前架构文档 | R3 | 01、02 | [阶段 03](phases/03-recovery-and-verification.md) |

默认串行。阶段 02 的 UI 与 API 单测可在合同冻结后并行开发，但共享 migration、OpenAPI、安全状态和 membership domain function 不并行修改。

## 5. 当前代码证据与需退出的 singleton 假设

当前基线已确认：

- `private.system_admin` 使用 `singleton_id smallint default 1 check (singleton_id = 1)`；
- `docs/reference/data-model.md` 仍定义 singleton；
- `identity-security.md` 明确“system_admin singleton 保证最多一名管理员”；
- 多个 Local/API/E2E fixture 通过 `on conflict (singleton_id) do update` 暂时替换测试管理员；
- 当前 MFA 设计已支持备用 TOTP，但旧 proposal 明确不做多管理员；
- 当前运维 runbook 通过离线替换 singleton 恢复管理员。

实施必须逐项退出这些 singleton 假设，不保留“双轨 singleton + membership”兼容层。

## 6. 验证总矩阵

至少覆盖：

- Fresh Local DB 与当前 schema 升级；
- 0/1/2/3 active membership 边界；
- 两个会话并发移除，最终 active 数永远不低于 2；
- pending 用户不能访问普通 Admin 业务；
- 1 个 factor 不能激活，2 个 verified factor 可以激活；
- 非管理员、pending、active AAL1、active AAL2、recent MFA 过期语义；
- 管理员删除后旧 session/recent-proof 失效；
- 两名管理员独立登录和执行同权限操作；
- System Admin identity 继续被普通 Consumer Principal 拒绝；
- 单管理员完全失联时由另一管理员在线替换；
- 全员失联时离线 break-glass 可恢复且无网页绕过；
- membership/factor/recovery 审计不泄露 secret。

## 7. 最低命令与证据

实施阶段按实际改动至少执行适用的：

- `pnpm docs:check`
- `pnpm contracts:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:db`
- Account API / Auth 定向 Deno tests
- `pnpm test:e2e:t12-r2`
- 新增的 membership 并发/恢复 probe

命令存在不等于覆盖需求；阶段计划要求的新增场景必须真正进入 runner 并实际执行。

## 8. 发布与回退

实际实现为 R3。Production 发布前必须核对：

- migration 顺序、当前管理员数据转换和回退/forward-fix；
- 至少两个专用管理员 Auth identity 已准备；
- 每个管理员的 MFA readiness；
- membership mutation API/UI 与旧版本兼容窗口；
- 恢复凭据、`recovery_executor`、审计和 session 撤销路径；
- main 推送是否自动部署以及用户对目标 Production 动作的明确授权。

不得以恢复旧 singleton schema 的方式回滚已产生的新 membership 数据。数据库失败恢复优先 forward-fix；必要时应用可以临时停止管理员 membership mutation，但不能降低现有 Auth/AAL2 安全边界。

## 9. 总体验收

所有阶段完成后：

1. 目标架构的所有不变量均有自动化或 Local 演练证据；
2. 没有残留 `singleton_id = 1` 业务授权假设；
3. 两名 active 管理员的独立恢复链已核验；
4. 在线路径无法降到少于两名 active admin；
5. break-glass 仅存在于受控离线 runbook；
6. architecture/reference/guides 已同步为实际实现；
7. proposal 才可从 Proposed/In Progress 更新为 Completed。

