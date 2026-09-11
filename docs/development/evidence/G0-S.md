# G0-S Staging 托管门槛

> DP2校准：下文是既有探针快照，不是本次实时云端检查。`verify_jwt=true`与安全专题的网关要求存在未闭环差异，默认`SUPABASE_DB_URL`不证明独立executor/TLS已验收；由[收尾T17-R1](../tasks/closeout-01.md)核对，G0-S保持PARTIAL。

日期：2026-09-08  
项目：`workendstaging` / `egsokuicabbxspkdccqe`  
状态：PARTIAL（项目基线、迁移、Edge 和真实 Auth/Account API 基础链路已完成；浏览器/Provider/Storage 托管条件仍未闭环）

## 已核对

- Supabase Dashboard 可访问，项目状态为 Healthy，区域为 Southeast Asia (Singapore)，数据库为 PostgreSQL 17.6。
- 项目 URL 与 Publishable Key 已从控制台确认，并写入本机根目录 `.env`；`.env` 被 Git 忽略，未写入仓库、报告或提交。
- `GET https://egsokuicabbxspkdccqe.supabase.co/auth/v1/health` 返回 HTTP 200，GoTrue 版本为 `v2.196.0`。
- 用户确认该项目为本仓库 Staging 后，已清理旧基线：旧 `platform` schema 及其表/函数、旧 public 函数、6 个旧 Edge Functions、旧自定义 Edge Function Secrets，以及旧 Auth 用户均已移除。没有删除项目、组织或 Supabase 平台默认 Secret。
- 仓库 13 个迁移已在 Staging 应用，迁移历史中保留 13 个仓库迁移名；`public`/`private` 表与仓库模型一致，当前业务表均为 0 行，RLS 均启用。
- 仓库 `account-api` 已部署并处于 ACTIVE，Edge 网关 `verify_jwt=true`。缺少 `X-Platform-Key` 的实际请求返回 HTTP 401 `UNAUTHORIZED`，证明托管函数入口可达且默认拒绝。
- 使用临时 Staging Auth 用户完成真实链路：登录 HTTP 200；公开 plans HTTP 200；未激活 principal HTTP 200 且返回 `not_activated`；activate HTTP 200；激活后 principal HTTP 200；profile GET/PATCH、preferences GET、subscription GET 均 HTTP 200；Auth logout HTTP 204；logout 后使用旧 JWT 请求 principal 返回 HTTP 401。
- 本次探针暴露并修复了 Edge 运行时函数名前缀差异：`account-api` v13 统一兼容 `/functions/v1/account-api`、`/account-api` 和直接 `/v1` 路径；本地 Account API 7 项 Deno 测试全部通过。
- Staging 自定义 Secret 仅保留本项目所需的 HMAC 配置；数据库连接使用 Supabase Edge Function 默认注入的 `SUPABASE_DB_URL`，没有把数据库密码写入仓库 `.env`。

## 当前未闭环

- `SP-AUTH` 的真实密码登录、JWT session、账户激活、资料/偏好、订阅和 logout 后旧 JWT 拒绝已完成；本次临时用户、平台、计划、Key、账户和审计 fixture 已清理归零。
- 真实浏览器 SSR、OAuth/SMTP 和真实 Edge/Storage 取消/迟到写入仍为 `NOT_RUN`，不能由 API 或 Local 结果替代。
- 当前没有 X02 的实际 Admin/BFF 托管站点、可信代理链或发布域名，也没有 X03 的 Google OAuth/SMTP 测试配置；这些仍阻塞 G2-S 与完整 T17/T18 验收。
- Security Advisor 当前为：`public.platform_auth_origins` 启用 RLS 但无策略（INFO，符合默认拒绝设计）；Auth 泄露密码保护未启用（WARN，需在 Auth 配置中确认后开启）。没有遗留旧 `platform.idempotency_records` Critical 告警。
- Performance Advisor 仅报告未使用索引和未覆盖外键的 INFO 项；它们来自空 Staging 的静态分析，不作为本轮 G0-S 通过条件，也未被擅自修改。

## 结论

X01（独立 Staging、项目基线和最小客户端配置）已满足；迁移、`account-api` 托管部署和真实 Auth/API 基础链路已完成。G0-S 暂不能标记 PASS，原因是 X02 托管站点/可信代理链、X03 OAuth/SMTP 和真实 Storage 语义尚未提供或验证，另需补跑托管 pooler/TLS 探针。用户创建的 Staging Auth 账户未被改动。
