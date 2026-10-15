# 运行时、环境与部署架构

本文件描述代码实际运行在哪里、不同运行时之间如何通信、哪些配置/Secret 属于什么边界，以及“代码支持”与“真实环境已部署”之间的区别。

## Requirements

本基础设施主要支撑 `REQ-SYS-002`、`REQ-SYS-003`、`REQ-SYS-005`、`REQ-SYS-008`，以及 `REQ-BIL-010`、`REQ-OPS-009`、`REQ-API-011` 对“代码能力与环境证据分离”的要求。

## 1. 运行时组件

- **Admin Web**：`apps/admin`，Next.js/Vercel，Browser -> same-origin BFF -> central Admin API。
- **Account/Admin Edge API**：`supabase/functions/account-api`，同一 Edge Function 承载 Account `/v1` 与 Admin `/admin/api/v1` adapter。
- **Maintenance**：`supabase/functions/maintenance`，server-only capability token，可调用 DB、Storage、Auth Admin、Provider。
- **Billing Webhook**：`supabase/functions/billing-webhook`，自行验证 Provider signature/path/provider account，持久化 Inbox 后 ACK。
- **PostgreSQL**：private domain functions + executor roles。
- **Storage**：private `platform-config-files` 与 `platform-feedback-attachments` buckets。

## 2. Local Supabase 端口

当前 `supabase/config.toml`：

| Service | Local port |
| --- | ---: |
| API | 54321 |
| DB | 54322 |
| Studio | 54323 |
| Inbucket UI | 54324 |
| SMTP | 54325 |
| POP3 | 54326 |
| DB pooler | 54329 |

PostgreSQL 17，Pooler 当前 transaction mode。

## 3. Data API 暴露

Local config 暴露 `public/storage/graphql_public`，不暴露 `private`。即便 public schema 可被 PostgREST 看见，RLS/grant 仍负责阻止普通浏览器访问核心表。

Private SQL path 固定由 Edge/server runtime 使用 executor login。

## 4. Auth Runtime

Local site URL `http://localhost:3000`，配置 exact additional redirects；email signup 与 confirmation 按 Local config；TOTP enroll/verify 开启。

Hosted 环境实际 JWT expiry、redirect、provider、SMTP 等以真实项目配置为准；Local config 不能被写成 Production 已配置证据。

Account/Maintenance/Webhook 三个 Edge Function 都设置 `verify_jwt=false`，因为它们分别在内部执行更精确的 Platform Key/JWT、capability token、Provider signature 校验。关闭 gateway JWT precheck 不等于业务匿名开放。

## 5. Admin 环境变量

主要 server config：Supabase URL/publishable key、`ADMIN_ORIGIN`、`ACCOUNT_API_URL`、`ACCOUNT_API_TIMEOUT_MS`、`ADMIN_MFA_ATTESTATION_SECRET`、`NODE_ENV`。Secret 不进入 `NEXT_PUBLIC_*`。

## 6. Account API 环境变量

主要边界：Supabase URL/key、JWT/JWKS、Account/Admin DB URL、DB pool、Admin MFA attestation、Platform Key HMAC current/previous、Redemption HMAC current/previous、Storage service role、Auth timeout、Billing checkout HMAC、Provider account、Checkout enabled、Afdian checkout URL。

所有凭据通过环境 Secret 注入，仓库只保存名称和安全语义。

## 7. Maintenance / Billing 环境变量

Capability tokens：`MAINTENANCE_FILES_TOKEN`、`MAINTENANCE_IDENTITY_TOKEN`、`MAINTENANCE_BILLING_TOKEN`。

Billing/Afdian：Webhook ingress switch、Provider account、webhook path secret、公钥、background/settlement switch、`AFDIAN_USER_ID`、`AFDIAN_API_TOKEN`、API base URL/timeout。

Afdian API Token 只存在服务端 Secret 管理系统。

## 8. Hosted Billing Cron

Hosted Cron runtime Secret 从 Vault 读取 maintenance function URL 和 billing capability token。DB cron/pg_net 发 HTTP，`private.billing_cron_invocations` 记录 scheduler/HTTP/worker 证据。

migration 中存在 cron function 不等于当前 Hosted 环境 Vault/网络/调度已成功。Production readiness 必须用真实 invocation/HTTP/worker 结果证明。

## 9. Maintenance Schedule Metadata

仓库 `maintenance/schedule.json` 声明 files/feedback/reconcile/retention/billing/idempotency cadence。除 Billing Hosted Cron 的明确实现外，其他 metadata 是否由真实 scheduler 调用必须单独核实。

不要把“有 HTTP route + schedule.json”描述成“自动任务已经运行”。

## 10. 网络与事务边界

所有 runtime 遵循 short DB transaction -> commit -> external HTTP/Storage/Auth/Provider -> short finalize transaction。

不能持有 DB lock 等待 Afdian、Storage 或 Auth。HTTP timeout 不等于 external action 没发生；使用 unknown/reconciliation/fence 恢复。

## 11. 部署环境隔离

Local/Test/Preview/Production 不共享 Auth users、DB data、Storage objects、SQL credentials、Platform Keys、HMAC secrets、Redemption codes 或 Provider secrets。

Local/Preview 禁止指向 Production 作为方便测试手段。测试数据使用合成身份和订单。

## 12. Admin Delivery

Admin Vercel 从 monorepo root frozen install，再执行 `pnpm --filter admin build`。

Production 与 GitHub main 的自动部署绑定意味着 merge/push main 可能成为发布链的一部分，因此 Git 交付和生产影响必须分开判断。

本架构文档不把某次历史 Vercel deployment ID 当作永久架构事实。

## 13. Migration / Release

数据库变更：Local fresh reset -> forward migration -> schema/role/function checks -> Edge/runtime -> Production 独立 release gate。

已有正式业务数据后不通过删除 ledger/历史 migration“回滚”。

## 14. 备份与恢复

数据库与 Storage object 必须分层备份。Supabase DB backup 不包含 Storage bytes。

架构支持 backup barrier/tombstone，但外部 backup destination、真实 manifest、RPO/RTO 是否达标必须有独立环境证据和恢复演练。

## 15. 外部依赖

主要外部运行依赖：Supabase Auth/PostgreSQL/Storage/Edge Functions、Vercel、Afdian、GitHub Actions/GitHub。

SaaS 当前状态、配额、URL、价格或 Provider 行为可能变化，长期架构只保存协议边界；实时配置从环境或官方控制面核对。
