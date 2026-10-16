# TODO 缺口收敛验证记录（2026-10-16）

本记录对应 [`plan.md`](plan.md)。候选工作树基于 `855a5ee1d45fa299971a678fe1a5a2c264b49039` 开始，最终提交即包含本文件的任务分支 commit；生产/Hosted/真实 Provider 均未执行。

## 1. 已完成实现

- Account 360 Identity 数据源改为独立 `source_state` 降级；业务 Workbench 不再因 Auth email lookup 503 整体失效。
- PlatformSwitcher 增加 `aria-activedescendant`、ArrowUp/Down/Home/End、Enter/Space 与真实浏览器 E2E 场景。
- Admin 最后四处裸 401/403 load-state 分桶收敛到 machine-code 分类；recent-MFA 文案/无用 5 分钟常量统一到权威 30 分钟语义。
- Admin Web 全局 framing/MIME/referrer/permissions headers 与 CSP Report-Only 落地。
- verified TOTP 删除新增数据库 serialized prepare/finalize、短租约 durable operation、factor floor、proof invalidation、Provider outcome reconciliation、session refresh、UI confirm/step-up 和并发自动测试入口。
- Admin canonical OpenAPI 从 76 增至 78 operations；Account 仍为 40，Integration capability 仍为 11。
- Hosted Maintenance、Afdian、备份恢复、Retention、Production 执行步骤拆入 `docs/development/runbooks/`。

## 2. 当前候选 PASS

| 检查 | 结果 |
| --- | --- |
| `pnpm format:check` | PASS；418 files |
| `pnpm lint` | PASS；0 warnings / 0 errors |
| `pnpm typecheck` | PASS；workspace typecheck |
| `pnpm build` | PASS；Admin Next.js production build，15 static pages + dynamic routes 正常生成 |
| `pnpm test:unit` | PASS；workspace unit suites |
| `pnpm --filter admin test:unit` | PASS；75 tests |
| Account API Deno `index.test.ts` | PASS；52 tests |
| `pnpm test:tooling` | PASS |
| `pnpm test:maintenance` | PASS；26 tests |
| `pnpm test:consumer-harness` | PASS；test-only boundary / forbidden imports / smoke |
| `pnpm runtime:probe` | PASS；Node + Deno shared Edge import |
| `pnpm docs:check` | PASS；73 documents / links / navigation |
| `pnpm contracts:check` | PASS；Account 40 / Admin 78 / Integration 11 / consumer compatibility 3 contracts, 30 fields |
| `git diff --check` | PASS（仅 Git 提示 `TODO.md` 工作树 CRLF 将来转 LF，不是 whitespace error） |

## 3. 完整 Local Release Gate — BLOCKED

实际执行：`pnpm verify:task:0801`。

工具链预检 PASS：Node 24.x（baseline 24.19.0）、pnpm 11.18.0、Deno 2.9.6、Supabase CLI 2.111.0。

随后在第一步 `start Local Supabase` 退出 1：

```text
failed to inspect container health: failed to connect to the docker API at
npipe:////./pipe/dockerDesktopLinuxEngine
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
TASK-0801 failed: start Local Supabase (exit 1)
```

额外诊断：Docker Desktop 可执行文件位于 `D:\APP\Base\DockerDesktop\Docker Desktop.exe`；CLI 曾短暂把 Desktop 拉到 `running`，但 Linux engine 随后再次退出。Windows `com.docker.service` 当前为 `Stopped`，当前 Runner 调用 `Start-Service com.docker.service` 被操作系统拒绝（无服务管理权限），因此不能稳定提供 Local Supabase 所需 Linux engine。

结论：这是**本机执行环境权限阻塞**，不是 migration/pgTAP/Auth 用例失败。以下当前候选用例因此保持 `BLOCKED/NOT_RUN`，不能借用旧 HEAD 或 Hosted 结果冒充：

- 新 migration 的空库 reset / DB 权限验证；
- `sec_admin_04_mfa_factor_lifecycle.sql`；
- `admin-mfa-factor-concurrency.mjs` 双 session 并发；
- 真实 Local Supabase TOTP enroll/delete/session refresh；
- Admin browser PlatformSwitcher/MFA/CSP 回归；
- `verify:task:0801` 后续 SQL/API/E2E/backup-recovery 链。

恢复方法：由具有本机服务权限的操作者启动 `com.docker.service` / Docker Desktop Linux engine，再在**同一候选**运行 `pnpm verify:task:0801`。禁止修改测试 URL 指向 Hosted/Production 规避该门槛。

## 4. 外部环境 / 决策 — NOT_RUN

以下不是仓库实现缺口，且当前指令没有提供足以安全执行真实环境写入/费用/支付/法务决策的目标与授权，因此本轮只完成 Runbook 和代码准备：

- Hosted Maintenance / Cron / Vault / alert 真实运行证据；
- Afdian 真实/受控付款与 Provider 合同验收；
- DB + Storage 真实恢复介质与 RPO/RTO 演练；
- personal-data retention days/source/reference 的业务/法务/财务决策；
- 任一具体真实 Consumer 的目标仓库/配置/发布验收；
- Production G0–G6、migration、Secret/Key、强制 CSP/HSTS、真实付款和发布观察。

执行清单统一见 [`docs/development/runbooks/README.md`](../../development/runbooks/README.md)。这些事项没有真实环境证据时继续 `NOT_RUN`，不影响对“仓库侧准备已完成”的判断，也不得升级为环境 PASS。
