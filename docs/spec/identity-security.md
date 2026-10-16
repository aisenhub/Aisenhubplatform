# 身份与安全需求

## REQ-IAM-001 — JWT 与 Session 必须同时验证

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security
- **Architecture**: `architecture/modules/identity-security.md`

**Statement**

Account/Admin 身份验证必须验证 JWT 签名、issuer/audience/expiry/subject/session，并在构造 Principal 或 Admin context 时重新检查当前 Auth session 和身份生命周期；仅 JWT 未过期不足以授权。

## REQ-IAM-002 — 共享 Global Identity 不等于跨平台授权

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

同一 Global Identity 可以拥有多个 Platform Account，但调用某个平台业务必须同时满足该 Platform Key 和该平台账户状态；不得把共享身份模型误解释为可跨平台越权。

## REQ-IAM-003 — System Admin membership 服务端权威

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

System Admin 权限必须以服务端 `pending / active` membership 为权威；普通 Admin 业务只允许 active member，不能由客户端 metadata、菜单或 JWT 自声明管理员身份。

## REQ-IAM-004 — Admin readiness 保持多管理员与双 TOTP

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

正常管理 readiness 必须保持至少 2 名 active System Admin，且每名 active admin 至少有 2 个 verified TOTP factor；membership 变更不得把系统降到 active-floor 以下。

## REQ-IAM-005 — 普通 Admin 业务至少需要 AAL2

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

普通 Admin 业务必须要求 active membership、有效 Admin session 和 AAL2；pending admin 只允许最小 onboarding/security 面，不获得普通管理权限。

## REQ-IAM-006 — 高风险 Admin 操作需要近期 MFA

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

密钥生命周期、Global Delete、平台账户治理、Billing 人工处理和 System Admin membership 等高风险 mutation 必须使用服务端 recent-MFA proof；AAL2 或浏览器布尔值本身不等于近期验证。

## REQ-IAM-007 — Recent-MFA proof 必须绑定当前会话

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

Recent-MFA proof 必须绑定 user/session/factor/verified time，有明确短时有效期和 anti-replay；普通 token refresh 不得延长该窗口，session revoke 或 membership remove 必须使其失效。

## REQ-IAM-008 — 普通用户近期认证与 Admin MFA 分离

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

普通用户关闭账户/Global Delete 等近期认证必须使用独立、绑定原业务 session 的 server-verified reauth 事件，不能复用 Admin recent MFA，也不能信任客户端“已重新认证”声明。

## REQ-IAM-009 — System Admin 身份不得进入普通 Consumer 业务

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Security

**Statement**

pending/active System Admin 专用 Auth Identity 必须被普通平台 Principal/激活/业务 API 拒绝，降低管理员凭据被普通产品流程使用的风险。

## REQ-IAM-010 — Auth/权限服务不可用时拒绝授权

- **Status**: Active
- **Delivery**: Implemented
- **Priority**: P0
- **Type**: Reliability

**Statement**

身份、session、membership、MFA 或关键授权依赖查询失败时，受保护业务必须返回明确 authorization unavailable/fail closed，不允许降级为仅检查缓存或 JWT。

## REQ-IAM-011 — Admin TOTP 因子生命周期必须安全可恢复

- **Status**: Active
- **Delivery**: Partial
- **Priority**: P0
- **Type**: Security

**Statement**

Admin 在线 MFA 管理必须支持第二 verified TOTP factor，已有 factor 的增删需要现有因子的近期验证；应用受控入口不得允许 active admin 删除最后一个 verified factor，因子变化后必须刷新/失效旧 recent proof，并提供不依赖网页绕过 MFA 的离线恢复路径。

**Acceptance**

- 已有 verified factor 时新增/删除 factor 需要近期 MFA。
- 在线管理入口拒绝删除最后一个 verified factor。
- factor 变化后旧 recent proof 不再可用。
- Supabase 原生 endpoint/并发绕行边界有明确测试和风险记录，不把应用层检查夸大成 Provider 全局原子保证。

## 当前缺口

当前已实现：verified TOTP 列表、首因子注册、在已有因子时增加第二/备用 TOTP、Provider challenge/verify、session 绑定的 server-signed attestation 与最长 30 分钟 recent proof。

当前尚未实现：Admin 对 **verified factor** 的删除产品入口，因此“删除前近期验证、最后因子在线保护、删除后 proof/session 收敛”尚未完成。现有 `unenroll` 代码只删除 unverified enrollment。历史固定版本探针已经证明 Supabase 原生 endpoint 和并发会话能够将 factor 删除至 0；未来即使补充应用入口，也必须继续保留该风险边界。因此 `Delivery` 保持 `Partial`。

统一安全语义剩余覆盖和 Web hardening 分别由 `REQ-ADM-009/010` 跟踪；当前未完成项统一登记在 [`docs/plans/TODO.md`](../plans/TODO.md)，不能用 IAM Requirement 冒充已完成。

## Domain Verification

当前基线证据包括 Admin MFA routes/page、`@kit/domain/admin-mfa-attestation` 及其测试、canonical `admin_step_up_issue/admin_step_up_valid`、Admin security status、System Admin domain tests，以及历史 `SEC-PROBE-00` 对原生 factor 删除/AAL refresh 边界的 Local Supabase 探针。历史探针只证明被记录版本/环境中的 Provider 行为，当前代码事实仍以源码与最新验证为准。
