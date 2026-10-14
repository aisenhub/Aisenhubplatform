# System Admin 多管理员与灾备韧性验证记录

状态：PARTIAL（实现完成；最终 Local Docker 复验 BLOCKED）

本文件只记录实际执行结果。PASS / FAIL / NOT_RUN / PARTIAL / BLOCKED 按仓库验证口径使用，不把宿主环境故障记成业务失败。

## 1. 基线

| 项目 | 记录 |
| --- | --- |
| 起始 HEAD | `b141b1b94bab7ce6b65d29eb6cc037ba715d90e0` |
| 分支 | `codex/s2-runtime-hardening` |
| Supabase CLI | `2.111.0` |
| 实施日期 | 2026-10-14 |
| Production 授权 | 未授权；本次未连接或修改 Production Supabase、真实管理员、真实支付或成本配置 |

## 2. 阶段记录

| 阶段 | 状态 | 主要变更 | 验证 | Commit/Push |
| --- | --- | --- | --- | --- |
| 01 Membership 基础 | PARTIAL | `private.system_admin` 去 singleton；`pending/active` membership；active-only Admin 授权投影；Consumer 拒绝任意 membership；统一 advisory lock；2-active 下限；新并发 probe | migration 在隔离 Supabase schema clone 完整 COMMIT PASS；`sec_admin_03` 28/28 PASS；随后发现并修正 actor-check-before-lock 并发竞态，最新锁顺序的 Local 并发复验因 Docker 服务 BLOCKED | 待总体验收后提交 |
| 02 Onboarding / MFA | PARTIAL | Admin status/list/add/activate/remove API；pending onboarding gate；双 verified TOTP 激活；双 TOTP 添加 UI；Security members/readiness；session/proof 撤销；OpenAPI 76 operations | Edge/API 114/114 PASS；Admin unit 73/73 PASS；workspace typecheck/lint/build/contracts PASS；最新 Local 浏览器 E2E 因 Docker 服务 BLOCKED | 待总体验收后提交 |
| 03 Recovery / 总验收 | PARTIAL | `recovery_executor` add/activate/remove；恢复仍遵守双 TOTP 与 2-active 下限；运维 runbook/readiness/reference/architecture 同步 | `sec_admin_03` 已验证 recovery pending/activate/remove/audit/readiness；最终 Local DB 全回归、并发 probe 与浏览器恢复矩阵因 Docker 服务 BLOCKED | 待总体验收后提交 |

## 3. 已实际通过的 System Admin 数据库证据

在包含 Supabase Auth/schema 的隔离 clone 上，forward migration `20261014054854_system_admin_resilience.sql` 已完整执行并 COMMIT。随后 `supabase/tests/sec_admin_03_system_admin_resilience.sql` 实际得到 28/28 PASS，覆盖：

- singleton 列退出、membership schema 与 executor capability；
- 两名 active + 每人双 verified TOTP 的 readiness；
- add 只产生 pending、operation id 幂等重放；
- pending 无普通 Admin 授权；
- 1 个 factor 不能激活、2 个 verified TOTP 可以激活；
- System Admin identity 不能进入 Consumer Principal；
- Consumer 业务 identity 不能直接提升为 System Admin；
- 三名 active 时可正常移除，移除立即撤销 Auth session 与 recent-proof；
- 正常路径不能降到 2 名 active 以下；
- offline recovery add 仍为 pending，activate 仍要求双 TOTP，remove 仍遵守 2-active 下限；
- membership/recovery audit 与最终 readiness。

该次 28/28 PASS 之后，代码审查又识别到一个真实并发窗口：两个 actor 可在等待 membership lock 前同时通过 actor 校验。migration 已调整为 add/activate/remove **先取得统一 membership advisory lock，再重新校验 actor/session/recent-MFA**。该调整保持函数签名和单事务状态机不变，但最新版本仍必须实际重跑并发 probe 后才能把阶段 01 记为 PASS。

## 4. 非 Docker 质量门

2026-10-14 当前工作树实际执行：

| 验证 | 结果 |
| --- | --- |
| `pnpm format:check` | PASS：415 files |
| `pnpm lint` | PASS：350 files，0 warnings / 0 errors |
| `pnpm typecheck` | PASS：5 tasks |
| `pnpm test:unit` | PASS：Domain 12、UI 36、Admin 73 |
| `node tooling/scripts/src/api-tests.mjs` | PASS：114 passed / 0 failed |
| `pnpm contracts:check` | PASS：Account 40 operations、Admin 76 operations；Consumer Lab snapshot 与 compatibility PASS |
| `pnpm contracts:breaking` | PASS：against `origin/main` |
| `pnpm test:tooling` | PASS：9/9 |
| `pnpm test:registry` | PASS：manifest/contracts/harness/Admin Lab/browser secret boundary |
| `pnpm test:consumer-harness` | PASS：contract + smoke |
| `pnpm runtime:probe` | PASS：Node + Deno shared Edge boundary |
| `pnpm docs:check` | PASS：216 documents |
| `pnpm build` | PASS：Admin Next.js production build |

## 5. 当前 Local 验证阻断

最终数据库/并发/浏览器复验未能继续，不是断言失败，而是宿主 Docker Desktop 服务不可用：

- `docker ps` 无法连接 `npipe:////./pipe/dockerDesktopLinuxEngine`；
- `sc query com.docker.service` 显示 Windows `com.docker.service` 为 `STOPPED`；
- 当前 Runner 执行 `sc start com.docker.service` 返回 `Access is denied`，无法提权启动宿主服务；
- 已尝试 Docker Desktop stop/start 与非破坏性 `wsl --terminate docker-desktop`，仍无法在当前权限边界恢复 Docker API。

因此以下最新版本验收保持 BLOCKED / NOT_RUN，而不是 FAIL：

1. 在真实 Local Supabase 上重新应用最新 migration；
2. 重跑 `sec_admin_03_system_admin_resilience.sql`；
3. 运行 `pnpm test:sql:system-admin-resilience-concurrency`，证明两个并发 remove 最终始终保留至少 2 名 active；
4. 重跑完整 `pnpm test:db`；
5. 重跑适用的 Admin Local E2E（含 pending/onboarding/独立管理员登录与失效 session）。

## 6. 结论

System Admin 多管理员、双 TOTP readiness、在线 membership 生命周期、2-active 保护、Consumer 身份隔离、session/proof 撤销和 offline recovery 的实现已落地；静态、API、合同、单元与构建门均通过。当前唯一未关闭项是 **宿主 Docker 服务权限导致的最终 Local R3 验收阻断**。在上述 5 个 Local gate 实际 PASS 前，本 proposal 不标记 Completed，也不进入 main/Production 发布。
