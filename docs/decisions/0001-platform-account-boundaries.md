# ADR-0001：自营平台统一账户与安全边界

状态：Accepted

本决策记录当前系统长期有效的领域边界。实现细节和字段定义分别以 [当前架构](../architecture/overview.md)、[跨模块合同](../reference/contracts.md)、[数据模型](../reference/data-model.md) 和数据库迁移为准。

## Context

Aisenhubplatform 为多个由同一运营主体控制的平台提供共享身份和平台内账户能力。系统需要在共享 Auth 身份的同时保持平台租户隔离，并让 Account API、Admin、Maintenance 和 SDK 使用一致的安全与领域规则。

## Decisions

| 编号 | 决策 | 直接影响 |
| --- | --- | --- |
| D01 | 平台是相互信任的自营平台，共享 Supabase Global Identity；JWT 不代表平台绑定授权 | Platform Key 决定目标平台，不能由请求 body 伪造 platform_id |
| D02 | 文件必须由后端按真实字节校验后写入私有 Storage，不向浏览器发放上传签名 | BFF/Account API 负责有界读取、配额预约、hash 和 Storage 写入 |
| D03 | V1 保持模块化单体，最多一个运行中 Admin，不包含支付、组织/团队或第三方平台接入 | 不新增微服务、通用 RBAC、Billing 或第三方授权入口 |
| D04 | Free 是读取时回退；Grant/Event 是权益事实；Projection 由统一数据库领域过程更新 | Account API、Admin 和后台任务不能各自计算权益 |
| D05 | 私有 SQL 通过 TLS 事务连接和独立 executor 角色调用 | account、admin、job、recovery 权限分离，private schema 不暴露给 Data API |
| D06 | Admin 敏感动作需要绑定当前 session 的近期 MFA proof，窗口为 5 分钟 | AAL2、JWT `iat` 或客户端布尔值不能代替服务端 proof |
| D07 | Storage 写入结果为 unknown 时继续占用预算，不猜测取消成功 | 清理任务必须保留租约和 fencing token，并支持人工恢复 |
| D08 | 账户关闭和 Global Delete 分离；跨 Auth、数据库、Storage 的删除使用 checkpoint 任务 | 不把外部服务调用包进长数据库事务，失败可以续跑 |
| D09 | 普通用户近期认证使用独立 email `token_hash` Auth session；proof 绑定原业务 session | 临时 token 不返回浏览器，中央 API 验证两个 session 的用户和有效窗口 |
| D10 | MakerKit 只作为工程结构、组件组织和实现边界参考 | Admin 与平台参考页面独立维护视觉和交互，不复制 Starter 业务模型 |

## Consequences

- `platform_accounts` 是平台用户状态根；同一 Auth 用户可以在多个平台注册账户，但各平台资料、偏好、权益和文件隔离。
- Account API 和 Admin API 必须通过受控 context 调用 PostgreSQL private 函数；页面、BFF、SDK 和 Maintenance 只能编排请求，不能绕过领域入口。
- 关闭、暂停、删除中和平台禁用状态必须在每次敏感写入时重新检查；中央服务不可用时默认拒绝授权。
- 文件、权益、Key、兑换码和删除任务都需要 append-only 事件或可恢复状态，不能用直接覆盖投影或物理删除掩盖历史。
- 新平台通过配置、Origin、Plan、Key 和 SDK 接入，不通过核心代码中的 hard-coded platform 分支接入。

## 当前默认参数

这些参数是当前代码和迁移使用的默认值；调整时必须同步对应 reference、测试和运行配置。

| 参数 | 默认值 | 适用范围 |
| --- | --- | --- |
| 单文件上限 | 1 MiB | `platform_file_policies.max_file_bytes` 最大值 |
| 文件数量/总量 | 10 个 / 10 MiB | 平台账户预算 |
| Access JWT | 15 分钟 | Auth 配置目标 |
| Recent proof | 5 分钟 | 普通近期认证和 Admin step-up |
| Account API 总预算 | 5 秒 | SDK 默认请求超时 |
| 上传接收并发 | 每实例 16、每账户 2 | 进程内 `UploadGate` |
| 兑换限流 | 每账户 5/分钟、每可信 IP 30/分钟、每平台 300/分钟 | 数据库窗口计数器 |
| 关闭账户清理 | 30 天 | 资料、偏好和文件的默认清理策略 |
| 备份目标 | RPO 24 小时、RTO 4 小时 | 待真实环境演练证明的运行目标 |

