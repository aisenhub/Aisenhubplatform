# TODO 缺口收敛验证记录（2026-10-16）

本记录对应 [`plan.md`](plan.md)。候选工作树基于 `855a5ee1d45fa299971a678fe1a5a2c264b49039` 开始，最终提交即包含本文件的任务分支 commit；当前仓库绑定的 Supabase 目标 `workendstaging` 已执行本轮 migration / Edge Function 更新，独立正式 Production、Hosted 运维实证与真实 Provider 验收仍未执行。

## 1. 已完成实现

- Account 360 Identity 数据源改为独立 `source_state` 降级；业务 Workbench 不再因 Auth email lookup 503 整体失效。
- PlatformSwitcher 增加 `aria-activedescendant`、ArrowUp/Down/Home/End、Enter/Space 与真实浏览器 E2E 场景。
- Admin 最后四处裸 401/403 load-state 分桶收敛到 machine-code 分类；recent-MFA 文案/无用 5 分钟常量统一到权威 30 分钟语义。
- Admin Web 全局 framing/MIME/referrer/permissions headers 与强制 CSP 落地；T12 浏览器通过 `securitypolicyviolation` 监听验证整条候选流程 0 violation。
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

## 3. 完整 Local Release Gate — PASS

实际执行：`pnpm verify:task:0801`。

工具链预检 PASS：Node 24.x（baseline 24.19.0）、pnpm 11.18.0、Deno 2.9.6、Supabase CLI 2.111.0。Docker Desktop Linux engine 恢复后先清理旧 Local Supabase 端口映射并按当前 `config.toml` 重建，最终同一候选完整门禁通过。

- `TASK-0801 PASS: 24 executable gates passed`；
- Edge/API：115 passed / 0 failed；
- PostgreSQL：64 files / 1398 tests PASS，其中 `sec_admin_04_mfa_factor_lifecycle.sql` 17/17 PASS；
- Billing / System Admin / Admin MFA 并发脚本全部 PASS；
- Consumer Harness Local E2E：PASS；
- Admin T12 browser：登录、AAL1/AAL2、MFA、step-up、真实 GoTrue 三因子→受控 UI 删除→剩余双因子、session refresh、旧 recent-proof 清除、PlatformSwitcher 键盘行为、95 routes × 5 viewports、0 CSP violation 全部 PASS；
- docs：73 documents PASS；OpenAPI：Account 40 / Admin 78 operations PASS；Integration 11 capabilities / consumer compatibility 3 contracts、30 fields PASS。

## 4. 当前绑定 Supabase 目标部署 — PASS

目标：`workendstaging`（project ref `egsokuicabbxspkdccqe`）。该项目仍是当前 Admin Production 前端绑定的唯一 Supabase 测试项目，不冒充独立正式 Production 数据库。

- `supabase db push --linked --dry-run` 只识别 `20261016022824_admin_mfa_factor_lifecycle.sql` 为 pending；实际 push 成功，远端 migration history 现为 `20261013210107`、`20261014054854`、`20261016022824`。
- `account-api` 已重新部署为 v69，状态 `ACTIVE`，`verify_jwt=false`；本轮未改动的 `maintenance` v45 / `billing-webhook` v36 未做无意义重部署。
- 远端只读 smoke：`private.admin_mfa_factor_operations`、prepare/finalize 函数存在；`admin_executor` 有 prepare EXECUTE，`account_executor` 无该权限；当前 authorized operation 数为 0。
- Supabase Security Advisor 仍只有既知 `Leaked Password Protection Disabled` WARN；Performance Advisor 返回既有 unindexed-FK / unused-index INFO，本轮新增 `admin_mfa_factor_operations_cleanup_idx` 因刚部署尚未使用而出现在 unused-index INFO，不构成发布阻断。

## 5. 其余外部环境 / 决策 — NOT_RUN

以下不是仓库实现缺口，且当前指令没有提供足以安全执行真实环境写入/费用/支付/法务决策的目标与授权，因此本轮只完成 Runbook 和代码准备：

- Hosted Maintenance / Cron / Vault / alert 真实运行证据；
- Afdian 真实/受控付款与 Provider 合同验收；
- DB + Storage 真实恢复介质与 RPO/RTO 演练；
- personal-data retention days/source/reference 的业务/法务/财务决策；
- 任一具体真实 Consumer 的目标仓库/配置/发布验收；
- 独立正式 Production G0–G6、Secret/Key、HSTS、真实付款和发布观察；当前 `workendstaging` 的本轮 migration / `account-api` 更新不替代独立 Production 发布证据。

执行清单统一见 [`docs/development/runbooks/README.md`](../../development/runbooks/README.md)。这些事项没有真实环境证据时继续 `NOT_RUN`，不影响对“仓库侧准备已完成”的判断，也不得升级为环境 PASS。
