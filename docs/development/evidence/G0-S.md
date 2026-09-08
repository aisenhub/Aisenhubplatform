# G0-S Staging 托管门槛

日期：2026-09-08  
项目：`workendstaging` / `egsokuicabbxspkdccqe`  
状态：BLOCKED（Auth 公共端点已连通；项目基线漂移，数据库/API/Edge/迁移验收未完成）

## 已核对

- Supabase Dashboard 可访问，项目状态显示 Healthy，区域为 Southeast Asia (Singapore)。
- 项目 URL 与 Publishable Key 已从控制台确认，并写入本机根目录 `.env`；该文件被 Git 忽略，未写入 Secret/service-role/数据库密码。
- 只读 Auth 健康探针 `GET https://egsokuicabbxspkdccqe.supabase.co/auth/v1/health` 返回 HTTP 200，GoTrue 版本为 `v2.196.0`。
- 只读 REST 探针请求 `public.platform_accounts` 返回 HTTP 404 / `PGRST205`（表不在当前 schema cache），与 Staging 尚未应用仓库迁移的控制台记录一致。
- Database Migrations 页面可访问；当前仅显示历史 `0001 platform_clean_schema`、`0002 platform_security_and_auth`。
- 当前仓库迁移集尚未在该 Staging 项目中执行；未通过 Dashboard 或 CLI 写入任何迁移。
- Supabase 管理元数据显示数据库为 PostgreSQL 17.6；当前业务表集中在既有 `platform.*` schema，仓库目标的 `public.*`/`private.*` 表不存在，且当前没有 `private` schema。
- 当前项目已有 `platform-public`、`platform-api`、`platform-admin`、`payment-webhook`、`account-deletion-worker`、`retention-cleanup` 六个旧 Edge Functions；它们不是仓库的 `account-api`，不能把旧函数存在误记为本仓库部署成功。

## 阻塞

- 当前已具备 Staging 公共客户端变量，但仍没有 `SUPABASE_DB_URL`、`SUPABASE_ACCESS_TOKEN` 或可执行迁移/Edge 部署的凭据；控制台登录状态不能自动提供安全的 CLI/脚本凭据。
- 当前连接器可以访问项目管理面，但现有 Staging 迁移基线与仓库目标不一致；未经迁移设计确认，不应用仓库 DDL，避免把两套业务模型混装。
- 因此目前只能记录公共 Auth 健康探针 PASS；`SP-SQL`、完整 `SP-AUTH`、`SP-UPLOAD`、仓库 Edge Function、迁移升级和 G0-S 不能标记 PASS。
- Security Advisor 发现 Critical：`platform.idempotency_records` 未启用 RLS。平台给出的候选修复为 `ALTER TABLE platform.idempotency_records ENABLE ROW LEVEL SECURITY;`，但启用后若无匹配策略会阻断访问；本轮未自动执行，须先确定该既有系统的访问策略。
- 还缺拟用托管站点/域名、Google OAuth、SMTP、部署目标和备份/告警输入；这些属于 X01/X02/X03 或后续 T17/T18 条件。

## 解除条件

先确认该项目是否确实是本仓库的目标 Staging：若是，应提供/确认从 `0001/0002` 到本仓库模型的正式迁移方案；若不是，应提供正确的空白或匹配项目。确认后再按固定迁移名应用 DDL，并运行负向权限、Auth、上传与 Edge 探针。既有 `platform.idempotency_records` 的 RLS 修复须由该系统负责人确认策略后单独处理。
