# OPT-002 实施与验证记录

## 项目与基线

- 任务：OPT-002 全局审计中心与概览去审计化。
- 起始 commit：`70beed4db0d7a39c641cb97683272f1730ee6bd5`。
- 分支：`codex/opt-002-global-audit`。
- 初始工作区：clean；`HEAD == origin/main`。
- 风险：R3（SQL security-definer + API/OpenAPI Contract + Edge + Admin UI）。
- Supabase：远端已授权开发/预发 `workendstaging`；Production 不在当前授权范围。
- Local Supabase 基线缺口：上一项结束时本机 Docker daemon 未运行，本项须重新探测/恢复；未恢复前相关验收不得写 PASS。

## 事实核验

- `public.audit_logs` 已存在 `platform_id/platform_account_id`，无需新增或回填 scope。
- 当前 `admin_audit_list` 没有返回 platform scope，也没有结构化 filters。
- Admin account transition 会把目标账户写入 `platform_account_id`，因此不能把该字段直接当 actor profile。
- 当前远端实际 audit 样本的 outcome 均允许为空；缺失结果必须显示“未记录”。
- Overview 当前 audit fetch 同时支撑“最近活动”和“最近变更的平台”，需要一起移除。

## 阶段状态

| 阶段 | 状态 | 已完成 | 剩余 |
| --- | --- | --- | --- |
| 01 Audit v2 数据/API/合同 | PARTIAL | migration、v2 SQL/API/OpenAPI、Deno tests、workendstaging migration/Edge/权限/筛选验证 | Local Supabase SQL fresh/upgrade/API 验收 BLOCKED |
| 02 Admin Audit UI + Overview | PARTIAL | Audit 业务语义表格/URL 筛选/Inspector、Overview 去审计、unit/typecheck/build/browser/docs/lint/format | R3 Local Supabase 后 final diff、commit/push/merge/main/branch clean-up |

## 验证记录

| 日期 | 阶段 | 命令/操作 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-10 | 预研 | main/worktree/branch/source/schema/OpenAPI tests 重新核对 | Local | PASS |
| 2026-10-10 | 预研 | 查询 audit event_type/target_type/outcome/platform 分布 | Remote workendstaging, read-only | PASS：现有样本均有 platform_id，outcome 当前均为空 |
| 2026-10-10 | 01 | `pnpm contracts:check` | Local | PASS：Admin 46 operations；Consumer Lab snapshot/compatibility PASS |
| 2026-10-10 | 01 | `pnpm contracts:breaking` | Local | PASS：相对 `origin/main` 无破坏性合同变更 |
| 2026-10-10 | 01 | Account API Deno tests | Local | PASS：45 passed / 0 failed |
| 2026-10-10 | 01 | migration/function/permission/filter/index synthetic assertions | Remote workendstaging | PASS：`20261010092449`、v2、admin-only execute、组合筛选、`unrecorded`、3 个索引均核对 |
| 2026-10-10 | 01 | Local Docker/Supabase 恢复 | Local | BLOCKED：Docker Desktop 进程可启动；Runner 无权限启动 `com.docker.service`，`dockerDesktopLinuxEngine` pipe 不存在 |
| 2026-10-10 | 02 | `pnpm --filter admin test:unit` | Local | PASS：10 files / 48 tests |
| 2026-10-10 | 02 | `pnpm --filter admin typecheck` | Local | PASS |
| 2026-10-10 | 02 | `pnpm --filter admin build` | Local | PASS：Next production build，`/admin/audit` 正常生成 |
| 2026-10-10 | 02 | `pnpm lint` / `pnpm format:check` | Local | PASS |
| 2026-10-10 | 02 | `pnpm docs:check` | Local | PASS：137 docs/links/navigation |
| 2026-10-10 | 02 | `node tests/spikes/e2e/admin-ux-local.mjs` | Local + synthetic HTTP | PASS：Overview 零 audit 请求；60 route/viewport 组合；Audit table/filter/cursor/Inspector/empty state；无 browser runtime exception |

## Remote Supabase 记录

- 项目：`workendstaging` (`egsokuicabbxspkdccqe`)。
- migration history 已记录 `20261010092449` / `admin_audit_list_v2`；三个 Audit v2 索引存在。
- `private.admin_audit_list_v2(...)` 存在，`admin_executor` 可执行、`account_executor` 不可执行；`private.audit_actor_email(uuid)` 不直接暴露给 `admin_executor`。
- `account-api` 为 ACTIVE v55，远端源码已包含 Audit v2 route/filter/DTO；本次核查没有重复部署。
- 合成只读断言：active admin context 可调用；limit=5 返回 5 条；platform/action/target 组合筛选匹配；`outcome=unrecorded` 只返回 outcome null。
- Security Advisor 仅报告项目既有 `pg_net` 位于 public schema、Leaked Password Protection 未开启两项 WARN；没有发现本次 Audit v2 新增的专项安全告警。Performance Advisor 将新索引标为“尚未使用”属于当前统计窗口信息，不据此删除新索引。

## GitHub 记录

尚未产生实施 commit/push/main merge。

## 当前环境缺口

Local Docker/Supabase 仍是唯一合并阻塞。已定位既有 Docker Desktop 到 `D:\APP\Base\DockerDesktop\Docker Desktop.exe` 并启动 GUI，但 `com.docker.service` 处于 stopped，当前 Runner 对该 Windows 服务没有启动权限；`docker info` 因 `dockerDesktopLinuxEngine` named pipe 不存在而失败。远端 staging 验证不能替代开发流程强制的 Local Supabase R3 证据，因此在管理员权限下启动 Docker Engine 并完成 SQL fresh/upgrade + Local API 断言之前，本项不得 merge main，也不得顺序进入 OPT-003。
