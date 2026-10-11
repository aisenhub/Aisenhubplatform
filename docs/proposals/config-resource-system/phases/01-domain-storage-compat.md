# Phase 01 — Config 领域、Storage Ledger 与兼容层

状态：执行中

## 目标

先把数据库事实、物理容量和权限边界建立完整；不在本阶段开放浏览器新产品入口。

## 实施项

- [ ] DB-001：使用 Supabase CLI 创建正式 migration；新增 Config / Version / Gallery Submission / Gallery Entry / Like / Usage Event 表、索引、复合归属约束、RLS/force RLS 与收窄 grants。
- [ ] DB-002：`platform_config_files` 增加 `resource_kind`，历史行固定为 `legacy`；现有 Account/Admin legacy 文件函数过滤 legacy，新 Config Version 使用 `config_version`。
- [ ] DB-003：`platform_file_policies` 增加 `max_platform_total_bytes`；legacy `file_intent_create` 与新 Version reservation 都在同一事务锁下检查平台 reserved 总量。
- [ ] DB-004：冻结 Config slot helper：从有效 entitlement `features.config_slot_limit` 读取 0..1000 整数；新 Config 创建统计全部 active Config，超额只阻止新建。
- [ ] DB-005：实现 Config create/read/list/patch、Version intent/activate、Gallery submission/approval primitive、Like/Usage primitive；全部 security-definer 固定 search_path 和 executor grants。
- [ ] DB-006：复用 `rate_limit_consume` 固定 Version/Submission/Like/Download-Apply 四类窗口；未知/非法 feature 值 fail closed。
- [ ] SQL-001：新增 pgTAP 覆盖 ownership、跨平台拒绝、slot、capacity、immutable Version、pending/approved 分离、legacy visibility、executor 权限和 public/anon/authenticated deny。
- [ ] COMPAT-001：`contracts:breaking` 对 Account/Admin 当前 v1 不产生 breaking change。
- [ ] STAGE-001：Local fresh/upgrade/SQL 通过后部署授权 staging migration，核对表、函数 owner/search_path、RLS/grants/advisors；Production NOT_RUN。

## 完成门槛

- legacy 文件回归全部通过，新 Config 领域无法被旧 API 枚举/删除。
- 平台总容量同时覆盖 legacy + config_version reserved bytes。
- 没有直接表访问或跨平台/跨账户 IDOR。
- staging 与仓库 migration 版本一致后才进入 Phase 02。