## 当前验证边界

下表只表达当前代码和部署前检查的边界，不把未运行的托管环境操作写成已完成：

| 主题 | 当前可依据的来源 | 仍需在对应环境核对的内容 |
| --- | --- | --- |
| 依赖和工具 | 根目录 `package.json`、workspace、lockfile 和实际脚本 | CI 与部署环境的 Node/pnpm/Supabase CLI 版本一致性 |
| 数据库和权限 | `supabase/migrations`、`supabase/tests`、受控 SQL wrapper | Production 的 executor、TLS、pooler 和真实凭据配置 |
| 身份和回调 | Auth adapter、Account API、认证相关迁移与单元测试 | Supabase Auth、OAuth provider、邮件和浏览器多会话行为 |
| 文件和恢复 | 文件迁移、受控 Storage adapter、maintenance 任务和恢复屏障测试 | 对象备份送达、恢复演练、告警和真实 Storage 取消语义 |
| API 合同 | OpenAPI JSON、domain DTO、Account/Admin 路由和 `pnpm contracts:check` | 每个部署环境的网关、域名、缓存和真实端到端流量 |

当代码、迁移、测试和本文件出现差异时，先以代码和迁移核对事实，再更新本文件及受影响的 reference 文档。未核实的内容标为“待验证”，不使用历史计划编号代替证据。

## 外部输入与阻塞边界

以下信息不应写入公开仓库，但会决定哪些验证可以完成：

| 信息 | 影响 | 缺少时可继续的工作 |
| --- | --- | --- |
| Production Supabase 项目、区域和最小凭据 | 生产数据库、Auth、权限和 API 发布观察 | Local 迁移、类型、fixture、单元测试和发布前压力探针 |
| Account/Admin/BFF 的真实部署 host 和可信代理链 | SSR、上传、Origin 和缓存验证 | 本地 HTTP、CSRF、Storage adapter 测试 |
| OAuth 测试客户端、回调地址和 SMTP 测试配置 | Provider、邮箱和浏览器 E2E | 密码流程、callback 负向测试和会话单测 |
| 独立备份目标、加密凭据和告警渠道 | 联合备份、墓碑恢复和 RPO/RTO 演练 | manifest、屏障和隔离恢复模拟 |
| 正式 npm scope、Registry 地址和发布权限 | SDK/Registry 发布验证 | 本地 tarball、manifest 和消费项目构建 |
| 生产区域、预算、平台数量和负载 | 容量、性能和运营阈值 | 默认负载下的 Local 压力探针 |

## 决策更新记录模板

每次改变本 ADR 的安全、数据或跨模块边界时，至少记录：

```md
### YYYY-MM-DD：变更标题

- 变更原因：
- 代码/迁移证据：
- 新旧行为：
- 受影响文档、接口和消费者：
- 验证命令及结果：
- 未解决的风险或外部输入：
```

### 2026-09-11：取消 Staging 环境

- 变更原因：项目开发流程统一采用本地 Supabase 验证，发布时直接迁移到 Production，不再维护独立 Staging 环境。
- 代码/迁移证据：本次只同步运维、测试、架构、Agent 规则和 Admin Origins 提示；已有迁移中的 `staging` 值未改动，避免未经数据盘点的数据库契约变更。
- 新旧行为：旧流程包含 Local、Staging、Production；新流程为 Local → Production。Preview 仅作为 Local 的开发预览，不作为独立 Supabase 环境。
- 受影响文档、接口和消费者：`docs/guides/operations.md`、`docs/guides/testing.md`、文件任务架构说明、项目 Agent 规则和 Admin Origins 页面提示。
- 验证命令及结果：`pnpm docs:check` 通过；`pnpm --filter admin typecheck` 通过。
- 未解决的风险或外部输入：数据库仍接受历史 `staging` origin。若要从数据库层禁止该值，需要另行盘点数据并提交向前迁移，不能通过本次文档同步直接移除。

## Rejected alternatives

- 不把 JWT、Origin、前端路由或 `user_metadata.is_admin` 当作平台或管理员授权。
- 不在浏览器直接连接 Storage，不用 signed upload 绕过真实字节和预算检查。
- 不让 Admin 直接修改 subscriptions Projection，不在第二个服务复制 Ledger、配额或删除算法。
- 不把本地参考页面、Local Registry 或本地测试结果描述成生产部署和托管验收。
