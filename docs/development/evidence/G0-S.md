# G0-S Staging 托管门槛

日期：2026-09-08  
项目：`workendstaging` / `egsokuicabbxspkdccqe`  
状态：BLOCKED（已完成控制台只读核对，未执行数据库/API/Edge 验收）

## 已核对

- Supabase Dashboard 可访问，项目状态显示 Healthy，区域为 Southeast Asia (Singapore)。
- Database Migrations 页面可访问；当前仅显示历史 `0001 platform_clean_schema`、`0002 platform_security_and_auth`。
- 当前仓库迁移集尚未在该 Staging 项目中执行；未通过 Dashboard 或 CLI 写入任何迁移。

## 阻塞

- 当前 Codex 工作进程未发现 `SUPABASE_URL`、`SUPABASE_DB_URL`、`SUPABASE_ACCESS_TOKEN` 或可供测试的项目 API 密钥；仓库内无 `.env` 文件。控制台登录状态不能自动提供安全的 CLI/脚本凭据。
- 因此 `SP-SQL`、`SP-AUTH`、`SP-UPLOAD`、真实 Edge Function、迁移升级和 G0-S 不能标记 PASS。
- 还缺拟用托管站点/域名、Google OAuth、SMTP、部署目标和备份/告警输入；这些属于 X01/X02/X03 或后续 T17/T18 条件。

## 解除条件

将 Staging 的非生产连接变量以当前工作环境可读方式提供（不提交仓库、不在聊天中粘贴 Secret），并确认可执行迁移的发布方式；随后先做迁移清单/版本校验，再运行 Staging 负向权限、Auth、上传与 Edge 探针。
