# Phase 01 — Config 领域、Storage Ledger 与兼容层

状态：已完成

## 目标

先把数据库事实、物理容量和权限边界建立完整；不在本阶段开放浏览器新产品入口。

## 实施项

- [x] DB-001：使用 Supabase CLI 创建正式 migration；新增 Config / Version / Gallery Submission / Gallery Entry / Like / Usage Event 表、索引、复合归属约束、RLS/force RLS 与收窄 grants。
- [x] DB-002：`platform_config_files` 增加 `resource_kind`，历史行固定为 `legacy`；现有 Account/Admin legacy 文件函数过滤 legacy，新 Config Version 使用 `config_version`。
- [x] DB-003：`platform_file_policies` 增加 `max_platform_total_bytes`；legacy `file_intent_create` 与新 Version reservation 都在同一事务锁下检查平台 reserved 总量。
- [x] DB-004：冻结 Config slot helper：从有效 entitlement `features.config_slot_limit` 读取 0..1000 整数；新 Config 创建统计全部 active Config，超额只阻止新建。
- [x] DB-005：实现 Config create/read/list/patch、Version intent/activate、Gallery submission/approval primitive、Like/Usage primitive；全部 security-definer 固定 search_path 和 executor grants。
- [x] DB-006：复用 `rate_limit_consume` 固定 Config/Version create、Submission、Like/Unlike、Download/Apply delivery 窗口；未知/非法 feature 值 fail closed。
- [x] SQL-001：新增 pgTAP 覆盖 ownership、跨平台拒绝、slot、capacity、immutable Version、pending/approved 分离、legacy visibility、executor 权限和 public/anon/authenticated deny。
- [x] COMPAT-001：`contracts:breaking` 对 Account/Admin 当前 v1 不产生 breaking change。
- [x] STAGE-001：Local fresh/upgrade/SQL 通过后部署授权 staging migration，核对表、函数 owner/search_path、RLS/grants/advisors；Production NOT_RUN。

## 完成门槛

- legacy 文件回归全部通过，新 Config 领域无法被旧 API 枚举/删除。
- 平台总容量同时覆盖 legacy + config_version reserved bytes。
- 没有直接表访问或跨平台/跨账户 IDOR。
- staging 与仓库 migration 版本一致后才进入 Phase 02。

## 完成证据

- Local fresh：三条 OPT-007 migration 从空库完整应用，`pnpm test:db` PASS（63 files / 1209 tests）。
- Local upgrade：从 `20261010223414` 非空旧 schema 保留 legacy file fixture 后向前升级；历史行保持 `resource_kind=legacy`、平台容量默认 1 GiB；第三条 FK index migration 以增量方式应用后 SQL suite 同样 PASS（63 / 1209）。
- Compatibility：`pnpm contracts:breaking` PASS，Account/Admin 当前 v1 无 breaking change。
- Staging：`workendstaging` 已按仓库版本应用 `20261011024824`、`20261011025311`、`20261011044555`；6/6 新表 force RLS，关键函数 owner/search_path/grants 与 Local 一致。
- Advisors：Security 无 OPT-007 新告警；Performance 的新 Config FK `unindexed_foreign_keys` 已由第三条 migration 消除。刚创建索引的 unused 统计不作为删除依据。
- Edge：Account API 仍 ACTIVE v57，本阶段无 Edge 代码，因此未 redeploy。Production NOT_RUN。
