# OPT-007 验证记录

状态：In Progress

## 阶段状态

| 阶段 | 状态 | 已有证据 | 下一步 |
| --- | --- | --- | --- |
| 01 领域/Storage 兼容 | DONE | 三条 migration、legacy 隔离、Config/Version/Gallery/Like/Usage primitives、fresh+upgrade 63/1209、staging/advisors 已验证 | Phase 02 Account/Consumer |
| 02 Account/Consumer | READY | Phase 01 DB 权威边界与 staging 已完成 | 增量 v1 API / OpenAPI / Consumer Harness |
| 03 Admin 治理 | NOT_STARTED | 无 | Phase 02 完成后实施 |
| 04 Lifecycle/Release | NOT_STARTED | 无 | Phase 03 完成后实施 |

## 事实与验证日志

| 日期 | 范围 | 命令/来源 | 环境 | 结果 |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 基线 | Git / latest main | Local | PASS：OPT-006 closeout 后 `main@ec997111969c6abfda42f57abd179e6fc0bdfb8e`，新分支 `codex/opt-007-config-resource-system` |
| 2026-10-11 | 预研复核 | SQL / Account+Admin OpenAPI / Consumer Harness / Admin Files / Overview | Source | PASS：legacy `/v1/config-files` 是 canonical v1；file ledger 含 unknown/delete/backup barrier；Admin 仍是文件运维；Overview 审核仍 planned |
| 2026-10-11 | 权益/生命周期 | Plan features / Global Delete / retention / rate limit / profiles | Source | PASS：features 可携带数值但 UI 无编辑；Global Delete `files_blocked` 标记作者 files deleting；通用 rate limiter 可复用；profile 可作为作者当前展示源 |
| 2026-10-11 | Supabase 安全基线 | 当前 Supabase docs：Database Functions / RLS / private Storage / Database backup scope | Public docs | PASS：继续 private bucket、RLS/收窄 grants、security-definer 固定 search_path；数据库备份不包含 Storage objects |
| 2026-10-11 | Phase 01 schema/functions | `20261011024824` / `20261011025311` / `20261011044555` | Local | PASS：Config/Version/Gallery/Like/Usage、legacy-only wrappers、平台总容量、slot helper、限流和 FK covering indexes 已落地 |
| 2026-10-11 | Local fresh | `pnpm exec supabase db reset --local --no-seed` + `pnpm test:db` | Local Supabase | PASS：三条 migration fresh 应用；63 files / 1209 tests |
| 2026-10-11 | Local upgrade | reset 到 `20261010223414` + 非空 legacy fixture + `migration up --local`；随后第三条 index migration 增量应用 | Local Supabase | PASS：旧 file 保持 `legacy`、reserved bytes 保留、默认平台容量 1 GiB、6 张新表/Like+Usage 函数权限正确；升级库 63 / 1209 PASS |
| 2026-10-11 | v1 兼容 | `pnpm contracts:breaking` | Local | PASS：Account/Admin OpenAPI 相对 `origin/main` 无 breaking change |
| 2026-10-11 | staging migration | `supabase db push --linked`（link=`workendstaging` / `egsokuicabbxspkdccqe`） | Staging | PASS：远端 history 精确包含 `20261011024824`、`20261011025311`、`20261011044555` |
| 2026-10-11 | staging security | Supabase SQL + Security Advisor | Staging | PASS：6/6 Config 表 force RLS；关键函数均 `domain_owner` + security definer + pinned search_path；浏览器无直表/函数越权；仅保留既有 `pg_net` public schema 与 leaked-password protection WARN |
| 2026-10-11 | staging performance | Supabase Performance Advisor | Staging | PASS：OPT-007 新 Config FK 的 unindexed findings 从 Advisor 中消失（总数 55→42）；新索引 fresh/零流量下显示 unused，暂不删除 |
| 2026-10-11 | staging Edge | Supabase Edge Functions | Staging | PASS：`account-api` ACTIVE v57；Phase 01 无 Edge 改动，未 redeploy |
| 2026-10-11 | Production | 发布边界 | Production | NOT_RUN：OPT-007 未获 Production 授权 |

## 当前结论

- 正式模型已冻结为 Config / immutable Version / Gallery Submission + Entry / Like / Usage Event，并保留 `platform_config_files` 作为唯一物理 ledger。
- legacy API 采用 additive coexistence，不做 v1 breaking rename/delete。
- 槽位、平台容量、Gallery admission、删除与 usage 语义已在 design 固化。
- Phase 01 已完成并同步 staging；下一步进入 Phase 02 Account/Consumer。Production 始终 NOT_RUN，除非用户另行明确授权。
