# 阶段 03：Bootstrap、Break-glass 与总体验收

状态：Completed（2026-10-14）  
风险级别：R3

## 目标

把首次 bootstrap、单管理员失联的在线接管、全部管理员失联的离线恢复以及生产 readiness 形成明确 runbook，并完成整套 Local 恢复演练。

## 实施内容

1. 更新受控 bootstrap 流程：全新环境一次准备两个独立 dedicated Auth users 和 pending membership，不开放匿名 Web bootstrap。
2. 明确 Local/Test fixture 与 Production operator 流程的边界，所有脚本增加防误连 guard。
3. 更新 break-glass runbook：工单/恢复 ID、基础设施权限、限时 `recovery_executor`、Auth user 准备、membership 恢复、MFA 完成、激活、旧 session/proof 撤销、secret 轮换、审计和关闭恢复入口。
4. Admin Security 增加 readiness：active admin 数量、每个 active admin 的可信 factor readiness、Auth 用户不可用/不一致状态。
5. 定义不健康门槛：active `< 2` 或任一 active admin verified TOTP `< 2` 必须明确告警/阻断“已具备管理员灾备”的声明。
6. 同步当前 architecture/reference/operations，删除已不成立的 singleton 描述；旧 admin-security-mfa-hardening proposal 只保留其历史范围，不改写历史验证结果。

## Local 演练 A：单管理员完全失联

准备 A/B 两名 active admin。模拟 A 的 Auth/MFA 完全不可用：

1. B 独立登录并 recent MFA；
2. B 添加 C pending；
3. C 独立完成双 TOTP 并激活；
4. B 移除 A；
5. 验证 active admin 仍为 2（B/C）；
6. 验证 A 的旧 session/recent-proof 不可继续管理；
7. 核对完整 audit chain。

## Local 演练 B：全部管理员失联

模拟 A/B 均不可登录，正常 Admin API 不可用：

1. 启用限时离线 recovery capability；
2. 恢复/创建专用管理员 C；
3. 建立 pending membership，C 完成双 TOTP 后激活；
4. 再建立并激活 D，使 active admin 恢复到至少 2；
5. 撤销失效管理员 session/proof，检查 membership；
6. 关闭 recovery capability、轮换必要 secret；
7. 核对 recovery event/audit 和恢复耗时。

## 总体验证

- `pnpm docs:check`
- `pnpm contracts:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:db`
- 受影响 Account/Admin Deno tests
- `pnpm test:e2e:t12-r2`
- membership 并发 probe
- 两套 Local recovery drill

实际命令以实施时仓库入口为准；未运行不得记 PASS。

## 退出条件

- 正常在线路径、单管理员失联、全员失联三种场景都有可复核证据；
- 所有当前文档不再把 singleton 当作已实现架构；
- active admin 数量和 MFA readiness 有明确生产门槛；
- break-glass 不依赖隐藏常驻第二账号，也不暴露网页绕过入口。
