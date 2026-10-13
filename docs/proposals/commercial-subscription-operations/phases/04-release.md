# 阶段 04：Upgrade / Staging / Release

状态：Completed

关联：[总计划](../plan.md) · [设计](../design.md) · [验证记录](../verification-record.md)

## 目标

完成非空升级、完整 R3、staging 状态核对和 GitHub/main/branch closeout。

## 任务

- [x] LIFE-001：Plan/Offer/Price archive、Purchases Paused、Mapping 失效、历史 Checkout/Grant/Order 的兼容生命周期验证。
- [x] LIFE-002：Global Delete/retention 对新增商业外键/投影无 PII 回流或阻塞。
- [x] TEST-001：fresh reset + non-empty upgrade + full DB。
- [x] TEST-002：API/OpenAPI/breaking、Admin/Consumer browser、unit/typecheck/build、lint/format/docs。
- [x] TEST-003：canonical `TASK-0801` R3 PASS。
- [x] STAGE-001：staging migration/Edge 对齐，SQL/权限/HTTP/关键工作流 smoke。
- [x] GIT-001：最终 diff/hygiene、push、PR/CI、merge/rebase main、核对远端 main。
- [x] GIT-002：确认无独有提交/未提交改动后删除本地/远端 OPT-010 分支。
## 当前验证证据（2026-10-13）

- Fresh reset 明确 exit 0；full DB **73 files / 1536 tests PASS**。
- 从 `20261012094715` 真实构造 legacy paid plan / fixed product Provider Mapping / Checkout / Order / `billing_order` Grant / active Campaign，再前向应用 OPT-010 四条 migration：生成 3 个 active legacy Offer/Price，金额保持 monthly `9.90`、yearly `39.90`、lifetime `49.90`；历史 Checkout / Mapping / Campaign 的新商业 attribution 保持 null，Order / Grant 解释不变。
- 升级后事务内 lifecycle probe PASS：Purchases Paused 全量 fail-closed；新 commercial Mapping 可 publish 后 disable；Offer archive 后不可恢复并从 Consumer catalog 消失；历史 Checkout / Order / Grant 不被改写。Retention cleanup 与 Global Delete 最终 identity detach 均可匿名化账户且保留 Checkout / Order / Grant / Offer 历史。
- Canonical `pnpm verify:task:0801 --reuse-local` **20/20 gates PASS**：API **111/111**、DB **73/1536**、settlement concurrency、contracts/breaking、Consumer/Admin browser、100-observation responsive/a11y、docs **192**、OpenAPI Account/Admin **47/77** 全绿。
- Staging `workendstaging / egsokuicabbxspkdccqe` 已对齐最终四条 migration；`account-api` 从 v62 部署为 **v63 ACTIVE** 且 `verify_jwt=false` 保持。SQL 核验商业表/索引/函数及 `account_executor` / `admin_executor` 最小权限；bundle 反查包含 `ACCOUNT_API_JWT_ISSUER` 与 Commerce VOLATILE 写函数单次求值修复。无 Platform Key 的 Consumer Commerce 与无 Admin 会话的 Commerce Summary 均 HTTP 401 fail-closed。Security advisor 仅既有 `pg_net` public schema / leaked-password protection WARN，无 OPT-010 新 finding。Production NOT_RUN。
- GitHub PR **#17**（head `55bac2b`）已于 2026-10-13 合并；PR head 的 Actions Workflow **#164** completed/success；远端 `main@00ab819a10ca764d5f96ce0e362c4bcb4ebe71a7` 与任务分支最终文件树无差异。确认无未提交或独有内容后，原 `codex/opt-010-commercial-operations` 本地/远端分支均已删除。

## 退出条件

所有适用 R3、staging、GitHub main 与原任务分支清理均已闭环，OPT-010 标记 Completed。Production 默认 NOT_RUN。
