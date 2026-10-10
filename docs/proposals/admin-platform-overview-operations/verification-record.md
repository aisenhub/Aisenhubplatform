# OPT-004 实施与验证记录

## 基线

- 起始 main：`80a260bc43738b168d6521ccdbe51cb99eef929f`
- 分支：`codex/opt-004-platform-overview`
- 初始工作区：clean，`main == origin/main`。
- 环境：Local Windows + Docker Desktop + Local Supabase；Production 不在授权范围。
- 风险：R3。

## 阶段状态

| 阶段 | 状态 | 已完成 | 剩余 |
| --- | --- | --- | --- |
| 01 聚合合同 | PASS | migration/API/OpenAPI、权限、upgrade/fresh、DB/API/contracts、Admin BFF/unit | 无 |
| 02 Admin UI | 进行中 | Phase 01 已冻结 | Overview/browser/R3/Git closeout |

## 验证记录

| 日期 | 阶段 | 操作 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 预研 | main/worktree、Platform Overview、账户/订阅/订单 schema、Admin API/OpenAPI 重新核对 | Local | PASS：确认需新增权威聚合边界；Feedback/Gallery 尚不存在，收入口径不在本项实现 |
| 2026-10-11 | 01 | `pnpm exec supabase migration up --local` + 定向 `t22_admin_platform_overview.sql` | Local Supabase | PASS：migration 前向应用；16/16 pgTAP |
| 2026-10-11 | 01 | `pnpm test:api` | Local | PASS：97/97 |
| 2026-10-11 | 01 | Consumer Lab snapshot write + `contracts:check` + `contracts:breaking` | Local | PASS：Admin 48 operations；compatibility/breaking 均 PASS |
| 2026-10-11 | 01 | `pnpm test:db`（upgrade） | Local Supabase | PASS：62 files / 1146 tests |
| 2026-10-11 | 01 | `pnpm db:reset` + `pnpm test:db` | Local Supabase | PASS：fresh 应用至 `20261010223414`；62 files / 1146 tests |
| 2026-10-11 | 01 | `pnpm --filter admin test:unit` | Local | PASS：11 files / 51 tests，含 BFF/OpenAPI allowlist 48 operations |
| 2026-10-11 | 01 | format/lint/docs/diff | Local | PASS：392 files；lint 0/0；149 docs；diff clean；format 首次仅 Account API test 一文件不一致，定向格式化后复测通过 |

## 交接

- 当前无产品决策阻塞。
- 下一步：Phase 02 重构平台 Overview UI，补浏览器周期切换/错误/待办与 canonical R3。
- 不应重复实施：OPT-003 Identity lifecycle；Global Billing observability；后续 OPT-007/008/009/010 目标域。

