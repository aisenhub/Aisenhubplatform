# System Admin 多管理员与灾备韧性验证记录

状态：Completed（2026-10-14）

本文件只记录实际执行结果。PASS / FAIL / NOT_RUN / PARTIAL / BLOCKED 按仓库验证口径使用。

## 1. 基线与范围

- 起始基线：`main@b141b1b94bab7ce6b65d29eb6cc037ba715d90e0`。
- 实施分支：`codex/s2-runtime-hardening`。
- 第一批实现提交：`cff4c26f372cf62492f07d698846a9c2f589ddbd`。
- 数据库变更使用 forward migration：`20261014054854_system_admin_resilience.sql`；未改写已应用 canonical migration。
- 验证只连接 Local Supabase；未连接或修改 Production Supabase，未执行 Production deploy、真实支付或成本变更。

## 2. 阶段结果

| 阶段 | 状态 | 主要结果 | 验证证据 |
| --- | --- | --- | --- |
| 01 Membership 基础 | PASS | `private.system_admin` 去 singleton；`pending/active` membership；active-only Admin 授权；Consumer 拒绝任意 admin membership；统一 advisory lock；2-active floor | forward migration Local PASS；`sec_admin_03` 28/28 PASS；完整 DB 63 files / 1381 tests PASS；并发 remove floor probe PASS |
| 02 Onboarding / MFA | PASS | Admin status/list/add/activate/remove；pending onboarding；双 verified TOTP 激活；独立 Admin identity；session/proof 撤销；Security UI | Edge/API 114/114 PASS；Admin/Workspace unit、typecheck、lint、build PASS；T12 browser flow PASS |
| 03 Recovery / 总验收 | PASS | `recovery_executor` add/activate/remove；双 TOTP 与 2-active readiness；运维/架构/reference 同步 | recovery pending/activate/remove/audit/readiness pgTAP PASS；Consumer Harness Local E2E PASS；最终 TASK-0801 22 gates PASS |

## 3. System Admin 数据库证据

`supabase/tests/sec_admin_03_system_admin_resilience.sql` 实际结果：**28/28 PASS**。覆盖：

- singleton 列退出、membership schema 与 executor capability；
- 两名 active + 每人双 verified TOTP 的 readiness；
- add 只产生 pending、operation id 幂等重放；
- pending 无普通 Admin 授权；
- 1 个 factor 不能激活，2 个 verified TOTP 才能激活；
- System Admin identity 不能进入 Consumer Principal；
- Consumer 业务 identity 不能直接提升为 System Admin；
- 三名 active 时可正常移除，移除立即撤销 Auth session 与 recent-proof；
- 正常路径不能降到 2 名 active 以下；
- offline recovery add 仍为 pending，activate 仍要求双 TOTP，remove 仍遵守 2-active floor；
- membership/recovery audit 与最终 readiness。

并发审查发现的 actor-check-before-lock 窗口已修正：add/activate/remove 先取得统一 `system-admin-membership` advisory lock，再在锁内重新校验 actor/session/recent-MFA 和 active floor。`tests/spikes/sql/system-admin-resilience-concurrency.mjs` 实际结果：**PASS: concurrent System Admin removals preserve the two-active floor**。

## 4. 最终 Local R3 验收

最终执行：

```text
pnpm verify:task:0801 --reuse-local
```

结果：**TASK-0801 PASS: 22 executable gates passed.**

关键明细：

- repository format / lint / typecheck / production build：PASS；
- workspace unit tests：PASS；
- tooling safety：9/9 PASS；
- Edge/API：114 passed / 0 failed；
- PostgreSQL pgTAP：63 files / 1381 tests PASS；
- settlement concurrency：PASS；
- prelaunch Commerce Price/Mapping concurrency：PASS；
- System Admin resilience concurrency：PASS；
- contract breaking check：PASS；
- Registry contract surface：PASS；
- Consumer Harness contract/smoke + Local E2E：PASS；
- Node/Deno runtime import boundary：PASS；
- Admin T12 browser flow：PASS，包括 AAL1/AAL2、MFA step-up、non-admin fail-closed、Config/Feedback governance、identity/account deep-link、logout 失效等；
- T12 responsive/a11y：320 / 375 / 390 / 768 / 1440，共 100 route observations，overflow / semantic controls / dialog focus / tab navigation 全部 PASS；
- docs check：216 documents PASS；
- OpenAPI：Account 40 operations / Admin 76 operations PASS；
- Consumer Lab snapshot 与 compatibility：PASS。

## 5. 验收期间发现并关闭的问题

最终验收期间额外关闭三类历史/测试适配问题：

1. Global Delete pgTAP 仍检查旧 `private.system_admin` 授权实现，已更新为 `private.active_system_admin`；
2. private RLS 测试硬编码 19 张表，新增 `system_admin_operations` 后改为结构性断言“所有 private 普通表均启用 RLS”；
3. T12 旧 fixture 复用 System Admin 作为 Consumer identity，与新专用管理员身份边界冲突；已拆成独立 Local Auth Consumer 用户，并完成 320px Security panel intrinsic-width 响应式修复。

上述修改均已被最终 22-gate 验收覆盖。

## 6. 结论

System Admin 多管理员与灾备韧性 proposal 已完成实现与 Local R3 验收。当前仓库已具备同权多管理员 membership、pending onboarding、双 TOTP readiness、数据库并发 2-active floor、专用管理员身份、session/recent-proof 撤销、offline recovery 与可调查审计；无剩余本 proposal 产品缺陷或验收阻断。
