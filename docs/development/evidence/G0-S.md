# G0-S Staging 托管门槛

日期：2026-09-08  
项目：`workendstaging` / `egsokuicabbxspkdccqe`  
状态：PARTIAL（项目基线、迁移和 Edge 已完成；真实 Auth 用户业务链路仍未闭环）

## 已核对

- Supabase Dashboard 可访问，项目状态为 Healthy，区域为 Southeast Asia (Singapore)，数据库为 PostgreSQL 17.6。
- 项目 URL 与 Publishable Key 已从控制台确认，并写入本机根目录 `.env`；`.env` 被 Git 忽略，未写入仓库、报告或提交。
- `GET https://egsokuicabbxspkdccqe.supabase.co/auth/v1/health` 返回 HTTP 200，GoTrue 版本为 `v2.196.0`。
- 用户确认该项目为本仓库 Staging 后，已清理旧基线：旧 `platform` schema 及其表/函数、旧 public 函数、6 个旧 Edge Functions、旧自定义 Edge Function Secrets，以及旧 Auth 用户均已移除。没有删除项目、组织或 Supabase 平台默认 Secret。
- 仓库 13 个迁移已在 Staging 应用，迁移历史中保留 13 个仓库迁移名；`public`/`private` 表与仓库模型一致，当前业务表均为 0 行，RLS 均启用。
- 仓库 `account-api` 已部署并处于 ACTIVE，Edge 网关 `verify_jwt=true`。缺少 `X-Platform-Key` 的实际请求返回 HTTP 401 `UNAUTHORIZED`，证明托管函数入口可达且默认拒绝。
- Staging 自定义 Secret 仅保留本项目所需的 HMAC 配置；数据库连接使用 Supabase Edge Function 默认注入的 `SUPABASE_DB_URL`，没有把数据库密码写入仓库 `.env`。

## 当前未闭环

- 通过 Dashboard 创建临时 Staging Auth 用户的两次尝试均未在 Users 列表落库，因此尚未执行真实用户登录、JWT session、账户激活、资料/偏好、订阅和 logout 后旧 JWT 拒绝的托管探针。
- 因此 `SP-AUTH` 真实托管部分、需要登录态的 `account-api` 路径、真实浏览器 SSR，以及 OAuth/SMTP 仍为 `NOT_RUN`，不能由 Local 结果替代。
- 当前没有 X02 的实际 Admin/BFF 托管站点、可信代理链或发布域名，也没有 X03 的 Google OAuth/SMTP 测试配置；这些仍阻塞 G2-S 与完整 T17/T18 验收。
- Security Advisor 当前为：`public.platform_auth_origins` 启用 RLS 但无策略（INFO，符合默认拒绝设计）；Auth 泄露密码保护未启用（WARN，需在 Auth 配置中确认后开启）。没有遗留旧 `platform.idempotency_records` Critical 告警。
- Performance Advisor 仅报告未使用索引和未覆盖外键的 INFO 项；它们来自空 Staging 的静态分析，不作为本轮 G0-S 通过条件，也未被擅自修改。

## 结论

X01（独立 Staging、项目基线和最小客户端配置）已满足；迁移和 `account-api` 托管部署已完成。G0-S 暂不能标记 PASS，待取得一个可由 Auth 正常创建/登录的临时测试用户后，补跑真实 Auth/API 负向与正向探针，并清理临时用户和 fixture。OAuth/SMTP、真实浏览器 SSR、托管站点和 Storage 取消语义仍分别留给 T17/G2-S/G4-S。
